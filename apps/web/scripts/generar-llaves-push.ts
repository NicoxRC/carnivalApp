/**
 * Genera el par de llaves VAPID para los avisos «el desfile está cerca».
 *
 *   npm run push:llaves
 *
 * Pegar la salida en `.env.local` (y en las variables del despliegue). La
 * privada es un secreto de servidor: nunca con prefijo NEXT_PUBLIC_. Si se
 * cambian las llaves, las suscripciones que ya existían dejan de servir.
 */
import { generateVAPIDKeys } from "web-push";

const { publicKey, privateKey } = generateVAPIDKeys();
console.log(`NEXT_PUBLIC_VAPID_PUBLICA=${publicKey}
VAPID_PRIVADA=${privateKey}
VAPID_CONTACTO=mailto:cambiar-por-un-correo-real@example.com`);
