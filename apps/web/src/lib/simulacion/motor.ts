import { puntoEnMetro, SENDA } from "@/lib/senda";
import type { EntradaPosicion, Rol } from "@/lib/tipos";

/**
 * Motor de simulación. No toca la base de datos ni la red: solo calcula
 * dónde estarían los tres reporteros en un instante dado.
 *
 * Lo usan dos consumidores distintos:
 *  - el script `npm run simular`, que hace POST a /api/posiciones como un reportero real;
 *  - el botón "simular" de la app, que lo corre dentro del proceso de Next.
 *
 * En los dos casos los datos entran por la misma puerta que usaría un celular
 * de verdad. No hay un camino "de mentiras" paralelo al real.
 */

export interface OpcionesSimulacion {
  /** km/h de la cabeza cuando está andando. Un desfile real va a 1–2 km/h. */
  velocidadKmh: number;
  /** Metros entre cabeza y mitad, y entre mitad y cola. */
  separacionM: number;
  /** Probabilidad de detenerse en cada tick. Los desfiles paran muchísimo. */
  paradas: boolean;
  /** Metros iniciales de la cabeza. */
  inicioM: number;
  /** Precisión GPS falsa, para que el payload se vea como el real. */
  precisionM: number;
}

export const OPCIONES_POR_DEFECTO: OpcionesSimulacion = {
  velocidadKmh: 1.5,
  separacionM: 550,
  paradas: true,
  inicioM: 0,
  precisionM: 12,
};

export class SimuladorDesfile {
  private metrosCabeza: number;
  private paradoHastaMs = 0;
  private proximaParadaMs: number;
  private readonly opciones: OpcionesSimulacion;

  constructor(opciones: Partial<OpcionesSimulacion> = {}) {
    this.opciones = { ...OPCIONES_POR_DEFECTO, ...opciones };
    this.metrosCabeza = this.opciones.inicioM;
    this.proximaParadaMs = Date.now() + this.intervaloAleatorio(60_000, 150_000);
  }

  private intervaloAleatorio(min: number, max: number) {
    return min + Math.random() * (max - min);
  }

  get parado(): boolean {
    return Date.now() < this.paradoHastaMs;
  }

  get avanceM(): number {
    return this.metrosCabeza;
  }

  get terminado(): boolean {
    return this.metrosCabeza >= SENDA.longitudMetros;
  }

  /** Avanza la simulación `dtSegundos` y devuelve las tres posiciones a reportar. */
  avanzar(dtSegundos: number, desfileId: string): EntradaPosicion[] {
    const ahora = Date.now();

    if (this.opciones.paradas) {
      if (this.parado) {
        // Sigue detenido: no avanza, pero igual reporta. Un desfile detenido
        // también es información — de hecho es la que más se pregunta.
      } else if (ahora >= this.proximaParadaMs) {
        this.paradoHastaMs = ahora + this.intervaloAleatorio(40_000, 120_000);
        this.proximaParadaMs = this.paradoHastaMs + this.intervaloAleatorio(90_000, 200_000);
      }
    }

    if (!this.parado) {
      // Pequeña variación para que la velocidad no se vea sintética.
      const factor = 0.8 + Math.random() * 0.4;
      const ms = (this.opciones.velocidadKmh / 3.6) * factor;
      this.metrosCabeza = Math.min(this.metrosCabeza + ms * dtSegundos, SENDA.longitudMetros);
    }

    return this.posiciones(desfileId);
  }

  posiciones(desfileId: string): EntradaPosicion[] {
    const metrosPorRol: Record<Rol, number> = {
      cabeza: this.metrosCabeza,
      mitad: Math.max(0, this.metrosCabeza - this.opciones.separacionM),
      cola: Math.max(0, this.metrosCabeza - this.opciones.separacionM * 2),
    };

    return (Object.keys(metrosPorRol) as Rol[]).map((rol) => {
      const { lat, lng } = puntoEnMetro(metrosPorRol[rol]);
      // Ruido de GPS: unos pocos metros, para que la proyección sobre la senda
      // tenga que hacer su trabajo igual que con un celular real.
      const jitter = () => (Math.random() - 0.5) * 0.00008;
      return {
        desfileId,
        rol,
        lat: lat + jitter(),
        lng: lng + jitter(),
        precisionM: this.opciones.precisionM,
        ts: Date.now(),
      };
    });
  }

  reiniciar(inicioM = 0) {
    this.metrosCabeza = inicioM;
    this.paradoHastaMs = 0;
    this.proximaParadaMs = Date.now() + this.intervaloAleatorio(60_000, 150_000);
  }
}

/** Cada cuánto reporta un reportero. Igual que en la app real: 10–15 s. */
export const INTERVALO_REPORTE_MS = 12_000;
