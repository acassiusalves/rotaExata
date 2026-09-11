import test from "node:test";
import assert from "node:assert/strict";

import { resolveRouteDriverId } from "../src/lib/driver-identity.ts";

test("usa o driverId da rota quando existe", () => {
  assert.equal(
    resolveRouteDriverId({ driverId: "abc123", driverInfo: { name: "Fulano" } }),
    "abc123"
  );
});

test("REGRESSAO: driverInfo nao tem id, mas a rota tem driverId", () => {
  // `driverInfo` gravado pelo sistema e {name, vehicle} -- nunca teve `id`.
  // payment-generator lia `driverInfo.id`, entao todo pagamento gerado por ele
  // nascia com driverId undefined: 93 de 374 registros ate 11/09/2026.
  const rota = {
    driverId: "OVJvs7UHvGTFxwgCTSyYDuY604z1",
    driverInfo: { name: "Motorista SDM", vehicle: { type: "N/A", plate: "N/A" } },
  };
  assert.equal(resolveRouteDriverId(rota), "OVJvs7UHvGTFxwgCTSyYDuY604z1");
  assert.notEqual(resolveRouteDriverId(rota), undefined);
});

test("cai para driverInfo.id em rota legada sem driverId no topo", () => {
  assert.equal(
    resolveRouteDriverId({ driverInfo: { id: "legado99", name: "Antigo" } }),
    "legado99"
  );
});

test("driverId vazio nao mascara o driverInfo.id", () => {
  assert.equal(
    resolveRouteDriverId({ driverId: "", driverInfo: { id: "legado99" } }),
    "legado99"
  );
});

test("sem nenhuma das duas origens devolve null, nunca undefined", () => {
  assert.equal(resolveRouteDriverId({}), null);
  assert.equal(resolveRouteDriverId({ driverInfo: { name: "So nome" } }), null);
});
