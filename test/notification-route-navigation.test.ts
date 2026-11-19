import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');

// Execute the real foreground callback, replacing only browser/FCM boundaries.
function foregroundReceiver(permission: NotificationPermission = 'granted') {
  const file = 'src/hooks/use-fcm-token.tsx';
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback: string | undefined;
  function visit(node: any) {
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'onForegroundNotification') {
      callback = node.arguments[0].getText(source);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(callback, 'o callback real de foreground deve existir');
  const shown: { title: string; options: Record<string, any> }[] = [];
  const code = ts.transpileModule(`(${callback})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const receive = runInNewContext(code, {
    native:false,alive: true, currentUid: { current: 'driver-a' }, userId: 'driver-a',
    toast() {}, permission: () => permission, console,
    window: { dispatchEvent() {} }, Event,
    navigator: { serviceWorker: { getRegistration: async () => ({
      showNotification: async (title: string, options: Record<string, any>) => { shown.push({ title, options }); },
    }) } },
  });
  return { receive, shown };
}

// Execute the shipped worker with no network imports and no open windows.
function closedAppWorker(windows: any[] = [], overrides:Record<string,unknown>={}) {
  const handlers = new Map<string, (event: any) => void>();
  const opened: string[] = [];
  const shown: { title: string; options: Record<string, any> }[] = [];
  let background: (payload: any) => Promise<void>;
  const clients = {
    matchAll: async () => windows,
    openWindow: async (url: string) => { opened.push(url); },
    claim: async () => {},
  };
  runInNewContext(readFileSync('public/firebase-messaging-sw.js', 'utf8'), {
    self: {
      addEventListener: (name: string, handler: (event: any) => void) => handlers.set(name, handler),
      location: { origin: 'https://example.test' }, clients,
      registration: { showNotification: async (title: string, options: Record<string, any>) => { shown.push({ title, options }); } },
    },
    clients, URL, importScripts() {}, console: { log() {} },
    readRotaPushGrant:async()=>undefined,flushRotaPushRevocations:async()=>{},
    fetch:async()=>({ok:true,json:async()=>({native:false})}),
    firebase: { initializeApp() {}, messaging: () => ({ onBackgroundMessage: (handler: typeof background) => { background = handler; } }) },
    ...overrides,
  });
  return {
    opened, shown,
    receiveBackground: (payload: any) => background(payload),
    async click(options: Record<string, any>, action = '') {
      let pending: Promise<unknown> | undefined;
      let closed = false;
      handlers.get('notificationclick')!({
        action, notification: { ...options, close() { closed = true; } },
        waitUntil: (promise: Promise<unknown>) => { pending = promise; },
      });
      await pending;
      assert.equal(closed, true);
    },
  };
}

test('aviso recebido em foreground abre sua rota após fechar todas as janelas', async () => {
  const foreground = foregroundReceiver();
  const payload = { data: { routeId: 'route-a', type: 'route_change', title: 'Rota alterada', body: 'Revise as paradas' } };
  await foreground.receive(payload);
  assert.equal(foreground.shown.length, 1);
  const worker = closedAppWorker();
  await worker.click(foreground.shown[0].options);
  assert.deepEqual(worker.opened, ['/my-routes/route-a']);
});

test('aviso sem rota mantém o destino da lista de notificações', async () => {
  const foreground = foregroundReceiver();
  await foreground.receive({ notification: { title: 'Aviso geral', body: 'Mensagem' } });
  const worker = closedAppWorker();
  await worker.click(foreground.shown[0].options);
  assert.deepEqual(worker.opened, ['/driver/notifications']);
});

test('aviso de background continua abrindo a rota correspondente com app fechado', async () => {
  const worker = closedAppWorker();
  await worker.receiveBackground({ data: { routeId: 'route-b', title: 'Rota alterada', body: 'Mensagem' } });
  await worker.click(worker.shown[0].options);
  assert.deepEqual(worker.opened, ['/my-routes/route-b']);
});

test('ação Fechar dispensa o aviso sem abrir janela', async () => {
  const worker = closedAppWorker();
  await worker.click({ data: { routeId: 'route-a' } }, 'close');
  assert.deepEqual(worker.opened, []);
});

test('permissão negada não tenta criar notificação de sistema', async () => {
  const foreground = foregroundReceiver('denied');
  await foreground.receive({ data: { routeId: 'route-a', title: 'Rota alterada' } });
  assert.equal(foreground.shown.length, 0);
});

test('I8 navega a janela aberta para o destino seguro e depois traz foco',async()=>{
  const operations:string[]=[];
  const client={url:'https://example.test/elsewhere',navigate:async(path:string)=>{
    operations.push(path);return client;
  },focus:async()=>operations.push('focus')};
  const worker=closedAppWorker([client]);
  await worker.click({data:{routeId:'route-open'}});
  assert.deepEqual(operations,['/my-routes/route-open','focus']);
  await worker.click({data:{routeId:'//evil'}});
  assert.deepEqual(operations.slice(2),['/driver/notifications','focus']);
});

test('I7 worker fechado ignora push vinculado sem prova local ou com sessão revogada',async()=>{
  const worker=closedAppWorker([],{
    fetch:async()=>({ok:false}),
    readRotaPushGrant:async()=>({id:'binding-a',proof:'proof-a'}),
  });
  await worker.receiveBackground({data:{boundPush:'1',bindingId:'binding-a',deliveryId:'delivery-a',title:'private'}});
  assert.equal(worker.shown.length,0);
});

test('I7 entrega atrasada de A não é aberta por B nem exibida após revogação',async()=>{
  let grant={id:'binding-a',proof:'proof-a'};
  let valid=true;
  const worker=closedAppWorker([],{
    readRotaPushGrant:async()=>grant,
    fetch:async (_url:string,options:RequestInit)=>{
      assert.equal(options.redirect,'error');
      assert.equal(JSON.parse(String(options.body)).proof,'proof-a');
      return {ok:valid,json:async()=>({routeId:'route-a'})};
    },
  });
  const payload={data:{boundPush:'1',bindingId:'binding-a',deliveryId:'delivery-a',body:'private'}};
  await worker.receiveBackground(payload);
  assert.equal(worker.shown.length,1);
  assert.doesNotMatch(worker.shown[0].options.body,/private/);
  valid=false;
  await worker.receiveBackground(payload);
  assert.equal(worker.shown.length,1);
  grant={id:'binding-b',proof:'proof-b'};
  await worker.click(worker.shown[0].options);
  await worker.receiveBackground(payload);
  assert.deepEqual(worker.opened,[]);
  assert.equal(worker.shown.length,1);
});
