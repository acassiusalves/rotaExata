/**
 * Resolve o motorista de uma rota.
 *
 * Uma rota guarda a identidade do motorista em DOIS lugares, com papeis
 * diferentes:
 *
 *   route.driverId    -- o uid de verdade, usado para consultar `users`
 *   route.driverInfo  -- copia desnormalizada para exibicao: {name, vehicle}
 *
 * `driverInfo` NUNCA teve o campo `id` -- quem o escreve (updateRouteDriver, a
 * tela de organizacao e a de criacao de rotas) grava so `name` e `vehicle`.
 * Mesmo assim `payment-generator` lia `routeData.driverInfo.id`, entao todo
 * pagamento gerado por ele nascia com `driverId: undefined` e deixava de ser
 * filtravel por motorista: 93 dos 374 registros ate 11/09/2026.
 *
 * `payment-actions` ja fazia certo em um dos seus caminhos
 * (`routeData.driverId || routeData.driverInfo?.id`) -- e por isso os outros
 * 281 registros estao corretos. Esta funcao e esse mesmo criterio, em um lugar
 * so, para os dois arquivos usarem.
 */

export type RouteDriverSource = {
  driverId?: string | null;
  driverInfo?: {id?: string | null; name?: string | null} | null;
} | null | undefined;

/**
 * Devolve o uid do motorista da rota, ou `null` quando a rota nao tem nenhuma
 * das duas origens. Nunca devolve `undefined`: gravar `undefined` no Firestore
 * e o que produzia os registros sem `driverId`.
 */
export function resolveRouteDriverId(route: RouteDriverSource): string | null {
  // A ordem importa: `driverId` e a fonte de verdade; `driverInfo.id` so
  // existe em rotas legadas. String vazia conta como ausente.
  return route?.driverId || route?.driverInfo?.id || null;
}
