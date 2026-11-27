import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export const project = 'demo-rotaexata-driver';
export const sourcePort = Number(process.env.TEST_PLANNING_AUTH_PORT ?? 3497);
export const appPort = Number(process.env.TEST_PLANNING_PORT ?? 3498);
export const source = 'http://127.0.0.1:' + sourcePort;
export const base = 'http://127.0.0.1:' + appPort;
export const publishableKey = 'sb_publishable_planning_fixture';

export function requirePlanningEmulator() {
  if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8181') {
    throw new Error('Run the browser tests with FIRESTORE_EMULATOR_HOST=127.0.0.1:8181.');
  }
}

const serviceId = 'web-planning-fixture-service';
const routeId = 'web-planning-fixture-route-a';
const closedId = 'web-planning-fixture-route-b';
const draftId = 'web-planning-fixture-draft';
const orderId = 'web-planning-fixture-order';
const driverId = 'web-planning-fixture-driver';
const point = (id, name, lat, lng) => ({ id, placeId: 'place-'+id, address: name, customerName: name, lat, lng });
const origin = point('origin','Depósito de teste',-16.681,-49.256);
const first = point('first','Parada Base',-16.688,-49.245);
const second = point('second','Parada Seguinte',-16.699,-49.252);
const old = {...point('historic','Parada Entregue',-16.7,-49.25),deliveryStatus:'completed'};
const pool = {...point(orderId,'Pedido Avulso',-16.692,-49.249),orderNumber:'P-TESTE-4902'};
const replacement = point('luna-replacement','Parada Atualizada pela Luna',-16.687,-49.238);
const driverName = 'Motorista do navegador';
const plannedDate = new Date('2026-11-27T12:00:00-03:00');

export async function seedPlanningData() {
  requirePlanningEmulator();
  const name = 'planning-browser-fixtures';
  const app = getApps().find(app => app.name === name) ?? initializeApp({ projectId:project }, name);
  const db = getFirestore(app);
  const service = db.doc('services/'+serviceId);
  const active = db.doc('routes/'+routeId);
  const closed = db.doc('routes/'+closedId);
  const draft = db.doc('routes/'+draftId);
  const order = db.doc('orders/'+orderId);
  const common = { origin, distanceMeters:1200, duration:'600s', encodedPolyline:'_p~iF~ps|U_ulLnnqC_mqNvxq~@', plannedDate, visible:true };
  await Promise.all([
    service.set({ ...common, name:'Serviço de teste', code:'LNS-TESTE', status:'dispatched',
      allStops:[first,second,old,pool], routeIds:[routeId,closedId], stats:{totalRoutes:2,totalDeliveries:4} }),
    active.set({ ...common,name:'Planejamento A',code:'LNS-TESTE-A',serviceId,serviceCode:'LNS-TESTE',
      source:'lunna',status:'in_progress',stops:[first,second],unassignedStops:[pool] }),
    closed.set({ ...common,name:'Planejamento B',code:'LNS-TESTE-B',serviceId,serviceCode:'LNS-TESTE',
      source:'lunna',status:'completed',stops:[old],unassignedStops:[pool] }),
    draft.set({ ...common,name:'Rascunho de teste',code:'RT-TESTE',source:'rota-exata',status:'draft',
      routeDate:'2026-11-27',routeTime:'12:00',stops:[first,second],organizedRoutes:[{
        key:'A',name:'Rascunho A',stops:[first,second],
        info:{distanceMeters:1200,duration:'600s',encodedPolyline:common.encodedPolyline,color:'#e60000'},dispatched:false,
      }] }),
    order.set({number:pool.orderNumber,logisticsStatus:'em_rota',rotaExataServiceId:serviceId,
      rotaExataRouteId:closedId,rotaExataRouteCode:'LNS-TESTE-B'}),
    db.doc('users/'+driverId).set({role:'driver',active:true,name:driverName,vehicle:{type:'Carro',plate:'TESTE'}}),
  ]);
  return { db,service,active,closed,draft,order,first,second,replacement,old,pool,driverName,driverId };
}

export const pages = {
  route: '/routes/'+routeId+'/acompanhar',
  service: '/routes/service/'+serviceId+'/acompanhar',
  completed: '/routes/'+closedId+'/acompanhar',
  initial: '/routes/organize?draft='+draftId,
};
