/**
 * Regras da reabertura de rota finalizada.
 *
 * Uma rota sai de `completed` (motorista) ou `completed_auto` (robo) e volta
 * ao motorista. Tres cuidados moram aqui, todos puros e testaveis:
 *
 *   1. QUEM PODE SER REABERTA -- so rota finalizada, com motorista, e sem
 *      pagamento aprovado/pago (dinheiro ja decidido nao muda por baixo dos
 *      panos). Pagamento pendente nao impede: e anotado para recalculo.
 *   2. PARA ONDE VOLTA -- `in_progress` se o motorista ja tinha iniciado
 *      (preserva startedAt e currentStopIndex; "Iniciar Rota" regravaria os
 *      dois), senao `dispatched`.
 *   3. O ROBO NAO PODE REFECHAR NA HORA -- `autoCompleteRoutes` fecha rota
 *      `dispatched`/`in_progress` cuja plannedDate passou de 48h. Uma rota
 *      antiga reaberta satisfaz esse criterio no mesmo instante; por isso o
 *      relogio das 48h passa a contar a partir de `reopenedAt`.
 */

export const REOPEN_GRACE_HOURS = 48;

/** Espelha MIN_REOPEN_REASON_LENGTH de src/lib/route-reopen.ts (front). */
export const MIN_REOPEN_REASON_LENGTH = 5;

const REOPENABLE_STATUSES = new Set(["completed", "completed_auto"]);
const CLOSED_PAYMENT_STATUSES = new Set(["approved", "paid"]);

/** Minimo que precisamos de um Timestamp do Firestore para comparar datas. */
export type ComparableTimestamp = {toMillis: () => number};

export type ReopenableRoute = {
  status?: string | null;
  driverId?: string | null;
  startedAt?: ComparableTimestamp | null;
  completedAt?: ComparableTimestamp | null;
  autoCompletedAt?: ComparableTimestamp | null;
  plannedDate?: ComparableTimestamp | null;
  reopenedAt?: ComparableTimestamp | null;
};

export type PaymentRef = {id: string; status?: string | null};

export type ReopenRefusal =
  | "status-invalido"
  | "sem-motorista"
  | "pagamento-fechado";

export type ReopenDecision =
  | {
      ok: true;
      targetStatus: "dispatched" | "in_progress";
      pendingPaymentIds: string[];
    }
  | {ok: false; reason: ReopenRefusal};

export const REOPEN_REFUSAL_MESSAGES: Record<ReopenRefusal, string> = {
  "status-invalido": "Apenas rotas finalizadas podem ser reabertas.",
  "sem-motorista": "A rota não possui motorista atribuído.",
  "pagamento-fechado":
    "Esta rota já tem pagamento aprovado ou pago e não pode ser reaberta por aqui.",
};

/** Decide se a rota pode ser reaberta e para qual status ela volta. */
export function resolveReopen(
  route: ReopenableRoute,
  payments: PaymentRef[]
): ReopenDecision {
  if (!REOPENABLE_STATUSES.has(String(route.status ?? ""))) {
    return {ok: false, reason: "status-invalido"};
  }
  if (!route.driverId) {
    return {ok: false, reason: "sem-motorista"};
  }

  const vivos = payments.filter((p) => String(p.status ?? "") !== "cancelled");
  if (vivos.some((p) => CLOSED_PAYMENT_STATUSES.has(String(p.status ?? "")))) {
    return {ok: false, reason: "pagamento-fechado"};
  }

  return {
    ok: true,
    targetStatus: route.startedAt ? "in_progress" : "dispatched",
    // Aqui so restam pagamentos pendentes: aprovado/pago ja bloqueou acima.
    pendingPaymentIds: vivos.map((p) => p.id),
  };
}

export type ReopenHistoryEntry = {
  at: unknown;
  by: string;
  reason: string;
  fromStatus: string;
  previousCompletedAt: ComparableTimestamp | null;
  previousAutoCompletedAt: ComparableTimestamp | null;
};

/**
 * Linha de `reopenHistory`. `at` e injetado porque `arrayUnion` nao aceita
 * `serverTimestamp()` -- quem chama passa `Timestamp.now()`.
 */
export function buildReopenHistoryEntry(
  route: ReopenableRoute,
  meta: {at: unknown; by: string; reason: string}
): ReopenHistoryEntry {
  return {
    at: meta.at,
    by: meta.by,
    reason: meta.reason,
    fromStatus: String(route.status ?? ""),
    previousCompletedAt: route.completedAt ?? null,
    previousAutoCompletedAt: route.autoCompletedAt ?? null,
  };
}

/**
 * Filtro do `autoCompleteRoutes`: a rota esta parada ha mais de 48h?
 * A referencia e o mais recente entre `plannedDate` e `reopenedAt`.
 */
export function isEligibleForAutoCompletion(
  route: ReopenableRoute,
  cutoffMs: number
): boolean {
  const status = String(route.status ?? "");
  if (status !== "dispatched" && status !== "in_progress") return false;
  if (!route.plannedDate) return false;

  const planejada = route.plannedDate.toMillis();
  const reaberta = route.reopenedAt?.toMillis() ?? 0;
  return Math.max(planejada, reaberta) < cutoffMs;
}
