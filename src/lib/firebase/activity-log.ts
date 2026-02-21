import { addDoc, collection, Timestamp, query, where, orderBy, limit as firestoreLimit, getDocs } from 'firebase/firestore';
import { db } from './client';
import type { ActivityEventType, ActivityLogEntry, ActivityChange, LogActivityResult, PaymentMethod, EntityType } from '../types';

// Re-export types for backward compatibility
export type { ActivityEventType, ActivityLogEntry, ActivityChange, LogActivityResult };

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Registra uma atividade no activity log
 * Não propaga erros - logging não deve quebrar operações principais
 * @returns Resultado com sucesso, ID do documento e possível erro
 */
export async function logActivity(entry: Omit<ActivityLogEntry, 'timestamp'>): Promise<LogActivityResult> {
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

    return {
      success: true,
      id: docRef.id,
    };
  } catch (error) {
    console.error('[ActivityLog] ❌ Erro ao registrar atividade:', error);
    console.error('[ActivityLog] Error code:', (error as any)?.code);
    console.error('[ActivityLog] Error message:', (error as any)?.message);
    console.error('[ActivityLog] Entry que falhou:', entry);

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    };
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
  customerName?: string;
  orderNumber?: string;
  deliveryStatus?: string;
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
    action: `Ponto ${params.customerName || params.pointCode || params.pointId} removido da rota ${params.routeCode}${params.deliveryStatus === 'failed' ? ' (falha na entrega)' : ''}`,
    metadata: {
      address: params.address,
      customerName: params.customerName,
      orderNumber: params.orderNumber,
      deliveryStatus: params.deliveryStatus,
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

/**
 * Registra exclusão de rota
 */
export async function logRouteDeleted(params: {
  userId: string;
  userName: string;
  routeId: string;
  routeCode: string;
  serviceId?: string;
  serviceCode?: string;
  routeName?: string;
  totalPoints: number;
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
    action: `Rota ${params.routeName || params.routeCode} excluída (${params.totalPoints} pontos devolvidos)`,
    metadata: {
      routeName: params.routeName,
      totalPoints: params.totalPoints,
      deleted: true,
    },
  });
}

/**
 * Registra troca de motorista em uma rota
 */
export async function logDriverChanged(params: {
  userId: string;
  userName: string;
  routeId: string;
  routeCode: string;
  serviceId?: string;
  serviceCode?: string;
  oldDriverName?: string;
  oldDriverId?: string;
  newDriverName: string;
  newDriverId: string;
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
    action: params.oldDriverName
      ? `Motorista trocado de ${params.oldDriverName} para ${params.newDriverName} na rota ${params.routeCode}`
      : `Motorista ${params.newDriverName} atribuído à rota ${params.routeCode}`,
    changes: [
      {
        field: 'driverId',
        oldValue: params.oldDriverId || null,
        newValue: params.newDriverId,
        fieldLabel: 'Motorista',
      },
    ],
    metadata: {
      oldDriverName: params.oldDriverName,
      oldDriverId: params.oldDriverId,
      newDriverName: params.newDriverName,
      newDriverId: params.newDriverId,
    },
  });
}

/**
 * Registra renomeação de rota
 */
export async function logRouteRenamed(params: {
  userId: string;
  userName: string;
  routeId: string;
  routeCode: string;
  serviceId?: string;
  serviceCode?: string;
  oldName: string;
  newName: string;
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
    action: `Rota renomeada de "${params.oldName}" para "${params.newName}"`,
    changes: [
      {
        field: 'name',
        oldValue: params.oldName,
        newValue: params.newName,
        fieldLabel: 'Nome da Rota',
      },
    ],
  });
}

/**
 * Registra transferência de ponto entre rotas
 */
export async function logPointTransferred(params: {
  userId: string;
  userName: string;
  pointId: string;
  pointCode?: string;
  sourceRouteId: string;
  sourceRouteName?: string;
  targetRouteId: string;
  targetRouteName?: string;
  serviceId?: string;
  serviceCode?: string;
  address: string;
  customerName?: string;
}) {
  await logActivity({
    eventType: 'point_moved_to_route',
    userId: params.userId,
    userName: params.userName,
    entityType: 'point',
    entityId: params.pointId,
    entityCode: params.pointCode,
    serviceId: params.serviceId,
    serviceCode: params.serviceCode,
    routeId: params.targetRouteId,
    routeCode: params.targetRouteName,
    pointId: params.pointId,
    pointCode: params.pointCode,
    action: `Ponto ${params.customerName || params.address} transferido de ${params.sourceRouteName || params.sourceRouteId} para ${params.targetRouteName || params.targetRouteId}`,
    metadata: {
      sourceRouteId: params.sourceRouteId,
      sourceRouteName: params.sourceRouteName,
      targetRouteId: params.targetRouteId,
      targetRouteName: params.targetRouteName,
      address: params.address,
      customerName: params.customerName,
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

// ============================================================================
// HELPER FUNCTIONS - FINANCEIRO
// ============================================================================

/**
 * Registra aprovação de pagamento
 */
export async function logPaymentApproved(params: {
  userId: string;
  userName: string;
  paymentId: string;
  driverName: string;
  routeCode: string;
  totalValue: number;
  routeId?: string;
}): Promise<LogActivityResult> {
  return await logActivity({
    eventType: 'payment_approved',
    category: 'FINANCIAL',
    userId: params.userId,
    userName: params.userName,
    entityType: 'payment',
    entityId: params.paymentId,
    entityCode: params.routeCode,
    paymentId: params.paymentId,
    routeId: params.routeId,
    routeCode: params.routeCode,
    action: `Pagamento aprovado para ${params.driverName} - Rota ${params.routeCode} - R$ ${params.totalValue.toFixed(2)}`,
    changes: [
      {
        field: 'status',
        oldValue: 'pending',
        newValue: 'approved',
        fieldLabel: 'Status do Pagamento',
      },
    ],
    metadata: {
      driverName: params.driverName,
      totalValue: params.totalValue,
      approvedAt: Timestamp.now(),
    },
  });
}

/**
 * Registra marcação de pagamento como pago
 */
export async function logPaymentMarkedAsPaid(params: {
  userId: string;
  userName: string;
  paymentId: string;
  driverName: string;
  routeCode: string;
  totalValue: number;
  paymentMethod: PaymentMethod;
  paymentReference?: string;
  paidDate?: Date;
  routeId?: string;
}): Promise<LogActivityResult> {
  const paymentMethodLabels: Record<PaymentMethod, string> = {
    pix: 'PIX',
    bank_transfer: 'Transferência Bancária',
    cash: 'Dinheiro',
    other: 'Outro',
  };

  return await logActivity({
    eventType: 'payment_marked_as_paid',
    category: 'FINANCIAL',
    userId: params.userId,
    userName: params.userName,
    entityType: 'payment',
    entityId: params.paymentId,
    entityCode: params.routeCode,
    paymentId: params.paymentId,
    routeId: params.routeId,
    routeCode: params.routeCode,
    action: `Pagamento marcado como pago - ${params.driverName} - ${paymentMethodLabels[params.paymentMethod]} - R$ ${params.totalValue.toFixed(2)}`,
    changes: [
      {
        field: 'status',
        oldValue: 'approved',
        newValue: 'paid',
        fieldLabel: 'Status do Pagamento',
      },
      {
        field: 'paymentMethod',
        oldValue: null,
        newValue: params.paymentMethod,
        fieldLabel: 'Método de Pagamento',
      },
    ],
    metadata: {
      driverName: params.driverName,
      totalValue: params.totalValue,
      paymentMethod: params.paymentMethod,
      paymentMethodLabel: paymentMethodLabels[params.paymentMethod],
      paymentReference: params.paymentReference,
      paidDate: params.paidDate ? Timestamp.fromDate(params.paidDate) : Timestamp.now(),
    },
  });
}

/**
 * Registra cancelamento de pagamento
 */
export async function logPaymentCancelled(params: {
  userId: string;
  userName: string;
  paymentId: string;
  driverName: string;
  routeCode: string;
  totalValue: number;
  cancellationReason: string;
  previousStatus: 'pending' | 'approved';
  routeId?: string;
}): Promise<LogActivityResult> {
  return await logActivity({
    eventType: 'payment_cancelled',
    category: 'FINANCIAL',
    userId: params.userId,
    userName: params.userName,
    entityType: 'payment',
    entityId: params.paymentId,
    entityCode: params.routeCode,
    paymentId: params.paymentId,
    routeId: params.routeId,
    routeCode: params.routeCode,
    action: `Pagamento cancelado - ${params.driverName} - Rota ${params.routeCode} - Motivo: ${params.cancellationReason}`,
    changes: [
      {
        field: 'status',
        oldValue: params.previousStatus,
        newValue: 'cancelled',
        fieldLabel: 'Status do Pagamento',
      },
    ],
    metadata: {
      driverName: params.driverName,
      totalValue: params.totalValue,
      cancellationReason: params.cancellationReason,
      cancelledAt: Timestamp.now(),
    },
  });
}

/**
 * Registra aprovação em lote de pagamentos
 */
export async function logPaymentBatchApproved(params: {
  userId: string;
  userName: string;
  paymentIds: string[];
  totalCount: number;
  totalValue: number;
  driverNames: string[];
}): Promise<LogActivityResult> {
  return await logActivity({
    eventType: 'payment_batch_approved',
    category: 'FINANCIAL',
    userId: params.userId,
    userName: params.userName,
    entityType: 'payment',
    entityId: 'batch',
    entityCode: `LOTE-${params.totalCount}`,
    action: `Lote de ${params.totalCount} pagamentos aprovado - Total: R$ ${params.totalValue.toFixed(2)}`,
    metadata: {
      paymentIds: params.paymentIds,
      totalCount: params.totalCount,
      totalValue: params.totalValue,
      driverNames: params.driverNames,
      batchApprovedAt: Timestamp.now(),
    },
  });
}

/**
 * Registra conciliação bancária (manual ou por IA)
 */
export async function logBankReconciliation(params: {
  userId: string;
  userName: string;
  routeId: string;
  routeCode: string;
  pointId?: string;
  pointCode?: string;
  customerName?: string;
  expectedValue: number;
  extractedValue?: number;
  reconciledMethod: 'manual' | 'ai';
  photoUrl?: string;
  difference?: number;
}): Promise<LogActivityResult> {
  const isAiReconciliation = params.reconciledMethod === 'ai';
  const valueDiff = params.difference !== undefined
    ? params.difference
    : (params.extractedValue ? Math.abs(params.extractedValue - params.expectedValue) : 0);

  return await logActivity({
    eventType: 'bank_reconciliation',
    category: 'FINANCIAL',
    userId: params.userId,
    userName: params.userName,
    origin: isAiReconciliation ? 'ai_process' : 'web_admin',
    entityType: 'point',
    entityId: params.pointId || params.routeId,
    entityCode: params.pointCode || params.routeCode,
    routeId: params.routeId,
    routeCode: params.routeCode,
    pointId: params.pointId,
    pointCode: params.pointCode,
    action: isAiReconciliation
      ? `Conciliação automática (IA) - ${params.customerName || 'Cliente'} - Diferença: R$ ${valueDiff.toFixed(2)}`
      : `Conciliação manual - ${params.customerName || 'Cliente'}`,
    changes: [
      {
        field: 'reconciled',
        oldValue: false,
        newValue: true,
        fieldLabel: 'Conciliado',
      },
    ],
    metadata: {
      customerName: params.customerName,
      expectedValue: params.expectedValue,
      extractedValue: params.extractedValue,
      reconciledMethod: params.reconciledMethod,
      photoUrl: params.photoUrl,
      difference: valueDiff,
      reconciledAt: Timestamp.now(),
    },
  });
}

// ============================================================================
// HELPER FUNCTIONS - ESTOQUE
// ============================================================================

/**
 * Registra entrada de estoque
 */
export async function logStockEntry(params: {
  userId: string;
  userName: string;
  stockItemId: string;
  productCode: string;
  productName: string;
  quantity: number;
  unitValue?: number;
  supplier?: string;
  invoiceNumber?: string;
}): Promise<LogActivityResult> {
  return await logActivity({
    eventType: 'stock_entry',
    category: 'INVENTORY',
    userId: params.userId,
    userName: params.userName,
    entityType: 'stock',
    entityId: params.stockItemId,
    entityCode: params.productCode,
    stockItemId: params.stockItemId,
    action: `Entrada de estoque - ${params.productName} - Qtd: ${params.quantity}`,
    metadata: {
      productCode: params.productCode,
      productName: params.productName,
      quantity: params.quantity,
      unitValue: params.unitValue,
      totalValue: params.unitValue ? params.unitValue * params.quantity : undefined,
      supplier: params.supplier,
      invoiceNumber: params.invoiceNumber,
      entryDate: Timestamp.now(),
    },
  });
}

/**
 * Registra saída de estoque
 */
export async function logStockExit(params: {
  userId: string;
  userName: string;
  stockItemId: string;
  productCode: string;
  productName: string;
  quantity: number;
  orderId?: string;
  orderNumber?: string;
  customerId?: string;
  customerName?: string;
  reason?: string;
}): Promise<LogActivityResult> {
  return await logActivity({
    eventType: 'stock_exit',
    category: 'INVENTORY',
    userId: params.userId,
    userName: params.userName,
    entityType: 'stock',
    entityId: params.stockItemId,
    entityCode: params.productCode,
    stockItemId: params.stockItemId,
    orderId: params.orderId,
    customerId: params.customerId,
    action: `Saída de estoque - ${params.productName} - Qtd: ${params.quantity}${params.orderNumber ? ` - Pedido ${params.orderNumber}` : ''}`,
    metadata: {
      productCode: params.productCode,
      productName: params.productName,
      quantity: params.quantity,
      orderId: params.orderId,
      orderNumber: params.orderNumber,
      customerId: params.customerId,
      customerName: params.customerName,
      reason: params.reason,
      exitDate: Timestamp.now(),
    },
  });
}

/**
 * Registra ajuste de inventário
 */
export async function logStockAdjustment(params: {
  userId: string;
  userName: string;
  stockItemId: string;
  productCode: string;
  productName: string;
  oldQuantity: number;
  newQuantity: number;
  adjustmentReason: string;
}): Promise<LogActivityResult> {
  const difference = params.newQuantity - params.oldQuantity;
  const adjustmentType = difference > 0 ? 'Aumento' : 'Redução';

  return await logActivity({
    eventType: 'stock_adjustment',
    category: 'INVENTORY',
    userId: params.userId,
    userName: params.userName,
    entityType: 'stock',
    entityId: params.stockItemId,
    entityCode: params.productCode,
    stockItemId: params.stockItemId,
    action: `${adjustmentType} de estoque - ${params.productName} - ${Math.abs(difference)} unidades`,
    changes: [
      {
        field: 'quantity',
        oldValue: params.oldQuantity,
        newValue: params.newQuantity,
        fieldLabel: 'Quantidade',
      },
    ],
    metadata: {
      productCode: params.productCode,
      productName: params.productName,
      oldQuantity: params.oldQuantity,
      newQuantity: params.newQuantity,
      difference: difference,
      adjustmentReason: params.adjustmentReason,
      adjustedAt: Timestamp.now(),
    },
  });
}

/**
 * Registra reserva de estoque para pedido
 */
export async function logStockReservation(params: {
  userId: string;
  userName: string;
  stockItemId: string;
  productCode: string;
  productName: string;
  quantity: number;
  orderId: string;
  orderNumber: string;
  customerId?: string;
  customerName?: string;
}): Promise<LogActivityResult> {
  return await logActivity({
    eventType: 'stock_reservation',
    category: 'INVENTORY',
    userId: params.userId,
    userName: params.userName,
    entityType: 'stock',
    entityId: params.stockItemId,
    entityCode: params.productCode,
    stockItemId: params.stockItemId,
    orderId: params.orderId,
    customerId: params.customerId,
    action: `Estoque reservado - ${params.productName} - Qtd: ${params.quantity} - Pedido ${params.orderNumber}`,
    metadata: {
      productCode: params.productCode,
      productName: params.productName,
      quantity: params.quantity,
      orderId: params.orderId,
      orderNumber: params.orderNumber,
      customerId: params.customerId,
      customerName: params.customerName,
      reservedAt: Timestamp.now(),
    },
  });
}

/**
 * Registra liberação de estoque reservado
 */
export async function logStockRelease(params: {
  userId: string;
  userName: string;
  stockItemId: string;
  productCode: string;
  productName: string;
  quantity: number;
  orderId: string;
  orderNumber: string;
  releaseReason: 'cancellation' | 'delivery' | 'adjustment';
}): Promise<LogActivityResult> {
  const reasonLabels = {
    cancellation: 'Cancelamento do pedido',
    delivery: 'Entrega realizada',
    adjustment: 'Ajuste manual',
  };

  return await logActivity({
    eventType: 'stock_release',
    category: 'INVENTORY',
    userId: params.userId,
    userName: params.userName,
    entityType: 'stock',
    entityId: params.stockItemId,
    entityCode: params.productCode,
    stockItemId: params.stockItemId,
    orderId: params.orderId,
    action: `Estoque liberado - ${params.productName} - Qtd: ${params.quantity} - ${reasonLabels[params.releaseReason]}`,
    metadata: {
      productCode: params.productCode,
      productName: params.productName,
      quantity: params.quantity,
      orderId: params.orderId,
      orderNumber: params.orderNumber,
      releaseReason: params.releaseReason,
      releaseReasonLabel: reasonLabels[params.releaseReason],
      releasedAt: Timestamp.now(),
    },
  });
}

// ============================================================================
// HELPER FUNCTIONS - EDIÇÕES DE DADOS
// ============================================================================

/**
 * Registra edição de dados do cliente
 */
export async function logCustomerDataUpdated(params: {
  userId: string;
  userName: string;
  customerId: string;
  customerCode: string;
  customerName: string;
  changes: ActivityChange[];
}): Promise<LogActivityResult> {
  return await logActivity({
    eventType: 'customer_data_updated',
    category: 'MODIFICATION',
    userId: params.userId,
    userName: params.userName,
    entityType: 'customer',
    entityId: params.customerId,
    entityCode: params.customerCode,
    customerId: params.customerId,
    action: `Dados do cliente ${params.customerName} atualizados`,
    changes: params.changes,
    metadata: {
      customerName: params.customerName,
      fieldsUpdated: params.changes.map(c => c.field),
    },
  });
}

/**
 * Registra edição de dados do pedido
 */
export async function logOrderDataUpdated(params: {
  userId: string;
  userName: string;
  orderId: string;
  orderNumber: string;
  customerId?: string;
  customerName?: string;
  changes: ActivityChange[];
}): Promise<LogActivityResult> {
  return await logActivity({
    eventType: 'order_data_updated',
    category: 'MODIFICATION',
    userId: params.userId,
    userName: params.userName,
    entityType: 'order',
    entityId: params.orderId,
    entityCode: params.orderNumber,
    orderId: params.orderId,
    customerId: params.customerId,
    action: `Pedido ${params.orderNumber} atualizado${params.customerName ? ` - ${params.customerName}` : ''}`,
    changes: params.changes,
    metadata: {
      customerName: params.customerName,
      fieldsUpdated: params.changes.map(c => c.field),
    },
  });
}

/**
 * Registra mudança de preço
 */
export async function logPriceChanged(params: {
  userId: string;
  userName: string;
  entityType: 'product' | 'service' | 'delivery_zone';
  entityId: string;
  entityCode: string;
  entityName: string;
  oldPrice: number;
  newPrice: number;
  changeReason?: string;
}): Promise<LogActivityResult> {
  const priceDiff = params.newPrice - params.oldPrice;
  const percentChange = ((priceDiff / params.oldPrice) * 100).toFixed(2);
  const changeDirection = priceDiff > 0 ? 'aumento' : 'redução';

  return await logActivity({
    eventType: 'price_changed',
    category: 'MODIFICATION',
    userId: params.userId,
    userName: params.userName,
    entityType: params.entityType as EntityType,
    entityId: params.entityId,
    entityCode: params.entityCode,
    action: `Preço alterado - ${params.entityName} - ${changeDirection} de ${percentChange}%`,
    changes: [
      {
        field: 'price',
        oldValue: params.oldPrice,
        newValue: params.newPrice,
        fieldLabel: 'Preço',
      },
    ],
    metadata: {
      entityName: params.entityName,
      oldPrice: params.oldPrice,
      newPrice: params.newPrice,
      priceDiff: priceDiff,
      percentChange: parseFloat(percentChange),
      changeReason: params.changeReason,
    },
  });
}

// ============================================================================
// HELPER FUNCTIONS - INTEGRAÇÕES
// ============================================================================

/**
 * Registra sincronização de pedido Lunna
 */
export async function logLunnaOrderSynced(params: {
  userId: string;
  userName: string;
  orderId: string;
  orderNumber: string;
  customerId?: string;
  customerName?: string;
  totalValue: number;
  itemCount: number;
  serviceId?: string;
  serviceCode?: string;
  routeId?: string;
  routeCode?: string;
}): Promise<LogActivityResult> {
  return await logActivity({
    eventType: 'lunna_order_synced',
    category: 'INTEGRATION',
    origin: 'api_integration',
    userId: params.userId,
    userName: params.userName,
    entityType: 'integration',
    entityId: params.orderId,
    entityCode: params.orderNumber,
    orderId: params.orderId,
    customerId: params.customerId,
    serviceId: params.serviceId,
    serviceCode: params.serviceCode,
    routeId: params.routeId,
    routeCode: params.routeCode,
    action: `Pedido Lunna ${params.orderNumber} sincronizado - ${params.customerName || 'Cliente'}`,
    metadata: {
      orderNumber: params.orderNumber,
      customerName: params.customerName,
      totalValue: params.totalValue,
      itemCount: params.itemCount,
      syncedAt: Timestamp.now(),
    },
  });
}

/**
 * Registra atualização de status no Lunna
 */
export async function logLunnaStatusUpdated(params: {
  userId: string;
  userName: string;
  orderId: string;
  orderNumber: string;
  oldStatus: string;
  newStatus: string;
  routeId?: string;
  routeCode?: string;
  pointId?: string;
  pointCode?: string;
}): Promise<LogActivityResult> {
  return await logActivity({
    eventType: 'lunna_status_updated',
    category: 'INTEGRATION',
    origin: 'api_integration',
    userId: params.userId,
    userName: params.userName,
    entityType: 'integration',
    entityId: params.orderId,
    entityCode: params.orderNumber,
    orderId: params.orderId,
    routeId: params.routeId,
    routeCode: params.routeCode,
    pointId: params.pointId,
    pointCode: params.pointCode,
    action: `Status Lunna atualizado - Pedido ${params.orderNumber} - ${params.oldStatus} → ${params.newStatus}`,
    changes: [
      {
        field: 'logisticsStatus',
        oldValue: params.oldStatus,
        newValue: params.newStatus,
        fieldLabel: 'Status Logístico',
      },
    ],
    metadata: {
      orderNumber: params.orderNumber,
      oldStatus: params.oldStatus,
      newStatus: params.newStatus,
      updatedAt: Timestamp.now(),
    },
  });
}

// ============================================================================
// QUERY FUNCTIONS (CONSULTAS)
// ============================================================================

/**
 * Busca histórico de atividades de uma entidade específica
 */
export async function getActivityHistory(
  entityId: string,
  entityType?: EntityType,
  limitCount: number = 50
): Promise<{ success: boolean; activities: (ActivityLogEntry & { id: string })[]; error?: string }> {
  try {
    const activityRef = collection(db, 'activity_log');
    
    let q = entityType
      ? query(
          activityRef,
          where('entityId', '==', entityId),
          where('entityType', '==', entityType),
          orderBy('timestamp', 'desc'),
          firestoreLimit(limitCount)
        )
      : query(
          activityRef,
          where('entityId', '==', entityId),
          orderBy('timestamp', 'desc'),
          firestoreLimit(limitCount)
        );

    const snapshot = await getDocs(q);
    const activities = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as (ActivityLogEntry & { id: string })[];

    return {
      success: true,
      activities,
    };
  } catch (error) {
    console.error('[ActivityLog] Erro ao buscar histórico:', error);
    return {
      success: false,
      activities: [],
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    };
  }
}

/**
 * Busca atividades por período
 */
export async function getActivitiesByDateRange(
  startDate: Date,
  endDate: Date,
  limitCount: number = 100
): Promise<{ success: boolean; activities: (ActivityLogEntry & { id: string })[]; error?: string }> {
  try {
    const activityRef = collection(db, 'activity_log');
    
    const q = query(
      activityRef,
      where('timestamp', '>=', Timestamp.fromDate(startDate)),
      where('timestamp', '<=', Timestamp.fromDate(endDate)),
      orderBy('timestamp', 'desc'),
      firestoreLimit(limitCount)
    );

    const snapshot = await getDocs(q);
    const activities = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as (ActivityLogEntry & { id: string })[];

    return {
      success: true,
      activities,
    };
  } catch (error) {
    console.error('[ActivityLog] Erro ao buscar por período:', error);
    return {
      success: false,
      activities: [],
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    };
  }
}

// ============================================================================
// UTILITY FUNCTIONS (UTILITÁRIAS)
// ============================================================================

/**
 * Helper para criar snapshots de estado
 */
export function buildSnapshot<T extends Record<string, any>>(
  obj: T,
  fieldsToCapture?: (keyof T)[]
): Record<string, any> {
  if (fieldsToCapture) {
    return fieldsToCapture.reduce((acc, field) => {
      acc[field as string] = obj[field];
      return acc;
    }, {} as Record<string, any>);
  }
  
  return { ...obj };
}

/**
 * Helper para detectar e formatar alterações entre dois objetos
 */
export function compareChanges<T extends Record<string, any>>(
  oldObj: T,
  newObj: T,
  fieldLabels?: Record<keyof T, string>
): ActivityChange[] {
  const changes: ActivityChange[] = [];
  
  const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
  
  for (const key of allKeys) {
    const oldValue = oldObj[key];
    const newValue = newObj[key];
    
    // Ignora valores undefined
    if (oldValue === undefined && newValue === undefined) {
      continue;
    }
    
    // Detecta mudança
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changes.push({
        field: key,
        oldValue: oldValue,
        newValue: newValue,
        fieldLabel: fieldLabels?.[key as keyof T] || key,
      });
    }
  }
  
  return changes;
}

/**
 * Formata valor para exibição
 */
export function formatValue(value: any): string {
  if (value === null || value === undefined) {
    return '(vazio)';
  }
  
  if (typeof value === 'number') {
    return value.toFixed(2);
  }
  
  if (typeof value === 'boolean') {
    return value ? 'Sim' : 'Não';
  }
  
  if (value instanceof Timestamp || (value && typeof value === 'object' && '_seconds' in value)) {
    const date = value instanceof Timestamp 
      ? value.toDate() 
      : new Date(value._seconds * 1000);
    return date.toLocaleString('pt-BR');
  }
  
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  
  return String(value);
}
