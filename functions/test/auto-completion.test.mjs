// Roda contra o artefato compilado: `npm run build` antes.
import test from "node:test";
import assert from "node:assert/strict";
import mod from "../lib/auto-completion.js";

const {resolveAutoCompletion} = mod;

/** Timestamp falso com a mesma superficie que o script usa (toMillis). */
const ts = (iso) => ({ toMillis: () => new Date(iso).getTime(), __iso: iso });

test("rota abandonada: nenhuma parada tocada, nao ganha completedAt", () => {
  // LNS-0090-A era assim: despachada, 2 paradas, motorista nunca abriu.
  const r = resolveAutoCompletion([{}, {}]);
  assert.equal(r.worked, false);
  assert.equal(r.reason, "paradas-pendentes");
});

test("rota parcial: parou no meio, nao ganha completedAt", () => {
  const r = resolveAutoCompletion([
    {deliveryStatus: "completed", completedAt: ts("2026-04-02T14:00:00Z")},
    {deliveryStatus: "completed", completedAt: ts("2026-04-02T15:00:00Z")},
    {},
  ]);
  assert.equal(r.worked, false);
  assert.equal(r.reason, "paradas-pendentes");
});

test("REGRESSAO: rota inteiramente trabalhada ganha completedAt da ULTIMA parada", () => {
  // As 19 rotas do levantamento: toda parada resolvida, faltou so o clique de
  // fechar no app. Ficavam fora do pagamento porque o robo nunca gravava
  // completedAt -- e a data certa e o fim do trabalho, nao a hora do robo.
  const r = resolveAutoCompletion([
    {deliveryStatus: "completed", completedAt: ts("2026-09-08T14:00:00Z")},
    {deliveryStatus: "completed", completedAt: ts("2026-09-08T18:30:00Z")},
    {deliveryStatus: "completed", completedAt: ts("2026-09-08T16:00:00Z")},
  ]);
  assert.equal(r.worked, true);
  assert.equal(r.finishedAt.__iso, "2026-09-08T18:30:00Z");
});

test("tentativa frustrada conta como parada resolvida: o motorista foi ate la", () => {
  const r = resolveAutoCompletion([
    {deliveryStatus: "completed", completedAt: ts("2026-01-19T12:00:00Z")},
    {deliveryStatus: "failed", completedAt: ts("2026-01-19T13:00:00Z")},
  ]);
  assert.equal(r.worked, true);
  assert.equal(r.finishedAt.__iso, "2026-01-19T13:00:00Z");
});

test("rota sem paradas nenhuma nao ganha completedAt", () => {
  const r = resolveAutoCompletion([]);
  assert.equal(r.worked, false);
  assert.equal(r.reason, "sem-paradas");
});

test("defensivo: resolvidas mas sem data utilizavel nao ganha completedAt", () => {
  const r = resolveAutoCompletion([{deliveryStatus: "completed"}]);
  assert.equal(r.worked, false);
  assert.equal(r.reason, "sem-data");
});

test("status desconhecido nao e tratado como resolvido", () => {
  const r = resolveAutoCompletion([
    {deliveryStatus: "completed", completedAt: ts("2026-01-19T12:00:00Z")},
    {deliveryStatus: "pending", completedAt: ts("2026-01-19T13:00:00Z")},
  ]);
  assert.equal(r.worked, false);
});
