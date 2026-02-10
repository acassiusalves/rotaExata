import { db } from './firebase/client';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import { calculateRouteEarnings, type RouteForCalculation } from './earnings-calculator';
import type { EarningsRules, DriverPayment } from './types';

export interface GeneratePaymentsResult {
  generated: number;
  payments: DriverPayment[];
  errors: Array<{ routeId: string; error: string }>;
}

/**
 * Gera pagamentos pendentes para rotas completadas que ainda não têm pagamento
 * @param startDate - Data inicial para filtrar rotas (opcional)
 * @param endDate - Data final para filtrar rotas (opcional)
 * @returns Resultado com quantidade gerada e lista de pagamentos
 */
export async function generatePendingPayments(
  startDate?: Date,
  endDate?: Date
): Promise<GeneratePaymentsResult> {
  const errors: Array<{ routeId: string; error: string }> = [];
  const newPayments: DriverPayment[] = [];

  try {
    // 1. Busca regras ativas
    const rulesDoc = await getDoc(doc(db, 'earningsRules', 'active'));

    if (!rulesDoc.exists()) {
      throw new Error(
        'Nenhuma regra de ganhos ativa encontrada. Configure as regras primeiro.'
      );
    }

    const rules = rulesDoc.data() as EarningsRules;

    if (!rules.active) {
      throw new Error('As regras de ganhos estão desativadas.');
    }

    // 2. Busca rotas completadas
    const routesQuery = query(
      collection(db, 'routes'),
      where('status', 'in', ['completed', 'completed_auto'])
    );

    const routesSnapshot = await getDocs(routesQuery);

    // 3. Busca pagamentos existentes para evitar duplicação
    const paymentsSnapshot = await getDocs(collection(db, 'driverPayments'));
    const existingPaymentRouteIds = new Set(
      paymentsSnapshot.docs.map((doc) => doc.data().routeId)
    );

    // 4. Processa cada rota
    for (const routeDoc of routesSnapshot.docs) {
      const routeId = routeDoc.id;

      // Pula se já existe pagamento para esta rota
      if (existingPaymentRouteIds.has(routeId)) {
        continue;
      }

      const routeData = routeDoc.data();

      // Valida se a rota tem informações necessárias
      if (!routeData.driverInfo || !routeData.completedAt) {
        errors.push({
          routeId,
          error: 'Rota sem motorista ou data de conclusão',
        });
        continue;
      }

      // Converte Timestamp para Date
      const completedDate =
        routeData.completedAt instanceof Timestamp
          ? routeData.completedAt.toDate()
          : new Date(routeData.completedAt);

      // Aplica filtro de data se fornecido
      if (startDate && completedDate < startDate) {
        continue;
      }
      if (endDate && completedDate > endDate) {
        continue;
      }

      // Prepara dados da rota para cálculo
      const routeForCalculation: RouteForCalculation = {
        ...routeData,
        driverId: routeData.driverInfo.id,
        driverName: routeData.driverInfo.name,
        completedAt: completedDate,
      };

      try {
        // Calcula ganhos
        const calculation = calculateRouteEarnings(routeForCalculation, rules);

        // Prepara documento de pagamento
        const paymentData: Omit<DriverPayment, 'id'> = {
          routeId,
          routeCode: routeData.code || 'N/A',
          driverId: routeData.driverInfo.id,
          driverName: routeData.driverInfo.name,
          routeCompletedAt: routeData.completedAt,
          routePlannedDate: routeData.plannedDate || routeData.completedAt,
          calculatedAt: Timestamp.now(),
          breakdown: calculation.breakdown,
          routeStats: calculation.routeStats,
          totalEarnings: calculation.totalEarnings,
          status: 'pending',
          rulesVersion: rules.version,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        };

        // Cria documento no Firestore
        const paymentRef = doc(collection(db, 'driverPayments'));
        const paymentWithId: DriverPayment = {
          ...paymentData,
          id: paymentRef.id,
        };

        await setDoc(paymentRef, paymentWithId);
        newPayments.push(paymentWithId);
      } catch (error) {
        errors.push({
          routeId,
          error:
            error instanceof Error
              ? error.message
              : 'Erro desconhecido ao calcular ganhos',
        });
      }
    }

    return {
      generated: newPayments.length,
      payments: newPayments,
      errors,
    };
  } catch (error) {
    throw new Error(
      `Erro ao gerar pagamentos: ${
        error instanceof Error ? error.message : 'Erro desconhecido'
      }`
    );
  }
}

/**
 * Gera pagamento para uma rota específica
 * @param routeId - ID da rota
 * @returns Pagamento gerado ou null se já existe
 */
export async function generatePaymentForRoute(
  routeId: string
): Promise<DriverPayment | null> {
  try {
    // Verifica se já existe pagamento
    const existingPaymentsQuery = query(
      collection(db, 'driverPayments'),
      where('routeId', '==', routeId)
    );
    const existingPayments = await getDocs(existingPaymentsQuery);

    if (!existingPayments.empty) {
      return null; // Já existe pagamento
    }

    // Busca a rota
    const routeDoc = await getDoc(doc(db, 'routes', routeId));

    if (!routeDoc.exists()) {
      throw new Error('Rota não encontrada');
    }

    const routeData = routeDoc.data();

    // Valida status da rota
    if (
      !routeData.status ||
      !['completed', 'completed_auto'].includes(routeData.status)
    ) {
      throw new Error('Rota não está completada');
    }

    // Valida informações necessárias
    if (!routeData.driverInfo || !routeData.completedAt) {
      throw new Error('Rota sem motorista ou data de conclusão');
    }

    // Busca regras ativas
    const rulesDoc = await getDoc(doc(db, 'earningsRules', 'active'));

    if (!rulesDoc.exists()) {
      throw new Error('Nenhuma regra de ganhos ativa encontrada');
    }

    const rules = rulesDoc.data() as EarningsRules;

    // Prepara rota para cálculo
    const completedDate =
      routeData.completedAt instanceof Timestamp
        ? routeData.completedAt.toDate()
        : new Date(routeData.completedAt);

    const routeForCalculation: RouteForCalculation = {
      ...routeData,
      driverId: routeData.driverInfo.id,
      driverName: routeData.driverInfo.name,
      completedAt: completedDate,
    };

    // Calcula ganhos
    const calculation = calculateRouteEarnings(routeForCalculation, rules);

    // Cria pagamento
    const paymentRef = doc(collection(db, 'driverPayments'));
    const payment: DriverPayment = {
      id: paymentRef.id,
      routeId,
      routeCode: routeData.code || 'N/A',
      driverId: routeData.driverInfo.id,
      driverName: routeData.driverInfo.name,
      routeCompletedAt: routeData.completedAt,
      routePlannedDate: routeData.plannedDate || routeData.completedAt,
      calculatedAt: Timestamp.now(),
      breakdown: calculation.breakdown,
      routeStats: calculation.routeStats,
      totalEarnings: calculation.totalEarnings,
      status: 'pending',
      rulesVersion: rules.version,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    await setDoc(paymentRef, payment);

    return payment;
  } catch (error) {
    throw new Error(
      `Erro ao gerar pagamento para rota: ${
        error instanceof Error ? error.message : 'Erro desconhecido'
      }`
    );
  }
}
