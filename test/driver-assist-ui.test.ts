import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url);
const { buildSync } = require('esbuild');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const load = require('./support/load-callback.cjs');

function component<T>(file: string, name: string) {
  const compiled = buildSync({ entryPoints: [resolve(file)], bundle: true, external: ['react', 'react-dom'],
    mainFields: ['module', 'main'], platform: 'node', format: 'cjs', write: false });
  const module = { exports: {} as Record<string, T> };
  runInNewContext(compiled.outputFiles[0].text, { module, exports: module.exports, require, process });
  return module.exports[name];
}

const AssistBanner = component<(props: Record<string, unknown>) => unknown>('src/components/driver/assist-banner.tsx', 'AssistBanner');

test('a faixa diz em nome de quem o operador age e que a ação fica no nome dele', () => {
  const html = renderToStaticMarkup(React.createElement(AssistBanner, { driverName: 'João Entregador', staffName: 'Maria Operadora', onEnd() {} }));
  assert.match(html, /Operando como/);
  assert.match(html, /João Entregador/);
  assert.match(html, /Maria Operadora/);
  assert.match(html, /<button[^>]*>.*Encerrar.*<\/button>/s);
  assert.match(html, /role="status"/);
});

test('no modo operador abrir um aviso não o marca como lido para o motorista', async () => {
  let writes = 0;
  const actions = load('src/app/(driver)/driver/notifications/page.tsx', ['handleMarkAsOpened'], {
    readOnly: false, assist: { driverName: 'João', staffName: 'Maria', expiresAt: '' }, request: () => {}, endpoint: '/api/staff/driver-assist',
    driverCommand: async () => { writes++; }, refresh() {}, window: { dispatchEvent() {} }, Event,
  });
  await actions.handleMarkAsOpened('notice-a', false);
  assert.equal(writes, 0);
});

test('no modo operador as preferências do motorista não são gravadas', async () => {
  let writes = 0;
  const actions = load('src/app/(driver)/driver/settings/page.tsx', ['saveSettings'], {
    readOnly: false, assist: { driverName: 'João', staffName: 'Maria', expiresAt: '' }, request: () => {}, endpoint: '/api/staff/driver-assist',
    driverCommand: async () => { writes++; }, setSettings() {}, toast() {}, console: { error() {} },
  });
  assert.equal(await actions.saveSettings({ notifications: false, darkMode: true, autoNavigation: false, keepScreenOn: true }), false);
  assert.equal(writes, 0);
});

function assistContext(overrides: Record<string, unknown>) {
  const tab = { location: { href: '' }, closed: false, close() { this.closed = true; } };
  const notices: { title: string; description?: string }[] = [];
  const calls: { path: string; init: { method: string; body: string } }[] = [];
  return { tab, notices, calls, context: {
    driver: { id: 'driver-1', name: 'João Entregador' }, reason: '  Motorista sem sinal  ',
    isReopenReasonValid: (value: string) => value.trim().length >= 5,
    setIsSubmitting() {}, onClose() {}, window: { open: () => tab },
    staff: { request: async (path: string, init: { method: string; body: string }) => { calls.push({ path, init }); return { grantId: '3f2c1a9e-8b7d-4c6f-9a1b-2d3e4f5a6b7c' }; } },
    assistEntryPath: (grantId: string) => '/impersonate-driver?grant=' + grantId,
    assistOpenMessage: () => 'Motorista não encontrado.',
    toast: (notice: { title: string; description?: string }) => notices.push(notice), ...overrides,
  } };
}

test('confirmar o motivo abre o acesso e leva a nova aba para o app do motorista', async () => {
  const f = assistContext({});
  await load('src/components/drivers/driver-assist-dialog.tsx', ['handleConfirm'], f.context).handleConfirm();
  assert.equal(f.calls[0].path, '/api/staff/drivers/driver-1/assist');
  assert.equal(f.calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(f.calls[0].init.body), { reason: 'Motorista sem sinal' });
  assert.equal(f.tab.location.href, '/impersonate-driver?grant=3f2c1a9e-8b7d-4c6f-9a1b-2d3e4f5a6b7c');
});

test('se o servidor recusa, a aba aberta é fechada e o operador vê o motivo', async () => {
  const f = assistContext({ staff: { request: async () => { throw Object.assign(new Error('x'), { status: 404, code: 'staff_driver_not_found' }); } } });
  await load('src/components/drivers/driver-assist-dialog.tsx', ['handleConfirm'], f.context).handleConfirm();
  assert.equal(f.tab.closed, true);
  assert.equal(f.notices.at(-1)!.description, 'Motorista não encontrado.');
});

test('motivo curto não abre aba nem chama o servidor', async () => {
  const f = assistContext({ reason: 'oi' });
  let opened = 0;
  f.context.window = { open: () => { opened++; return f.tab; } };
  await load('src/components/drivers/driver-assist-dialog.tsx', ['handleConfirm'], f.context).handleConfirm();
  assert.equal(opened, 0);
  assert.equal(f.calls.length, 0);
});

for (const [mode, assist, expected] of [
  ['operador', { driverName: 'João', staffName: 'Maria', expiresAt: '' }, /em andamento/i],
  ['motorista', null, /rastreamento est[aá] ativo/i],
] as const) {
  test(`ao iniciar a rota, o aviso para o ${mode} só fala de rastreamento quando ele liga`, async () => {
    const notices: { title: string; description: string }[] = [];
    const actions = load('src/app/(driver)/my-routes/[id]/page.tsx', ['handleStartRoute'], {
      route: { status: 'dispatched', stops: [] }, readOnly: false, assist, isStarting: false, setIsStarting() {},
      routeAction: async () => ({ ok: true }), startTracking() {},
      toast: (notice: { title: string; description: string }) => notices.push(notice),
      console: { error() {} }, routeActionProblem: () => ({ title: 'x', description: 'x' }),
    });
    await actions.handleStartRoute();
    assert.equal(notices.length, 1);
    assert.match(notices[0].description, expected);
    if (assist) assert.doesNotMatch(notices[0].description, /rastreamento/i);
  });
}
