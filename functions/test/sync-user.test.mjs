// Roda contra o artefato compilado: `npm run build` antes.
import test from "node:test";
import assert from "node:assert/strict";
import mod from "../lib/sync-user.js";

const {buildSyncPatch} = mod;

test("cadastro faltando: atribui o papel padrao", () => {
  const p = buildSyncPatch({
    email: "alguem@gmail.com",
    currentRole: undefined,
    currentDisplayName: undefined,
    authDisplayName: "Alguem",
  });
  assert.equal(p.role, "vendedor");
  assert.equal(p.displayName, "Alguem");
});

test("cadastro faltando do dono do projeto: atribui admin", () => {
  const p = buildSyncPatch({
    email: "acassiusalves@gmail.com",
    currentRole: undefined,
    currentDisplayName: undefined,
    authDisplayName: null,
  });
  assert.equal(p.role, "admin");
});

test("REGRESSAO: quem ja tem papel nunca e rebaixado", () => {
  // syncAuthUsers forcava role:'vendedor' em qualquer e-mail, sem checar nada:
  // bastava chamar com o e-mail de um admin para derruba-lo.
  for (const papel of ["admin", "socio", "gestor", "driver", "estoquista"]) {
    const p = buildSyncPatch({
      email: "andreschaurich@gmail.com",
      currentRole: papel,
      currentDisplayName: "Andre Schaurich",
      authDisplayName: "Andre Schaurich",
    });
    assert.equal(p.role, undefined, `role nao pode ser tocada (papel atual: ${papel})`);
  }
});

test("REGRESSAO: displayName existente nao e apagado quando o Auth nao tem nome", () => {
  const p = buildSyncPatch({
    email: "andreschaurich@gmail.com",
    currentRole: "admin",
    currentDisplayName: "Andre Schaurich",
    authDisplayName: null,
  });
  assert.equal(p.displayName, undefined);
});

test("displayName so e preenchido quando o cadastro esta sem nome", () => {
  const p = buildSyncPatch({
    email: "alguem@gmail.com",
    currentRole: "vendedor",
    currentDisplayName: "",
    authDisplayName: "Nome Do Auth",
  });
  assert.equal(p.displayName, "Nome Do Auth");
});
