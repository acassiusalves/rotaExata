import { db } from '@/lib/firebase/client';
import { doc, updateDoc, serverTimestamp, collection, query, where, getDocs, getDoc } from 'firebase/firestore';
import type { RouteInfo, PlaceValue, LunnaService, LunnaServiceStatus } from '@/lib/types';
import { logLunnaStatusUpdated } from './firebase/activity-log';

/**
 * Sincroniza status de entrega com pedidos do Lunna
 * Atualiza o campo logisticsStatus no pedido quando o motorista completa/falha uma entrega
 */
export async function syncLunnaOrderStatus(
  routeInfo: RouteInfo,
  stop: PlaceValue,
  newStatus: 'entregue' | 'falha'
) {
  // Verifica se a rota é do Lunna
  if (routeInfo.source !== 'lunna') {
    return;
  }

  // Busca o número do pedido
  const orderNumber = stop.orderNumber;
  if (!orderNumber) {
    console.warn('Stop não tem orderNumber, não é possível sincronizar');
    return;
  }

  try {
    // Buscar pedido pelo número na coleção orders
    const ordersRef = collection(db, 'orders');
    const q = query(ordersRef, where('number', '==', orderNumber));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      console.warn(`Pedido ${orderNumber} não encontrado no Lunna`);
      return;
    }

    const orderDoc = snapshot.docs[0];
    const orderData = orderDoc.data();
    const oldStatus = orderData.logisticsStatus || 'pendente';

    // Atualizar status do pedido
    await updateDoc(doc(db, 'orders', orderDoc.id), {
      logisticsStatus: newStatus,
      updatedAt: serverTimestamp(),
    });

    // Registra a sincronização no log de atividades
    await logLunnaStatusUpdated({
      userId: 'system-auto',
      userName: 'Sistema Automático',
      orderId: orderDoc.id,
      orderNumber: orderNumber,
      oldStatus: oldStatus,
      newStatus: newStatus,
      routeId: routeInfo.id,
      routeCode: routeInfo.code,
      pointId: stop.id,
      pointCode: stop.pointCode,
    }).catch(logError => {
      // Não propaga erro de logging para não quebrar sincronização
      console.error('[Lunna Sync] Erro ao registrar log:', logError);
    });
  } catch (error) {
    console.error(`❌ Erro ao sincronizar status do pedido ${orderNumber}:`, error);
    throw error;
  }
}

/**
 * Remove associação de pedido com rota quando removido da rota
 * Volta o status para 'pendente'
 */
export async function removeLunnaOrderFromRoute(orderNumber: string) {
  try {
    const ordersRef = collection(db, 'orders');
    const q = query(ordersRef, where('number', '==', orderNumber));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const orderDoc = snapshot.docs[0];
      await updateDoc(doc(db, 'orders', orderDoc.id), {
        logisticsStatus: 'pendente',
        rotaExataRouteId: null,
        rotaExataRouteCode: null,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    console.error(`❌ Erro ao remover associação do pedido ${orderNumber}:`, error);
    throw error;
  }
}

/**
 * Atualiza múltiplos pedidos quando uma rota é movida ou editada
 * Mantém o status 'em_rota' mas atualiza o routeId/routeCode
 */
export async function updateLunnaOrdersRoute(
  orderNumbers: string[],
  newRouteId: string,
  newRouteCode: string
) {
  try {
    const ordersRef = collection(db, 'orders');

    for (const orderNumber of orderNumbers) {
      const q = query(ordersRef, where('number', '==', orderNumber));
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        const orderDoc = snapshot.docs[0];
        await updateDoc(doc(db, 'orders', orderDoc.id), {
          rotaExataRouteId: newRouteId,
          rotaExataRouteCode: newRouteCode,
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch (error) {
    console.error('❌ Erro ao atualizar pedidos com nova rota:', error);
    throw error;
  }
}

// ============================================
// FUNÇÕES PARA SINCRONIZAÇÃO DE SERVIÇOS LUNA
// ============================================

/**
 * Atualiza estatísticas do serviço quando uma entrega é concluída/falha
 */
export async function updateServiceStats(serviceId: string) {
  try {
    const serviceRef = doc(db, 'services', serviceId);
    const serviceSnap = await getDoc(serviceRef);

    if (!serviceSnap.exists()) {
      console.warn(`Serviço ${serviceId} não encontrado`);
      return;
    }

    const serviceData = serviceSnap.data() as LunnaService;

    // Buscar todas as rotas do serviço
    const routesRef = collection(db, 'routes');
    const routesQuery = query(routesRef, where('serviceId', '==', serviceId));
    const routesSnap = await getDocs(routesQuery);

    let completedRoutes = 0;
    let completedDeliveries = 0;
    let failedDeliveries = 0;

    for (const routeDoc of routesSnap.docs) {
      const routeData = routeDoc.data() as RouteInfo;

      // Verificar se rota está completa
      if (routeData.status === 'completed' || routeData.status === 'completed_auto') {
        completedRoutes++;
      }

      // Contar entregas por status
      for (const stop of routeData.stops || []) {
        if (stop.deliveryStatus === 'completed') {
          completedDeliveries++;
        } else if (stop.deliveryStatus === 'failed') {
          failedDeliveries++;
        }
      }
    }

    // Determinar status do serviço
    let newStatus: LunnaServiceStatus = serviceData.status;
    const totalRoutes = routesSnap.size;

    if (totalRoutes > 0) {
      if (completedRoutes === totalRoutes) {
        newStatus = 'completed';
      } else if (completedRoutes > 0 || failedDeliveries > 0) {
        newStatus = 'partial';
      } else if (routesSnap.docs.some(d => (d.data() as RouteInfo).status === 'in_progress')) {
        newStatus = 'in_progress';
      }
    }

    // Atualizar serviço
    await updateDoc(serviceRef, {
      status: newStatus,
      'stats.totalRoutes': totalRoutes,
      'stats.completedRoutes': completedRoutes,
      'stats.completedDeliveries': completedDeliveries,
      'stats.failedDeliveries': failedDeliveries,
      updatedAt: serverTimestamp(),
      ...(newStatus === 'completed' ? { completedAt: serverTimestamp() } : {}),
    });

    console.log(`✅ Estatísticas do serviço ${serviceId} atualizadas`);
  } catch (error) {
    console.error(`❌ Erro ao atualizar estatísticas do serviço ${serviceId}:`, error);
    throw error;
  }
}

/**
 * Sincroniza status de entrega com serviço Luna
 * Chamado quando uma entrega é concluída ou falha
 */
export async function syncLunnaServiceStatus(
  routeInfo: RouteInfo,
  stop: PlaceValue,
  newStatus: 'entregue' | 'falha'
) {
  // Primeiro sincroniza o pedido individual
  await syncLunnaOrderStatus(routeInfo, stop, newStatus);

  // Se a rota pertence a um serviço, atualiza as estatísticas do serviço
  if (routeInfo.serviceId) {
    await updateServiceStats(routeInfo.serviceId);
  }
}
