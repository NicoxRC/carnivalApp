"use client";

import { useEffect } from "react";

import { API_BASE } from "@/lib/api/client";

export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const t = setTimeout(() => {
      const api = API_BASE ? `?api=${encodeURIComponent(new URL(API_BASE).origin)}` : "";
      navigator.serviceWorker.register(`/sw.js${api}`).catch(() => {
      });
    }, 1200);
    return () => clearTimeout(t);
  }, []);

  return null;
}
