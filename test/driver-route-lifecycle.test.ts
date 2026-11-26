import assert from 'node:assert/strict';
import { test } from 'node:test';
import { finishReadiness, routeActionLogLine } from '../src/lib/driver/route-lifecycle.ts';

const stops = (done: number, open: number, extra: unknown[] = []) => [
  ...Array.from({ length: done }, (_, i) => ({ id: 'd' + i, deliveryStatus: i % 2 ? 'failed' : 'completed' })),
  ...Array.from({ length: open }, (_, i) => ({ id: 'o' + i })),
  ...extra,
];

test('rota em andamento com 80% das paradas resolvidas pode ser finalizada', () => {
  assert.deepEqual(finishReadiness('in_progress', stops(4, 1)), { ready: true, routeStatus: 'in_progress', activeStops: 5, resolvedStops: 4 });
});

test('abaixo de 80% a finalização é recusada e os números explicam por quê', () => {
  assert.deepEqual(finishReadiness('in_progress', stops(3, 2)), { ready: false, routeStatus: 'in_progress', activeStops: 5, resolvedStops: 3 });
});

test('rota que nunca foi iniciada não pode ser finalizada mesmo com tudo entregue', () => {
  const result = finishReadiness('dispatched', stops(5, 0));
  assert.equal(result.ready, false);
  assert.equal(result.routeStatus, 'dispatched');
});

test('parada desvinculada não conta no total nem como pendência', () => {
  const result = finishReadiness('in_progress', stops(4, 0, [{ id: 'x', unlinkedAt: 'ontem' }]));
  assert.deepEqual([result.ready, result.activeStops, result.resolvedStops], [true, 4, 4]);
});

test('parada "pending" ou sem desfecho continua em aberto', () => {
  const result = finishReadiness('in_progress', [{ deliveryStatus: 'pending' }, {}, { deliveryStatus: 'completed' }]);
  assert.deepEqual([result.ready, result.activeStops, result.resolvedStops], [false, 3, 1]);
});

test('rota sem paradas ativas ou com dados malformados não é finalizável e não quebra', () => {
  assert.equal(finishReadiness('in_progress', []).ready, false);
  assert.equal(finishReadiness('in_progress', undefined).ready, false);
  assert.deepEqual(finishReadiness(undefined, [null, 'x']), { ready: false, routeStatus: null, activeStops: 2, resolvedStops: 0 });
});

test('linha de log de recusa leva ação, rota, código e contagens', () => {
  const line = routeActionLogLine({ action: 'finish', routeId: 'route-1', uid: 'driver-1', httpStatus: 409, code: 'route_not_ready',
    detail: { routeStatus: 'dispatched', activeStops: 6, resolvedStops: 0 } });
  assert.match(line, /^\[driver-route\] /);
  assert.deepEqual(JSON.parse(line.slice('[driver-route] '.length)), { action: 'finish', routeId: 'route-1', uid: 'driver-1',
    httpStatus: 409, code: 'route_not_ready', routeStatus: 'dispatched', activeStops: 6, resolvedStops: 0 });
});

test('linha de log de exceção registra nome e mensagem limitada do erro', () => {
  const error = Object.assign(new RangeError('x'.repeat(900)), { code: 10 });
  const logged = JSON.parse(routeActionLogLine({ action: 'start', routeId: 'route-1', uid: 'driver-1', httpStatus: 503,
    code: 'route_unavailable', error }).slice('[driver-route] '.length));
  assert.equal(logged.error.name, 'RangeError');
  assert.equal(logged.error.code, 10);
  assert.equal(logged.error.message.length, 300);
});

test('valor lançado que não é Error também fica registrado', () => {
  const logged = JSON.parse(routeActionLogLine({ action: 'start', routeId: 'r', uid: 'u', httpStatus: 503, code: 'route_unavailable',
    error: 'boom' }).slice('[driver-route] '.length));
  assert.deepEqual(logged.error, { name: 'string', message: 'boom' });
});

test('linha de log identifica o acesso quando o comando veio do painel', () => {
  const logged = JSON.parse(routeActionLogLine({ action: 'finish', routeId: 'r', uid: 'u', httpStatus: 409, code: 'route_not_ready',
    assistGrantId: 'grant-1' }).slice('[driver-route] '.length));
  assert.equal(logged.assistGrantId, 'grant-1');
});
