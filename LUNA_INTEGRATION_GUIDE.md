# Guia de Integração Luna ↔ Rota Exata

## Origem Padrão (OBRIGATÓRIO)

**Todos** os serviços e rotas criados pelo Luna **DEVEM** incluir o campo `origin` com a seguinte estrutura:

```typescript
const DEFAULT_ORIGIN = {
  id: 'default-origin-sol-de-maria',
  address: 'Avenida Circular, 1028, Setor Pedro Ludovico, Goiânia-GO',
  placeId: 'ChIJFT_4_9XFUpQRy_14vCVa2po',
  lat: -16.6786,
  lng: -49.2552,
};
```

## Ao criar um novo SERVIÇO

```typescript
await addDoc(collection(db, 'services'), {
  code: 'LNS-XXXX',
  origin: DEFAULT_ORIGIN,  // ⚠️ OBRIGATÓRIO
  allStops: [],
  routeIds: [],
  stats: {
    totalDeliveries: 0,
    totalDistance: 0,
    totalDuration: '0s',
  },
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
});
```

## Ao criar uma nova ROTA

```typescript
await addDoc(collection(db, 'routes'), {
  name: 'Rota A',
  code: 'LNS-XXXX-A',
  origin: DEFAULT_ORIGIN,  // ⚠️ OBRIGATÓRIO
  serviceId: serviceId,
  serviceCode: serviceCode,
  source: 'lunna',
  stops: [],
  unassignedStops: [],
  encodedPolyline: '',
  distanceMeters: 0,
  duration: '0s',
  status: 'draft',
  plannedDate: Timestamp.fromDate(new Date(routeDate)),
  period: 'Matutino',
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
});
```

## Adicionar pedido diretamente a uma rota específica

```typescript
// 1. Adicionar o stop à rota usando arrayUnion
const routeRef = doc(db, 'routes', routeId);
await updateDoc(routeRef, {
  stops: arrayUnion(stopData),
  updatedAt: serverTimestamp(),
});

// 2. Atualizar o pedido com as informações da rota
const ordersQuery = query(collection(db, 'orders'), where('number', '==', orderNumber));
const ordersSnap = await getDocs(ordersQuery);
for (const orderDoc of ordersSnap.docs) {
  await updateDoc(doc(db, 'orders', orderDoc.id), {
    logisticsStatus: 'allocated',
    rotaExataServiceId: serviceId,
    rotaExataServiceCode: serviceCode,
    rotaExataRouteId: routeId,
    updatedAt: serverTimestamp(),
  });
}

// 3. Atualizar o serviço
const serviceRef = doc(db, 'services', serviceId);
await updateDoc(serviceRef, {
  allStops: arrayUnion(stopData),
  'stats.totalDeliveries': increment(1),
  updatedAt: serverTimestamp(),
});
```

## Desvincular pedido de rota (mover para não alocados)

```typescript
// 1. Buscar rota atual
const routeRef = doc(db, 'routes', routeId);
const routeSnap = await getDoc(routeRef);
const routeData = routeSnap.data();

// 2. Remover dos stops e adicionar aos unassignedStops
const newStops = routeData.stops.filter(s => s.orderNumber !== orderNumber);
const stopToMove = routeData.stops.find(s => s.orderNumber === orderNumber);

await updateDoc(routeRef, {
  stops: newStops,
  unassignedStops: arrayUnion(stopToMove),
  updatedAt: serverTimestamp(),
});

// 3. Atualizar pedido para remover routeId mas manter serviceId
const ordersQuery = query(collection(db, 'orders'), where('number', '==', orderNumber));
const ordersSnap = await getDocs(ordersQuery);
for (const orderDoc of ordersSnap.docs) {
  await updateDoc(doc(db, 'orders', orderDoc.id), {
    logisticsStatus: 'pending',
    rotaExataRouteId: null,
    updatedAt: serverTimestamp(),
  });
}
```

## Desvincular pedido completamente (remover do serviço)

```typescript
// 1. Buscar e remover de TODAS as rotas do serviço
const routesQuery = query(collection(db, 'routes'), where('serviceId', '==', serviceId));
const routesSnap = await getDocs(routesQuery);

for (const routeDoc of routesSnap.docs) {
  const routeData = routeDoc.data();
  const newStops = routeData.stops.filter(s => s.orderNumber !== orderNumber);
  const newUnassigned = (routeData.unassignedStops || []).filter(s => s.orderNumber !== orderNumber);

  await updateDoc(doc(db, 'routes', routeDoc.id), {
    stops: newStops,
    unassignedStops: newUnassigned,
    updatedAt: serverTimestamp(),
  });
}

// 2. Remover do serviço
const serviceRef = doc(db, 'services', serviceId);
const serviceSnap = await getDoc(serviceRef);
const serviceData = serviceSnap.data();
const newAllStops = serviceData.allStops.filter(s => s.orderNumber !== orderNumber);

await updateDoc(serviceRef, {
  allStops: newAllStops,
  'stats.totalDeliveries': newAllStops.length,
  updatedAt: serverTimestamp(),
});

// 3. Limpar campos do pedido
const ordersQuery = query(collection(db, 'orders'), where('number', '==', orderNumber));
const ordersSnap = await getDocs(ordersQuery);
for (const orderDoc of ordersSnap.docs) {
  await updateDoc(doc(db, 'orders', orderDoc.id), {
    logisticsStatus: null,
    rotaExataServiceId: null,
    rotaExataServiceCode: null,
    rotaExataRouteId: null,
    updatedAt: serverTimestamp(),
  });
}
```

## Scripts de Correção (caso origin esteja faltando)

Se por algum motivo serviços ou rotas forem criados sem o campo `origin`, execute:

```bash
# Corrigir rotas
npx tsx scripts/fix-lunna-route-origins.ts

# Corrigir serviços
npx tsx scripts/fix-lunna-service-origins.ts
```

## Validação

Para verificar se um serviço/rota tem origin válido:

```typescript
function hasValidOrigin(data: any): boolean {
  return !!(
    data.origin &&
    typeof data.origin.lat === 'number' &&
    typeof data.origin.lng === 'number' &&
    data.origin.lat !== 0 &&
    data.origin.lng !== 0
  );
}
```
