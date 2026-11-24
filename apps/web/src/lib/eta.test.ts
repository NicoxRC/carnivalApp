import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { aRango, calcularEta, estimarVelocidad } from "@/lib/eta";
import type { EstadoDesfile, MuestraHistorial, Posicion, Rol } from "@/lib/tipos";

const AHORA = 1_800_000_000_000;
const MIN = 60_000;

/** Historial de la cabeza avanzando a `kmh`, un punto cada 20 s, hasta `hastaM` en AHORA. */
function historial(kmh: number, minutos: number, hastaM: number): MuestraHistorial[] {
  const ms = kmh / 3.6;
  const puntos: MuestraHistorial[] = [];
  for (let t = minutos * 60; t >= 0; t -= 20) {
    puntos.push({ metros: hastaM - ms * t, ts: AHORA - t * 1000 });
  }
  return puntos;
}

const pos = (rol: Rol, metros: number, ts = AHORA): Posicion => ({ rol, lat: 0, lng: 0, metros, precisionM: 10, ts });

function estado(parcial: Partial<EstadoDesfile>): EstadoDesfile {
  return {
    desfileId: "d",
    nombre: "Desfile",
    estado: "en_curso",
    fecha: "2027-01-06",
    horaInicio: "09:00",
    sendaId: "s",
    posiciones: {},
    historialCabeza: [],
    avisos: [],
    servidorTs: AHORA,
    ...parcial,
  };
}

const eta = (e: EstadoDesfile, metrosUsuario: number | null, desvio = 0) =>
  calcularEta({ estado: e, metrosUsuario, desvioUsuarioM: desvio, desvioMaxM: 600, ahora: AHORA });

describe("aRango", () => {
  it("da siempre un rango en múltiplos de 5, nunca un minuto exacto", () => {
    for (const m of [1, 4, 12, 27, 63, 140]) {
      const r = aRango(m);
      assert.equal(r.minMin % 5, 0);
      assert.equal(r.maxMin % 5, 0);
      assert.ok(r.maxMin - r.minMin >= 5, `rango de ${m} min demasiado estrecho`);
      assert.ok(r.minMin <= m && m <= r.maxMin, `${m} min queda fuera de su propio rango`);
    }
  });

  it("es asimétrico: un desfile se atrasa más fácil de lo que se adelanta", () => {
    const r = aRango(40);
    assert.ok(r.maxMin - 40 > 40 - r.minMin);
  });
});

describe("estimarVelocidad", () => {
  it("usa la velocidad nominal mientras no haya 90 s de historial", () => {
    const v = estimarVelocidad(historial(3, 1, 1000), AHORA);
    assert.equal(v.medida, false);
    assert.ok(Math.abs(v.kmh - 1.2) < 0.01);
  });

  it("mide la velocidad real con historial suficiente", () => {
    const v = estimarVelocidad(historial(1.8, 8, 1000), AHORA);
    assert.equal(v.medida, true);
    assert.ok(Math.abs(v.kmh - 1.8) < 0.05, `midió ${v.kmh}`);
  });

  it("descarta un salto de GPS en vez de creer que el desfile va a 40 km/h", () => {
    const v = estimarVelocidad(
      [
        { metros: 100, ts: AHORA - 4 * MIN },
        { metros: 2800, ts: AHORA },
      ],
      AHORA,
    );
    assert.equal(v.medida, false);
  });

  it("declara detenido solo tras 10 minutos sin avanzar", () => {
    const quieto = (min: number) =>
      estimarVelocidad(
        Array.from({ length: min * 3 + 1 }, (_, i) => ({ metros: 500 + (i % 2), ts: AHORA - (min * 60 - i * 20) * 1000 })),
        AHORA,
      );
    assert.equal(quieto(6).detenido, false);
    assert.equal(quieto(11).detenido, true);
  });
});

describe("calcularEta", () => {
  it("sin reportes de la cabeza no inventa nada", () => {
    assert.deepEqual(eta(estado({}), 2000), { tipo: "sin_datos", motivo: "sin_reporte" });
  });

  it("sin ubicación, o lejos de la senda, lo dice", () => {
    const e = estado({ posiciones: { cabeza: pos("cabeza", 500) } });
    assert.deepEqual(eta(e, null), { tipo: "sin_datos", motivo: "sin_ubicacion" });
    assert.deepEqual(eta(e, 2000, 900), { tipo: "sin_datos", motivo: "fuera_de_senda" });
  });

  it("calcula la llegada con la velocidad medida", () => {
    const e = estado({ posiciones: { cabeza: pos("cabeza", 1000) }, historialCabeza: historial(1.5, 8, 1000) });
    const r = eta(e, 2000);
    assert.equal(r.tipo, "llegando");
    if (r.tipo !== "llegando") return;
    // 1000 m a 1,5 km/h = 40 min
    assert.ok(r.minMin <= 40 && 40 <= r.maxMin, `40 min fuera de ${r.minMin}–${r.maxMin}`);
    assert.equal(r.velocidadMedida, true);
  });

  it("si la cabeza lleva más de 5 min callada, no da un tiempo", () => {
    const viejo = AHORA - 8 * MIN;
    const e = estado({ posiciones: { cabeza: pos("cabeza", 1000, viejo) }, historialCabeza: [{ metros: 1000, ts: viejo }] });
    const r = eta(e, 2000);
    assert.equal(r.tipo, "sin_senal");
    if (r.tipo === "sin_senal") assert.equal(r.haceMin, 8);
  });

  it("dice «aquí» cuando la cabeza está a menos de 120 m", () => {
    const e = estado({ posiciones: { cabeza: pos("cabeza", 1950) } });
    assert.equal(eta(e, 2000).tipo, "aqui");
  });

  it("distingue «pasó la cabeza» de «ya pasó todo»", () => {
    const base = { cabeza: pos("cabeza", 3000) };
    const falta = eta(estado({ posiciones: { ...base, cola: pos("cola", 1500) } }), 2000);
    const paso = eta(estado({ posiciones: { ...base, cola: pos("cola", 2500) } }), 2000);
    assert.equal(falta.tipo, "ya_paso");
    assert.equal(paso.tipo, "ya_paso");
    if (falta.tipo === "ya_paso") assert.equal(falta.colaYaPaso, false);
    if (paso.tipo === "ya_paso") assert.equal(paso.colaYaPaso, true);
  });

  it("dice en cuánto termina de pasar, usando la cola", () => {
    const e = estado({
      posiciones: { cabeza: pos("cabeza", 3000), cola: pos("cola", 1500) },
      historialCabeza: historial(1.5, 8, 3000),
    });
    const r = eta(e, 2000);
    assert.equal(r.tipo, "ya_paso");
    // 500 m a 1,5 km/h = 20 min
    if (r.tipo === "ya_paso") assert.ok(r.colaEn && r.colaEn.minMin <= 20 && 20 <= r.colaEn.maxMin);
  });

  it("detenido: lo dice en vez de prometer una hora", () => {
    const quieto = Array.from({ length: 40 }, (_, i) => ({ metros: 1000, ts: AHORA - (39 - i) * 20_000 }));
    const e = estado({ posiciones: { cabeza: pos("cabeza", 1000) }, historialCabeza: quieto });
    assert.equal(eta(e, 2000).tipo, "detenido");
  });
});
