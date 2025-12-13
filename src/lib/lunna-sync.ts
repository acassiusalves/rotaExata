import { db } from '@/lib/firebase/client';
import { doc, updateDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import type { RouteInfo, PlaceValue } from '@/lib/types';

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

    // Atualizar status do pedido
    await updateDoc(doc(db, 'orders', orderDoc.id), {
      logisticsStatus: newStatus,
      updatedAt: serverTimestamp(),
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
