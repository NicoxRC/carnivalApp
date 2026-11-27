"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, requestApi, apiUrl } from "@/lib/api/client";
import { parseParadeState } from "@/lib/api/state";
import type { ParadeState } from "@/lib/types";

export type Connection = "connecting" | "live" | "retrying" | "offline";

interface Result {
  state: ParadeState | null;
  connection: Connection;
  clockOffsetMs: number;
  receivedAt: number | null;
  refresh: () => void;
}

const RETRY_BASE_MS = 1500;
const RETRY_MAX_MS = 20_000;

export function useParadeState(): Result {
  const [state, setState] = useState<ParadeState | null>(null);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [clockOffsetMs, setClockOffset] = useState(0);
  const [receivedAt, setReceivedAt] = useState<number | null>(null);
  const [reopen, setReopen] = useState(0);

  const attempts = useRef(0);
  const last = useRef<ParadeState | null>(null);
  const streamParadeId = useRef<string | null>(null);

  const apply = useCallback((incoming: ParadeState, fromCache = false) => {
    const previous = last.current;
    if (previous && previous.paradeId === incoming.paradeId && incoming.serverTs < previous.serverTs) {
      if (fromCache) setConnection((c) => (c === "live" ? "retrying" : c));
      return;
    }
    last.current = incoming;
    setState(incoming);

    if (fromCache) {
      setConnection((c) => (c === "live" ? "retrying" : c === "connecting" ? "offline" : c));
      return;
    }
    setClockOffset(incoming.serverTs - Date.now());
    setReceivedAt(Date.now());
    setConnection("live");
    attempts.current = 0;
    if (streamParadeId.current && streamParadeId.current !== incoming.paradeId) {
      streamParadeId.current = null;
      setReopen((n) => n + 1);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const r = await requestApi("/api/state", { cache: "no-store" });
      apply(parseParadeState(await r.json()), r.headers.get("X-From-Cache") === "1");
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setConnection("live");
        return;
      }
      setConnection((c) => (c === "live" ? "retrying" : "offline"));
    }
  }, [apply]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    let es: EventSource | null = null;
    let reconnect: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = () => {
      if (closed) return;
      try {
        es = new EventSource(apiUrl("/api/state/stream"));
      } catch {
        setConnection("offline");
        return;
      }

      es.onmessage = (ev) => {
        try {
          const incoming = parseParadeState(JSON.parse(ev.data));
          streamParadeId.current = incoming.paradeId;
          apply(incoming);
        } catch {}
      };

      es.onerror = () => {
        es?.close();
        if (closed) return;
        attempts.current += 1;
        setConnection(attempts.current > 2 ? "offline" : "retrying");
        const delay = Math.min(RETRY_BASE_MS * 2 ** (attempts.current - 1), RETRY_MAX_MS);
        reconnect = setTimeout(connect, delay + Math.random() * 1000);
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnect) clearTimeout(reconnect);
      es?.close();
    };
  }, [apply, reopen]);

  useEffect(() => {
    let ticks = 0;
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      ticks++;
      if (receivedAt === null || Date.now() - receivedAt > 30_000 || ticks % 8 === 0) void refresh();
    }, 15_000);
    return () => clearInterval(t);
  }, [refresh, receivedAt]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  return { state, connection, clockOffsetMs, receivedAt, refresh };
}

export function useClock(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
