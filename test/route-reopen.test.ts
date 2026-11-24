import test from "node:test";
import assert from "node:assert/strict";

import {
  canReopenRoute,
  isReopenReasonValid,
  MIN_REOPEN_REASON_LENGTH,
} from "../src/lib/route-reopen.ts";

test("REGRESSAO LNS-0420-B: rota finalizada pelo motorista tambem pode ser reaberta", () => {
  // O botao antigo so existia para completed_auto; a LNS-0420-B e `completed`.
  assert.equal(canReopenRoute("completed", "admin"), true);
  assert.equal(canReopenRoute("completed", "socio"), true);
});

test("rota auto-finalizada continua podendo ser reaberta", () => {
  assert.equal(canReopenRoute("completed_auto", "admin"), true);
});

test("rota que nao esta finalizada nao tem o que reabrir", () => {
  for (const status of ["draft", "dispatched", "in_progress", "", null, undefined]) {
    assert.equal(canReopenRoute(status, "admin"), false);
  }
});

test("gestor, financeiro, motorista e sem papel nao reabrem", () => {
  for (const role of ["gestor", "financeiro", "driver", "", null, undefined]) {
    assert.equal(canReopenRoute("completed", role), false);
  }
});

test("motivo exige o minimo de caracteres, ignorando espacos nas pontas", () => {
  assert.equal(MIN_REOPEN_REASON_LENGTH, 5);
  assert.equal(isReopenReasonValid("abc"), false);
  assert.equal(isReopenReasonValid("   abc  "), false);
  assert.equal(isReopenReasonValid(""), false);
  assert.equal(isReopenReasonValid("12345"), true);
  assert.equal(isReopenReasonValid("  entrega pendente  "), true);
});
