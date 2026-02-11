import { PlaceValue } from '@/lib/types';

/**
 * Gera códigos sequenciais para pontos baseado no código da rota
 *
 * Formato: {ROUTE_CODE}-{SEQUENCE}
 * Exemplos:
 * - RT-0001-001, RT-0001-002, RT-0001-003 (rotas independentes)
 * - LN-0011-A-001, LN-0011-A-002 (rotas de serviço)
 *
 * @param stops Array de pontos (PlaceValue)
 * @param routeCode Código da rota (ex: "RT-0001" ou "LN-0011-A")
 * @returns Array de pontos com pointCode atribuído
 */
export function generatePointCodes(
  stops: PlaceValue[],
  routeCode: string
): PlaceValue[] {
  return stops.map((stop, index) => ({
    ...stop,
    pointCode: `${routeCode}-${String(index + 1).padStart(3, '0')}`
  }));
}

/**
 * Gera um único pointCode para um ponto específico
 *
 * @param routeCode Código da rota
 * @param position Posição do ponto na sequência (1-based)
 * @returns Código do ponto formatado
 */
export function generateSinglePointCode(
  routeCode: string,
  position: number
): string {
  return `${routeCode}-${String(position).padStart(3, '0')}`;
}
