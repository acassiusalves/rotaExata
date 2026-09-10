// Roda contra o artefato compilado: `npm run build` antes.
import test from "node:test";
import assert from "node:assert/strict";
import mod from "../lib/invite-conflict.js";

const {checkInviteConflict} = mod;

test("e-mail livre: segue o convite normalmente", () => {
  const r = checkInviteConflict({
    email: "sdmsystemsdm@gmail.com",
    requestedRole: "driver",
    authUserExists: false,
    existingRole: undefined,
  });
  assert.equal(r.blocked, false);
});

test("REGRESSAO: e-mail de admin nao pode ser rebaixado a motorista", () => {
  // Incidente 09/09/2026: um admin digitou o proprio e-mail no cadastro de
  // motorista e o inviteUser carimbou role:'driver' por cima do cadastro dele,
  // derrubando o acesso dele ao Rota E ao Luna (mesma colecao `users`).
  const r = checkInviteConflict({
    email: "andreschaurich@gmail.com",
    requestedRole: "driver",
    authUserExists: true,
    existingRole: "admin",
  });
  assert.equal(r.blocked, true);
  assert.match(r.message, /j[áa] pertence/i);
  assert.match(r.message, /admin/);
  assert.match(r.message, /andreschaurich@gmail\.com/);
});

test("mesmo papel tambem bloqueia: convite nunca reescreve cadastro existente", () => {
  const r = checkInviteConflict({
    email: "bmmarcio4@gmail.com",
    requestedRole: "driver",
    authUserExists: true,
    existingRole: "driver",
  });
  assert.equal(r.blocked, true);
});

test("conta no Auth sem doc no Firestore: bloqueia sem citar papel", () => {
  const r = checkInviteConflict({
    email: "orfao@gmail.com",
    requestedRole: "driver",
    authUserExists: true,
    existingRole: undefined,
  });
  assert.equal(r.blocked, true);
  assert.doesNotMatch(r.message, /papel atual/i);
});
