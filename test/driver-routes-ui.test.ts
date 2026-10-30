import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url);
const { buildSync } = require('esbuild');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const compiled = buildSync({
  entryPoints: [resolve('src/components/driver/route-sync-status.tsx')],
  bundle: true, external: ['react', 'react-dom'], mainFields: ['module', 'main'],
  platform: 'node', format: 'cjs', write: false,
});
const module = { exports: {} as { RouteSyncStatus: (props: Record<string, unknown>) => unknown } };
runInNewContext(compiled.outputFiles[0].text, { module, exports: module.exports, require, process });

function render(state: string, overrides = {}) {
  return renderToStaticMarkup(React.createElement(module.exports.RouteSyncStatus, {
    state, isRefreshing: false, lastServerSyncAt: null, onRefresh() {}, ...overrides,
  }));
}

test('erro da consulta permanece visível com botão de nova tentativa', () => {
  const html = render('error');
  assert.match(html, /role="alert"/);
  assert.match(html, /Tentar novamente/);
  assert.doesNotMatch(html, /Nenhuma rota disponível/);
});

test('sem conexão preserva orientação de retomada e não anuncia lista vazia', () => {
  const html = render('offline', { lastServerSyncAt: 100_000 });
  assert.match(html, /Sem conexão/);
  assert.match(html, /role="status"/);
  assert.doesNotMatch(html, /Nenhuma rota disponível/);
});

test('atualização em andamento desabilita novas tentativas com rótulo acessível', () => {
  const html = render('loading', { isRefreshing: true });
  assert.match(html, /disabled/);
  assert.match(html, /Atualizando/);
});

test('uma lista sincronizada oferece atualização manual sem mostrar alerta de falha', () => {
  const html = render('ready', { lastServerSyncAt: 100_000 });
  assert.match(html, /Atualizar rotas/);
  assert.doesNotMatch(html, /role="alert"/);
});
