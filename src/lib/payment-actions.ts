import { db } from './firebase/client';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { calculateRouteEarnings, type RouteForCalculation } from './earnings-calculator';
import type { EarningsRules, DriverPayment, PaymentMethod } from './types';

/**
 * Aprova um pagamento pendente
 * @param paymentId - ID do pagamento
 * @param userId - ID do usuário que está aprovando
 */
export async function approvePayment(
  paymentId: string,
  userId: string
): Promise<void> {
  try {
    const paymentRef = doc(db, 'driverPayments', paymentId);
    const paymentDoc = await getDoc(paymentRef);

    if (!paymentDoc.exists()) {
      throw new Error('Pagamento não encontrado');
    }

    const payment = paymentDoc.data() as DriverPayment;

    if (payment.status !== 'pending') {
      throw new Error(
        `Pagamento não pode ser aprovado. Status atual: ${payment.status}`
      );
    }

    await setDoc(
      paymentRef,
      {
        status: 'approved',
        approvedBy: userId,
        approvedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );
  } catch (error) {
    throw new Error(
      `Erro ao aprovar pagamento: ${
        error instanceof Error ? error.message : 'Erro desconhecido'
      }`
    );
  }
}

/**
 * Aprova múltiplos pagamentos em lote
 * @param paymentIds - Array de IDs de pagamentos
 * @param userId - ID do usuário que está aprovando
 * @returns Resultado com sucessos e erros
 */
export async function approvePaymentsBatch(
  paymentIds: string[],
  userId: string
): Promise<{ success: number; errors: Array<{ id: string; error: string }> }> {
  const errors: Array<{ id: string; error: string }> = [];
  let success = 0;

  for (const paymentId of paymentIds) {
    try {
      await approvePayment(paymentId, userId);
      success++;
    } catch (error) {
      errors.push({
        id: paymentId,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }

  return { success, errors };
}

/**
 * Marca um pagamento como pago
 * @param paymentId - ID do pagamento
 * @param userId - ID do usuário que está marcando como pago
 * @param paymentMethod - Método de pagamento usado
 * @param paymentReference - Referência do pagamento (ID transação, etc.)
 * @param paidDate - Data do pagamento (opcional, usa data atual se não fornecida)
 */
export async function markAsPaid(
  paymentId: string,
  userId: string,
  paymentMethod: PaymentMethod,
  paymentReference?: string,
  paidDate?: Date
): Promise<void> {
  try {
    const paymentRef = doc(db, 'driverPayments', paymentId);
    const paymentDoc = await getDoc(paymentRef);

    if (!paymentDoc.exists()) {
      throw new Error('Pagamento não encontrado');
    }

    const payment = paymentDoc.data() as DriverPayment;

    if (payment.status === 'cancelled') {
      throw new Error('Pagamento cancelado não pode ser marcado como pago');
    }

    if (payment.status === 'paid') {
      throw new Error('Pagamento já está marcado como pago');
    }

    await setDoc(
      paymentRef,
      {
        status: 'paid',
        paidBy: userId,
        paidAt: paidDate ? Timestamp.fromDate(paidDate) : Timestamp.now(),
        paymentMethod,
        paymentReference: paymentReference || null,
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );
  } catch (error) {
    throw new Error(
      `Erro ao marcar pagamento como pago: ${
        error instanceof Error ? error.message : 'Erro desconhecido'
      }`
    );
  }
}

/**
 * Cancela um pagamento
 * @param paymentId - ID do pagamento
 * @param userId - ID do usuário que está cancelando
 * @param reason - Motivo do cancelamento
 */
export async function cancelPayment(
  paymentId: string,
  userId: string,
  reason: string
): Promise<void> {
  try {
    const paymentRef = doc(db, 'driverPayments', paymentId);
    const paymentDoc = await getDoc(paymentRef);

    if (!paymentDoc.exists()) {
      throw new Error('Pagamento não encontrado');
    }

    const payment = paymentDoc.data() as DriverPayment;

    if (payment.status === 'paid') {
      throw new Error(
        'Pagamento já pago não pode ser cancelado. Crie um ajuste se necessário.'
      );
    }

    if (payment.status === 'cancelled') {
      throw new Error('Pagamento já está cancelado');
    }

    if (!reason || reason.trim().length === 0) {
      throw new Error('Motivo do cancelamento é obrigatório');
    }

    await setDoc(
      paymentRef,
      {
        status: 'cancelled',
        cancelledBy: userId,
        cancelledAt: Timestamp.now(),
        cancellationReason: reason.trim(),
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );
  } catch (error) {
    throw new Error(
      `Erro ao cancelar pagamento: ${
        error instanceof Error ? error.message : 'Erro desconhecido'
      }`
    );
  }
}

/**
 * Recalcula um pagamento pendente com as regras atuais
 * @param paymentId - ID do pagamento
 * @returns Pagamento atualizado
 */
export async function recalculatePayment(
  paymentId: string
): Promise<DriverPayment> {
  try {
    const paymentRef = doc(db, 'driverPayments', paymentId);
    const paymentDoc = await getDoc(paymentRef);

    if (!paymentDoc.exists()) {
      throw new Error('Pagamento não encontrado');
    }

    const payment = paymentDoc.data() as DriverPayment;

    if (payment.status !== 'pending') {
      throw new Error('Apenas pagamentos pendentes podem ser recalculados');
    }

    // Busca a rota
    const routeDoc = await getDoc(doc(db, 'routes', payment.routeId));

    if (!routeDoc.exists()) {
      throw new Error('Rota não encontrada');
    }

    const routeData = routeDoc.data();

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

    // Recalcula ganhos
    const calculation = calculateRouteEarnings(routeForCalculation, rules);

    // Atualiza pagamento
    const updatedPayment: DriverPayment = {
      ...payment,
      breakdown: calculation.breakdown,
      routeStats: calculation.routeStats,
      totalEarnings: calculation.totalEarnings,
      rulesVersion: rules.version,
      updatedAt: Timestamp.now(),
      notes: payment.notes
        ? `${payment.notes}\nRecalculado em ${new Date().toLocaleString('pt-BR')}`
        : `Recalculado em ${new Date().toLocaleString('pt-BR')}`,
    };

    await setDoc(paymentRef, updatedPayment, { merge: true });

    return updatedPayment;
  } catch (error) {
    throw new Error(
      `Erro ao recalcular pagamento: ${
        error instanceof Error ? error.message : 'Erro desconhecido'
      }`
    );
  }
}

/**
 * Adiciona uma nota a um pagamento
 * @param paymentId - ID do pagamento
 * @param note - Nota a ser adicionada
 */
export async function addPaymentNote(
  paymentId: string,
  note: string
): Promise<void> {
  try {
    const paymentRef = doc(db, 'driverPayments', paymentId);
    const paymentDoc = await getDoc(paymentRef);

    if (!paymentDoc.exists()) {
      throw new Error('Pagamento não encontrado');
    }

    const payment = paymentDoc.data() as DriverPayment;

    const updatedNotes = payment.notes
      ? `${payment.notes}\n${note}`
      : note;

    await setDoc(
      paymentRef,
      {
        notes: updatedNotes,
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );
  } catch (error) {
    throw new Error(
      `Erro ao adicionar nota ao pagamento: ${
        error instanceof Error ? error.message : 'Erro desconhecido'
      }`
    );
  }
}
