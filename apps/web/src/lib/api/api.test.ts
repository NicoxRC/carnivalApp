import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { API_DESARROLLO, resolverBaseApi, urlApi } from "@/lib/api/cliente";
import { estadoDesdeApi } from "@/lib/api/estado";
import { posicionParaApi } from "@/lib/api/posiciones";
import type { EntradaPosicion } from "@/lib/tipos";

describe("dónde está el API", () => {
  it("arma la URL con la base configurada, sin barras de más", () => {
    const base = resolverBaseApi("https://api.ejemplo.co/", false);
    assert.equal(urlApi("/api/state", base), "https://api.ejemplo.co/api/state");
    assert.equal(urlApi("api/state", base), "https://api.ejemplo.co/api/state");
  });

  it("sin NEXT_PUBLIC_API_URL usa localhost en desarrollo y falla en producción", () => {
    assert.equal(resolverBaseApi(undefined, true), API_DESARROLLO);
    assert.equal(resolverBaseApi("  ", false), null);
    assert.throws(() => urlApi("/api/state", null), /NEXT_PUBLIC_API_URL/);
  });
});

const ESTADO_API = {
  paradeId: "d31-1",
  name: "Desfile de Años Viejos",
  state: "in_progress",
  date: "2026-12-31",
  startTime: "14:00",
  courseId: "senda-carnaval",
  positions: {
    head: { post: "head", lat: 1.21, lng: -77.28, metres: 1200, accuracyM: 8, ts: 2000 },
    tail: { post: "tail", lat: 1.2, lng: -77.27, metres: 400, accuracyM: null, ts: 1900 },
  },
  headHistory: [
    { metres: 1100, ts: 1000 },
    { metres: 1200, ts: 2000 },
  ],
  announcements: [{ id: "a1", text: "Arranca tarde", level: "alert", createdAt: 500, expiresAt: null }],
  serverTs: 2100,
};

describe("el estado del API se traduce al de la web", () => {
  it("traduce nombres y valores", () => {
    const e = estadoDesdeApi(ESTADO_API);
    assert.equal(e.desfileId, "d31-1");
    assert.equal(e.estado, "en_curso");
    assert.equal(e.horaInicio, "14:00");
    assert.equal(e.posiciones.cabeza?.metros, 1200);
    assert.equal(e.posiciones.cola?.precisionM, null);
    assert.equal(e.posiciones.mitad, undefined);
    assert.equal(e.historialCabeza.length, 2);
    assert.equal(e.avisos[0].nivel, "alerta");
    assert.equal(e.servidorTs, 2100);
  });

  it("falla con un estado al que le falta un campo o trae un valor desconocido", () => {
    const { serverTs: _, ...sinReloj } = ESTADO_API;
    assert.throws(() => estadoDesdeApi(sinReloj), /serverTs/);
    assert.throws(() => estadoDesdeApi({ ...ESTADO_API, state: "paused" }), /state/);
  });
});

describe("las posiciones se traducen al API", () => {
  const entrada: EntradaPosicion = { desfileId: "d31-1", rol: "mitad", lat: 1.21, lng: -77.28, precisionM: 6, ts: 1000 };

  it("manda el puesto en inglés y sin el id del desfile", () => {
    const p = posicionParaApi(entrada);
    assert.deepEqual(p, { post: "middle", lat: 1.21, lng: -77.28, accuracyM: 6, ts: 1000 });
    assert.equal(posicionParaApi({ ...entrada, precisionM: undefined, ts: undefined }).accuracyM, null);
  });

  it("falla con un rol desconocido", () => {
    assert.throws(() => posicionParaApi({ ...entrada, rol: "lateral" as EntradaPosicion["rol"] }), /lateral/);
  });
});
