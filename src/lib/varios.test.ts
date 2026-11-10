import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validarComercio } from "@/lib/comercios";
import { desfileActual } from "@/lib/desfiles";
import { hoyEnPasto, minutosDelDiaEnPasto, normalizarHora, partesDeFecha } from "@/lib/fecha";
import { haceCuanto, horaDelDia } from "@/lib/formato";
import { traducir } from "@/lib/i18n-textos";
import { validarAviso, validarDesfile, validarEvento } from "@/lib/programacion";
import { pasosPorHito } from "@/lib/recorrido";
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

describe("desfile actual", () => {
  const d = (id: string, fecha: string, estado: Desfile["estado"] = "programado"): Desfile => ({
    id,
    nombre: id,
    fecha,
    horaInicio: "09:00",
    estado,
  });
  const lista = [d("a", "2026-12-31"), d("b", "2027-01-02"), d("c", "2027-01-06")];

  it("el que está en curso gana, sea del día que sea", () => {
    assert.equal(desfileActual([lista[0], { ...lista[1], estado: "en_curso" }, lista[2]], "2026-12-31")?.id, "b");
  });
  it("si no, el programado para hoy", () => {
    assert.equal(desfileActual(lista, "2027-01-02")?.id, "b");
  });
  it("si no, el próximo", () => {
    assert.equal(desfileActual(lista, "2026-11-10")?.id, "a");
    assert.equal(desfileActual(lista, "2027-01-03")?.id, "c");
  });
  it("y cuando ya se acabó el Carnaval, el último", () => {
    const fin = lista.map((x) => ({ ...x, estado: "finalizado" as const }));
    assert.equal(desfileActual(fin, "2027-02-01")?.id, "c");
  });
  it("sin desfiles no hay actual", () => {
    assert.equal(desfileActual([], "2027-01-01"), null);
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

  it("registra a qué hora pasó la cabeza por cada hito", () => {
    const h1 = SENDA.hitos[1];
    const pasos = pasosPorHito([
      { metros: 0, ts: 1000 },
      { metros: h1.metros - 50, ts: 2000 },
      { metros: h1.metros + 5, ts: 3000 },
    ]);
    assert.equal(pasos[1].ts, 3000);
    assert.equal(pasos[pasos.length - 1].ts, null);
  });
});

describe("validación del panel", () => {
  const base = { nombre: "Café X", categoria: "cafe", lat: 1.22, lng: -77.28 };

  it("sin plan no hay oferta, menú ni contacto: eso es lo que se vende", () => {
    const v = validarComercio({ ...base, plan: null, promo: "2x1", whatsapp: "3001234567", menu: [{ nombre: "Tinto", precio: "$2.000" }] }, "c1");
    assert.ok("comercio" in v);
    if ("comercio" in v) {
      assert.equal(v.comercio.promo, null);
      assert.equal(v.comercio.whatsapp, null);
      assert.deepEqual(v.comercio.menu, []);
    }
  });

  it("con plan guarda menú, WhatsApp con indicativo y enlace http(s)", () => {
    const v = validarComercio(
      { ...base, plan: "destacado", promo: "2x1", whatsapp: "300 123 4567", enlace: "instagram.com/x", menu: [{ nombre: "Tinto", precio: "$2.000" }, { nombre: "" }] },
      "c1",
    );
    assert.ok("comercio" in v);
    if ("comercio" in v) {
      assert.equal(v.comercio.whatsapp, "573001234567");
      assert.equal(v.comercio.enlace, "https://instagram.com/x");
      assert.equal(v.comercio.menu.length, 1);
    }
  });

  it("rechaza enlaces que no son http(s)", () => {
    const v = validarComercio({ ...base, plan: "basico", enlace: "javascript:alert(1)" }, "c1");
    assert.ok("comercio" in v && v.comercio.enlace === null);
  });

  it("un servicio nunca es pauta", () => {
    const v = validarComercio({ ...base, categoria: "bano", plan: "destacado", promo: "x" }, "c1");
    assert.ok("comercio" in v && v.comercio.plan === null && v.comercio.promo === null);
  });

  it("exige el punto en el mapa", () => {
    assert.ok("error" in validarComercio({ nombre: "X", categoria: "cafe", lat: null, lng: null }, "c1"));
  });

  it("valida desfiles, eventos y avisos", () => {
    assert.ok("error" in validarDesfile({ nombre: "X", fecha: "mañana", horaInicio: "9:00" }, "d"));
    assert.ok("desfile" in validarDesfile({ nombre: "X", fecha: "2027-01-06", horaInicio: "9:00" }, "d"));
    const e = validarEvento({ titulo: "T", fecha: "2027-01-06", horaInicio: "10:00", categoria: "tasca", lat: null, lng: null }, "e");
    assert.ok("evento" in e && e.evento.lat === null);
    const a = validarAviso({ texto: "Hola", duracionMin: 99999 }, "a");
    assert.ok("aviso" in a && a.aviso.expiraEn! - a.aviso.creadoEn === 12 * 60 * 60_000);
  });
});
