const CLAVE = "sed:dispositivo-firmado";

let enCurso: Promise<string | null> | null = null;

/**
 * El id anónimo de este celular, emitido y firmado por el servidor. Solo sirve
 * para no contar dos veces a la misma persona en el gentío y para limitar
 * cuántas fotos sube cada uno. No dice nada de quién es.
 */
export function obtenerDispositivo(): Promise<string | null> {
  try {
    const guardado = localStorage.getItem(CLAVE);
    if (guardado) return Promise.resolve(guardado);
  } catch {
    // sin almacenamiento: se pide uno por sesión
  }
  return (enCurso ??= fetch("/api/dispositivo", { method: "POST" })
    .then((r) => (r.ok ? (r.json() as Promise<{ dispositivo: string }>) : null))
    .then((d) => {
      if (!d) return null;
      try {
        localStorage.setItem(CLAVE, d.dispositivo);
      } catch {
        // vale para esta sesión
      }
      return d.dispositivo;
    })
    .catch(() => null)
    .finally(() => {
      enCurso = null;
    }));
}

/** El servidor no reconoció el id (cambió su secreto): se pide otro la próxima vez. */
export function olvidarDispositivo() {
  try {
    localStorage.removeItem(CLAVE);
  } catch {
    // nada
  }
}
