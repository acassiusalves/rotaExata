import { PlaceValue, RouteChangeNotification } from './types';
import { Timestamp } from 'firebase/firestore';
import { getStopIdentityKey } from './route-stop-utils';

export interface RouteChange {
  stopId: string;
  stopKey?: string;
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
  const oldStopsMap = new Map(
    oldStops.map((stop, index) => [getStopIdentityKey(stop), { stop, index }]),
  );
  const newStopsMap = new Map(
    newStops.map((stop, index) => [getStopIdentityKey(stop), { stop, index }]),
  );

  // Verificar paradas removidas
  oldStops.forEach((oldStop, oldIndex) => {
    const stopKey = getStopIdentityKey(oldStop);
    if (!newStopsMap.has(stopKey)) {
      changes.push({
        stopId: oldStop.id || oldStop.pointCode || oldStop.orderNumber || oldStop.placeId,
        stopKey: stopKey || undefined,
        stopIndex: oldIndex,
        changeType: 'removed',
        oldValue: oldStop.address,
      });
    }
  });

  // Verificar paradas adicionadas e mudanças
  newStops.forEach((newStop, newIndex) => {
    const newStopKey = getStopIdentityKey(newStop);
    const oldStopData = oldStopsMap.get(newStopKey);

    if (!oldStopData) {
      // Parada adicionada
      changes.push({
        stopId: newStop.id || newStop.pointCode || newStop.orderNumber || newStop.placeId,
        stopKey: newStopKey || undefined,
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
          stopId: newStop.id || newStop.pointCode || newStop.orderNumber || newStop.placeId,
          stopKey: newStopKey || undefined,
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
          stopId: newStop.id || newStop.pointCode || newStop.orderNumber || newStop.placeId,
          stopKey: newStopKey || undefined,
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
          stopId: newStop.id || newStop.pointCode || newStop.orderNumber || newStop.placeId,
          stopKey: newStopKey || undefined,
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

  // Agrupar mudanças pela identidade estável (com stopId como fallback legado)
  changes.forEach((change) => {
    const changeKey = change.stopKey || change.stopId;
    const existing = changesMap.get(changeKey) || [];
    existing.push(change);
    changesMap.set(changeKey, existing);
  });

  return stops.map((stop, index) => {
    const normalizedKey = getStopIdentityKey(stop);
    const stopChanges =
      (normalizedKey ? changesMap.get(normalizedKey) : undefined) ||
      changesMap.get(stop.id);

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

    const modifiedStop: any = {
      ...stop,
      wasModified: true,
      modifiedAt: Timestamp.now(),
      modificationType: primaryChange.changeType,
    };

    // Only add originalSequence if it's a sequence change (avoid undefined in Firestore)
    if (primaryChange.changeType === 'sequence') {
      modifiedStop.originalSequence = primaryChange.oldValue;
    }

    return modifiedStop;
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
