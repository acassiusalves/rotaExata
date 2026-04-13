'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import { db } from '@/lib/firebase/client';
import { doc, getDoc, getDocs, collection, query, where, Timestamp, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import type { LunnaService, PlaceValue } from '@/lib/types';

export default function ServiceOrganizePage() {
  const router = useRouter();
  const params = useParams();
  const serviceId = params.serviceId as string;
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const loadServiceAndRedirect = async () => {
      try {
        // Buscar dados do serviço
        const serviceRef = doc(db, 'services', serviceId);
        const serviceSnap = await getDoc(serviceRef);

        if (!serviceSnap.exists()) {
          setError('Serviço não encontrado');
          setIsLoading(false);
          return;
        }

        const serviceData = serviceSnap.data() as LunnaService;

        console.log('📦 [ServiceOrganize] Dados do serviço carregados:', {
          code: serviceData.code,
          status: serviceData.status,
          stopsCount: serviceData.allStops?.length || 0,
          hasOrigin: !!serviceData.origin,
          originAddress: serviceData.origin?.address,
        });

        // Validar se o serviço tem stops
        if (!serviceData.allStops || serviceData.allStops.length === 0) {
          setError('Serviço não possui paradas para organizar');
          setIsLoading(false);
          return;
        }

        // Validar se o serviço tem origem
        if (!serviceData.origin || !serviceData.origin.lat || !serviceData.origin.lng) {
          setError('Serviço não possui origem definida');
          setIsLoading(false);
          return;
        }

        const plannedDate = serviceData.plannedDate instanceof Timestamp
          ? serviceData.plannedDate.toDate()
          : serviceData.plannedDate instanceof Date
            ? serviceData.plannedDate
            : new Date();
        const routeDateISO = plannedDate.toISOString();
        const routeTime = `${String(plannedDate.getHours()).padStart(2, '0')}:${String(plannedDate.getMinutes()).padStart(2, '0')}`;

        // Buscar rotas já existentes para este serviço
        const existingRoutesQuery = query(
          collection(db, 'routes'),
          where('serviceId', '==', serviceId)
        );
        const existingRoutesSnap = await getDocs(existingRoutesQuery);

        const existingServiceRoutes: Array<{
          id: string;
          code: string;
          name: string;
          stops: PlaceValue[];
          distanceMeters: number;
          duration: string;
          encodedPolyline: string;
          color: string;
          status: string;
          driverId?: string;
          driverInfo?: { name: string; vehicle: { type: string; plate: string } };
        }> = [];

        const assignedStopIds = new Set<string>();
        const assignedOrderNumbers = new Set<string>();
        // Coletar stops não atribuídos que foram adicionados diretamente nas rotas pelo Luna
        const routeUnassignedStops: PlaceValue[] = [];

        for (const routeDoc of existingRoutesSnap.docs) {
          const routeData = routeDoc.data();
          const routeStops = (routeData.stops || []) as PlaceValue[];

          // Registrar IDs e orderNumbers dos stops já atribuídos a rotas
          routeStops.forEach((stop) => {
            const stopId = String(stop.id ?? stop.placeId);
            if (stopId) assignedStopIds.add(stopId);
            if (stop.orderNumber) assignedOrderNumbers.add(stop.orderNumber);
          });

          // Coletar unassignedStops das rotas (adicionados via Luna diretamente)
          const routeUnassigned = (routeData.unassignedStops || []) as PlaceValue[];
          if (routeUnassigned.length > 0) {
            // Auto-merge: mover unassignedStops com coordenadas válidas para stops da rota
            const validUnassigned = routeUnassigned.filter(s => s.lat && s.lng && s.lat !== 0 && s.lng !== 0);
            const invalidUnassigned = routeUnassigned.filter(s => !s.lat || !s.lng || s.lat === 0 || s.lng === 0);

            if (validUnassigned.length > 0) {
              // Deduplicar contra stops existentes da rota
              const existingRouteOrders = new Set(routeStops.map(s => s.orderNumber).filter(Boolean));
              const newValidStops = validUnassigned.filter(s => !s.orderNumber || !existingRouteOrders.has(s.orderNumber));

              if (newValidStops.length > 0) {
                const mergedStops = [...routeStops, ...newValidStops];
                // Atualizar Firestore: mover para stops e limpar unassignedStops
                try {
                  await updateDoc(doc(db, 'routes', routeDoc.id), {
                    stops: mergedStops,
                    unassignedStops: invalidUnassigned, // Manter apenas os sem coordenadas
                    updatedAt: serverTimestamp(),
                  });
                  console.log(`✅ [ServiceOrganize] Auto-merge: ${newValidStops.length} stop(s) movido(s) para rota ${routeData.code || routeDoc.id}`);
                  // Atualizar routeStops local para refletir a mudança
                  routeStops.push(...newValidStops);
                  // Registrar os novos stops como atribuídos
                  newValidStops.forEach(s => {
                    const sid = String(s.id ?? s.placeId);
                    if (sid) assignedStopIds.add(sid);
                    if (s.orderNumber) assignedOrderNumbers.add(s.orderNumber);
                  });
                } catch (err) {
                  console.error('❌ [ServiceOrganize] Erro ao auto-merge:', err);
                  // Em caso de erro, tratar como não atribuídos normalmente
                  routeUnassignedStops.push(...validUnassigned);
                }
              }
            }
            // Stops sem coordenadas continuam como não atribuídos
            if (invalidUnassigned.length > 0) {
              routeUnassignedStops.push(...invalidUnassigned);
            }
          }

          existingServiceRoutes.push({
            id: routeDoc.id,
            code: routeData.code || '',
            name: routeData.name || '',
            stops: routeStops,
            distanceMeters: routeData.distanceMeters || 0,
            duration: routeData.duration || '0s',
            encodedPolyline: routeData.encodedPolyline || '',
            color: routeData.color || '#6366f1',
            status: routeData.status || 'draft',
            driverId: routeData.driverId,
            driverInfo: routeData.driverInfo,
          });
        }

        // Auto-cleanup: verificar pedidos desvinculados no Luna e removê-los das rotas
        const allOrderNumbers = new Set<string>();
        existingServiceRoutes.forEach(r => {
          r.stops.forEach(s => { if (s.orderNumber) allOrderNumbers.add(s.orderNumber); });
        });
        routeUnassignedStops.forEach(s => { if (s.orderNumber) allOrderNumbers.add(s.orderNumber); });

        if (allOrderNumbers.size > 0) {
          try {
            // Buscar orders pelo orderNumber para verificar se foram desvinculados
            const orderNumbers = Array.from(allOrderNumbers);
            const unlinkedOrders = new Set<string>();

            // Firestore where-in aceita max 30 itens por query
            for (let i = 0; i < orderNumbers.length; i += 30) {
              const batch = orderNumbers.slice(i, i + 30);
              const ordersSnap = await getDocs(
                query(collection(db, 'orders'), where('number', 'in', batch))
              );
              for (const orderDoc of ordersSnap.docs) {
                const orderData = orderDoc.data();
                // Se o pedido não tem rotaExataServiceId ou não referencia este serviço, foi desvinculado
                if (!orderData.rotaExataServiceId || orderData.rotaExataServiceId !== serviceId) {
                  if (orderData.number) unlinkedOrders.add(orderData.number);
                }
              }
            }

            if (unlinkedOrders.size > 0) {
              console.log(`🧹 [ServiceOrganize] Pedidos desvinculados detectados:`, Array.from(unlinkedOrders));

              // Remover stops desvinculados de cada rota
              for (let ri = 0; ri < existingServiceRoutes.length; ri++) {
                const route = existingServiceRoutes[ri];
                const origStopsLen = route.stops.length;
                route.stops = route.stops.filter(s => !s.orderNumber || !unlinkedOrders.has(s.orderNumber));
                const removed = origStopsLen - route.stops.length;

                if (removed > 0) {
                  // Atualizar Firestore
                  try {
                    const cleanedUnassigned = routeUnassignedStops.filter(s => !s.orderNumber || !unlinkedOrders.has(s.orderNumber));

                    await updateDoc(doc(db, 'routes', route.id), {
                      stops: route.stops,
                      unassignedStops: cleanedUnassigned,
                      updatedAt: serverTimestamp(),
                    });
                    console.log(`✅ [ServiceOrganize] Removido ${removed} stop(s) desvinculado(s) da rota ${route.code || route.id}`);
                  } catch (err) {
                    console.error('❌ [ServiceOrganize] Erro ao limpar stops desvinculados:', err);
                  }
                }
              }

              // Remover dos sets de atribuídos
              unlinkedOrders.forEach(on => {
                assignedOrderNumbers.delete(on);
              });

              // Limpar routeUnassignedStops
              const cleanedRouteUnassigned = routeUnassignedStops.filter(s => !s.orderNumber || !unlinkedOrders.has(s.orderNumber));
              routeUnassignedStops.length = 0;
              routeUnassignedStops.push(...cleanedRouteUnassigned);

              // Também limpar do allStops do serviço
              const origAllStopsLen = serviceData.allStops.length;
              serviceData.allStops = serviceData.allStops.filter(
                (s: PlaceValue) => !s.orderNumber || !unlinkedOrders.has(s.orderNumber)
              );
              if (serviceData.allStops.length < origAllStopsLen) {
                try {
                  const serviceRef = doc(db, 'services', serviceId);
                  await updateDoc(serviceRef, {
                    allStops: serviceData.allStops,
                    'stats.totalDeliveries': serviceData.allStops.length,
                    updatedAt: serverTimestamp(),
                  });
                  console.log(`✅ [ServiceOrganize] Removido ${origAllStopsLen - serviceData.allStops.length} stop(s) desvinculado(s) do serviço`);
                } catch (err) {
                  console.error('❌ [ServiceOrganize] Erro ao limpar allStops do serviço:', err);
                }
              }
            }
          } catch (err) {
            console.error('❌ [ServiceOrganize] Erro ao verificar pedidos desvinculados:', err);
          }
        }

        // Filtrar stops do serviço que ainda não foram atribuídos a nenhuma rota
        const unassignedFromService = serviceData.allStops.filter((stop) => {
          const stopId = String(stop.id ?? stop.placeId);
          if (assignedStopIds.has(stopId)) return false;
          if (stop.orderNumber && assignedOrderNumbers.has(stop.orderNumber)) return false;
          return true;
        });

        // Auto-deduplicar unassignedFromService (evitar duplicatas dentro do próprio allStops)
        const seenServiceOrders = new Set<string>();
        const seenServiceIds = new Set<string>();
        const dedupedFromService = unassignedFromService.filter(s => {
          const sid = String(s.id ?? s.placeId);
          if (seenServiceIds.has(sid)) return false;
          if (s.orderNumber && seenServiceOrders.has(s.orderNumber)) return false;
          seenServiceIds.add(sid);
          if (s.orderNumber) seenServiceOrders.add(s.orderNumber);
          return true;
        });

        // Combinar: stops não atribuídos do serviço + stops não atribuídos das rotas (evitando duplicatas)
        const allUnassignedIds = new Set(dedupedFromService.map(s => String(s.id ?? s.placeId)));
        const allUnassignedOrders = new Set(
          dedupedFromService.map(s => s.orderNumber).filter(Boolean)
        );
        const newFromRoutes = routeUnassignedStops.filter(s => {
          const sid = String(s.id ?? s.placeId);
          // Evitar duplicata por ID
          if (allUnassignedIds.has(sid)) return false;
          // Evitar duplicata por orderNumber (mesmo pedido com ID diferente)
          if (s.orderNumber && (assignedOrderNumbers.has(s.orderNumber) || allUnassignedOrders.has(s.orderNumber))) return false;
          allUnassignedIds.add(sid);
          if (s.orderNumber) allUnassignedOrders.add(s.orderNumber);
          return true;
        });
        const unassignedStops = [...dedupedFromService, ...newFromRoutes];

        console.log('📦 [ServiceOrganize] Rotas existentes:', existingServiceRoutes.length);
        console.log('📦 [ServiceOrganize] Stops já atribuídos:', assignedStopIds.size);
        console.log('📦 [ServiceOrganize] Stops não atribuídos (serviço):', dedupedFromService.length);
        console.log('📦 [ServiceOrganize] Stops não atribuídos (rotas):', newFromRoutes.length);
        console.log('📦 [ServiceOrganize] Total stops não atribuídos:', unassignedStops.length);

        // Preparar dados para a página de organização
        const routeData = {
          origin: serviceData.origin,
          stops: unassignedStops, // Apenas stops não atribuídos
          routeDate: routeDateISO,
          routeTime,
          isService: true,
          serviceId: serviceId,
          serviceCode: serviceData.code,
          isExistingRoute: false,
          existingServiceRoutes: existingServiceRoutes.length > 0 ? existingServiceRoutes : undefined,
        };

        console.log('📦 [ServiceOrganize] Salvando no sessionStorage:', {
          stopsCount: routeData.stops.length,
          hasOrigin: !!routeData.origin,
          originAddress: routeData.origin?.address,
          originLat: routeData.origin?.lat,
          originLng: routeData.origin?.lng,
          serviceCode: routeData.serviceCode,
          isService: routeData.isService,
          existingRoutes: existingServiceRoutes.length,
        });
        console.log('📦 [ServiceOrganize] Origin completo:', routeData.origin);

        // Não precisa mais do sessionStorage - usar URL diretamente
        // sessionStorage.setItem('newRouteData', JSON.stringify(routeData));

        // Redirecionar para a nova URL com serviceId
        router.push(`/routes/service/${serviceId}/acompanhar`);
      } catch (err) {
        console.error('Erro ao carregar serviço:', err);
        setError('Erro ao carregar dados do serviço');
        setIsLoading(false);
      }
    };

    if (serviceId) {
      loadServiceAndRedirect();
    }
  }, [serviceId, router]);

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-destructive text-lg">{error}</p>
          <button
            onClick={() => router.push('/routes')}
            className="mt-4 text-primary underline"
          >
            Voltar para Rotas
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin" />
      <span className="ml-4">Carregando serviço...</span>
    </div>
  );
}
