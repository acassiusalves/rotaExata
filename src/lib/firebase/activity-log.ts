import { addDoc, collection, Timestamp } from 'firebase/firestore';
import { db } from './client';

// ============================================================================
// TYPES
// ============================================================================

export type ActivityEventType =
  // Criação
  | 'service_created'
  | 'route_created'
  | 'point_created'
  // Movimentação de pontos
  | 'point_moved_to_route'
  | 'point_reordered'
  | 'point_removed_from_route'
  | 'point_added_to_route'
  // Edições de dados
  | 'service_updated'
  | 'route_updated'
  | 'point_data_updated'
  // Status de entrega
  | 'point_delivery_started'
  | 'point_arrived'
  | 'point_completed'
  | 'point_failed'
  // Atribuições
  | 'route_dispatched'
  | 'driver_assigned'
  | 'driver_unassigned'
  // Finalização automática e reenvio
  | 'route_auto_completed'
  | 'route_resent';

export type ActivityChange = {
  field: string;
  oldValue: any;
  newValue: any;
  fieldLabel?: string;
};

export type ActivityLogEntry = {
  timestamp: Timestamp;
  eventType: ActivityEventType;
  userId: string;
  userName?: string;
  entityType: 'service' | 'route' | 'point' | 'driver';
  entityId: string;
  entityCode?: string;
  serviceId?: string;
  serviceCode?: string;
  routeId?: string;
  routeCode?: string;
  pointId?: string;
  pointCode?: string;
  action: string;
  changes?: ActivityChange[];
  metadata?: Record<string, any>;
};

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Registra uma atividade no activity log
 * Não propaga erros - logging não deve quebrar operações principais
 */
export async function logActivity(entry: Omit<ActivityLogEntry, 'timestamp'>): Promise<void> {
  try {
    console.log('[ActivityLog] 📝 Tentando registrar:', {
      eventType: entry.eventType,
      action: entry.action,
      entityType: entry.entityType,
      entityCode: entry.entityCode,
    });
    console.log('[ActivityLog] DB disponível:', !!db);

    const docRef = await addDoc(collection(db, 'activity_log'), {
      ...entry,
      timestamp: Timestamp.now(),
    });

    console.log('[ActivityLog] ✅ Atividade registrada com sucesso! ID:', docRef.id);
  } catch (error) {
    console.error('[ActivityLog] ❌ Erro ao registrar atividade:', error);
    console.error('[ActivityLog] Error code:', (error as any)?.code);
    console.error('[ActivityLog] Error message:', (error as any)?.message);
    console.error('[ActivityLog] Entry que falhou:', entry);
    // Não propagar erro - logging não deve quebrar a operação principal
  }
}

// ============================================================================
// HELPER FUNCTIONS - SERVIÇOS
// ============================================================================

/**
 * Registra criação de serviço
 */
export async function logServiceCreated(params: {
  userId: string;
  userName: string;
  serviceId: string;
  serviceCode: string;
  totalOrders: number;
  plannedDate: string;
}) {
  await logActivity({
    eventType: 'service_created',
    userId: params.userId,
    userName: params.userName,
    entityType: 'service',
    entityId: params.serviceId,
    entityCode: params.serviceCode,
    serviceId: params.serviceId,
    serviceCode: params.serviceCode,
    action: `Serviço ${params.serviceCode} criado com ${params.totalOrders} pedidos`,
    metadata: {
      totalOrders: params.totalOrders,
      plannedDate: params.plannedDate,
    },
  });
}

/**
 * Registra atualização de serviço
 */
export async function logServiceUpdated(params: {
  userId: string;
  userName: string;
  serviceId: string;
  serviceCode: string;
  changes: ActivityChange[];
}) {
  await logActivity({
    eventType: 'service_updated',
    userId: params.userId,
    userName: params.userName,
    entityType: 'service',
    entityId: params.serviceId,
    entityCode: params.serviceCode,
    serviceId: params.serviceId,
    serviceCode: params.serviceCode,
    action: `Serviço ${params.serviceCode} atualizado`,
    changes: params.changes,
  });
}

// ============================================================================
// HELPER FUNCTIONS - ROTAS
// ============================================================================

/**
 * Registra criação de rota
 */
export async function logRouteCreated(params: {
  userId: string;
  userName: string;
  routeId: string;
  routeCode: string;
  serviceId?: string;
  serviceCode?: string;
  totalPoints: number;
  distanceMeters?: number;
  duration?: string;
  driverName?: string;
}) {
  await logActivity({
    eventType: 'route_created',
    userId: params.userId,
    userName: params.userName,
    entityType: 'route',
    entityId: params.routeId,
    entityCode: params.routeCode,
    serviceId: params.serviceId,
    serviceCode: params.serviceCode,
    routeId: params.routeId,
    routeCode: params.routeCode,
    action: `Rota ${params.routeCode} criada com ${params.totalPoints} pontos${params.driverName ? ` - Motorista: ${params.driverName}` : ''}`,
    metadata: {
      totalPoints: params.totalPoints,
      distanceMeters: params.distanceMeters,
      duration: params.duration,
      driverName: params.driverName,
    },
  });
}

/**
 * Registra despacho de rota
 */
export async function logRouteDispatched(params: {
  userId: string;
  userName: string;
  routeId: string;
  routeCode: string;
  serviceId?: string;
  serviceCode?: string;
  driverName: string;
  driverId: string;
  totalPoints: number;
}) {
  await logActivity({
    eventType: 'route_dispatched',
    userId: params.userId,
    userName: params.userName,
    entityType: 'route',
    entityId: params.routeId,
    entityCode: params.routeCode,
    serviceId: params.serviceId,
    serviceCode: params.serviceCode,
    routeId: params.routeId,
    routeCode: params.routeCode,
    action: `Rota ${params.routeCode} despachada para ${params.driverName}`,
    metadata: {
      driverName: params.driverName,
      driverId: params.driverId,
      totalPoints: params.totalPoints,
    },
  });
}

/**
 * Registra atualização de rota
 */
export async function logRouteUpdated(params: {
  userId: string;
  userName: string;
  routeId: string;
  routeCode: string;
  serviceId?: string;
  serviceCode?: string;
  changes: ActivityChange[];
}) {
  await logActivity({
    eventType: 'route_updated',
    userId: params.userId,
    userName: params.userName,
    entityType: 'route',
    entityId: params.routeId,
    entityCode: params.routeCode,
    serviceId: params.serviceId,
    serviceCode: params.serviceCode,
    routeId: params.routeId,
    routeCode: params.routeCode,
    action: `Rota ${params.routeCode} atualizada`,
    changes: params.changes,
  });
}

// ============================================================================
// HELPER FUNCTIONS - PONTOS
// ============================================================================

/**
 * Registra criação de pontos (em lote)
 */
export async function logPointsCreated(params: {
  userId: string;
  userName: string;
  routeId: string;
  routeCode: string;
  serviceId?: string;
  serviceCode?: string;
  pointCodes: string[];
  totalPoints: number;
}) {
  await logActivity({
    eventType: 'point_created',
    userId: params.userId,
    userName: params.userName,
    entityType: 'point',
    entityId: params.pointCodes[0] || 'batch',
    entityCode: params.pointCodes[0],
    serviceId: params.serviceId,
    serviceCode: params.serviceCode,
    routeId: params.routeId,
    routeCode: params.routeCode,
    action: `${params.totalPoints} pontos criados na rota ${params.routeCode}`,
    metadata: {
      pointCodes: params.pointCodes,
      totalPoints: params.totalPoints,
    },
  });
}

/**
 * Registra movimentação de ponto entre rotas
 */
export async function logPointMovedToRoute(params: {
  userId: string;
  userName: string;
  pointId: string;
  oldRouteId: string;
  oldRouteCode: string;
  oldPointCode: string;
  newRouteId: string;
  newRouteCode: string;
  newPointCode: string;
  address: string;
  serviceId?: string;
  serviceCode?: string;
}) {
  await logActivity({
    eventType: 'point_moved_to_route',
    userId: params.userId,
    userName: params.userName,
    entityType: 'point',
    entityId: params.pointId,
    entityCode: params.newPointCode,
    serviceId: params.serviceId,
    serviceCode: params.serviceCode,
    routeId: params.newRouteId,
    routeCode: params.newRouteCode,
    pointId: params.pointId,
    pointCode: params.newPointCode,
    action: `Ponto movido de ${params.oldPointCode} para ${params.newPointCode}`,
    changes: [
      {
        field: 'routeId',
        oldValue: params.oldRouteId,
        newValue: params.newRouteId,
        fieldLabel: 'Rota',
      },
      {
        field: 'pointCode',
        oldValue: params.oldPointCode,
        newValue: params.newPointCode,
        fieldLabel: 'Código do Ponto',
      },
    ],
    metadata: {
      oldRouteCode: params.oldRouteCode,
      oldPointCode: params.oldPointCode,
      address: params.address,
    },
  });
}

/**
 * Registra reordenação de ponto dentro da mesma rota
 */
export async function logPointReordered(params: {
  userId: string;
  userName: string;
  pointId: string;
  routeId: string;
  routeCode: string;
  serviceId?: string;
  serviceCode?: string;
  oldPointCode?: string;
  newPointCode: string;
  oldPosition?: number;
  newPosition: number;
  address: string;
}) {
  await logActivity({
    eventType: 'point_reordered',
    userId: params.userId,
    userName: params.userName,
    entityType: 'point',
    entityId: params.pointId,
    entityCode: params.newPointCode,
    serviceId: params.serviceId,
    serviceCode: params.serviceCode,
    routeId: params.routeId,
    routeCode: params.routeCode,
    pointId: params.pointId,
    pointCode: params.newPointCode,
    action: params.oldPointCode
      ? `Ponto reordenado de ${params.oldPointCode} para ${params.newPointCode}`
      : `Ponto reordenado para posição ${params.newPosition}`,
    changes: params.oldPointCode ? [
      {
        field: 'pointCode',
        oldValue: params.oldPointCode,
        newValue: params.newPointCode,
        fieldLabel: 'Código do Ponto',
      },
    ] : undefined,
    metadata: {
      oldPosition: params.oldPosition,
      newPosition: params.newPosition,
      address: params.address,
    },
  });
}

/**
 * Registra edição de dados de um ponto
 */
export async function logPointDataUpdated(params: {
  userId: string;
  userName: string;
  pointId: string;
  pointCode?: string;
  routeId: string;
  routeCode: string;
  serviceId?: string;
  serviceCode?: string;
  changes: ActivityChange[];
  customerName?: string;
}) {
  await logActivity({
    eventType: 'point_data_updated',
    userId: params.userId,
    userName: params.userName,
    entityType: 'point',
    entityId: params.pointId,
    entityCode: params.pointCode,
    serviceId: params.serviceId,
    serviceCode: params.serviceCode,
    routeId: params.routeId,
    routeCode: params.routeCode,
    pointId: params.pointId,
    pointCode: params.pointCode,
    action: `Dados do ponto ${params.pointCode || params.pointId} atualizados`,
    changes: params.changes,
    metadata: {
      customerName: params.customerName,
    },
  });
}

/**
 * Registra remoção de ponto de uma rota
 */
export async function logPointRemovedFromRoute(params: {
  userId: string;
  userName: string;
  pointId: string;
  pointCode?: string;
  routeId: string;
  routeCode: string;
  serviceId?: string;
  serviceCode?: string;
  address: string;
}) {
  await logActivity({
    eventType: 'point_removed_from_route',
    userId: params.userId,
    userName: params.userName,
    entityType: 'point',
    entityId: params.pointId,
    entityCode: params.pointCode,
    serviceId: params.serviceId,
    serviceCode: params.serviceCode,
    routeId: params.routeId,
    routeCode: params.routeCode,
    pointId: params.pointId,
    pointCode: params.pointCode,
    action: `Ponto ${params.pointCode || params.pointId} removido da rota ${params.routeCode}`,
    metadata: {
      address: params.address,
    },
  });
}

/**
 * Registra adição de ponto a uma rota
 */
export async function logPointAddedToRoute(params: {
  userId: string;
  userName: string;
  pointId: string;
  pointCode?: string;
  routeId: string;
  routeCode: string;
  serviceId?: string;
  serviceCode?: string;
  address: string;
}) {
  await logActivity({
    eventType: 'point_added_to_route',
    userId: params.userId,
    userName: params.userName,
    entityType: 'point',
    entityId: params.pointId,
    entityCode: params.pointCode,
    serviceId: params.serviceId,
    serviceCode: params.serviceCode,
    routeId: params.routeId,
    routeCode: params.routeCode,
    pointId: params.pointId,
    pointCode: params.pointCode,
    action: `Ponto ${params.pointCode || params.pointId} adicionado à rota ${params.routeCode}`,
    metadata: {
      address: params.address,
    },
  });
}

// ============================================================================
// HELPER FUNCTIONS - STATUS DE ENTREGA
// ============================================================================

/**
 * Registra início de entrega
 */
export async function logPointDeliveryStarted(params: {
  userId: string;
  userName: string;
  pointId: string;
  pointCode?: string;
  routeId: string;
  routeCode: string;
  serviceId?: string;
  serviceCode?: string;
  address: string;
  customerName?: string;
}) {
  await logActivity({
    eventType: 'point_delivery_started',
    userId: params.userId,
    userName: params.userName,
    entityType: 'point',
    entityId: params.pointId,
    entityCode: params.pointCode,
    serviceId: params.serviceId,
    serviceCode: params.serviceCode,
    routeId: params.routeId,
    routeCode: params.routeCode,
    pointId: params.pointId,
    pointCode: params.pointCode,
    action: `Entrega iniciada no ponto ${params.pointCode || params.pointId}`,
    metadata: {
      address: params.address,
      customerName: params.customerName,
    },
  });
}

/**
 * Registra chegada ao ponto
 */
export async function logPointArrived(params: {
  userId: string;
  userName: string;
  pointId: string;
  pointCode?: string;
  routeId: string;
  routeCode: string;
  serviceId?: string;
  serviceCode?: string;
  address: string;
  customerName?: string;
}) {
  await logActivity({
    eventType: 'point_arrived',
    userId: params.userId,
    userName: params.userName,
    entityType: 'point',
    entityId: params.pointId,
    entityCode: params.pointCode,
    serviceId: params.serviceId,
    serviceCode: params.serviceCode,
    routeId: params.routeId,
    routeCode: params.routeCode,
    pointId: params.pointId,
    pointCode: params.pointCode,
    action: `Motorista chegou no ponto ${params.pointCode || params.pointId}`,
    metadata: {
      address: params.address,
      customerName: params.customerName,
    },
  });
}

/**
 * Registra entrega completada
 */
export async function logPointCompleted(params: {
  userId: string;
  userName: string;
  pointId: string;
  pointCode?: string;
  routeId: string;
  routeCode: string;
  serviceId?: string;
  serviceCode?: string;
  photoUrl?: string;
  address: string;
  customerName?: string;
  notes?: string;
}) {
  await logActivity({
    eventType: 'point_completed',
    userId: params.userId,
    userName: params.userName,
    entityType: 'point',
    entityId: params.pointId,
    entityCode: params.pointCode,
    serviceId: params.serviceId,
    serviceCode: params.serviceCode,
    routeId: params.routeId,
    routeCode: params.routeCode,
    pointId: params.pointId,
    pointCode: params.pointCode,
    action: `Entrega completada no ponto ${params.pointCode || params.pointId}`,
    changes: [
      {
        field: 'deliveryStatus',
        oldValue: 'en_route',
        newValue: 'completed',
        fieldLabel: 'Status',
      },
    ],
    metadata: {
      photoUrl: params.photoUrl,
      address: params.address,
      customerName: params.customerName,
      notes: params.notes,
      completedAt: Timestamp.now(),
    },
  });
}

/**
 * Registra entrega falhada
 */
export async function logPointFailed(params: {
  userId: string;
  userName: string;
  pointId: string;
  pointCode?: string;
  routeId: string;
  routeCode: string;
  serviceId?: string;
  serviceCode?: string;
  failureReason?: string;
  wentToLocation?: boolean;
  attemptPhotoUrl?: string;
  address: string;
  customerName?: string;
}) {
  await logActivity({
    eventType: 'point_failed',
    userId: params.userId,
    userName: params.userName,
    entityType: 'point',
    entityId: params.pointId,
    entityCode: params.pointCode,
    serviceId: params.serviceId,
    serviceCode: params.serviceCode,
    routeId: params.routeId,
    routeCode: params.routeCode,
    pointId: params.pointId,
    pointCode: params.pointCode,
    action: `Entrega falhou no ponto ${params.pointCode || params.pointId}${params.failureReason ? ` - Motivo: ${params.failureReason}` : ''}`,
    changes: [
      {
        field: 'deliveryStatus',
        oldValue: 'en_route',
        newValue: 'failed',
        fieldLabel: 'Status',
      },
    ],
    metadata: {
      failureReason: params.failureReason,
      wentToLocation: params.wentToLocation,
      attemptPhotoUrl: params.attemptPhotoUrl,
      address: params.address,
      customerName: params.customerName,
      failedAt: Timestamp.now(),
    },
  });
}

// ============================================================================
// HELPER FUNCTIONS - MOTORISTAS
// ============================================================================

/**
 * Registra atribuição de motorista
 */
export async function logDriverAssigned(params: {
  userId: string;
  userName: string;
  routeId: string;
  routeCode: string;
  serviceId?: string;
  serviceCode?: string;
  driverName: string;
  driverId: string;
}) {
  await logActivity({
    eventType: 'driver_assigned',
    userId: params.userId,
    userName: params.userName,
    entityType: 'driver',
    entityId: params.driverId,
    entityCode: params.driverName,
    serviceId: params.serviceId,
    serviceCode: params.serviceCode,
    routeId: params.routeId,
    routeCode: params.routeCode,
    action: `Motorista ${params.driverName} atribuído à rota ${params.routeCode}`,
    metadata: {
      driverName: params.driverName,
      driverId: params.driverId,
    },
  });
}

/**
 * Registra desatribuição de motorista
 */
export async function logDriverUnassigned(params: {
  userId: string;
  userName: string;
  routeId: string;
  routeCode: string;
  serviceId?: string;
  serviceCode?: string;
  driverName: string;
  driverId: string;
}) {
  await logActivity({
    eventType: 'driver_unassigned',
    userId: params.userId,
    userName: params.userName,
    entityType: 'driver',
    entityId: params.driverId,
    entityCode: params.driverName,
    serviceId: params.serviceId,
    serviceCode: params.serviceCode,
    routeId: params.routeId,
    routeCode: params.routeCode,
    action: `Motorista ${params.driverName} removido da rota ${params.routeCode}`,
    metadata: {
      driverName: params.driverName,
      driverId: params.driverId,
    },
  });
}

// ============================================================================
// HELPER FUNCTIONS - FINALIZAÇÃO AUTOMÁTICA E REENVIO
// ============================================================================

/**
 * Registra finalização automática de rota pelo sistema após 48h
 */
export async function logRouteAutoCompleted(params: {
  routeId: string;
  routeCode: string;
  serviceId?: string;
  serviceCode?: string;
  driverName?: string;
  driverId?: string;
}) {
  await logActivity({
    eventType: 'route_auto_completed',
    userId: 'system',
    userName: 'Sistema',
    entityType: 'route',
    entityId: params.routeId,
    entityCode: params.routeCode,
    serviceId: params.serviceId,
    serviceCode: params.serviceCode,
    routeId: params.routeId,
    routeCode: params.routeCode,
    action: `Rota ${params.routeCode} finalizada automaticamente após 48h sem conclusão pelo motorista`,
    changes: [
      {
        field: 'status',
        oldValue: 'in_progress',
        newValue: 'completed_auto',
        fieldLabel: 'Status',
      },
    ],
    metadata: {
      driverName: params.driverName,
      driverId: params.driverId,
    },
  });
}

/**
 * Registra reenvio de rota ao motorista pelo administrador
 */
export async function logRouteResent(params: {
  userId: string;
  userName: string;
  routeId: string;
  routeCode: string;
  serviceId?: string;
  serviceCode?: string;
  driverName: string;
  driverId: string;
}) {
  await logActivity({
    eventType: 'route_resent',
    userId: params.userId,
    userName: params.userName,
    entityType: 'route',
    entityId: params.routeId,
    entityCode: params.routeCode,
    serviceId: params.serviceId,
    serviceCode: params.serviceCode,
    routeId: params.routeId,
    routeCode: params.routeCode,
    action: `Rota ${params.routeCode} reenviada ao motorista ${params.driverName} pelo administrador`,
    changes: [
      {
        field: 'status',
        oldValue: 'completed_auto',
        newValue: 'dispatched',
        fieldLabel: 'Status',
      },
    ],
    metadata: {
      driverName: params.driverName,
      driverId: params.driverId,
    },
  });
}
