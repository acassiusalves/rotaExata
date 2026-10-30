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
    alive: true, currentUid: { current: 'driver-a' }, userId: 'driver-a',
    toast() {}, permission: () => permission, console,
    navigator: { serviceWorker: { getRegistration: async () => ({
      showNotification: async (title: string, options: Record<string, any>) => { shown.push({ title, options }); },
    }) } },
  });
  return { receive, shown };
}

// Execute the shipped worker with no network imports and no open windows.
function closedAppWorker() {
  const handlers = new Map<string, (event: any) => void>();
  const opened: string[] = [];
  const shown: { title: string; options: Record<string, any> }[] = [];
  let background: (payload: any) => Promise<void>;
  const clients = {
    matchAll: async () => [],
    openWindow: async (url: string) => { opened.push(url); },
    claim: async () => {},
  };
  runInNewContext(readFileSync('public/firebase-messaging-sw.js', 'utf8'), {
    self: {
      addEventListener: (name: string, handler: (event: any) => void) => handlers.set(name, handler),
      location: { origin: 'https://example.test' }, clients,
      registration: { showNotification: async (title: string, options: Record<string, any>) => { shown.push({ title, options }); } },
    },
    clients, importScripts() {}, console: { log() {} },
    firebase: { initializeApp() {}, messaging: () => ({ onBackgroundMessage: (handler: typeof background) => { background = handler; } }) },
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
