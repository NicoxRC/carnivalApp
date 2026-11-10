import type {
  CategoriaComercio,
  CategoriaServicio,
  Comercio,
  ItemMenu,
  MomentoPromo,
  PlanComercio,
} from "@/lib/tipos";

/** Nombre para mostrar de cada categoría. El orden es el de los selectores. */
export const CATEGORIAS_COMERCIO: Record<CategoriaComercio, string> = {
  restaurante: "Restaurante",
  tasca: "Tasca",
  cafe: "Café",
  heladeria: "Heladería",
  panaderia: "Panadería",
  tienda: "Tienda",
  bar: "Bar",
  farmacia: "Droguería",
};

/**
 * Servicios. ⚠️ Solo con datos oficiales: un baño inventado en un mapa que
 * alguien usa para buscar un baño es peor que no ofrecer la capa.
 */
export const CATEGORIAS_SERVICIO: Record<CategoriaServicio, string> = {
  bano: "Baños",
  hidratacion: "Punto de hidratación",
  salud: "Primeros auxilios",
  policia: "Policía",
  cierre: "Cierre vial",
};

export function esServicio(categoria: string): categoria is CategoriaServicio {
  return categoria in CATEGORIAS_SERVICIO;
}

export function nombreCategoria(categoria: string): string {
  return (
    (CATEGORIAS_COMERCIO as Record<string, string>)[categoria] ??
    (CATEGORIAS_SERVICIO as Record<string, string>)[categoria] ??
    "Sitio"
  );
}

export const PLANES_COMERCIO: Record<PlanComercio, string> = {
  basico: "Básico",
  destacado: "Destacado",
};

export const MOMENTOS_PROMO: Record<MomentoPromo, string> = {
  siempre: "Todo el día",
  antes: "Solo antes de que pase el desfile",
  despues: "Solo después de que pase el desfile",
};

const LARGO_MAX = { nombre: 80, descripcion: 280, direccion: 140, horario: 80, promo: 140 };
const MAX_ITEMS_MENU = 40;

function texto(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function validarMenu(v: unknown): ItemMenu[] {
  if (!Array.isArray(v)) return [];
  const menu: ItemMenu[] = [];
  for (const item of v.slice(0, MAX_ITEMS_MENU)) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    const nombre = texto(o.nombre, 60);
    if (nombre) menu.push({ nombre, precio: texto(o.precio, 24) });
  }
  return menu;
}

/** Deja solo dígitos y agrega el indicativo de Colombia a un celular de 10 dígitos. */
function validarWhatsapp(v: unknown): string | null {
  const digitos = texto(v, 24).replace(/\D/g, "");
  if (digitos.length === 10 && digitos.startsWith("3")) return `57${digitos}`;
  return digitos.length >= 10 && digitos.length <= 15 ? digitos : null;
}

/** Solo http(s): un `javascript:` aquí terminaría en un enlace que toca el público. */
function validarEnlace(v: unknown): string | null {
  const t = texto(v, 200);
  if (!t) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

/**
 * Valida lo que manda el panel de administración. Devuelve el comercio limpio
 * o el primer error, con un mensaje que se puede mostrar tal cual.
 */
export function validarComercio(
  cuerpo: unknown,
  id: string,
): { comercio: Comercio } | { error: string } {
  if (typeof cuerpo !== "object" || cuerpo === null) return { error: "Datos inválidos." };
  const o = cuerpo as Record<string, unknown>;

  const nombre = texto(o.nombre, LARGO_MAX.nombre);
  if (!nombre) return { error: "Falta el nombre." };

  const categoria = String(o.categoria);
  const servicio = esServicio(categoria);
  if (!servicio && !(categoria in CATEGORIAS_COMERCIO)) return { error: "Categoría inválida." };

  const lat = Number(o.lat);
  const lng = Number(o.lng);
  if (o.lat === null || o.lng === null || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return { error: "Falta marcar el punto en el mapa." };
  }

  // Un servicio nunca es pauta. Y sin plan no hay oferta, menú ni contacto:
  // eso es justamente lo que se vende.
  const plan = !servicio && (o.plan === "basico" || o.plan === "destacado") ? o.plan : null;
  const momento = o.promoMomento === "antes" || o.promoMomento === "despues" ? o.promoMomento : "siempre";

  return {
    comercio: {
      id,
      nombre,
      categoria: categoria as Comercio["categoria"],
      descripcion: texto(o.descripcion, LARGO_MAX.descripcion),
      direccion: texto(o.direccion, LARGO_MAX.direccion),
      horario: texto(o.horario, LARGO_MAX.horario),
      lat,
      lng,
      plan,
      promo: plan ? texto(o.promo, LARGO_MAX.promo) || null : null,
      promoMomento: plan ? momento : "siempre",
      menu: plan ? validarMenu(o.menu) : [],
      whatsapp: plan ? validarWhatsapp(o.whatsapp) : null,
      enlace: plan ? validarEnlace(o.enlace) : null,
      visible: o.visible !== false,
    },
  };
}
