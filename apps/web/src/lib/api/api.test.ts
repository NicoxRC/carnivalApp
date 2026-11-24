import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { API_DESARROLLO, resolverBaseApi, urlApi } from "@/lib/api/cliente";
import { comerciosDesdeApi, metricaParaApi } from "@/lib/api/comercios";
import { estadoDesdeApi } from "@/lib/api/estado";
import { posicionParaApi } from "@/lib/api/posiciones";
import { programacionDesdeApi, recorridoDesdeApi } from "@/lib/api/programacion";
import type { EntradaPosicion, TipoMetrica } from "@/lib/tipos";

/** Los traductores avisan en la consola al descartar algo; en los tests se calla. */
function sinAvisos<T>(f: () => T): T {
  const original = console.warn;
  console.warn = () => undefined;
  try {
    return f();
  } finally {
    console.warn = original;
  }
}

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

const EVENTO_API = {
  id: "tarima-1",
  date: "2027-01-04",
  startTime: "18:00",
  endTime: null,
  title: "Concierto",
  description: "En la plaza",
  category: "stage",
  placeName: "Plaza de Nariño",
  lat: 1.21,
  lng: -77.28,
  sponsored: true,
};

const PROGRAMACION_API = {
  parades: [{ id: "d31-1", name: "Años Viejos", date: "2026-12-31", startTime: "14:00", state: "scheduled" }],
  events: [EVENTO_API, { ...EVENTO_API, id: "tasca-1", category: "tasca", endTime: "22:00", lat: null, lng: null }],
  today: "2026-12-31",
  currentId: "d31-1",
};

describe("la programación del API se traduce a la de la web", () => {
  it("traduce un desfile con sus eventos", () => {
    const p = programacionDesdeApi(PROGRAMACION_API);
    assert.deepEqual(p.desfiles, [
      { id: "d31-1", nombre: "Años Viejos", fecha: "2026-12-31", horaInicio: "14:00", estado: "programado" },
    ]);
    assert.equal(p.eventos[0].categoria, "presentacion");
    assert.equal(p.eventos[0].lugarNombre, "Plaza de Nariño");
    assert.equal(p.eventos[0].patrocinado, true);
    assert.equal(p.eventos[1].horaFin, "22:00");
    assert.equal(p.eventos[1].lat, null);
    assert.equal(p.hoy, "2026-12-31");
    assert.equal(p.actualId, "d31-1");
    assert.equal(programacionDesdeApi({ ...PROGRAMACION_API, currentId: null }).actualId, null);
  });

  it("descarta solo el evento con una categoría desconocida y falla sin la estructura", () => {
    const raro = { ...EVENTO_API, id: "raro", category: "fireworks" };
    const p = sinAvisos(() => programacionDesdeApi({ ...PROGRAMACION_API, events: [raro, EVENTO_API] }));
    assert.deepEqual(
      p.eventos.map((e) => e.id),
      ["tarima-1"],
    );
    assert.throws(() => programacionDesdeApi({ ...PROGRAMACION_API, parades: null }), /parades/);
  });

  it("traduce el recorrido sin el desfile que viene al lado", () => {
    const pasos = recorridoDesdeApi({
      parade: PROGRAMACION_API.parades[0],
      passes: [
        { waypointId: "h1", name: "Salida", metres: 0, ts: 1000 },
        { waypointId: "h2", name: "Plaza", metres: 900, ts: null },
      ],
    });
    assert.deepEqual(pasos[1], { hitoId: "h2", nombre: "Plaza", metros: 900, ts: null });
    assert.throws(() => recorridoDesdeApi({ passes: [{ waypointId: "h1", name: "Salida" }] }), /metres/);
  });
});

const COMERCIO_API = {
  id: "cafe-1",
  name: "Café del Carnaval",
  category: "ice_cream",
  description: "Helados",
  address: "Frente a la plaza",
  hours: "8 a 20",
  lat: 1.21,
  lng: -77.28,
  plan: "featured",
  offer: "2x1",
  offerTiming: "after",
  menu: [{ name: "Helado", price: "$5.000" }],
  whatsapp: "573001234567",
  link: "https://ejemplo.co",
  visible: true,
};

const SIN_PLAN = {
  ...COMERCIO_API,
  id: "bano-1",
  category: "toilet",
  plan: null,
  offer: null,
  offerTiming: "always",
  menu: [],
  whatsapp: null,
  link: null,
};

describe("los comercios del API se traducen a los de la web", () => {
  it("traduce un comercio con plan y un servicio sin plan", () => {
    const [con, sin] = comerciosDesdeApi({ businesses: [COMERCIO_API, SIN_PLAN] });
    assert.equal(con.categoria, "heladeria");
    assert.equal(con.plan, "destacado");
    assert.equal(con.promo, "2x1");
    assert.equal(con.promoMomento, "despues");
    assert.deepEqual(con.menu, [{ nombre: "Helado", precio: "$5.000" }]);
    assert.equal(con.enlace, "https://ejemplo.co");
    assert.equal(sin.categoria, "bano");
    assert.equal(sin.plan, null);
    assert.equal(sin.promoMomento, "siempre");
    assert.equal(sin.whatsapp, null);
  });

  it("descarta solo el comercio con un valor desconocido y falla sin la lista", () => {
    const raro = { ...COMERCIO_API, id: "raro", plan: "gold" };
    const comercios = sinAvisos(() => comerciosDesdeApi({ businesses: [raro, SIN_PLAN] }));
    assert.deepEqual(
      comercios.map((c) => c.id),
      ["bano-1"],
    );
    assert.throws(() => comerciosDesdeApi({ comercios: [] }), /businesses/);
  });

  it("manda el tipo de métrica en inglés y falla con uno desconocido", () => {
    assert.deepEqual(metricaParaApi("cafe-1", "ficha"), { id: "cafe-1", type: "card" });
    assert.equal(metricaParaApi("cafe-1", "enlace").type, "link");
    assert.throws(() => metricaParaApi("cafe-1", "compartir" as TipoMetrica), /compartir/);
  });
});
