import Link from "next/link";

export const metadata = { title: "Qué datos usa la app · Sigue el Desfile" };

/**
 * ⚠️ BORRADOR. Describe con exactitud lo que hace el código hoy, pero NO es una
 * política de tratamiento de datos revisada por un abogado. Antes de publicar
 * la app hay que: (1) nombrar al responsable del tratamiento con su NIT y un
 * canal de contacto real, (2) hacerla revisar frente a la Ley 1581 de 2012 y
 * su reglamentación, y (3) mantenerla al día: si el código empieza a guardar
 * algo más, esta página cambia en el mismo PR.
 */
export default function Privacidad() {
  const h2 = "fuente-display mt-7 text-[20px] text-tinta";
  const p = "mt-2 text-[15px] leading-relaxed text-tinta-2";
  return (
    <div className="flex-1 bg-papel-3">
      <article className="pt-seguro mx-auto w-full max-w-2xl px-5 pb-12 lg:px-6 lg:pt-8">
        <h1 className="fuente-display text-[34px] leading-none text-tinta">Qué datos usa la app</h1>
        <p className="mt-3 rounded-xl bg-papel px-3 py-2 text-[12px] leading-snug font-semibold text-aviso-txt">
          Borrador. Falta el nombre y el contacto del responsable, y la revisión legal. No es todavía
          la política oficial.
        </p>

        <p className={p}>
          La app no tiene cuentas: no pide nombre, correo ni teléfono. Esto es todo lo que usa y para
          qué.
        </p>

        <h2 className={h2}>Tu ubicación</h2>
        <p className={p}>
          Si das permiso, tu ubicación se usa <b>en tu celular</b> para calcular cuánto le falta al
          desfile para llegar a donde estás. Tu posición exacta no se envía al servidor.
        </p>

        <h2 className={h2}>El mapa de gentío</h2>
        <p className={p}>
          Solo si respondés «Sí, compartir»: una vez por minuto la app envía en qué tramo de 100 m de
          la senda estás, junto con un identificador anónimo del dispositivo que sirve únicamente para
          no contarte dos veces. No se guarda por dónde anduviste: cada envío reemplaza al anterior, y
          deja de contar a los cinco minutos. Podés ver el mapa sin compartir nada.
        </p>

        <h2 className={h2}>Avisos «el desfile está cerca»</h2>
        <p className={p}>
          Si pedís el aviso, se guarda la dirección técnica a la que tu navegador recibe
          notificaciones y el punto de la senda donde esperás. Se borra apenas se manda el aviso, o
          cuando lo cancelás.
        </p>

        <h2 className={h2}>Fotos</h2>
        <p className={p}>
          Las fotos que subís se reducen en tu celular antes de enviarse, y en ese paso se eliminan
          sus datos internos (como las coordenadas donde se tomaron). Se guarda la foto y, si estabas
          sobre la senda, el tramo aproximado. Ninguna se publica sin revisión del equipo. No subás
          fotos de menores sin permiso de su familia.
        </p>

        <h2 className={h2}>Comercios</h2>
        <p className={p}>
          Se cuenta cuántas veces se abre la ficha de un comercio o se toca su WhatsApp. Es un
          contador: no registra quién fue.
        </p>

        <h2 className={h2}>En tu celular</h2>
        <p className={p}>
          La app guarda en tu navegador tus preferencias (idioma, si ya viste la bienvenida, el punto
          que marcaste a mano) y una copia del mapa para funcionar sin señal. Se borran al borrar los
          datos del sitio.
        </p>

        <h2 className={h2}>Lo que no hace</h2>
        <p className={p}>
          No usa cookies de publicidad ni rastreadores de terceros, y no vende ni comparte datos. Los
          comercios marcados como «Pauta» pagaron por aparecer destacados; no reciben datos tuyos.
        </p>

        <p className="mt-8">
          <Link href="/" className="font-bold text-tinta underline underline-offset-4">
            Volver al mapa
          </Link>
        </p>
      </article>
    </div>
  );
}
