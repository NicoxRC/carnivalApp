"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { parsePositionsResult } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { authRequest } from "@/lib/session";

export const SEND_INTERVAL_MS = 20_000;
const STALE_FIX_MS = 60_000;
const MAX_QUEUE = 200;
export const ACCEPTABLE_ACCURACY_M = 100;
const QUEUE_KEY = "sed:reporter:queue";

export interface Fix {
  lat: number;
  lng: number;
  accuracyM: number;
  ts: number;
}

type QueuedPoint =
  | { lat: number; lng: number; accuracyM: number; ts: number }
  | { waypointId: string; ts: number };

export type GpsState = "off" | "searching" | "ok" | "denied" | "error";
export type NetworkState = "ok" | "no_signal" | "session_expired";

export interface Reporting {
  active: boolean;
  gps: GpsState;
  fix: Fix | null;
  network: NetworkState;
  lastSentAt: number | null;
  pending: number;
  screenOn: boolean | null;
  onHold: boolean;
  start: () => void;
  stop: () => void;
  imHere: () => boolean;
  markWaypoint: (waypointId: string) => void;
}

function readQueue(): QueuedPoint[] {
  try {
    const v = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]") as unknown;
    return Array.isArray(v) ? (v as QueuedPoint[]).slice(-MAX_QUEUE) : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: QueuedPoint[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {}
}

type WakeLockSentinel = { release: () => Promise<void>; addEventListener: (e: "release", cb: () => void) => void };
type WithWakeLock = Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeLockSentinel> } };

export function useReporting(onSessionExpired: () => void): Reporting {
  const [active, setActive] = useState(false);
  const [gps, setGps] = useState<GpsState>("off");
  const [fix, setFix] = useState<Fix | null>(null);
  const [network, setNetwork] = useState<NetworkState>("ok");
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const [pending, setPending] = useState(0);
  const [screenOn, setScreenOn] = useState<boolean | null>(false);
  const [onHold, setOnHold] = useState(false);

  const queue = useRef<QueuedPoint[]>([]);
  const fixRef = useRef<Fix | null>(null);
  const clockOffsetMs = useRef(0);
  const sending = useRef(false);
  const watchId = useRef<number | null>(null);
  const wakeLock = useRef<WakeLockSentinel | null>(null);
  const sessionExpired = useRef(onSessionExpired);
  sessionExpired.current = onSessionExpired;

  useEffect(() => {
    queue.current = readQueue();
    setPending(queue.current.length);
  }, []);

  const enqueue = useCallback((p: QueuedPoint) => {
    queue.current = [...queue.current, p].slice(-MAX_QUEUE);
    saveQueue(queue.current);
    setPending(queue.current.length);
  }, []);

  const flushQueue = useCallback(async () => {
    if (sending.current || queue.current.length === 0) return;
    sending.current = true;
    const batch = queue.current;
    try {
      const r = await authRequest("/api/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(batch.map((p) => ({ ...p, ts: p.ts + clockOffsetMs.current }))),
      });
      const res = parsePositionsResult(await r.json());
      clockOffsetMs.current = res.serverTs - Date.now();
      setOnHold(res.waiting);
      queue.current = queue.current.slice(batch.length);
      saveQueue(queue.current);
      setPending(queue.current.length);
      setLastSentAt(Date.now());
      setNetwork("ok");
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setNetwork("session_expired");
        sessionExpired.current();
        return;
      }
      if (error instanceof ApiError && error.status === 400) {
        queue.current = queue.current.slice(batch.length);
        saveQueue(queue.current);
        setPending(queue.current.length);
      }
      setNetwork("no_signal");
    } finally {
      sending.current = false;
    }
  }, []);

  const enqueueFix = useCallback((): boolean => {
    const f = fixRef.current;
    if (!f || Date.now() - f.ts > STALE_FIX_MS || f.accuracyM > ACCEPTABLE_ACCURACY_M) return false;
    enqueue({ lat: f.lat, lng: f.lng, accuracyM: Math.round(f.accuracyM), ts: Date.now() });
    return true;
  }, [enqueue]);

  const requestScreen = useCallback(async () => {
    const nav = navigator as WithWakeLock;
    if (!nav.wakeLock) {
      setScreenOn(null);
      return;
    }
    try {
      const b = await nav.wakeLock.request("screen");
      wakeLock.current = b;
      setScreenOn(true);
      b.addEventListener("release", () => setScreenOn(false));
    } catch {
      setScreenOn(false);
    }
  }, []);

  const start = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setGps("error");
      return;
    }
    setActive(true);
    setGps("searching");
    void requestScreen();
    if (watchId.current === null) {
      watchId.current = navigator.geolocation.watchPosition(
        (pos) => {
          const f: Fix = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracyM: pos.coords.accuracy,
            ts: Date.now(),
          };
          const isFirst = !fixRef.current || fixRef.current.accuracyM > ACCEPTABLE_ACCURACY_M;
          fixRef.current = f;
          setFix(f);
          setGps("ok");
          if (isFirst && enqueueFix()) void flushQueue();
        },
        (err) => setGps(err.code === err.PERMISSION_DENIED ? "denied" : "error"),
        { enableHighAccuracy: true, maximumAge: 5_000, timeout: 30_000 },
      );
    }
  }, [enqueueFix, requestScreen, flushQueue]);

  const stop = useCallback(() => {
    setActive(false);
    setGps("off");
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    fixRef.current = null;
    setFix(null);
    void wakeLock.current?.release();
    wakeLock.current = null;
    setScreenOn(false);
    void flushQueue();
  }, [flushQueue]);

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      enqueueFix();
      void flushQueue();
    }, SEND_INTERVAL_MS);
    return () => clearInterval(t);
  }, [active, enqueueFix, flushQueue]);

  useEffect(() => {
    if (!active) return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void requestScreen();
      void flushQueue();
    };
    const onOnline = () => void flushQueue();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [active, requestScreen, flushQueue]);

  useEffect(
    () => () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
      void wakeLock.current?.release();
    },
    [],
  );

  const imHere = useCallback(() => {
    const ok = enqueueFix();
    if (ok) void flushQueue();
    return ok;
  }, [enqueueFix, flushQueue]);

  const markWaypoint = useCallback(
    (waypointId: string) => {
      enqueue({ waypointId, ts: Date.now() });
      void flushQueue();
    },
    [enqueue, flushQueue],
  );

  return {
    active,
    gps,
    fix,
    network,
    lastSentAt,
    pending,
    screenOn,
    onHold,
    start,
    stop,
    imHere,
    markWaypoint,
  };
}
