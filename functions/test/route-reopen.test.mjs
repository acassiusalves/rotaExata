// Roda contra o artefato compilado: `npm run build` antes.
import test from "node:test";
import assert from "node:assert/strict";
import mod from "../lib/route-reopen.js";

const {
  REOPEN_GRACE_HOURS,
  resolveReopen,
  buildReopenHistoryEntry,
  isEligibleForAutoCompletion,
} = mod;

const HORA = 60 * 60 * 1000;
const AGORA = Date.UTC(2026, 10, 24, 12, 0, 0);
const CORTE = AGORA - REOPEN_GRACE_HOURS * HORA;

/** Timestamp falso com a mesma superficie que as regras usam (toMillis). */
const ts = (ms) => ({toMillis: () => ms});

// ---------- resolveReopen ----------

test("rota finalizada pelo motorista e ja iniciada volta para in_progress", () => {
  // Caso LNS-0420-B: completed, com startedAt. Voltar para dispatched faria o
  // "Iniciar Rota" regravar startedAt e zerar currentStopIndex.
  const r = resolveReopen(
    {status: "completed", driverId: "d1", startedAt: ts(1)},
    []
  );
  assert.equal(r.ok, true);
  assert.equal(r.targetStatus, "in_progress");
  assert.deepEqual(r.pendingPaymentIds, []);
});

test("rota auto-finalizada que nunca foi iniciada volta para dispatched", () => {
  const r = resolveReopen({status: "completed_auto", driverId: "d1"}, []);
  assert.equal(r.ok, true);
  assert.equal(r.targetStatus, "dispatched");
});

test("rota nao finalizada nao pode ser reaberta", () => {
  for (const status of ["draft", "dispatched", "in_progress", "", null, undefined]) {
    const r = resolveReopen({status, driverId: "d1"}, []);
    assert.equal(r.ok, false);
    assert.equal(r.reason, "status-invalido");
  }
});

test("rota sem motorista nao pode ser reaberta", () => {
  for (const driverId of [undefined, null, ""]) {
    const r = resolveReopen({status: "completed", driverId}, []);
    assert.equal(r.ok, false);
    assert.equal(r.reason, "sem-motorista");
  }
});

test("pagamento aprovado ou pago bloqueia a reabertura", () => {
  for (const status of ["approved", "paid"]) {
    const r = resolveReopen(
      {status: "completed", driverId: "d1"},
      [{id: "p1", status}]
    );
    assert.equal(r.ok, false);
    assert.equal(r.reason, "pagamento-fechado");
  }
});

test("pagamento pago bloqueia mesmo com um cancelado ao lado", () => {
  const r = resolveReopen(
    {status: "completed", driverId: "d1"},
    [{id: "p1", status: "cancelled"}, {id: "p2", status: "paid"}]
  );
  assert.equal(r.ok, false);
  assert.equal(r.reason, "pagamento-fechado");
});

test("pagamento cancelado nao bloqueia e nao entra na lista de anotacao", () => {
  const r = resolveReopen(
    {status: "completed", driverId: "d1"},
    [{id: "p1", status: "cancelled"}]
  );
  assert.equal(r.ok, true);
  assert.deepEqual(r.pendingPaymentIds, []);
});

test("pagamento pendente permite reabrir e devolve o id para anotar", () => {
  const r = resolveReopen(
    {status: "completed", driverId: "d1"},
    [{id: "p1", status: "pending"}, {id: "p2", status: "cancelled"}]
  );
  assert.equal(r.ok, true);
  assert.deepEqual(r.pendingPaymentIds, ["p1"]);
});

// ---------- buildReopenHistoryEntry ----------

test("historico guarda os carimbos de finalizacao anteriores", () => {
  const concluida = ts(111);
  const at = {marker: "agora"};
  const entry = buildReopenHistoryEntry(
    {status: "completed", completedAt: concluida, autoCompletedAt: null},
    {at, by: "u1", reason: "entrega pendente"}
  );
  assert.equal(entry.at, at);
  assert.equal(entry.by, "u1");
  assert.equal(entry.reason, "entrega pendente");
  assert.equal(entry.fromStatus, "completed");
  assert.equal(entry.previousCompletedAt, concluida);
  assert.equal(entry.previousAutoCompletedAt, null);
});

// ---------- isEligibleForAutoCompletion ----------

const rota = (extra) => ({
  status: "dispatched",
  plannedDate: ts(AGORA - 7 * 24 * HORA),
  ...extra,
});

test("rota antiga nunca reaberta continua elegivel ao robo", () => {
  assert.equal(isEligibleForAutoCompletion(rota({}), CORTE), true);
  assert.equal(
    isEligibleForAutoCompletion(rota({status: "in_progress"}), CORTE),
    true
  );
});

test("REGRESSAO LNS-0420-B: rota planejada ha 7 dias e reaberta agora NAO e elegivel", () => {
  // Sem este guard o robo (a cada 30 min) refecharia a rota recem-reaberta,
  // porque so olhava plannedDate.
  const reaberta = rota({status: "in_progress", reopenedAt: ts(AGORA)});
  assert.equal(isEligibleForAutoCompletion(reaberta, CORTE), false);
});

test("passada a janela de 48h, a rota reaberta volta a ser elegivel", () => {
  const reaberta = rota({reopenedAt: ts(AGORA - 49 * HORA)});
  assert.equal(isEligibleForAutoCompletion(reaberta, CORTE), true);
});

test("exatamente no limite da janela ainda nao e elegivel", () => {
  const reaberta = rota({reopenedAt: ts(CORTE)});
  assert.equal(isEligibleForAutoCompletion(reaberta, CORTE), false);
});

test("rota planejada ha menos de 48h nao e elegivel", () => {
  const recente = rota({plannedDate: ts(AGORA - 10 * HORA)});
  assert.equal(isEligibleForAutoCompletion(recente, CORTE), false);
});

test("so dispatched e in_progress sao elegiveis", () => {
  for (const status of ["completed", "completed_auto", "draft", undefined]) {
    assert.equal(isEligibleForAutoCompletion(rota({status}), CORTE), false);
  }
});

test("sem plannedDate nao e elegivel (paridade com a query do robo)", () => {
  assert.equal(
    isEligibleForAutoCompletion({status: "dispatched"}, CORTE),
    false
  );
});
