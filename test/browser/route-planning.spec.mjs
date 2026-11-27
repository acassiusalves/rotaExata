import { test as baseTest, expect } from '@playwright/test';
import { base, pages, publishableKey, seedPlanningData, source } from './planning-data.mjs';

const test = baseTest.extend({
  planning: async ({ context, request }, use) => {
    const data = await seedPlanningData();
    const response = await request.post(source+'/auth/v1/token?grant_type=password',{headers:{apikey:publishableKey}});
    expect(response.ok()).toBeTruthy();
    await context.addInitScript(({ value, origin }) => {
      if (location.origin === origin) localStorage.setItem('rotaexata-platform-auth',JSON.stringify(value));
    }, { value:await response.json(), origin:base });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === base && url.pathname === '/api/compute-optimized-route') {
        return route.fulfill({json:{distanceMeters:1234,duration:'625s',encodedPolyline:'_p~iF~ps|U_ulLnnqC_mqNvxq~@'}});
      }
      return url.origin === base || url.origin === source ? route.continue() : route.abort();
    });
    await use(data);
  },
});

const tab = (page, name) => page.getByRole('tab',{name,exact:true});
const stop = (page, name) => page.getByTitle(new RegExp('^Parada [0-9]+: '+name));
const available = (page, name) => page.getByTitle(name+' - Arraste para uma rota',{exact:true});
const planResponse = (page, kind) => page.waitForResponse(response =>
  response.url().endsWith('/api/staff/routes/plan') && response.request().postDataJSON().body.poolMove?.kind === kind);
const writes = page => {
  const requests = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (request.method() === 'PATCH' || path === '/api/staff/routes/plan') requests.push(request);
  });
  return requests;
};

async function drag(page, source, target) {
  await expect(source).toBeVisible();
  await expect(target).toBeVisible();
  const from = await source.boundingBox(), to = await target.boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  try {
    const draggable = source.locator('xpath=ancestor-or-self::*[@aria-roledescription][1]');
    await expect(draggable).toHaveAttribute('aria-pressed','true',{timeout:3000});
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2,{steps:12});
  } finally {
    await page.mouse.up();
  }
}

for (const [view,path] of Object.entries(pages)) {
  test('planning tabs retain the current plan by mouse and keyboard on '+view, async ({ page, planning }) => {
    await page.goto(path);
    const firstStop = view === 'completed' ? planning.old : planning.first;
    await expect(stop(page,firstStop.customerName)).toBeVisible();
    const mutations = writes(page);
    await tab(page,'Atribuir').click();
    if (view !== 'completed') {
      const drivers = page.getByRole('tabpanel').getByRole('combobox').first();
      await drivers.click();
      await page.getByRole('option',{name:new RegExp(planning.driverName)}).click();
      await expect(drivers).toContainText(planning.driverName);
    }
    await tab(page,'Atribuir').focus();
    await page.keyboard.press('ArrowRight');
    await expect(tab(page,'Revisar')).toHaveAttribute('aria-selected','true');
    if (view === 'completed') {
      const completed = page.getByRole('group',{name:'Planejamento B',exact:true});
      await expect(completed).toBeVisible();
      await expect(completed.getByRole('button',{name:/Salvar Alterações|Despachar Rota/})).toHaveCount(0);
    } else {
      await expect(page.getByRole('tabpanel')).toContainText(planning.driverName);
    }
    await tab(page,'Organizar').click();
    await expect(stop(page,firstStop.customerName)).toBeVisible();
    await tab(page,'Atribuir').click();
    if (view !== 'completed') await expect(page.getByRole('tabpanel').getByRole('combobox').first()).toContainText(planning.driverName);
    expect(mutations.map(request=>request.url())).toEqual([]);
  });
}

test('service allocation survives reload and can return through the route page', async ({ page, planning }) => {
  const { active, closed, order, pool } = planning;
  const closedBefore = await closed.get();
  await page.goto(pages.service);
  const allocate = planResponse(page,'allocate');
  await drag(page, available(page,pool.customerName), stop(page,planning.first.customerName));
  expect((await allocate).status()).toBe(200);
  await expect(stop(page,pool.customerName)).toBeVisible();
  await expect(available(page,pool.customerName)).toHaveCount(0);
  expect((await order.get()).get('rotaExataRouteId')).toBe(active.id);
  expect((await closed.get()).updateTime.isEqual(closedBefore.updateTime)).toBe(true);

  await page.reload();
  await expect(stop(page,pool.customerName)).toBeVisible();
  await expect(available(page,pool.customerName)).toHaveCount(0);
  await page.goto(pages.route);
  const returned = planResponse(page,'return');
  await stop(page,pool.customerName).click({button:'right'});
  await page.getByRole('button',{name:'Remover da Rota',exact:true}).click();
  expect((await returned).status()).toBe(200);
  await expect(available(page,pool.customerName)).toBeVisible();
  await expect(stop(page,pool.customerName)).toHaveCount(0);
  await page.reload();
  await expect(available(page,pool.customerName)).toBeVisible();
  const linked = await order.get();
  expect(linked.get('rotaExataRouteId')).toBeNull();
  expect(linked.get('rotaExataServiceId')).toBe(planning.service.id);
  expect(linked.get('logisticsStatus')).toBe('programado');
});

test('a rejected allocation leaves the point available', async ({ page, planning }) => {
  const { active, order, pool } = planning;
  await order.update({rotaExataServiceId:'another-fixture-service'});
  await page.goto(pages.route);
  const request = planResponse(page,'allocate');
  await drag(page,available(page,pool.customerName),stop(page,planning.first.customerName));
  const response=await request;
  expect(response.status()).toBe(409);
  await expect(page.getByText('O vínculo atual do pedido impede este movimento.',{exact:true})).toBeVisible();
  await expect(available(page,pool.customerName)).toBeVisible();
  await expect(stop(page,pool.customerName)).toHaveCount(0);
  expect((await active.get()).get('stops')).toHaveLength(2);
});

test('after losing a response the retry confirms the existing command', async ({ page, planning }) => {
  const { active, pool, db } = planning;
  await page.goto(pages.route);
  const requests = [];
  await page.route('**/api/staff/routes/plan', async route => {
    const body = route.request().postDataJSON().body;
    requests.push(body.commandId);
    if (requests.length > 1) { await route.continue(); return; }
    const saved = await route.fetch();
    expect(saved.status()).toBe(200);
    await route.abort('failed');
  });
  await drag(page,available(page,pool.customerName),stop(page,planning.first.customerName));
  await expect(page.getByText('Gravação pendente de confirmação',{exact:true})).toBeVisible();
  const retry = planResponse(page,'allocate');
  await page.getByRole('button',{name:'Tentar novamente',exact:true}).click();
  const receipt = await (await retry).json();
  expect(receipt.replayed).toBe(true);
  expect(requests).toEqual([requests[0],requests[0]]);
  await expect(stop(page,pool.customerName)).toBeVisible();
  expect((await active.get()).get('stops').filter(item=>item.id===pool.id)).toHaveLength(1);
  const audit = await db.collection('activity_log').where('staffAuditOperationId','==',requests[0]).get();
  expect(audit.docs.filter(doc=>doc.get('eventType')==='point_added_to_route')).toHaveLength(1);
});

for (const view of ['route','service']) {
  test('a Luna replacement and removal refresh '+view+' without a reload', async ({ page, planning }) => {
    const { active, first, second, replacement } = planning;
    await page.goto(pages[view]);
    await expect(stop(page,first.customerName)).toBeVisible();
    await active.update({stops:[replacement,second],distanceMeters:2034,duration:'701s'});
    await expect(stop(page,replacement.customerName)).toBeVisible();
    await expect(stop(page,first.customerName)).toHaveCount(0);
    await expect(page.getByText('2.03 km',{exact:true})).toBeVisible();

    await active.update({stops:[replacement],distanceMeters:1110,duration:'300s'});
    await expect(stop(page,second.customerName)).toHaveCount(0);
    await expect(page.getByText('1.11 km',{exact:true})).toBeVisible();
  });
}

test('a pending reorder survives tab changes and detects a conflicting Luna edit', async ({ page, planning }) => {
  const { active, first, second, replacement } = planning;
  await page.goto(pages.route);
  await drag(page, stop(page,second.customerName), stop(page,first.customerName));
  await expect(page.getByRole('button',{name:'Aplicar Todas as Edições'})).toBeVisible();
  await tab(page,'Revisar').click();
  await expect(page.getByRole('tabpanel').getByText('Edições pendentes',{exact:true})).toBeVisible();
  await tab(page,'Organizar').click();
  await expect(page.getByRole('button',{name:'Cancelar Todas'})).toBeVisible();
  await active.update({stops:[replacement,second],distanceMeters:2100,duration:'700s'});
  await expect(page.getByText('A rota mudou durante a edição',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Aplicar Todas as Edições'}).click();
  await expect(page.getByText('Recarregue as rotas e tente aplicar as alterações novamente.',{exact:true})).toBeVisible();
  expect((await active.get()).get('stops').map(item=>item.id)).toEqual([replacement.id,second.id]);
  await page.getByRole('button',{name:'Cancelar Todas'}).click();
  await expect(stop(page,replacement.customerName)).toBeVisible();
});

test('draft availability survives a reload and remains after dispatching the arranged route', async ({ page, planning }) => {
  const { draft, first, second, driverName, driverId, db } = planning;
  await page.goto(pages.initial);
  await stop(page,first.customerName).click({button:'right'});
  await page.getByRole('button',{name:'Remover da Rota',exact:true}).click();
  await expect.poll(async () => (await draft.get()).get('unassignedStops')?.map(item=>item.id)).toEqual([first.id]);
  await page.reload();
  await expect(stop(page,second.customerName)).toBeVisible();
  await expect(stop(page,first.customerName)).toHaveCount(0);
  await page.getByRole('button',{name:'Serviços não alocados',exact:true}).click();
  await expect(page.getByText(first.customerName,{exact:true})).toBeVisible();
  await page.keyboard.press('Escape');

  await tab(page,'Atribuir').click();
  await page.getByRole('tabpanel').getByRole('combobox').first().click();
  await page.getByRole('option',{name:new RegExp(driverName)}).click();
  await tab(page,'Revisar').click();
  const published = page.waitForResponse(response => response.url().endsWith('/api/staff/routes/plan') &&
    response.request().postDataJSON().body.draftDispatch?.routeId === draft.id);
  await page.getByRole('button',{name:'Despachar Rota',exact:true}).click();
  const response = await published;
  expect(response.status()).toBe(200);
  const [created] = (await response.json()).createdRoutes;
  const saved = await db.doc('routes/'+created.routeId).get();
  expect(saved.get('driverId')).toBe(driverId);
  expect(saved.get('stops').map(item=>item.id)).toEqual([second.id]);
  expect((await draft.get()).get('unassignedStops').map(item=>item.id)).toEqual([first.id]);
});

test('service assignment only changes the stored driver after the explicit save', async ({ page, planning }) => {
  const { active, driverName, driverId } = planning;
  await page.goto(pages.service);
  await expect(stop(page,planning.first.customerName)).toBeVisible();
  await tab(page,'Atribuir').click();
  await page.getByRole('tabpanel').getByRole('combobox').first().click();
  await page.getByRole('option',{name:new RegExp(driverName)}).click();
  await tab(page,'Revisar').click();
  await expect(page.getByRole('tabpanel')).toContainText(driverName);
  expect((await active.get()).get('driverId')).toBeUndefined();
  await tab(page,'Atribuir').click();
  const saved = page.waitForResponse(response=>response.url().endsWith('/api/staff/routes/plan') &&
    response.request().postDataJSON().body.existingPlans[0]?.metadata?.driverId === driverId);
  await page.getByRole('button',{name:'Salvar Alterações',exact:true}).first().click();
  expect((await saved).status()).toBe(200);
  expect((await active.get()).get('driverId')).toBe(driverId);
});
