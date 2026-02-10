import { db } from './firebase/client';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { calculateRouteEarnings, type RouteForCalculation } from './earnings-calculator';
import type { EarningsRules, DriverPayment, PaymentMethod } from './types';

// Remove campos undefined de um objeto recursivamente
function removeUndefined(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(removeUndefined);
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.entries(obj).reduce((acc, [key, value]) => {
      if (value !== undefined) {
        acc[key] = removeUndefined(value);
      }
      return acc;
    }, {} as any);
  }
  return obj;
}

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
      routeCreatedAt: routeData.createdAt || payment.routeCreatedAt, // Preserva ou atualiza data de criação da rota
      breakdown: calculation.breakdown,
      routeStats: calculation.routeStats,
      totalEarnings: calculation.totalEarnings,
      rulesVersion: rules.version,
      updatedAt: Timestamp.now(),
      notes: payment.notes
        ? `${payment.notes}\nRecalculado em ${new Date().toLocaleString('pt-BR')}`
        : `Recalculado em ${new Date().toLocaleString('pt-BR')}`,
    };

    // Remove campos undefined antes de salvar
    const cleanPayment = removeUndefined(updatedPayment);

    await setDoc(paymentRef, cleanPayment, { merge: true });

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

/**
 * Corrige pagamentos sem driverId/driverName buscando da rota
 * @returns Número de pagamentos corrigidos
 */
export async function fixPaymentsWithoutDriver(): Promise<number> {
  try {
    const { collection, query, getDocs, doc, getDoc, setDoc } = await import('firebase/firestore');
    const { db } = await import('./firebase/client');

    const paymentsSnapshot = await getDocs(collection(db, 'driverPayments'));
    let fixed = 0;

    for (const paymentDoc of paymentsSnapshot.docs) {
      const payment = paymentDoc.data() as DriverPayment;

      // Se já tem driverId e driverName, pula
      if (payment.driverId && payment.driverName) {
        continue;
      }

      // Busca a rota para pegar os dados do motorista
      const routeDoc = await getDoc(doc(db, 'routes', payment.routeId));

      if (!routeDoc.exists()) {
        console.warn(`Rota não encontrada para pagamento ${payment.id}`);
        continue;
      }

      const routeData = routeDoc.data();

      // Pega driverId da rota (campo driverId ou driverInfo.id)
      const driverId = routeData.driverId || routeData.driverInfo?.id;
      const driverName = routeData.driverInfo?.name;

      if (!driverId || !driverName) {
        console.warn(`Rota ${payment.routeId} sem informações de motorista completas (driverId: ${driverId}, driverName: ${driverName})`);
        continue;
      }

      // Atualiza o pagamento com dados do motorista e data de criação da rota
      const updateData = {
        driverId: driverId,
        driverName: driverName,
        routeCreatedAt: routeData.createdAt, // Adiciona data de criação da rota se não existir
        routePlannedDate: routeData.plannedDate, // Adiciona data planejada da rota
      };

      const cleanData = removeUndefined(updateData);
      await setDoc(doc(db, 'driverPayments', payment.id), cleanData, { merge: true });
      fixed++;
    }

    return fixed;
  } catch (error) {
    throw new Error(
      `Erro ao corrigir pagamentos: ${
        error instanceof Error ? error.message : 'Erro desconhecido'
      }`
    );
  }
}

/**
 * Atualiza o valor de um pagamento manualmente
 * @param paymentId - ID do pagamento
 * @param newValue - Novo valor total
 * @param userId - ID do usuário que está fazendo a alteração
 * @param reason - Motivo da alteração
 */
export async function updatePaymentValue(
  paymentId: string,
  newValue: number,
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
        'Pagamento já foi pago. Para ajustar, cancele e crie um novo pagamento.'
      );
    }

    if (!reason || reason.trim().length === 0) {
      throw new Error('Motivo da alteração é obrigatório');
    }

    const oldValue = payment.totalEarnings;
    const difference = newValue - oldValue;

    // Cria nota de alteração
    const changeNote = `[${new Date().toLocaleString('pt-BR')}] Valor alterado manualmente por ${userId}\n` +
      `Valor anterior: R$ ${oldValue.toFixed(2)}\n` +
      `Valor novo: R$ ${newValue.toFixed(2)}\n` +
      `Diferença: ${difference > 0 ? '+' : ''}R$ ${difference.toFixed(2)}\n` +
      `Motivo: ${reason.trim()}`;

    const updatedNotes = payment.notes
      ? `${payment.notes}\n\n${changeNote}`
      : changeNote;

    const updateData = {
      totalEarnings: newValue,
      notes: updatedNotes,
      manuallyEdited: true,
      manualEditBy: userId,
      manualEditAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    // Remove undefined antes de salvar
    const cleanData = removeUndefined(updateData);

    await setDoc(paymentRef, cleanData, { merge: true });
  } catch (error) {
    throw new Error(
      `Erro ao atualizar valor do pagamento: ${
        error instanceof Error ? error.message : 'Erro desconhecido'
      }`
    );
  }
}

/**
 * Atualiza o valor de uma parada específica no pagamento
 * @param paymentId - ID do pagamento
 * @param routeId - ID da rota
 * @param stopIndex - Índice da parada (0-based)
 * @param newStopValue - Novo valor da parada
 * @param userId - ID do usuário que está fazendo a alteração
 * @param reason - Motivo da alteração
 */
export async function updateStopValue(
  paymentId: string,
  routeId: string,
  stopIndex: number,
  newStopValue: number,
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
        'Pagamento já foi pago. Para ajustar, cancele e crie um novo pagamento.'
      );
    }

    if (!reason || reason.trim().length === 0) {
      throw new Error('Motivo da alteração é obrigatório');
    }

    // Busca a rota para obter os dados da parada
    const routeDoc = await getDoc(doc(db, 'routes', routeId));
    if (!routeDoc.exists()) {
      throw new Error('Rota não encontrada');
    }

    const routeData = routeDoc.data();
    const stops = routeData.stops || [];

    if (stopIndex < 0 || stopIndex >= stops.length) {
      throw new Error('Índice de parada inválido');
    }

    const stop = stops[stopIndex];

    // Calcula o valor atual da parada
    const { breakdown, routeStats } = payment;
    const totalStops = routeStats.totalStops;
    const baseValuePerStop = breakdown.basePay / totalStops;

    let currentStopValue = baseValuePerStop;
    if (stop.deliveryStatus === 'completed') {
      currentStopValue += breakdown.deliveryBonuses / (routeStats.successfulDeliveries || 1);
    } else if (stop.deliveryStatus === 'failed' && stop.wentToLocation) {
      currentStopValue += breakdown.failedAttemptBonuses / (routeStats.failedWithAttempt || 1);
    }

    const difference = newStopValue - currentStopValue;

    // Atualiza o valor total do pagamento
    const newTotalEarnings = payment.totalEarnings + difference;

    // Cria nota de alteração
    const changeNote = `[${new Date().toLocaleString('pt-BR')}] Valor da Parada ${stopIndex + 1} alterado por ${userId}\n` +
      `Cliente: ${stop.customerName || 'Não especificado'}\n` +
      `Valor anterior: R$ ${currentStopValue.toFixed(2)}\n` +
      `Valor novo: R$ ${newStopValue.toFixed(2)}\n` +
      `Diferença: ${difference > 0 ? '+' : ''}R$ ${difference.toFixed(2)}\n` +
      `Total do pagamento atualizado: R$ ${newTotalEarnings.toFixed(2)}\n` +
      `Motivo: ${reason.trim()}`;

    const updatedNotes = payment.notes
      ? `${payment.notes}\n\n${changeNote}`
      : changeNote;

    // Armazena a alteração customizada da parada em um mapa
    const customStopValues = (payment as any).customStopValues || {};
    customStopValues[stopIndex] = {
      value: newStopValue,
      originalValue: currentStopValue,
      updatedBy: userId,
      updatedAt: Timestamp.now(),
      reason: reason.trim(),
    };

    const updateData = {
      totalEarnings: newTotalEarnings,
      notes: updatedNotes,
      customStopValues,
      manuallyEdited: true,
      manualEditBy: userId,
      manualEditAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    // Remove undefined antes de salvar
    const cleanData = removeUndefined(updateData);

    await setDoc(paymentRef, cleanData, { merge: true });
  } catch (error) {
    throw new Error(
      `Erro ao atualizar valor da parada: ${
        error instanceof Error ? error.message : 'Erro desconhecido'
      }`
    );
  }
}
