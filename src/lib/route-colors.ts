/**
 * Sistema de cores sequenciais para rotas
 * As cores são atribuídas automaticamente na sequência quando rotas são criadas
 */

export const ROUTE_COLORS = [
  '#e60000', // Vermelho - Icone address 1.svg
  '#1fd634', // Verde - Icone address 2.svg
  '#fa9200', // Laranja - Icone address 3.svg
  '#bf07e4', // Roxo - Icone address 4.svg
  '#000000', // Preto - Icone address 5.svg
] as const;

/**
 * Retorna a cor sequencial para uma rota baseada no índice
 * @param index - Índice da rota (0-based)
 * @returns Cor hexadecimal da rota
 */
export function getRouteColor(index: number): string {
  return ROUTE_COLORS[index % ROUTE_COLORS.length];
}

/**
 * Retorna o caminho do ícone SVG correspondente à cor da rota
 * @param color - Cor hexadecimal da rota
 * @returns Caminho do arquivo SVG
 */
export function getRouteIconPath(color: string): string {
  const colorIndex = ROUTE_COLORS.indexOf(color as any);
  if (colorIndex === -1) return '/icons/Icone address 1.svg';
  return `/icons/Icone address ${colorIndex + 1}.svg`;
}

/**
 * Atribui cores sequencialmente a um array de rotas
 * @param routes - Array de rotas para colorir
 * @returns Array de rotas com cores atribuídas
 */
export function assignRouteColors<T extends { color?: string }>(routes: T[]): T[] {
  return routes.map((route, index) => ({
    ...route,
    color: route.color || getRouteColor(index),
  }));
}
