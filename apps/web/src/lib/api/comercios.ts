/**
 * Los comercios y servicios del mapa (`GET /api/businesses`) traducidos al
 * `Comercio` de la web, y el tipo de interacción que se cuenta
 * (`POST /api/businesses/event`).
 *
 * Un comercio con un valor desconocido se descarta solo, con un aviso en la
 * consola: el resto de la capa sigue.
 */

import { booleano, deTabla, lista, numero, objeto, sinLosInvalidos, texto, textoONulo } from "@/lib/api/leer";
import {
  CATEGORIA_DE_COMERCIO,
  MOMENTO_DE_TIMING,
  PLAN_DE_API,
  TIPO_DE_METRICA,
  type TipoMetricaApi,
} from "@/lib/api/valores";
import type { Comercio, ItemMenu, TipoMetrica } from "@/lib/tipos";

function itemMenu(v: unknown): ItemMenu {
  const o = objeto(v, "menu[]");
  return { nombre: texto(o, "name"), precio: texto(o, "price") };
}

function comercio(v: unknown): Comercio {
  const o = objeto(v, "businesses[]");
  const plan = textoONulo(o, "plan");
  return {
    id: texto(o, "id"),
    nombre: texto(o, "name"),
    categoria: deTabla(CATEGORIA_DE_COMERCIO, texto(o, "category"), "category"),
    descripcion: texto(o, "description"),
    direccion: texto(o, "address"),
    horario: texto(o, "hours"),
    lat: numero(o, "lat"),
    lng: numero(o, "lng"),
    plan: plan === null ? null : deTabla(PLAN_DE_API, plan, "plan"),
    promo: textoONulo(o, "offer"),
    promoMomento: deTabla(MOMENTO_DE_TIMING, texto(o, "offerTiming"), "offerTiming"),
    menu: lista(o.menu, "menu").map(itemMenu),
    whatsapp: textoONulo(o, "whatsapp"),
    enlace: textoONulo(o, "link"),
    visible: booleano(o, "visible"),
  };
}

export function comerciosDesdeApi(json: unknown): Comercio[] {
  const o = objeto(json, "los comercios");
  return sinLosInvalidos(lista(o.businesses, "businesses"), comercio, "un comercio");
}

export interface MetricaApi {
  id: string;
  type: TipoMetricaApi;
}

export function metricaParaApi(id: string, tipo: TipoMetrica): MetricaApi {
  const type = TIPO_DE_METRICA[tipo];
  if (!type) throw new Error(`Tipo de métrica desconocido: «${tipo}».`);
  return { id, type };
}
