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
