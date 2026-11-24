/**
 * Español e inglés.
 *
 * El Carnaval recibe muchos turistas. Se traduce la INTERFAZ: botones, estados
 * del ETA, avisos del sistema. No se traduce el contenido que carga el equipo
 * (nombres de eventos, comercios, mensajes del administrador), que sale tal
 * como se escribió.
 *
 * El español conserva la voz pastusa del diseño. El inglés es neutro: un
 * turista no necesita voseo, necesita entender.
 */
export type Idioma = "es" | "en";

const TEXTOS = {
  // Navegación
  "nav.mapa": { es: "Mapa", en: "Map" },
  "nav.hoy": { es: "Hoy", en: "Today" },
  "nav.desfiles": { es: "Desfiles", en: "Parades" },
  "nav.fotos": { es: "Fotos", en: "Photos" },
  "nav.idioma": { es: "English", en: "Español" },

  // Inicio
  "inicio.sobre": { es: "Carnaval de Negros y Blancos", en: "Blacks and Whites' Carnival" },
  "inicio.titulo1": { es: "Sigue el", en: "Follow the" },
  "inicio.titulo2": { es: "Desfile", en: "Parade" },
  "inicio.texto": {
    es: "Enterate por dónde va el desfile ahora mismo y cuánto le falta pa' llegar a donde estás parado. Sin moverte del puesto, ¿sí o qué pues?",
    en: "See where the parade is right now and how long until it reaches the spot where you're standing. Without giving up your place.",
  },
  "inicio.mapa": { es: "seguí el desfile en vivo, con tarimas y tascas.", en: "follow the parade live, with stages and food stalls." },
  "inicio.resto.t": { es: "Hoy, Desfiles y Fotos", en: "Today, Parades and Photos" },
  "inicio.resto": { es: "todo lo del Carnaval en un solo puesto.", en: "everything about the Carnival in one place." },
  "inicio.seguir": { es: "Seguir el desfile", en: "Follow the parade" },
  "inicio.saltar": { es: "Ver primero sin ubicación", en: "Look around without location first" },
  "inicio.privacidad": { es: "Qué datos usa la app", en: "What data the app uses" },

  // Capas y controles del mapa
  "capa.desfile": { es: "Desfile", en: "Parade" },
  "capa.comercios": { es: "Comercios", en: "Shops & food" },
  "capa.tarimas": { es: "Tarimas", en: "Stages" },
  "capa.servicios": { es: "Servicios", en: "Services" },
  "capa.gentio": { es: "Gentío", en: "Crowds" },
  "mapa.provisional": {
    es: "Trazado provisional: no es la senda oficial de Corpocarnaval.",
    en: "Provisional route: not the official Corpocarnaval route.",
  },
  "mapa.llevame": { es: "Llevame al desfile", en: "Take me to the parade" },
  "mapa.centrar": { es: "Centrar en mi ubicación", en: "Center on my location" },
  "mapa.usarUbicacion": { es: "Usar mi ubicación", en: "Use my location" },
  "mapa.marcar": { es: "Marcar en el mapa", en: "Mark on the map" },
  "mapa.tocaDonde": { es: "Tocá en el mapa dónde vas a esperar el desfile.", en: "Tap the map where you'll wait for the parade." },
  "mapa.cancelar": { es: "Cancelar", en: "Cancel" },
  "mapa.puntoManual": { es: "Punto marcado a mano", en: "Spot marked by hand" },
  "mapa.usarGps": { es: "Usar el GPS", en: "Use GPS" },
  "mapa.envivo": { es: "EN VIVO", en: "LIVE" },
  "mapa.encuentro": { es: "Punto de encuentro que te compartieron", en: "Meeting point shared with you" },
  "mapa.quitar": { es: "Quitar", en: "Remove" },

  // Gentío
  "gentio.pregunta": { es: "¿Ayudás a saber dónde hay gente?", en: "Help show where the crowds are?" },
  "gentio.explica": {
    es: "La app manda cada minuto en qué tramo de la senda estás, sin nombre y sin guardar por dónde anduviste. Podés mirar el mapa igual sin compartir nada.",
    en: "Once a minute the app sends which stretch of the route you're on — no name, no history of where you've been. You can still view the map without sharing anything.",
  },
  "gentio.si": { es: "Sí, compartir", en: "Yes, share" },
  "gentio.no": { es: "Solo mirar", en: "Just look" },
  "gentio.tranquilo": { es: "Hay campo", en: "Room" },
  "gentio.con_gente": { es: "Con gente", en: "Busy" },
  "gentio.lleno": { es: "Lleno", en: "Packed" },
  "gentio.personas": { es: "{n} personas ahora", en: "{n} people now" },
  "gentio.insuficiente": {
    es: "Todavía no hay suficiente gente usando la app para decir dónde hay aglomeración. Hacen falta al menos {min}{actual}.",
    en: "Not enough people are using the app yet to show crowding. At least {min} are needed{actual}.",
  },
  "gentio.actual": { es: " y ahora mismo hay {n}", en: " and there are {n} right now" },
  "gentio.donde": { es: "¿Dónde me hago?", en: "Where should I stand?" },
  "gentio.sugerencia": { es: "Por {lugar} hay campo", en: "There's room near {lugar}" },
  "gentio.llegaEn": { es: "el desfile llega en {a}–{b} min", en: "the parade arrives in {a}–{b} min" },
  "gentio.sinSugerencias": {
    es: "No hay un tramo con campo más adelante del desfile, según quienes usan la app.",
    en: "No stretch with room ahead of the parade, going by people using the app.",
  },
  "gentio.aviso": {
    es: "Cuenta solo a quienes usan la app: puede haber más gente de la que se ve.",
    en: "Counts app users only: there may be more people than shown.",
  },

  // ETA
  "eta.llegando": { es: "El desfile te cae en", en: "The parade reaches you in" },
  "eta.detenido": { es: "El desfile está parado", en: "The parade has stopped" },
  "eta.detenido.hace": { es: " — lleva {n} min quieto", en: " — no movement for {n} min" },
  "eta.aqui": { es: "¡Ya te está pasando por delante!", en: "It's passing right in front of you!" },
  "eta.yaPasoTodo": { es: "Ya pasó todo por donde estás", en: "The whole parade has passed your spot" },
  "eta.cabezaPaso": { es: "La cabeza ya pasó", en: "The front has passed" },
  "eta.colaVa": { es: " — la cola va a {d}", en: " — the tail is {d} away" },
  "eta.dondeEstas": { es: "¿En qué parte estás?", en: "Where are you standing?" },
  "eta.lejos": { es: "Estás lejos de la senda", en: "You're far from the route" },
  "eta.noArranca": { es: "El desfile todavía no arranca", en: "The parade hasn't started yet" },
  "eta.sinSenal": { es: "Sin noticias del desfile hace {n} min", en: "No news from the parade for {n} min" },
  "eta.d.va": { es: "Va a {d}, ", en: "It's {d} away, " },
  "eta.d.medida": { es: "andando a {v} km/h", en: "moving at {v} km/h" },
  "eta.d.estimada": { es: "a un ritmo calculado de {v} km/h", en: "at an estimated {v} km/h" },
  "eta.d.sinMoverse": { es: " · sin moverse hace {n} min", en: " · not moving for {n} min" },
  "eta.d.cabezaA": { es: "La cabeza está a {d} de donde estás.", en: "The front is {d} from you." },
  "eta.d.estasA": { es: "Estás a {d} de la cabeza.", en: "You're {d} from the front." },
  "eta.d.adelante": { es: "La cabeza va {d} más adelante.", en: "The front is {d} further on." },
  "eta.d.sinUbicacion": { es: "Sin saber dónde estás no se puede calcular cuánto le falta.", en: "Without your location we can't work out how long it'll take." },
  "eta.d.acercate": { es: "Acercate a la senda, o marcá a mano dónde vas a esperarlo.", en: "Move closer to the route, or mark where you'll wait." },
  "eta.d.sinReportes": { es: "Todavía no hay señas de ningún reportero.", en: "No reports from the parade yet." },
  "eta.d.sinSenal": {
    es: "Lo último que se supo: iba a {d} de donde estás. Apenas vuelva la señal te digo cuánto falta.",
    en: "Last we heard it was {d} from you. We'll update as soon as reports resume.",
  },
  "eta.colaEn": { es: "Termina de pasar en {a}–{b} min.", en: "It finishes passing in {a}–{b} min." },
  "eta.conexion.conectando": { es: "conectando…", en: "connecting…" },
  "eta.conexion.en_vivo": { es: "en vivo", en: "live" },
  "eta.conexion.reintentando": { es: "reconectando…", en: "reconnecting…" },
  "eta.conexion.sin_conexion": { es: "sin conexión", en: "offline" },
  "eta.ultimas": { es: "últimas señas {hace} ({hora})", en: "last report {hace} ({hora})" },
  "eta.sinSenas": { es: "sin señas todavía", en: "no reports yet" },
  "eta.avisame": { es: "Avisame cuando esté cerca", en: "Notify me when it's close" },
  "eta.avisoListo": { es: "Te aviso cuando le falten unos {n} min", en: "We'll notify you about {n} min before" },
  "eta.avisoListoAbierta": {
    es: "Te aviso cuando le falten unos {n} min (dejá la app abierta)",
    en: "We'll notify you about {n} min before (keep the app open)",
  },
  "eta.avisoNegado": { es: "Activá las notificaciones del navegador para poder avisarte.", en: "Allow browser notifications so we can alert you." },
  "eta.avisoQuitar": { es: "Quitar aviso", en: "Cancel alert" },
  "eta.compartir": { es: "Compartir mi punto", en: "Share my spot" },
  "eta.compartirTexto": {
    es: "Estoy {donde} viendo el desfile.{eta} Mirá dónde:",
    en: "I'm watching the parade — {donde}.{eta} See where:",
  },
  "eta.compartirEta": { es: " Llega acá en {a}–{b} min.", en: " It gets here in {a}–{b} min." },
  "eta.copiado": { es: "Enlace copiado", en: "Link copied" },
  "aviso.titulo": { es: "{nombre}: ya viene", en: "{nombre}: almost there" },
  "aviso.cuerpo": { es: "Le faltan unos {n} min para llegar a donde estás.", en: "About {n} min until it reaches your spot." },

  // Referencias sobre la senda
  "ref.va.por": { es: "va por {a}", en: "passing {a}" },
  "ref.va.entre": { es: "va entre {a} y {b}", en: "between {a} and {b}" },
  "ref.va.antes": { es: "va antes de {a}", en: "before {a}" },
  "ref.va.paso": { es: "ya pasó {a}", en: "past {a}" },
  "ref.estas.por": { es: "estás por {a}", en: "you're near {a}" },
  "ref.estas.entre": { es: "estás entre {a} y {b}", en: "you're between {a} and {b}" },
  "ref.estas.antes": { es: "estás antes de {a}", en: "you're before {a}" },
  "ref.estas.paso": { es: "estás pasando {a}", en: "you're past {a}" },

  // Tiempo y distancia
  "t.ahora": { es: "ahora mismo", en: "just now" },
  "t.haceS": { es: "hace {n} s", en: "{n} s ago" },
  "t.haceMin": { es: "hace {n} min", en: "{n} min ago" },
  "t.haceH": { es: "hace {h} h", en: "{h} h ago" },
  "t.haceHMin": { es: "hace {h} h {n} min", en: "{h} h {n} min ago" },

  // Ficha de un punto
  "ficha.donde": { es: "Dónde", en: "Where" },
  "ficha.horario": { es: "Horario", en: "Hours" },
  "ficha.a": { es: " · a {d}", en: " · {d} away" },
  "ficha.verMapa": { es: "Ver en el mapa", en: "Show on map" },
  "ficha.menu": { es: "Ver menú", en: "See menu" },
  "ficha.ocultarMenu": { es: "Ocultar menú", en: "Hide menu" },
  "ficha.whatsapp": { es: "WhatsApp", en: "WhatsApp" },
  "ficha.enlace": { es: "Ver más", en: "More info" },
  "ficha.pauta": { es: "PAUTA", en: "AD" },
  "ficha.cerrar": { es: "Cerrar", en: "Close" },
  "oferta.cerca": { es: "Oferta cerca", en: "Offer nearby" },

  // Hoy
  "hoy.titulo": { es: "Hoy", en: "Today" },
  "hoy.ahorita": { es: "AHORITA · EN VIVO", en: "RIGHT NOW · LIVE" },
  "hoy.a": { es: "A {d}", en: "{d} away" },
  "hoy.yaCasi": { es: "de vos, ¡ya casi!", en: "— almost there!" },
  "hoy.deDonde": { es: "de donde estás", en: "from you" },
  "hoy.parado": { es: "Parado hace {n} min", en: "Stopped for {n} min" },
  "hoy.teCae": { es: "Te cae en {a}–{b} min", en: "Reaches you in {a}–{b} min" },
  "hoy.pasando": { es: "¡Te está pasando por delante!", en: "It's passing right in front of you!" },
  "hoy.yaPaso": { es: "Ya pasó por donde estás", en: "It has already passed your spot" },
  "hoy.sinSenal": { es: "Sin noticias hace {n} min", en: "No news for {n} min" },
  "hoy.decinos": { es: "Decinos dónde estás y te calculo cuánto le falta.", en: "Tell us where you are and we'll work out how long it'll take." },
  "hoy.seguilo": { es: "Seguilo en el mapa", en: "Follow it on the map" },
  "hoy.noArranca": { es: "Todavía no arranca. Cuando salga, acá te digo cuánto le falta.", en: "It hasn't started. Once it does, you'll see here how long it'll take." },
  "hoy.sale": { es: "Sale el {fecha} a las {hora}.", en: "Starts {fecha} at {hora}." },
  "hoy.verMapa": { es: "Ver el mapa", en: "Open the map" },
  "hoy.distancias": { es: "Mostrame a qué distancia me queda cada cosa", en: "Show how far each thing is from me" },
  "hoy.ejemplo": { es: "Programación de ejemplo, no oficial. Se reemplaza por la de Corpocarnaval.", en: "Sample schedule, not official. To be replaced with Corpocarnaval's." },
  "hoy.enCurso": { es: "Ahorita", en: "Now" },
  "hoy.pasado": { es: "Ya pasó", en: "Over" },
  "hoy.viene": { es: "Ahí viene", en: "Coming up" },
  "hoy.seAcabo": { es: "se acabó {hora}", en: "ended {hora}" },
  "hoy.nada": { es: "Hoy no hay eventos programados.", en: "No events scheduled for today." },
  "hoy.proximo": { es: "Lo próximo: {fecha}", en: "Next up: {fecha}" },
  "hoy.cerca": { es: "Cerca de la senda", en: "Near the route" },

  // Desfiles
  "desfiles.titulo": { es: "Desfiles", en: "Parades" },
  "desfiles.sub": { es: "Toda la programación", en: "Full schedule" },
  "desfiles.ejemplo": { es: "Programación de ejemplo. Ni fechas ni horas están confirmadas con Corpocarnaval.", en: "Sample schedule. Dates and times are not confirmed with Corpocarnaval." },
  "desfiles.hoy": { es: "Hoy", en: "Today" },
  "desfiles.seguir": { es: "Se puede seguir en el mapa", en: "Can be followed on the map" },
  "desfiles.enCurso": { es: "En curso", en: "Under way" },
  "desfiles.finalizado": { es: "Finalizado", en: "Finished" },
  "desfiles.recorrido": { es: "Por dónde pasó", en: "Where it passed" },
  "desfiles.ocultar": { es: "Ocultar recorrido", en: "Hide route log" },
  "desfiles.sinLlegar": { es: "todavía no", en: "not yet" },
  "desfiles.vacio": { es: "No hay nada programado.", en: "Nothing scheduled." },

  // Fotos
  "fotos.titulo": { es: "Fotos", en: "Photos" },
  "fotos.sub": { es: "Subí las tuyas y mirá las de todo el mundo", en: "Upload yours and see everyone's" },
  "fotos.subir": { es: "Subir una foto", en: "Upload a photo" },
  "fotos.subiendo": { es: "Subiendo…", en: "Uploading…" },
  "fotos.enviada": { es: "¡Recibida! Sale en el muro cuando el equipo la apruebe.", en: "Got it! It'll appear once the team approves it." },
  "fotos.error": { es: "No se pudo subir. Probá otra vez.", en: "Upload failed. Please try again." },
  "fotos.vacio": { es: "Todavía no hay fotos. ¡Subí la primera!", en: "No photos yet. Upload the first one!" },
  "fotos.reglas": { es: "Ninguna foto se publica sin pasar por moderación. No subás fotos de menores sin permiso de su familia.", en: "No photo is published without moderation. Don't upload photos of children without their family's permission." },
  "fotos.en": { es: "por {lugar}", en: "near {lugar}" },

  // Generales
  "error.titulo": { es: "Algo se dañó", en: "Something went wrong" },
  "error.texto": { es: "No es tu celular. Probá otra vez.", en: "It's not your phone. Please try again." },
  "error.reintentar": { es: "Probar otra vez", en: "Try again" },
} as const;

export type ClaveTexto = keyof typeof TEXTOS;

export function traducir(idioma: Idioma, clave: ClaveTexto, vars?: Record<string, string | number>): string {
  let texto: string = TEXTOS[clave][idioma];
  if (vars) for (const [k, v] of Object.entries(vars)) texto = texto.replaceAll(`{${k}}`, String(v));
  return texto;
}

export type Traductor = (clave: ClaveTexto, vars?: Record<string, string | number>) => string;
