"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Eta } from "@/lib/eta";

/**
 * «Avisame cuando esté cerca».
 *
 * Dos caminos, del mejor al que haya:
 *  - push:  el servidor manda la notificación aunque la app esté cerrada.
 *           Necesita llaves VAPID en el servidor y un navegador que soporte
 *           push (en iPhone, solo con la app instalada en la pantalla de inicio).
 *  - local: la propia app vigila el ETA y dispara la notificación. Solo
 *           funciona con la app abierta, y se le dice así al usuario.
 */
export type EstadoAviso =
  | { modo: "apagado" }
  | { modo: "push" | "local"; umbralMin: number }
  | { modo: "negado" };

const CLAVE = "sed:aviso-cercania";
export const UMBRAL_AVISO_MIN = 10;

function base64AUint8(base64: string): Uint8Array<ArrayBuffer> {
  const relleno = "=".repeat((4 - (base64.length % 4)) % 4);
  const crudo = atob((base64 + relleno).replace(/-/g, "+").replace(/_/g, "/"));
  const salida = new Uint8Array(new ArrayBuffer(crudo.length));
  for (let i = 0; i < crudo.length; i++) salida[i] = crudo.charCodeAt(i);
  return salida;
}

async function suscribirPush(metros: number, umbralMin: number): Promise<boolean> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  try {
    const cfg = (await (await fetch("/api/avisos-push")).json()) as { configurado: boolean; llave: string | null };
    if (!cfg.configurado || !cfg.llave) return false;
    // Sin service worker activo (p. ej. en desarrollo) esto no resuelve: se le da 3 s.
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((ok) => setTimeout(() => ok(null), 3000)),
    ]);
    if (!reg) return false;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64AUint8(cfg.llave) }));
    const r = await fetch("/api/avisos-push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suscripcion: sub.toJSON(), metros, umbralMin }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

export function useAvisoCercania(eta: Eta, titulo: string, cuerpo: (min: number) => string) {
  const [aviso, setAviso] = useState<EstadoAviso>({ modo: "apagado" });
  const cuerpoRef = useRef(cuerpo);
  cuerpoRef.current = cuerpo;

  useEffect(() => {
    try {
      const g = JSON.parse(localStorage.getItem(CLAVE) ?? "null") as EstadoAviso | null;
      if (g && (g.modo === "push" || g.modo === "local")) setAviso(g);
    } catch {
      // nada guardado
    }
  }, []);

  const guardar = useCallback((a: EstadoAviso) => {
    setAviso(a);
    try {
      if (a.modo === "apagado" || a.modo === "negado") localStorage.removeItem(CLAVE);
      else localStorage.setItem(CLAVE, JSON.stringify(a));
    } catch {
      // vale para esta sesión
    }
  }, []);

  const activar = useCallback(
    async (metros: number) => {
      if (!("Notification" in window)) return guardar({ modo: "negado" });
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") return guardar({ modo: "negado" });
      const conPush = await suscribirPush(metros, UMBRAL_AVISO_MIN);
      guardar({ modo: conPush ? "push" : "local", umbralMin: UMBRAL_AVISO_MIN });
    },
    [guardar],
  );

  const quitar = useCallback(async () => {
    guardar({ modo: "apagado" });
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      const sub = await reg?.pushManager?.getSubscription();
      if (sub) {
        await fetch("/api/avisos-push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
      }
    } catch {
      // Si no se pudo avisar al servidor, la suscripción se gasta sola al llegar el desfile.
    }
  }, [guardar]);

  // Camino local: la app misma dispara el aviso cuando el ETA baja del umbral.
  // En modo push también sirve de respaldo: si la notificación del servidor ya
  // llegó, aquí solo se apaga el estado.
  const minMin = eta.tipo === "llegando" ? eta.minMin : null;
  const llego = eta.tipo === "aqui" || eta.tipo === "ya_paso";
  useEffect(() => {
    if (aviso.modo !== "push" && aviso.modo !== "local") return;
    if (llego) return guardar({ modo: "apagado" });
    if (minMin === null || minMin > aviso.umbralMin) return;
    if (aviso.modo === "local" && Notification.permission === "granted") {
      const opciones = { body: cuerpoRef.current(Math.max(minMin, 5)), tag: "desfile-cerca", icon: "/icono-192.png" };
      void (async () => {
        try {
          const reg = await navigator.serviceWorker?.getRegistration();
          if (reg) await reg.showNotification(titulo, opciones);
          else new Notification(titulo, opciones);
        } catch {
          // Algunos navegadores solo permiten notificar desde el service worker.
        }
        navigator.vibrate?.([200, 100, 200]);
      })();
    }
    guardar({ modo: "apagado" });
  }, [aviso, minMin, llego, titulo, guardar]);

  return { aviso, activar, quitar };
}
