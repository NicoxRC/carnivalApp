/**
 * Reduce una foto en el celular antes de subirla: lado mayor de 1600 px, JPEG.
 *
 * Tres razones para hacerlo en el cliente y no en el servidor:
 *  - una foto de cámara pesa 4–8 MB y la red del 31 no la sube;
 *  - al redibujarla en un canvas se pierden los metadatos EXIF, entre ellos
 *    las coordenadas GPS exactas de dónde se tomó;
 *  - el servidor no necesita una librería de imágenes.
 */
const LADO_MAX = 1600;

export async function reducirFoto(archivo: File): Promise<Blob> {
  const mapa = await createImageBitmap(archivo, { imageOrientation: "from-image" });
  const escala = Math.min(1, LADO_MAX / Math.max(mapa.width, mapa.height));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(mapa.width * escala);
  lienzo.height = Math.round(mapa.height * escala);
  const ctx = lienzo.getContext("2d");
  if (!ctx) throw new Error("sin canvas");
  ctx.drawImage(mapa, 0, 0, lienzo.width, lienzo.height);
  mapa.close();
  return new Promise((ok, falla) =>
    lienzo.toBlob((b) => (b ? ok(b) : falla(new Error("no se pudo convertir"))), "image/jpeg", 0.82),
  );
}
