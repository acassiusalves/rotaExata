import assert from 'node:assert/strict';
import { test } from 'node:test';
import { locationPublisher } from '../src/lib/driver/location-publish.ts';

const here = { lat: -16.6, lng: -49.2 };
const far = { lat: -16.7, lng: -49.2 }; // ~11 km
const failure = (status: number) => Object.assign(new Error('falhou'), { status });
const gate = () => locationPublisher({ interval: 5000, distance: 10 });

test('a primeira posição é enviada', () => {
  assert.equal(gate().due(1000, here), true);
});

test('depois de um envio aceito, só reenvia ao se mover ou ao passar o intervalo', () => {
  const g = gate();
  g.attempted(1000); g.succeeded(1000, here);
  assert.equal(g.due(2000, here), false);
  assert.equal(g.due(2000, far), true);
  assert.equal(g.due(6000, here), true);
});

test('depois de uma falha, novas posições esperam o intervalo em vez de virar rajada', () => {
  const g = gate();
  g.attempted(1000); g.failed(failure(503));
  assert.equal(g.due(1200, here), false);
  assert.equal(g.due(3000, far), false, 'mover-se não fura a espera após falha');
  assert.equal(g.due(6000, far), true);
});

test('falha logo após um envio aceito também respeita o intervalo', () => {
  const g = gate();
  g.attempted(1000); g.succeeded(1000, here);
  g.attempted(7000); g.failed(failure(503));
  assert.equal(g.due(8000, far), false);
  assert.equal(g.due(12000, far), true);
});

test('agenda no máximo três novas tentativas seguidas e zera a contagem ao ter sucesso', () => {
  const g = gate();
  const outcomes = [1, 2, 3, 4].map(n => { g.attempted(n * 10000); return g.failed(failure(503)); });
  assert.deepEqual(outcomes, ['retry', 'retry', 'retry', 'wait']);
  g.attempted(60000); g.succeeded(60000, here);
  g.attempted(70000);
  assert.equal(g.failed(failure(503)), 'retry');
});

test('404 encerra os envios: a rota não aceita mais localização', () => {
  const g = gate();
  g.attempted(1000);
  assert.equal(g.failed(failure(404)), 'halt');
  assert.equal(g.halted, true);
  assert.equal(g.due(60000, far), false);
  assert.equal(g.due(60000, far, true), false, 'nem pedido forçado da central reabre o envio');
});

test('quando a rota volta a ser rastreável os envios recomeçam', () => {
  const g = gate();
  g.attempted(1000); g.failed(failure(404));
  g.resume();
  assert.equal(g.halted, false);
  assert.equal(g.due(2000, here), true);
});

test('pedido de localização da central ignora os filtros de distância e tempo', () => {
  const g = gate();
  g.attempted(1000); g.succeeded(1000, here);
  assert.equal(g.due(1500, here, true), true);
});
