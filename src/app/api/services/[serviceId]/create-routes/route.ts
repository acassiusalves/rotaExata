import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import type { PlaceValue, RouteInfo, LunnaService } from '@/lib/types';
import { logRouteCreatedAdmin, logPointsCreatedAdmin, logRouteDispatchedAdmin } from '@/lib/firebase/activity-log-admin';

// Função para gerar código de rota dentro de um serviço (LN-XXXX-A, LN-XXXX-B, etc.)
function generateRouteCodeForService(serviceCode: string, routeIndex: number): string {
  const letter = String.fromCharCode(65 + routeIndex); // A, B, C, D, ...
  return `${serviceCode}-${letter}`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ serviceId: string }> }
) {
  try {
    const { serviceId } = await params;

    if (!adminDb) {
      return NextResponse.json(
        { error: 'Firebase Admin não inicializado' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { routes, userId } = body;

    // Validação de entrada
    if (!routes || !Array.isArray(routes) || routes.length === 0) {
      return NextResponse.json(
        { error: 'routes é obrigatório e deve ser um array não vazio' },
        { status: 400 }
      );
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'userId é obrigatório' },
        { status: 400 }
      );
    }

    // Buscar o serviço
    const serviceRef = adminDb.collection('services').doc(serviceId);
    const serviceSnap = await serviceRef.get();

    if (!serviceSnap.exists) {
      return NextResponse.json(
        { error: 'Serviço não encontrado' },
        { status: 404 }
      );
    }

    const serviceData = serviceSnap.data() as LunnaService;

    // Verificar se o serviço está em estado de organização
    if (serviceData.status !== 'organizing') {
      return NextResponse.json(
        { error: 'Serviço não está em estado de organização' },
        { status: 400 }
      );
    }

    // Criar mapa de stops por ID para acesso rápido
    const stopsMap = new Map<string, PlaceValue>();
    for (const stop of serviceData.allStops) {
      stopsMap.set(stop.id, stop);
    }

    // Criar as rotas
    const createdRoutes: Array<{ id: string; code: string; stopsCount: number }> = [];
    const routeIds: string[] = [];

    for (let i = 0; i < routes.length; i++) {
      const routeConfig = routes[i];
      const routeCode = generateRouteCodeForService(serviceData.code, i);

      // Obter os stops para esta rota
      const routeStops: PlaceValue[] = [];
      for (const stopId of routeConfig.stopIds) {
        const stop = stopsMap.get(stopId);
        if (stop) {
          routeStops.push(stop);
        }
      }

      if (routeStops.length === 0) {
        continue; // Pular rotas sem stops
      }

      // Gerar códigos sequenciais para os pontos da rota
      const stopsWithCodes = routeStops.map((stop, index) => ({
        ...stop,
        pointCode: `${routeCode}-${String(index + 1).padStart(3, '0')}`
      }));

      // Obter IDs dos pedidos Luna para esta rota
      const routeLunnaOrderIds = stopsWithCodes
        .map(s => s.orderNumber)
        .filter((n): n is string => !!n);

      // Criar documento da rota
      const routeData: Partial<RouteInfo> & {
        origin: PlaceValue;
        serviceId: string;
        serviceCode: string;
        plannedDate: any;
        createdBy: string;
        createdAt: any;
        name: string;
      } = {
        code: routeCode,
        name: routeConfig.name || `Rota ${String.fromCharCode(65 + i)}`,
        origin: serviceData.origin,
        stops: stopsWithCodes,
        encodedPolyline: '',
        distanceMeters: 0,
        duration: '0s',
        status: routeConfig.driverId ? 'dispatched' : 'draft',
        source: 'lunna',
        lunnaOrderIds: routeLunnaOrderIds,
        serviceId: serviceId,
        serviceCode: serviceData.code,
        visible: true,
        plannedDate: serviceData.plannedDate || FieldValue.serverTimestamp(),
        createdBy: userId,
        createdAt: FieldValue.serverTimestamp(),
      };

      // Adicionar motorista se fornecido
      if (routeConfig.driverId) {
        const driverDoc = await adminDb.collection('drivers').doc(routeConfig.driverId).get();
        if (driverDoc.exists) {
          const driverData = driverDoc.data();
          (routeData as any).driverId = routeConfig.driverId;
          (routeData as any).driverInfo = {
            name: driverData?.name || 'Motorista',
            vehicle: driverData?.vehicle || { type: 'Carro', plate: '' },
          };
        }
      }

      const routeRef = await adminDb.collection('routes').add(routeData);
      routeIds.push(routeRef.id);

      createdRoutes.push({
        id: routeRef.id,
        code: routeCode,
        stopsCount: routeStops.length,
      });

      // Registrar atividade: criação da rota
      try {
        if (routeConfig.driverId) {
          // Se tem motorista, registrar como dispatch
          const driverDoc = await adminDb.collection('drivers').doc(routeConfig.driverId).get();
          const driverData = driverDoc.exists ? driverDoc.data() : null;

          await logRouteDispatchedAdmin({
            userId: userId,
            userName: 'Sistema Lunna',
            routeId: routeRef.id,
            routeCode: routeCode,
            serviceId: serviceId,
            serviceCode: serviceData.code,
            driverName: driverData?.name || 'Motorista',
            driverId: routeConfig.driverId,
            totalPoints: stopsWithCodes.length,
          });
        } else {
          // Se não tem motorista, registrar apenas criação
          await logRouteCreatedAdmin({
            userId: userId,
            userName: 'Sistema Lunna',
            routeId: routeRef.id,
            routeCode: routeCode,
            serviceId: serviceId,
            serviceCode: serviceData.code,
            totalPoints: stopsWithCodes.length,
          });
        }

        // Registrar criação dos pontos
        const pointCodes = stopsWithCodes.map(s => s.pointCode).filter((c): c is string => !!c);
        if (pointCodes.length > 0) {
          await logPointsCreatedAdmin({
            userId: userId,
            userName: 'Sistema Lunna',
            routeId: routeRef.id,
            routeCode: routeCode,
            serviceId: serviceId,
            serviceCode: serviceData.code,
            pointCodes: pointCodes,
            totalPoints: pointCodes.length,
          });
        }
      } catch (logError) {
        console.error('Erro ao registrar atividade:', logError);
        // Não falha a criação da rota se houver erro no log
      }

      // Atualizar pedidos do Luna com referência à rota específica
      for (const stop of routeStops) {
        if (stop.orderNumber) {
          // Buscar o pedido pelo número
          const ordersQuery = await adminDb
            .collection('orders')
            .where('number', '==', stop.orderNumber)
            .limit(1)
            .get();

          if (!ordersQuery.empty) {
            const orderDoc = ordersQuery.docs[0];
            await orderDoc.ref.update({
              logisticsStatus: routeConfig.driverId ? 'em_rota' : 'pendente',
              rotaExataRouteId: routeRef.id,
              rotaExataRouteCode: routeCode,
              updatedAt: FieldValue.serverTimestamp(),
            });
          }
        }
      }
    }

    // Atualizar o serviço com os IDs das rotas e novo status
    const allRoutesDispatched = routes.every(r => r.driverId);
    await serviceRef.update({
      routeIds: routeIds,
      status: allRoutesDispatched ? 'dispatched' : 'organizing',
      'stats.totalRoutes': createdRoutes.length,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      routes: createdRoutes,
      serviceStatus: allRoutesDispatched ? 'dispatched' : 'organizing',
    });
  } catch (error) {
    console.error('Erro ao criar rotas do serviço:', error);
    return NextResponse.json(
      {
        error: 'Erro interno ao criar rotas',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
