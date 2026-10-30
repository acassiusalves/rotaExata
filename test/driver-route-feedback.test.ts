import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const load = require('./support/load-callback.cjs');
const pages = ['src/app/(admin)/routes/service/[serviceId]/acompanhar/page.tsx', 'src/app/(admin)/routes/[routeId]/acompanhar/page.tsx'];
for (const page of pages) for (const outcome of ['skipped_no_token', 'failed', 'accepted']) {
  test(`${page}: mensagem final preserva resultado ${outcome} sem prometer recebimento`, async () => {
    const notices: { description: string }[] = [];
    const route = { stops: [{ id: 'one' }], encodedPolyline: '', distanceMeters: 0, duration: '0s' };
    const context = {
      routeData: {}, getRoute: () => route, getRouteDisplayName: () => 'Rota', getExistingRouteId: () => 'route-a',
      setIsSaving() {}, assignedDrivers: {}, availableDrivers: [], user: null, getPersistedStops: () => route.stops,
      saveExistingRoutePlansAtomically: async () => [{ routeId: 'route-a', stops: route.stops, changes: [{}], status: 'dispatched', driverId: 'a' }],
      applySavedRouteResult() {}, functions: {}, httpsCallable: () => async () => ({ data: { push: { outcome } } }),
      toast: (notice: { description: string }) => notices.push(notice), console: { error() {} }, RouteStructureConflictError: class extends Error {},
    };
    const actions = load(page, ['notifySavedRouteChanges', 'handleUpdateExistingRoute'], context);
    await actions.handleUpdateExistingRoute('A');
    assert.equal(notices.length, 1, 'o resultado deve produzir uma mensagem final, sem substituir o aviso anterior');
    const last = notices.at(-1)!.description;
    assert.doesNotMatch(last, /será notificado|recebido pelo/i);
    assert.match(last, outcome === 'accepted' ? /encaminhado|envio/ : /não.*(enviado|enviar)|ativar.*notifica/i);
  });
}

test('impersonação não marca aviso como aberto no consumidor real', async () => {
  let writes = 0;
  const actions = load('src/app/(driver)/driver/notifications/page.tsx', ['handleMarkAsOpened'], {
    isImpersonationSessionActive: () => true, updateDoc: async () => { writes++; }, doc: () => ({}), db: {}, serverTimestamp: () => 1, console,
  });
  await actions.handleMarkAsOpened('notice-a', false);
  assert.equal(writes, 0);
});

test('gateway público recusa confirmação de alteração em modo teste', async () => {
  let writes = 0;
  const actions = load('src/lib/firebase/route-stop-mutations.ts', ['acknowledgeRouteChangesAtomically'], {
    isImpersonationSessionActive: () => true,
    defaultGateway: { acknowledgeRouteChangesAtomically: async () => { writes++; } },
  });
  await assert.rejects(actions.acknowledgeRouteChangesAtomically('route-a'));
  assert.equal(writes, 0);
});
