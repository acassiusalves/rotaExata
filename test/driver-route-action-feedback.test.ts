import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { routeActionProblem } from '../src/lib/driver/route-action-feedback.ts';

const require = createRequire(import.meta.url);
const load = require('./support/load-callback.cjs');
const failure = (status: number, code: string) => Object.assign(new Error(code), { status, code });

test('sessão em verificação pede para aguardar em vez de culpar a rota', () => {
  const problem = routeActionProblem('start', failure(409, 'earnings_session_revalidating'));
  assert.match(problem.description, /sess[aã]o/i);
  assert.match(problem.description, /aguarde/i);
});

test('rota que saiu do estado esperado manda atualizar a tela', () => {
  assert.match(routeActionProblem('start', failure(409, 'route_invalid_state')).description, /atualize/i);
});

test('finalização recusada explica a regra de 80%', () => {
  assert.match(routeActionProblem('finish', failure(409, 'route_not_ready')).description, /80%/);
});

test('rota de outro motorista orienta a falar com a central', () => {
  assert.match(routeActionProblem('finish', failure(403, 'route_access_denied')).description, /central/i);
});

test('sessão expirada pede novo login', () => {
  assert.match(routeActionProblem('start', failure(401, 'earnings_unauthorized')).description, /entre novamente/i);
});

test('servidor indisponível é diferenciado de falta de internet', () => {
  const server = routeActionProblem('start', failure(503, 'route_unavailable')).description;
  const offline = routeActionProblem('start', new TypeError('Failed to fetch')).description;
  assert.match(server, /indispon[ií]vel/i);
  assert.match(offline, /conex[aã]o|internet/i);
  assert.notEqual(server, offline);
});

test('erro desconhecido mostra o código para o suporte', () => {
  const problem = routeActionProblem('finish', failure(418, 'route_teapot'));
  assert.match(problem.description, /finalizar/i);
  assert.match(problem.description, /route_teapot/);
});

test('o título diz qual ação falhou', () => {
  assert.match(routeActionProblem('start', failure(503, 'route_unavailable')).title, /iniciar/i);
  assert.match(routeActionProblem('finish', failure(503, 'route_unavailable')).title, /finalizar/i);
});

const page = 'src/app/(driver)/my-routes/[id]/page.tsx';
for (const [action, handler] of [['start', 'handleStartRoute'], ['finish', 'handleStopRoute']] as const) {
  test(`${handler} mostra ao motorista o motivo devolvido pelo servidor`, async () => {
    const notices: { title: string; description: string }[] = [];
    const actions = load(page, ['getCompletionPercentage', 'canFinishRoute', handler], {
      route: { status: action === 'start' ? 'dispatched' : 'in_progress', stops: [{ deliveryStatus: 'completed' }] },
      readOnly: false,
      routeAction: async () => { throw failure(409, 'earnings_session_revalidating'); },
      startTracking() {}, stopTracking() {}, setIsStarting() {}, isStarting: false,
      toast: (notice: { title: string; description: string }) => notices.push(notice),
      console: { error() {} }, routeActionProblem,
    });
    await actions[handler]();
    assert.equal(notices.length, 1);
    assert.match(notices[0].description, /sess[aã]o/i);
  });
}
