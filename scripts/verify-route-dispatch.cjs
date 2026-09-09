// Run with: node --test scripts/verify-route-dispatch.cjs
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');
const ts = require('typescript');

const pages = [
  'src/app/(admin)/routes/service/[serviceId]/acompanhar/page.tsx',
  'src/app/(admin)/routes/[routeId]/acompanhar/page.tsx',
];

// Execute the page's real callbacks without mounting Maps, Auth or Firestore.
// Only their external dependencies are supplied by the test fixtures.
function loadActions(page, context) {
  const source = ts.createSourceFile(page, readFileSync(resolve(__dirname, '..', page), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names = ['getRoute', 'getExistingRouteId', 'shouldUpdateExistingRoute', 'handleDispatchRoute', 'loadRouteFromFirestore'];
  const declarations = new Map();
  function visit(node) {
    if (ts.isVariableDeclaration(node) && names.includes(node.name.getText(source))) {
      declarations.set(node.name.getText(source), `const ${node.getText(source)};`);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.equal(declarations.size, names.length, 'callbacks de despacho devem ser encontrados');
  const code = ts.transpileModule(
    `${[...declarations.values()].join('\n')}\n({ ${names.join(', ')} });`,
    { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } },
  ).outputText;
  return runInNewContext(code, context);
}

function fixture() {
  const route = {
    stops: [{ id: 'stop-1', address: 'Rua de teste', lat: -16.7, lng: -49.2 }],
    status: 'draft', distanceMeters: 41170, duration: '6660s', encodedPolyline: 'polyline', color: '#e60000',
  };
  return {
    routeData: { isService: true, serviceId: 'service-1', serviceCode: 'LN-TEST', routeDate: '2026-09-09', routeTime: '11:11', origin: route.stops[0] },
    routeA: { ...route }, routeB: { ...route },
    serviceRouteIds: { A: 'draft-a', B: 'draft-b' },
    dynamicRoutes: [{ key: 'C', name: 'Rota 3', firestoreId: 'draft-c', data: { ...route } }],
    additionalRoutes: [],
    assignedDrivers: { A: 'driver-1', B: 'driver-1', C: 'driver-1' },
    availableDrivers: [{ id: 'driver-1', name: 'Motorista de teste', vehicle: { type: 'Moto', plate: 'TEST' } }],
  };
}

for (const page of pages) {
  for (const key of ['A', 'B', 'C']) {
    test(`${page}: rascunho ${key} salvo deve permitir despacho`, () => {
      const actions = loadActions(page, fixture());
      assert.equal(actions.getExistingRouteId(key), `draft-${key.toLowerCase()}`);
      assert.equal(actions.shouldUpdateExistingRoute(key), false, 'rascunho não pode oferecer somente Salvar Alterações');
    });
  }

  for (const status of ['dispatched', 'in_progress', 'completed', 'completed_auto']) {
    test(`${page}: rota ${status} deve salvar sem ser despachada novamente`, () => {
      const context = fixture();
      context.routeData.isExistingRoute = true;
      context.routeData.currentRouteId = 'existing-route';
      context.routeA.status = status;
      assert.equal(loadActions(page, context).shouldUpdateExistingRoute('A'), true);
    });
  }

  test(`${page}: rota nova sem documento deve permitir despacho`, () => {
    const context = fixture();
    context.serviceRouteIds.A = null;
    assert.equal(loadActions(page, context).shouldUpdateExistingRoute('A'), false);
  });

  test(`${page}: rascunho adicional do período mantém edição no contexto atual`, () => {
    const context = fixture();
    context.additionalRoutes = [{ id: 'other-draft', name: 'Outra rota', data: { ...context.routeA } }];
    assert.equal(loadActions(page, context).shouldUpdateExistingRoute('other-draft'), true,
      'o despacho de outra rota deve ser feito na própria tela, com seu serviço, origem e data');
  });

  for (const isService of [false, true]) {
  test(`${page}: carregar e despachar rascunho ${isService ? 'de serviço' : 'avulso'} pelo ID preserva o documento`, async () => {
    const context = fixture();
    context.routeData = { ...context.routeData, isService, isExistingRoute: true, currentRouteId: 'current-draft' };
    context.serviceRouteIds.A = null;
    const storedRoute = { ...context.routeA, origin: context.routeData.origin, code: 'LN-TEST-B', driverId: 'driver-1' };
    context.parsedData = { ...context.routeData, existingRouteData: storedRoute };
    const writes = [];
    const notices = [];
    Object.assign(context, {
      console: { log() {}, error() {}, warn() {} },
      user: null,
      getRouteDisplayName: () => 'Rota de teste',
      setIsSaving() {}, setIsLoading() {}, setRouteNames() {}, setAssignedDrivers() {}, setDynamicRoutes() {},
      setRouteA: (value) => { context.routeA = value; },
      setRouteB: (value) => { context.routeB = value; },
      setRouteData: (update) => { context.routeData = update(context.routeData); },
      getDoc: async () => ({ id: 'current-draft', exists: () => true, data: () => storedRoute }),
      rememberPersistedStops() {},
      carregarOrigemPadrao: async () => storedRoute.origin,
      isValidOrigin: () => true,
      toast: (notice) => notices.push(notice),
      serverTimestamp: () => 'server-timestamp',
      getPersistedStops: (_id, stops) => stops,
      saveExistingRoutePlansAtomically: async (plans) => {
        writes.push(...plans);
        return plans.map(plan => ({ routeId: plan.routeId, status: plan.metadata.status, driverId: plan.metadata.driverId, stops: plan.plannedStops, changes: [] }));
      },
      applySavedRouteResult() {}, notifySavedRouteChanges: async () => {},
      db: {}, collection: () => 'routes',
      doc: (_db, collection, id) => ({ collection, id }),
      updateDoc: async () => {}, arrayUnion: (...values) => values, increment: (value) => value,
      addDoc: async () => { throw new Error('Não deve criar uma segunda rota'); },
      RouteStructureConflictError: class extends Error {},
    });
    const actions = loadActions(page, context);
    await actions.loadRouteFromFirestore();
    assert.equal(context.routeA.status, 'draft', 'carregamento deve preservar o status do rascunho');
    assert.equal(context.routeA.code, 'LN-TEST-B', 'carregamento deve preservar o código, mesmo usando a chave local A');
    assert.equal(actions.shouldUpdateExistingRoute('A'), false);
    await actions.handleDispatchRoute('A');
    assert.equal(writes.length, 1, 'o despacho deve atualizar o rascunho existente');
    assert.equal(writes[0].routeId, 'current-draft');
    assert.equal(writes[0].expectedStatus, 'draft', 'despacho deve exigir que a rota ainda seja rascunho no servidor');
    assert.equal(writes[0].metadata.status, 'dispatched');
    assert.equal(writes[0].metadata.driverId, 'driver-1');
    if (isService) assert.equal(writes[0].metadata.code, 'LN-TEST-B', 'despacho não pode renumerar uma rota existente');
    assert.equal(writes[0].plannedStops.length, 1);
    assert.equal(notices.some(notice => notice.variant === 'destructive'), false);
  });
  }
}
