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
  entryPoints: [resolve('src/components/driver/route-start-card.tsx')],
  bundle: true, external: ['react', 'react-dom'], mainFields: ['module', 'main'],
  platform: 'node', format: 'cjs', write: false,
});
const module = { exports: {} as { RouteStartCard: (props: Record<string, unknown>) => unknown } };
runInNewContext(compiled.outputFiles[0].text, { module, exports: module.exports, require, process });

// O atributo, não a classe utilitária `disabled:` que o botão sempre carrega.
const locked = /<button[^>]*\sdisabled=""/;
const render = (overrides = {}) => renderToStaticMarkup(
  React.createElement(module.exports.RouteStartCard, { starting: false, disabled: false, onStart() {}, ...overrides }));

test('rota despachada mostra o botão de iniciar dentro do próprio aviso', () => {
  const html = render();
  assert.match(html, /<button[^>]*>.*Iniciar rota.*<\/button>/s);
  assert.doesNotMatch(html, locked);
});

test('o aviso explica por que as entregas ainda não podem ser confirmadas', () => {
  assert.match(render(), /Confirmar.*(liberad|depois)/is);
});

test('enquanto a rota inicia o botão fica travado e avisa que está iniciando', () => {
  const html = render({ starting: true });
  assert.match(html, locked);
  assert.match(html, /Iniciando/);
});

test('modo somente leitura não oferece o início da rota', () => {
  assert.match(render({ disabled: true }), locked);
});
