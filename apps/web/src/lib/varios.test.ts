import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { hoyEnPasto, minutosDelDiaEnPasto, normalizarHora, partesDeFecha } from "@/lib/fecha";
import { haceCuanto, horaDelDia } from "@/lib/formato";
import { traducir } from "@/lib/i18n-textos";
import { metrosEnSenda, puntoEnMetro, referenciaEnSenda, SENDA } from "@/lib/senda";
import type { Desfile } from "@/lib/tipos";

describe("fechas en hora de Pasto", () => {
  it("a las 8 p. m. en Pasto sigue siendo hoy, aunque en UTC ya sea mañana", () => {
    // 2027-01-01 01:00 UTC = 2026-12-31 20:00 en Pasto (UTC−5)
    const ts = Date.UTC(2027, 0, 1, 1, 0);
    assert.equal(hoyEnPasto(ts), "2026-12-31");
    assert.equal(minutosDelDiaEnPasto(ts), 20 * 60);
  });

  it("el día de la semana no depende de la zona", () => {
    assert.deepEqual(partesDeFecha("2026-12-31"), { diaCorto: "JUE", diaNumero: "31", largo: "31 de diciembre" });
  });

  it("formatea horas", () => {
    assert.equal(normalizarHora("9:00"), "09:00");
    assert.equal(horaDelDia("14:30"), "2:30 p. m.");
    assert.equal(horaDelDia("00:05"), "12:05 a. m.");
  });

  it("«hace cuánto» nunca dice un tiempo negativo", () => {
    assert.equal(haceCuanto(1000, 0), "ahora mismo");
    assert.equal(haceCuanto(0, 125_000), "hace 2 min");
    assert.equal(haceCuanto(0, 125_000, (c, v) => traducir("en", c, v)), "2 min ago");
  });
});

describe("la senda es 1D", () => {
  it("un punto de la senda vuelve a su mismo metro", () => {
    for (const m of [0, 500, 2000, SENDA.longitudMetros - 10]) {
      const p = puntoEnMetro(m);
      const proy = metrosEnSenda(p.lat, p.lng);
      assert.ok(Math.abs(proy.metros - m) < 2, `metro ${m} volvió como ${proy.metros}`);
      assert.ok(proy.desvioM < 2);
    }
  });

  it("los hitos quedan ordenados por avance", () => {
    const metros = SENDA.hitos.map((h) => h.metros);
    assert.deepEqual(metros, [...metros].sort((a, b) => a - b));
  });

  it("nombra por dónde va, en los dos idiomas", () => {
    const h = SENDA.hitos[2];
    assert.equal(referenciaEnSenda(h.metros).frase, `va por ${h.nombre}`);
    assert.equal(referenciaEnSenda(h.metros, "va", (c, v) => traducir("en", c, v)).frase, `passing ${h.nombre}`);
  });

});
