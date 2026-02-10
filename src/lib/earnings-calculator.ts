import type { EarningsRules, RouteInfo, PlaceValue, PaymentBreakdown, RouteStats } from './types';
import type { Timestamp } from 'firebase/firestore';

export interface RouteForCalculation extends RouteInfo {
  driverId: string;
  driverName: string;
  completedAt: Date | Timestamp;
  driverInfo?: {
    id: string;
    name: string;
  };
}

export interface EarningsCalculationResult {
  breakdown: PaymentBreakdown;
  routeStats: RouteStats;
  totalEarnings: number;
}

/**
 * Converte Timestamp do Firestore para Date
 */
function toDate(timestamp: Date | Timestamp): Date {
  if (timestamp instanceof Date) {
    return timestamp;
  }
  // Firestore Timestamp
  if ('toDate' in timestamp && typeof timestamp.toDate === 'function') {
    return timestamp.toDate();
  }
  return new Date(timestamp);
}

/**
 * Calcula os ganhos de um motorista para uma rota completada
 * @param route - Dados da rota completada
 * @param rules - Regras de ganhos ativas
 * @returns Breakdown detalhado e total de ganhos
 */
export function calculateRouteEarnings(
  route: RouteForCalculation,
  rules: EarningsRules
): EarningsCalculationResult {
  // Converte completedAt para Date
  const completedDate = toDate(route.completedAt);

  // 1. Calcula distância em quilômetros
  const distanceKm = route.distanceMeters / 1000;

  // 2. Conta entregas por status
  const successfulDeliveries = route.stops.filter(
    (stop) => stop.deliveryStatus === 'completed'
  ).length;

  const failedDeliveries = route.stops.filter(
    (stop) => stop.deliveryStatus === 'failed'
  ).length;

  // Tentativas falhadas onde o motorista foi até o local
  const failedWithAttempt = route.stops.filter(
    (stop) => stop.deliveryStatus === 'failed' && stop.wentToLocation === true
  ).length;

  // 3. Conta pedidos Lunna
  const lunnaOrderCount = route.lunnaOrderIds?.length || 0;

  // 4. Cálculos base - varia conforme modo de precificação
  let basePay = 0;
  let distanceEarnings = 0;

  if (rules.pricingMode === 'zone' && rules.pricingZones && rules.pricingZones.length > 0) {
    // Modo de precificação por zona
    // Usa a primeira zona como padrão (você pode implementar lógica mais complexa baseada na localização)
    basePay = rules.pricingZones[0].price;
    distanceEarnings = 0; // Não usa distância neste modo
  } else if (rules.pricingMode === 'distance') {
    // Modo de precificação por distância (original)
    basePay = rules.basePayPerRoute;
    distanceEarnings = distanceKm * rules.pricePerKm;
  } else {
    // Modo híbrido: usa zona como base e adiciona distância extra
    if (rules.pricingZones && rules.pricingZones.length > 0) {
      basePay = rules.pricingZones[0].price;
      // Calcula distância além da zona
      const zoneMaxDistance = rules.pricingZones[0].maxDistanceKm || 0;
      const extraDistance = Math.max(0, distanceKm - zoneMaxDistance);
      distanceEarnings = extraDistance * rules.pricePerKm;
    } else {
      basePay = rules.basePayPerRoute;
      distanceEarnings = distanceKm * rules.pricePerKm;
    }
  }

  const deliveryBonuses = successfulDeliveries * rules.bonusPerDelivery;
  const failedAttemptBonuses = failedWithAttempt * rules.bonusPerFailedAttempt;
  const lunnaBonus = lunnaOrderCount * rules.lunnaOrderBonus;

  // 5. Bônus de volume (tiers de paradas)
  let stopTierBonus = 0;
  const totalStops = route.stops.length;

  for (const tier of rules.stopTiers) {
    if (totalStops >= tier.minStops && totalStops <= tier.maxStops) {
      stopTierBonus = tier.bonus;
      break;
    }
  }

  // 6. Multiplicador de horário
  let timeBonusMultiplier = 1.0;
  const completedHour = completedDate.getHours();
  const completedDay = completedDate.getDay(); // 0 = Domingo, 6 = Sábado

  // Manhã cedo (6h-8h)
  if (
    rules.bonuses.earlyMorning.enabled &&
    completedHour >= 6 &&
    completedHour < 8
  ) {
    timeBonusMultiplier = Math.max(
      timeBonusMultiplier,
      rules.bonuses.earlyMorning.multiplier
    );
  }

  // Noite (20h-23h)
  if (
    rules.bonuses.lateNight.enabled &&
    completedHour >= 20 &&
    completedHour < 23
  ) {
    timeBonusMultiplier = Math.max(
      timeBonusMultiplier,
      rules.bonuses.lateNight.multiplier
    );
  }

  // Fim de semana (Sábado ou Domingo)
  if (
    rules.bonuses.weekend.enabled &&
    (completedDay === 0 || completedDay === 6)
  ) {
    timeBonusMultiplier = Math.max(
      timeBonusMultiplier,
      rules.bonuses.weekend.multiplier
    );
  }

  // 7. Calcula o bônus de horário
  // Aplica o multiplicador sobre base pay + distância
  const baseComponents = basePay + distanceEarnings;
  const timeBonusAmount =
    timeBonusMultiplier > 1
      ? baseComponents * (timeBonusMultiplier - 1)
      : 0;

  // 8. Calcula subtotal (sem bônus de tempo)
  const subtotal =
    basePay +
    distanceEarnings +
    deliveryBonuses +
    failedAttemptBonuses +
    lunnaBonus +
    stopTierBonus;

  // 9. Total de ganhos (subtotal + bônus de tempo)
  const totalEarnings = subtotal + timeBonusAmount;

  // 10. Prepara breakdown e estatísticas
  const breakdown: PaymentBreakdown = {
    basePay,
    distanceEarnings,
    deliveryBonuses,
    failedAttemptBonuses,
    timeBonusMultiplier,
    timeBonusAmount,
    stopTierBonus,
    lunnaBonus,
    subtotal,
  };

  const routeStats: RouteStats = {
    distanceKm: parseFloat(distanceKm.toFixed(2)),
    totalStops,
    successfulDeliveries,
    failedDeliveries,
    failedWithAttempt,
    lunnaOrderCount,
    duration: route.duration,
  };

  return {
    breakdown,
    routeStats,
    totalEarnings: parseFloat(totalEarnings.toFixed(2)),
  };
}

/**
 * Formata valor monetário para exibição
 * @param value - Valor numérico
 * @returns String formatada (ex: "R$ 120,50")
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

/**
 * Calcula ganhos teóricos para preview (dados mockados)
 * @param rules - Regras de ganhos
 * @returns Exemplo de cálculo
 */
export function calculatePreviewEarnings(rules: EarningsRules): EarningsCalculationResult {
  // Dados mockados para preview
  const mockRoute: RouteForCalculation = {
    driverId: 'mock-driver',
    driverName: 'Motorista Exemplo',
    completedAt: new Date(), // Agora
    stops: Array(15).fill(null).map((_, i) => ({
      id: `stop-${i}`,
      address: `Endereço ${i}`,
      placeId: `place-${i}`,
      lat: 0,
      lng: 0,
      deliveryStatus: i < 13 ? 'completed' : i < 14 ? 'failed' : 'pending',
      wentToLocation: i === 13 ? true : undefined,
    } as PlaceValue)),
    encodedPolyline: '',
    distanceMeters: 25000, // 25 km
    duration: '3600s', // 1 hora
    lunnaOrderIds: ['P0001', 'P0002', 'P0003'], // 3 pedidos Lunna
  };

  return calculateRouteEarnings(mockRoute, rules);
}
