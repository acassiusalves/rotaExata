import { adminDb } from './admin';
import { FieldValue } from 'firebase-admin/firestore';
import type { ActivityLogEntry, LogActivityResult } from '../types';

/**
 * Registra uma atividade no activity log usando Firebase Admin SDK (server-side)
 * Use esta versão em API routes e server actions.
 */
export async function logActivityAdmin(entry: Omit<ActivityLogEntry, 'timestamp'>): Promise<LogActivityResult> {
  try {
    if (!adminDb) {
      console.error('[ActivityLog Admin] ❌ adminDb não disponível');
      return { success: false, error: 'Firebase Admin não inicializado' };
    }

    const docRef = await adminDb.collection('activity_log').add({
      ...entry,
      timestamp: FieldValue.serverTimestamp(),
    });

    console.log('[ActivityLog Admin] ✅ Atividade registrada! ID:', docRef.id);
    return { success: true, id: docRef.id };
  } catch (error) {
    console.error('[ActivityLog Admin] ❌ Erro ao registrar atividade:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    };
  }
}

// ============================================================================
// HELPER FUNCTIONS - ROTAS (Server-side)
// ============================================================================

export async function logRouteCreatedAdmin(params: {
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
  return logActivityAdmin({
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

export async function logRouteDispatchedAdmin(params: {
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
  return logActivityAdmin({
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

export async function logPointsCreatedAdmin(params: {
  userId: string;
  userName: string;
  routeId: string;
  routeCode: string;
  serviceId?: string;
  serviceCode?: string;
  pointCodes: string[];
  totalPoints: number;
}) {
  return logActivityAdmin({
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

// ============================================================================
// HELPER FUNCTIONS - INTEGRAÇÕES (Server-side)
// ============================================================================

export async function logLunnaOrderSyncedAdmin(params: {
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
}) {
  return logActivityAdmin({
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
    },
  });
}

// ============================================================================
// HELPER FUNCTIONS - FINANCEIRO (Server-side)
// ============================================================================

export async function logBankReconciliationAdmin(params: {
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
}) {
  const isAiReconciliation = params.reconciledMethod === 'ai';
  const valueDiff = params.difference !== undefined
    ? params.difference
    : (params.extractedValue ? Math.abs(params.extractedValue - params.expectedValue) : 0);

  return logActivityAdmin({
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
    },
  });
}
