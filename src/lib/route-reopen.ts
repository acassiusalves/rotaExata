/**
 * Regras de interface da reabertura de rota finalizada.
 *
 * Espelham o callable `reopenRoute` (functions/src/route-reopen.ts): quem de
 * fato decide e o servidor; aqui so evitamos mostrar um botao que sera
 * recusado.
 */

const REOPENABLE_STATUSES = new Set(['completed', 'completed_auto']);
const REOPEN_ROLES = new Set(['admin', 'socio']);

/** Espelha MIN_REOPEN_REASON_LENGTH de functions/src/route-reopen.ts. */
export const MIN_REOPEN_REASON_LENGTH = 5;

export function canReopenRoute(
  status: string | null | undefined,
  role: string | null | undefined
): boolean {
  return (
    REOPENABLE_STATUSES.has(String(status ?? '')) &&
    REOPEN_ROLES.has(String(role ?? ''))
  );
}

export function isReopenReasonValid(reason: string): boolean {
  return reason.trim().length >= MIN_REOPEN_REASON_LENGTH;
}
