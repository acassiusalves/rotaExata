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
  return new Date(timestamp as any);
}

/**
 * Calcula a distância entre dois pontos em km usando a fórmula de Haversine
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Raio da Terra em km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Determina a zona de precificação de uma parada baseado na cidade e distância da origem
 * @param stop - Parada da rota
 * @param origin - Origem da rota
 * @param rules - Regras de ganhos (para usar as zonas configuradas)
 * @returns Valor da parada em reais
 */
function calculateStopPrice(stop: PlaceValue, origin?: PlaceValue, rules?: EarningsRules): number {
  const city = (stop.cidade || stop.city || '').toLowerCase().trim();
  const neighborhood = (stop.bairro || stop.neighborhood || '').toLowerCase().trim();

  // Se não tiver regras ou zonas configuradas, usa valores hardcoded (legado)
  if (!rules || !rules.pricingZones || rules.pricingZones.length === 0) {
    // Fallback para valores hardcoded antigos
    const citiesR20 = ['senador canedo', 'canedo', 'trindade', 'goianira'];
    if (citiesR20.some(c => city.includes(c) || neighborhood.includes(c))) {
      return 20;
    }

    const citiesGoianiaArea = ['goiânia', 'goiania', 'aparecida', 'aparecida de goiania', 'aparecida de goiânia'];
    const isGoianiaArea = citiesGoianiaArea.some(c => city.includes(c) || neighborhood.includes(c));

    if (isGoianiaArea && origin && origin.lat && origin.lng && stop.lat && stop.lng) {
      const distance = calculateDistance(origin.lat, origin.lng, stop.lat, stop.lng);
      return distance <= 7 ? 5 : 10;
    }

    if (isGoianiaArea) {
      return 5;
    }

    return 10;
  }

  // Usa as zonas configuradas nas regras
  for (const zone of rules.pricingZones) {
    // Verifica se a parada está nas cidades desta zona
    if (zone.cities && zone.cities.length > 0) {
      const cityMatch = zone.cities.some(zoneCity => {
        // zoneCity pode ser string ou objeto CityInfo
        const zoneCityStr = typeof zoneCity === 'string' ? zoneCity : (zoneCity as any).name || '';
        const zoneCityLower = zoneCityStr.toLowerCase().trim();
        return city.includes(zoneCityLower) || neighborhood.includes(zoneCityLower);
      });

      if (cityMatch) {
        // Se a zona tem distância máxima configurada, precisa calcular
        if (zone.maxDistanceKm && origin && origin.lat && origin.lng && stop.lat && stop.lng) {
          const distance = calculateDistance(origin.lat, origin.lng, stop.lat, stop.lng);

          // Se a distância está dentro do limite desta zona, retorna o preço
          if (distance <= zone.maxDistanceKm) {
            return zone.price;
          }
          // Se não, continua procurando outra zona que possa se aplicar
          continue;
        }

        // Se não tem distância máxima, retorna o preço da zona
        return zone.price;
      }
    }
  }

  // Se não encontrou nenhuma zona, retorna um valor padrão
  return 10;
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

  // 4. Calcula valor baseado em paradas (nova lógica por zona/distância)
  // Pega a origem da rota (primeiro ponto ou origem definida)
  const origin = (route as any).origin || route.stops[0];

  let basePay = 0;
  let deliveryBonuses = 0;
  let failedAttemptBonuses = 0;

  // Calcula o valor de cada parada individualmente
  for (const stop of route.stops) {
    const stopValue = calculateStopPrice(stop, origin, rules);

    if (stop.deliveryStatus === 'completed') {
      deliveryBonuses += stopValue;
    } else if (stop.deliveryStatus === 'failed' && stop.wentToLocation === true) {
      // Tentativa falhada onde foi ao local = 20% do valor da parada
      failedAttemptBonuses += stopValue * 0.2;
    }
  }

  // Distância não é mais usada diretamente, mas mantemos para compatibilidade
  const distanceEarnings = 0;

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
