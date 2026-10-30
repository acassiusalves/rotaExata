import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createDriverRoutesSync } from '../src/lib/driver-routes-sync.ts';

type Route = { id: string; status: 'dispatched' | 'in_progress' };
type Snapshot = { routes: Route[]; fromCache: boolean };
const pending: Route = { id: 'route-1', status: 'dispatched' };
const started: Route = { id: 'route-2', status: 'in_progress' };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

function fixture() {
  const document = new EventTarget();
  const window = new EventTarget();
  let visible = true;
  let online = true;
  let now = 100_000;
  const listeners: { next: (s: Snapshot) => void; error: (e: unknown) => void; active: boolean }[] = [];
  const reads: ReturnType<typeof deferred<Snapshot>>[] = [];
  const sync = createDriverRoutesSync<Route>({
    uid: 'driver-a',
    observeRoutes(next, error) {
      const listener = { next, error, active: true };
      listeners.push(listener);
      return () => { listener.active = false; };
    },
    readServer() {
      const read = deferred<Snapshot>();
      reads.push(read);
      return read.promise;
    },
    lifecycle: { document, window, isVisible: () => visible, isOnline: () => online },
    now: () => now,
  });
  return {
    sync, reads, listeners, document, window,
    emit(snapshot: Snapshot) { listeners.at(-1)!.next(snapshot); },
    fail(code: string) { listeners.at(-1)!.error({ code }); },
    setVisible(value: boolean) { visible = value; document.dispatchEvent(new Event('visibilitychange')); },
    setOnline(value: boolean) { online = value; window.dispatchEvent(new Event(value ? 'online' : 'offline')); },
    advance(ms: number) { now += ms; },
  };
}

test('erro de permissão permanece como erro, sem anunciar lista vazia', async t => {
  const f = fixture(); t.after(f.sync.stop); f.sync.start(); await flush();
  f.fail('permission-denied');
  assert.equal(f.sync.getSnapshot().state, 'error');
  assert.equal(f.sync.getSnapshot().errorCode, 'permission-denied');
});

test('cache vazio não comprova ausência de rotas, mas resposta do servidor comprova', async t => {
  const f = fixture(); t.after(f.sync.stop); f.sync.start(); await flush();
  f.emit({ routes: [], fromCache: true });
  assert.equal(f.sync.getSnapshot().state, 'loading');
  assert.equal(f.sync.getSnapshot().lastServerSyncAt, null);
  f.emit({ routes: [], fromCache: false });
  assert.equal(f.sync.getSnapshot().state, 'empty');
  assert.equal(f.sync.getSnapshot().lastServerSyncAt, 100_000);
});

test('retomar o app consulta o servidor e recupera uma nova rota sem remontar', async t => {
  const f = fixture(); t.after(f.sync.stop); f.sync.start(); await flush();
  f.reads[0].resolve({ routes: [], fromCache: false }); await flush();
  f.setVisible(false); f.advance(31_000); f.setVisible(true); await flush();
  f.reads[1].resolve({ routes: [pending], fromCache: false }); await flush();
  assert.deepEqual(f.sync.getSnapshot().routes, [pending]);
  assert.equal(f.sync.getSnapshot().state, 'ready');
  assert.equal(f.listeners.filter(l => l.active).length, 1);
});

test('focus e pageshow também recuperam dados depois de suspensão do navegador', async t => {
  const f = fixture(); t.after(f.sync.stop); f.sync.start(); await flush();
  f.reads[0].resolve({ routes: [], fromCache: false }); await flush();
  f.advance(31_000); f.window.dispatchEvent(new Event('focus')); await flush();
  f.reads[1].resolve({ routes: [pending], fromCache: false }); await flush();
  f.advance(31_000); f.window.dispatchEvent(new Event('pageshow')); await flush();
  f.reads[2].resolve({ routes: [started], fromCache: false }); await flush();
  assert.deepEqual(f.sync.getSnapshot().routes, [started]);
});

test('sem rede preserva rotas conhecidas e sincroniza quando a conexão volta', async t => {
  const f = fixture(); t.after(f.sync.stop); f.sync.start(); await flush();
  f.reads[0].resolve({ routes: [pending], fromCache: false }); await flush();
  f.setOnline(false);
  assert.equal(f.sync.getSnapshot().state, 'offline');
  assert.deepEqual(f.sync.getSnapshot().routes, [pending]);
  f.advance(31_000); f.setOnline(true); await flush();
  f.reads[1].resolve({ routes: [pending, started], fromCache: false }); await flush();
  assert.deepEqual(f.sync.getSnapshot().routes, [started, pending]);
  assert.equal(f.sync.getSnapshot().state, 'ready');
});

test('eventos simultâneos e atualização manual compartilham uma única leitura em voo', async t => {
  const f = fixture(); t.after(f.sync.stop); f.sync.start(); await flush();
  f.window.dispatchEvent(new Event('focus')); f.setVisible(true);
  const manual = f.sync.refresh(); await flush();
  assert.equal(f.reads.length, 1);
  f.reads[0].resolve({ routes: [pending], fromCache: false }); await manual;
  assert.deepEqual(f.sync.getSnapshot().routes, [pending]);
});

test('atualização automática respeita 30 segundos; ação manual pode atualizar antes', async t => {
  const f = fixture(); t.after(f.sync.stop); f.sync.start(); await flush();
  f.reads[0].resolve({ routes: [], fromCache: false }); await flush();
  f.advance(10_000); f.window.dispatchEvent(new Event('focus')); await flush();
  assert.equal(f.reads.length, 1);
  const manual = f.sync.refresh(); await flush();
  assert.equal(f.reads.length, 2);
  f.reads[1].resolve({ routes: [pending], fromCache: false }); await manual;
  assert.deepEqual(f.sync.getSnapshot().routes, [pending]);
});

test('retomada dentro do limite agenda uma única leitura ao final do intervalo', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(); t.after(f.sync.stop); f.sync.start(); await flush();
  f.reads[0].resolve({ routes: [], fromCache: false }); await flush();
  f.advance(10_000); f.window.dispatchEvent(new Event('focus')); f.setVisible(true);
  f.advance(20_000); t.mock.timers.tick(20_000); await flush();
  assert.equal(f.reads.length, 2);
  f.reads[1].resolve({ routes: [pending], fromCache: false }); await flush();
  assert.deepEqual(f.sync.getSnapshot().routes, [pending]);
});

test('erro permanente não provoca tentativas automáticas e tentativa manual pode recuperar listener', async t => {
  const f = fixture(); t.after(f.sync.stop); f.sync.start(); await flush();
  f.reads[0].resolve({ routes: [pending], fromCache: false }); await flush();
  f.fail('failed-precondition');
  f.advance(31_000); f.window.dispatchEvent(new Event('focus')); f.setOnline(true); await flush();
  assert.equal(f.reads.length, 1);
  assert.equal(f.sync.getSnapshot().state, 'error');
  const manual = f.sync.refresh(); await flush();
  f.reads[1].resolve({ routes: [started], fromCache: false }); await manual;
  assert.equal(f.sync.getSnapshot().state, 'ready');
  assert.deepEqual(f.sync.getSnapshot().routes, [started]);
  assert.equal(f.listeners.filter(l => l.active).length, 1);
});

test('um snapshot novo do listener vence uma resposta antiga de atualização', async t => {
  const f = fixture(); t.after(f.sync.stop); f.sync.start(); await flush();
  f.emit({ routes: [started], fromCache: false });
  f.reads[0].resolve({ routes: [pending], fromCache: false }); await flush();
  assert.deepEqual(f.sync.getSnapshot().routes, [started]);
});

test('um snapshot novo do servidor não é apagado por erro antigo da leitura em voo', async t => {
  const f = fixture(); t.after(f.sync.stop); f.sync.start(); await flush();
  f.emit({ routes: [started], fromCache: false });
  f.reads[0].reject({ code: 'unavailable' }); await flush();
  assert.equal(f.sync.getSnapshot().state, 'ready');
  assert.deepEqual(f.sync.getSnapshot().routes, [started]);
});

test('cache vazio posterior não apaga rotas já confirmadas no servidor', async t => {
  const f = fixture(); t.after(f.sync.stop); f.sync.start(); await flush();
  f.reads[0].resolve({ routes: [pending], fromCache: false }); await flush();
  f.emit({ routes: [], fromCache: true });
  assert.deepEqual(f.sync.getSnapshot().routes, [pending]);
  assert.notEqual(f.sync.getSnapshot().state, 'empty');
});

test('parar remove eventos e ignora respostas e callbacks de sessão encerrada', async () => {
  const f = fixture(); f.sync.start(); await flush();
  f.sync.stop(); const stopped = f.sync.getSnapshot();
  f.reads[0].resolve({ routes: [pending], fromCache: false });
  f.listeners[0].next({ routes: [started], fromCache: false });
  f.advance(31_000); f.window.dispatchEvent(new Event('focus')); f.setVisible(true); await flush();
  assert.equal(f.sync.getSnapshot(), stopped);
  assert.equal(f.reads.length, 1);
  assert.equal(f.listeners.filter(l => l.active).length, 0);
});

test('remontagem em StrictMode ignora a leitura e o listener da montagem anterior', async t => {
  const f = fixture(); t.after(f.sync.stop); f.sync.start(); await flush();
  f.sync.stop(); f.sync.start(); await flush();
  f.reads[1].resolve({ routes: [started], fromCache: false }); await flush();
  f.reads[0].resolve({ routes: [pending], fromCache: false });
  f.listeners[0].next({ routes: [pending], fromCache: false }); await flush();
  assert.deepEqual(f.sync.getSnapshot().routes, [started]);
  assert.equal(f.listeners.filter(l => l.active).length, 1);
});

test('abrir sem rede não anuncia ausência de rotas nem inicia consulta de servidor', async t => {
  const f = fixture(); t.after(f.sync.stop); f.setOnline(false); f.sync.start(); await flush();
  f.emit({ routes: [], fromCache: true });
  assert.equal(f.sync.getSnapshot().state, 'offline');
  assert.equal(f.reads.length, 0);
});

test('consulta sem resposta termina com erro recuperável e descarta resultado tardio', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(); t.after(f.sync.stop); f.sync.start(); await flush();
  t.mock.timers.tick(15_000); await flush();
  assert.equal(f.sync.getSnapshot().state, 'error');
  assert.equal(f.sync.getSnapshot().errorCode, 'deadline-exceeded');
  assert.equal(f.sync.getSnapshot().isRefreshing, false);
  f.reads[0].resolve({ routes: [pending], fromCache: false }); await flush();
  assert.deepEqual(f.sync.getSnapshot().routes, []);
});

test('erro permanente do listener prevalece sobre falha de leitura iniciada antes dele', async t => {
  const f = fixture(); t.after(f.sync.stop); f.sync.start(); await flush();
  f.fail('permission-denied'); f.reads[0].reject({ code: 'unavailable' }); await flush();
  assert.equal(f.sync.getSnapshot().errorCode, 'permission-denied');
  f.advance(31_000); f.window.dispatchEvent(new Event('focus')); await flush();
  assert.equal(f.reads.length, 1);
});

test('resultado de leitura anterior não limpa erro permanente mais recente', async t => {
  const f = fixture(); t.after(f.sync.stop); f.sync.start(); await flush();
  f.fail('permission-denied'); f.reads[0].resolve({ routes: [pending], fromCache: false }); await flush();
  assert.equal(f.sync.getSnapshot().errorCode, 'permission-denied');
  assert.equal(f.sync.getSnapshot().state, 'error');
});
