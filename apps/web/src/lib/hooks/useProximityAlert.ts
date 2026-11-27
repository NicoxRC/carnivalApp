"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Eta } from "@/lib/eta";

export type AlertState =
  | { mode: "off" }
  | { mode: "push" | "local"; thresholdMin: number }
  | { mode: "denied" };

const KEY = "sed:aviso-cercania";
export const ALERT_THRESHOLD_MIN = 10;

function base64ToUint8(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

async function subscribePush(metres: number, thresholdMin: number): Promise<boolean> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  try {
    const config = (await (await fetch("/api/avisos-push")).json()) as { configured: boolean; key: string | null };
    if (!config.configured || !config.key) return false;
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((ok) => setTimeout(() => ok(null), 3000)),
    ]);
    if (!reg) return false;
    const subscription =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ToUint8(config.key) }));
    const r = await fetch("/api/avisos-push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: subscription.toJSON(), metres, thresholdMin }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

export function useProximityAlert(eta: Eta, title: string, body: (min: number) => string) {
  const [alert, setAlert] = useState<AlertState>({ mode: "off" });
  const bodyRef = useRef(body);
  bodyRef.current = body;

  useEffect(() => {
    try {
      const g = JSON.parse(localStorage.getItem(KEY) ?? "null") as AlertState | null;
      if (g && (g.mode === "push" || g.mode === "local")) setAlert(g);
    } catch {}
  }, []);

  const save = useCallback((a: AlertState) => {
    setAlert(a);
    try {
      if (a.mode === "off" || a.mode === "denied") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, JSON.stringify(a));
    } catch {}
  }, []);

  const enable = useCallback(
    async (metres: number) => {
      if (!("Notification" in window)) return save({ mode: "denied" });
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return save({ mode: "denied" });
      const withPush = await subscribePush(metres, ALERT_THRESHOLD_MIN);
      save({ mode: withPush ? "push" : "local", thresholdMin: ALERT_THRESHOLD_MIN });
    },
    [save],
  );

  const disable = useCallback(async () => {
    save({ mode: "off" });
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      const subscription = await reg?.pushManager?.getSubscription();
      if (subscription) {
        await fetch("/api/avisos-push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
      }
    } catch {}
  }, [save]);

  const minMin = eta.kind === "arriving" ? eta.minMin : null;
  const arrived = eta.kind === "here" || eta.kind === "passed";
  useEffect(() => {
    if (alert.mode !== "push" && alert.mode !== "local") return;
    if (arrived) return save({ mode: "off" });
    if (minMin === null || minMin > alert.thresholdMin) return;
    if (alert.mode === "local" && Notification.permission === "granted") {
      const options = { body: bodyRef.current(Math.max(minMin, 5)), tag: "desfile-cerca", icon: "/icono-192.png" };
      void (async () => {
        try {
          const reg = await navigator.serviceWorker?.getRegistration();
          if (reg) await reg.showNotification(title, options);
          else new Notification(title, options);
        } catch {}
        navigator.vibrate?.([200, 100, 200]);
      })();
    }
    save({ mode: "off" });
  }, [alert, minMin, arrived, title, save]);

  return { alert, enable, disable };
}
