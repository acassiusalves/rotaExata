import { PlaceValue, RouteChangeNotification } from './types';
import { Timestamp } from 'firebase/firestore';

export interface RouteChange {
  stopId: string;
  stopIndex: number;
  changeType: 'address' | 'sequence' | 'data' | 'removed' | 'added';
  oldValue?: any;
  newValue?: any;
}

/**
 * Compara duas versões de rotas e retorna as mudanças detectadas
 */
export function detectRouteChanges(
  oldStops: PlaceValue[],
  newStops: PlaceValue[]
): RouteChange[] {
  const changes: RouteChange[] = [];

  // Criar mapas para facilitar comparação
  const oldStopsMap = new Map(oldStops.map((stop, idx) => [stop.id, { stop, index: idx }]));
  const newStopsMap = new Map(newStops.map((stop, idx) => [stop.id, { stop, index: idx }]));

  // Verificar paradas removidas
  oldStops.forEach((oldStop, oldIndex) => {
    if (!newStopsMap.has(oldStop.id)) {
      changes.push({
        stopId: oldStop.id,
        stopIndex: oldIndex,
        changeType: 'removed',
        oldValue: oldStop.address,
      });
    }
  });

  // Verificar paradas adicionadas e mudanças
  newStops.forEach((newStop, newIndex) => {
    const oldStopData = oldStopsMap.get(newStop.id);

    if (!oldStopData) {
      // Parada adicionada
      changes.push({
        stopId: newStop.id,
        stopIndex: newIndex,
        changeType: 'added',
        newValue: newStop.address,
      });
    } else {
      const oldStop = oldStopData.stop;
      const oldIndex = oldStopData.index;

      // Verificar mudança de sequência
      if (oldIndex !== newIndex) {
        changes.push({
          stopId: newStop.id,
          stopIndex: newIndex,
          changeType: 'sequence',
          oldValue: oldIndex,
          newValue: newIndex,
        });
      }

      // Verificar mudança de endereço
      if (oldStop.address !== newStop.address ||
          oldStop.lat !== newStop.lat ||
          oldStop.lng !== newStop.lng) {
        changes.push({
          stopId: newStop.id,
          stopIndex: newIndex,
          changeType: 'address',
          oldValue: oldStop.address,
          newValue: newStop.address,
        });
      }

      // Verificar mudanças em dados importantes
      if (oldStop.customerName !== newStop.customerName ||
          oldStop.phone !== newStop.phone ||
          oldStop.notes !== newStop.notes ||
          oldStop.orderNumber !== newStop.orderNumber) {
        changes.push({
          stopId: newStop.id,
          stopIndex: newIndex,
          changeType: 'data',
          oldValue: {
            customerName: oldStop.customerName,
            phone: oldStop.phone,
            notes: oldStop.notes,
            orderNumber: oldStop.orderNumber,
          },
          newValue: {
            customerName: newStop.customerName,
            phone: newStop.phone,
            notes: newStop.notes,
            orderNumber: newStop.orderNumber,
          },
        });
      }
    }
  });

  return changes;
}

/**
 * Marca as paradas alteradas com flags visuais
 */
export function markModifiedStops(
  stops: PlaceValue[],
  changes: RouteChange[]
): PlaceValue[] {
  const changesMap = new Map<string, RouteChange[]>();

  // Agrupar mudanças por stopId
  changes.forEach(change => {
    const existing = changesMap.get(change.stopId) || [];
    existing.push(change);
    changesMap.set(change.stopId, existing);
  });

  return stops.map((stop, index) => {
    const stopChanges = changesMap.get(stop.id);

    if (!stopChanges || stopChanges.length === 0) {
      return stop;
    }

    // Prioridade de tipo de mudança: removed > added > address > sequence > data
    const priorityOrder = ['removed', 'added', 'address', 'sequence', 'data'];
    const primaryChange = stopChanges.reduce((prev, curr) => {
      const prevPriority = priorityOrder.indexOf(prev.changeType);
      const currPriority = priorityOrder.indexOf(curr.changeType);
      return currPriority < prevPriority ? curr : prev;
    });

    return {
      ...stop,
      wasModified: true,
      modifiedAt: Timestamp.now(),
      modificationType: primaryChange.changeType,
      originalSequence: primaryChange.changeType === 'sequence' ? primaryChange.oldValue : undefined,
    };
  });
}

/**
 * Cria o objeto de notificação para o motorista
 */
export function createNotification(
  routeId: string,
  driverId: string,
  changes: RouteChange[]
): Omit<RouteChangeNotification, 'id'> {
  return {
    routeId,
    driverId,
    changes,
    createdAt: Timestamp.now(),
    acknowledged: false,
  };
}
