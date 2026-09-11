/**
 * Regra do `autoCompleteRoutes`.
 *
 * O robo fecha rotas paradas ha mais de 48h. Mas `completed_auto` mistura duas
 * situacoes opostas:
 *
 *   ABANDONADA        -- nenhuma (ou parte) das paradas foi resolvida. A rota
 *                        nao foi prestada; nao pode virar pagamento.
 *   TRABALHADA        -- toda parada tem desfecho (entregue ou tentativa
 *                        frustrada). O servico FOI prestado; faltou apenas o
 *                        clique de encerrar no app.
 *
 * `payment-generator` exige `completedAt` para gerar pagamento, e o robo nunca
 * gravava esse campo. O efeito colateral era: nenhuma rota auto-finalizada
 * gerava pagamento -- o que por acaso protegia as abandonadas, mas deixava sem
 * pagar quem tinha percorrido a rota inteira (19 rotas, 164 entregas e 16
 * tentativas frustradas ate 11/09/2026).
 *
 * Gravar `completedAt: serverTimestamp()` seria pior que o bug: pagaria as
 * abandonadas E carimbaria a hora em que o robo rodou -- ate 48h depois do
 * trabalho ter acabado -- jogando a rota no periodo de pagamento errado.
 *
 * Por isso a decisao olha as paradas, e a data e o fim REAL do trabalho: a
 * ultima parada resolvida.
 */

/** Desfechos que significam "o motorista esteve neste ponto". */
const DESFECHOS_RESOLVIDOS = new Set(["completed", "failed"]);

/** Minimo que precisamos de um Timestamp do Firestore para comparar datas. */
export type ComparableTimestamp = {toMillis: () => number};

export type StopLike = {
  deliveryStatus?: string | null;
  completedAt?: ComparableTimestamp | null;
};

export type AutoCompletionOutcome =
  | {worked: true; finishedAt: ComparableTimestamp}
  | {worked: false; reason: "sem-paradas" | "paradas-pendentes" | "sem-data"};

/**
 * Decide se uma rota auto-finalizada representa trabalho prestado e, em caso
 * afirmativo, quando esse trabalho terminou de fato.
 */
export function resolveAutoCompletion(
  stops: StopLike[]
): AutoCompletionOutcome {
  if (!Array.isArray(stops) || stops.length === 0) {
    return {worked: false, reason: "sem-paradas"};
  }

  const todasResolvidas = stops.every(
    (stop) => DESFECHOS_RESOLVIDOS.has(String(stop?.deliveryStatus ?? ""))
  );
  if (!todasResolvidas) {
    return {worked: false, reason: "paradas-pendentes"};
  }

  // Fim real do trabalho = a parada resolvida mais tarde.
  let ultima: ComparableTimestamp | null = null;
  for (const stop of stops) {
    const quando = stop?.completedAt;
    if (!quando || typeof quando.toMillis !== "function") continue;
    if (!ultima || quando.toMillis() > ultima.toMillis()) {
      ultima = quando;
    }
  }

  if (!ultima) {
    return {worked: false, reason: "sem-data"};
  }

  return {worked: true, finishedAt: ultima};
}
