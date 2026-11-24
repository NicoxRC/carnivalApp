import {
  AVANCE_MINIMO_M,
  DETENIDO_MS,
  MS_SIN_SENAL,
  MS_VENTANA_VELOCIDAD,
  SIN_AVANZAR_AVISO_MS,
  type EstadoDesfile,
  type MuestraHistorial,
} from "@/lib/tipos";

/**
 * Regla del producto: nunca mostrar un minuto exacto.
 * "Llega en 20–35 min" es honesto y defendible. "Llega en 27 min" se equivoca
 * y quema la credibilidad justo el único día del año en que importa.
 */

/** Los desfiles se detienen mucho. Sin este piso, el ETA se dispara al infinito. */
export const VELOCIDAD_MINIMA_MS = 0.3 / 3.6; // 0.3 km/h en m/s

/**
 * Velocidad típica de un desfile. Se usa mientras no haya historial suficiente
 * para medir: con 30 segundos de datos, el ruido del GPS domina la señal y la
 * "velocidad medida" sale en cualquier cosa. Es mejor una constante honesta
 * que un número medido que no mide nada.
 */
export const VELOCIDAD_NOMINAL_MS = 1.2 / 3.6; // 1,2 km/h

/** Debajo de esta ventana no se confía en la velocidad medida. */
const VENTANA_MINIMA_CONFIABLE_S = 90;

/**
 * Techo de credibilidad. Un desfile no supera esto: la gente camina al lado.
 * Por encima es un salto del GPS o un reportero que reapareció en otro punto,
 * no un desfile veloz. Se descarta la medición en vez de mostrar un ETA absurdo.
 */
const VELOCIDAD_MAXIMA_MS = 6 / 3.6; // 6 km/h

/** Dentro de este radio, el desfile está encima del usuario. */
const RADIO_AQUI_M = 120;

/** Rango de minutos, ya redondeado. */
export interface RangoMin {
  minMin: number;
  maxMin: number;
}

export type Eta =
  | { tipo: "sin_datos"; motivo: "sin_reporte" | "sin_ubicacion" | "fuera_de_senda" }
  /**
   * La cabeza lleva más de MS_SIN_SENAL sin reportar. No se da un tiempo: sería
   * un cálculo sobre dónde ESTABA el desfile, presentado como dónde está.
   */
  | { tipo: "sin_senal"; distanciaM: number; haceMin: number }
  | {
      tipo: "llegando";
      minMin: number;
      maxMin: number;
      distanciaM: number;
      velocidadKmh: number;
      /** false = velocidad nominal, todavía no medida. La UI debe decirlo. */
      velocidadMedida: boolean;
      /** Minutos sin avanzar, si ya pasó el umbral suave. null si viene fluido. */
      sinAvanzarMin: number | null;
      /** En cuánto termina de pasar (la cola llega a donde está el usuario). */
      colaEn: RangoMin | null;
    }
  | { tipo: "detenido"; distanciaM: number; detenidoHaceMin: number }
  | {
      tipo: "ya_paso";
      distanciaCabezaM: number;
      distanciaColaM: number | null;
      colaYaPaso: boolean;
      colaEn: RangoMin | null;
    }
  | { tipo: "aqui"; distanciaM: number; colaEn: RangoMin | null };

export interface VelocidadEstimada {
  /** m/s, ya con el piso mínimo aplicado. */
  ms: number;
  kmh: number;
  /** Avance real medido, sin piso. */
  avanceRealM: number;
  ventanaS: number;
  /** false = todavía no hay historial suficiente y se está usando la nominal. */
  medida: boolean;
  /** Hace cuánto que la cabeza no avanza de forma apreciable, en ms. */
  sinAvanzarMs: number;
  /** true solo cuando se pasó el umbral duro. */
  detenido: boolean;
}

/**
 * Velocidad de la cabeza: promedio simple sobre los últimos 10 minutos.
 * Simple a propósito — con 3 reporteros y GPS de celular, un modelo más fino
 * solo daría precisión falsa.
 */
export function estimarVelocidad(
  historial: MuestraHistorial[],
  ahora: number,
): VelocidadEstimada {
  const orden = [...historial].sort((a, b) => a.ts - b.ts);
  const sinMedir: VelocidadEstimada = {
    ms: VELOCIDAD_NOMINAL_MS,
    kmh: VELOCIDAD_NOMINAL_MS * 3.6,
    avanceRealM: 0,
    ventanaS: 0,
    medida: false,
    sinAvanzarMs: 0,
    detenido: false,
  };
  if (orden.length < 2) return sinMedir;

  const ultima = orden[orden.length - 1];

  // --- Velocidad: solo la ventana de 10 minutos ---
  const ventana = orden.filter((m) => ahora - m.ts <= MS_VENTANA_VELOCIDAD);
  let ms = VELOCIDAD_NOMINAL_MS;
  let medida = false;
  let avanceRealM = 0;
  let ventanaS = 0;
  if (ventana.length >= 2) {
    const primera = ventana[0];
    ventanaS = (ventana[ventana.length - 1].ts - primera.ts) / 1000;
    avanceRealM = ventana[ventana.length - 1].metros - primera.metros;
    if (ventanaS >= VENTANA_MINIMA_CONFIABLE_S) {
      const bruta = avanceRealM / ventanaS;
      if (bruta <= VELOCIDAD_MAXIMA_MS) {
        ms = Math.max(bruta, VELOCIDAD_MINIMA_MS);
        medida = true;
      }
      // Si se pasa del techo se deja la nominal y `medida` en false:
      // la UI dirá "a ritmo estimado" en vez de inventar una cifra.
    }
  }

  // --- Detención: se mira todo el historial, que es más largo que la ventana ---
  // Se busca la muestra más reciente desde la cual la cabeza SÍ avanzó.
  let sinAvanzarMs = ultima.ts - orden[0].ts;
  for (let i = orden.length - 1; i >= 0; i--) {
    if (ultima.metros - orden[i].metros > AVANCE_MINIMO_M) {
      sinAvanzarMs = ultima.ts - orden[i].ts;
      break;
    }
  }

  return {
    ms,
    kmh: ms * 3.6,
    avanceRealM,
    ventanaS,
    medida,
    sinAvanzarMs,
    // Sin historial suficiente no se puede afirmar que está detenido:
    // puede que la app lleve dos minutos abierta y ya.
    detenido: sinAvanzarMs >= DETENIDO_MS,
  };
}

/** Redondea a múltiplos de 5, para que el rango se lea como estimación y no como cronómetro. */
function aMultiploDe5(n: number, modo: "abajo" | "arriba"): number {
  return modo === "abajo" ? Math.floor(n / 5) * 5 : Math.ceil(n / 5) * 5;
}

/**
 * Convierte un ETA puntual en un rango honesto.
 * −25% / +40%: asimétrico porque un desfile se atrasa mucho más fácil de lo que se adelanta.
 */
export function aRango(minutos: number): RangoMin {
  const bajo = Math.max(0, aMultiploDe5(minutos * 0.75, "abajo"));
  let alto = aMultiploDe5(minutos * 1.4, "arriba");
  if (alto - bajo < 5) alto = bajo + 5;
  return { minMin: bajo, maxMin: alto };
}

export interface ArgsEta {
  estado: EstadoDesfile;
  /** Metros del usuario sobre la senda. null si no dio permiso de ubicación. */
  metrosUsuario: number | null;
  /** Qué tan lejos de la senda está realmente el usuario. */
  desvioUsuarioM: number | null;
  desvioMaxM: number;
  ahora: number;
}

export function calcularEta({
  estado,
  metrosUsuario,
  desvioUsuarioM,
  desvioMaxM,
  ahora,
}: ArgsEta): Eta {
  const cabeza = estado.posiciones.cabeza;
  if (!cabeza) return { tipo: "sin_datos", motivo: "sin_reporte" };
  if (metrosUsuario === null) return { tipo: "sin_datos", motivo: "sin_ubicacion" };
  if (desvioUsuarioM !== null && desvioUsuarioM > desvioMaxM) {
    return { tipo: "sin_datos", motivo: "fuera_de_senda" };
  }

  const distancia = metrosUsuario - cabeza.metros;

  // Con la cabeza callada, lo único honesto es decir cuándo fue el último dato.
  if (sinSenal(cabeza.ts, ahora) && distancia > RADIO_AQUI_M) {
    return {
      tipo: "sin_senal",
      distanciaM: distancia,
      haceMin: Math.round((ahora - cabeza.ts) / 60000),
    };
  }

  const vel = estimarVelocidad(estado.historialCabeza, ahora);

  // ¿En cuánto termina de pasar? La cola se mueve al ritmo de la cabeza; si
  // está callada o el desfile detenido, no se promete nada.
  const cola = estado.posiciones.cola;
  const faltaCola = cola ? metrosUsuario - cola.metros : null;
  const colaEn =
    cola && faltaCola !== null && faltaCola > RADIO_AQUI_M && !vel.detenido && !sinSenal(cola.ts, ahora)
      ? aRango(faltaCola / vel.ms / 60)
      : null;

  if (Math.abs(distancia) <= RADIO_AQUI_M) {
    return { tipo: "aqui", distanciaM: Math.abs(distancia), colaEn };
  }

  // El usuario quedó detrás de la cabeza: el desfile ya pasó por donde está.
  if (distancia < 0) {
    const brechaCola = faltaCola;
    return {
      tipo: "ya_paso",
      distanciaCabezaM: Math.abs(distancia),
      distanciaColaM: brechaCola === null ? null : Math.abs(brechaCola),
      colaYaPaso: brechaCola !== null && brechaCola < 0,
      colaEn,
    };
  }

  if (vel.detenido) {
    return {
      tipo: "detenido",
      distanciaM: distancia,
      detenidoHaceMin: Math.round(vel.sinAvanzarMs / 60000),
    };
  }

  const minutos = distancia / vel.ms / 60;
  const { minMin, maxMin } = aRango(minutos);

  return {
    tipo: "llegando",
    minMin,
    maxMin,
    distanciaM: distancia,
    velocidadKmh: vel.kmh,
    velocidadMedida: vel.medida,
    sinAvanzarMin:
      vel.sinAvanzarMs >= SIN_AVANZAR_AVISO_MS ? Math.round(vel.sinAvanzarMs / 60000) : null,
    colaEn,
  };
}

/** ¿Este reportero sigue vivo? Nunca se borra su última posición, solo se marca. */
export function sinSenal(ts: number, ahora: number): boolean {
  return ahora - ts > MS_SIN_SENAL;
}
