"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  binOfMetres,
  DENSITY_REPORT_INTERVAL_MS,
  type Density,
} from "@/lib/density";
import { ApiError, requestApi } from "@/lib/api/client";
import { parseDensity } from "@/lib/api/density";
import { forgetDevice, getDevice } from "@/lib/device";

const SHARE_KEY = "sed:share-crowd";

export type SharePermission = "undecided" | "yes" | "no";

function readPreference(): SharePermission {
  try {
    const v = localStorage.getItem(SHARE_KEY);
    return v === "yes" || v === "no" ? v : "undecided";
  } catch {
    return "undecided";
  }
}

interface Result {
  density: Density | null;
  share: SharePermission;
  decideShare: (value: "yes" | "no") => void;
}

export function useDensity(
  active: boolean,
  userMetres: number | null,
): Result {
  const [density, setDensity] = useState<Density | null>(null);
  const [share, setShare] = useState<SharePermission>("undecided");
  const metres = useRef(userMetres);
  metres.current = userMetres;

  useEffect(() => {
    setShare(readPreference());
  }, []);

  const decideShare = useCallback((value: "yes" | "no") => {
    try {
      localStorage.setItem(SHARE_KEY, value);
    } catch {}
    setShare(value);
  }, []);

  useEffect(() => {
    if (!active) return;
    let alive = true;

    const read = async () => {
      try {
        const r = await requestApi("/api/density", { cache: "no-store" });
        const d = parseDensity(await r.json());
        if (alive) setDensity(d);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          if (alive) setDensity(null);
        } else if (!(error instanceof TypeError)) {
          console.warn("Could not read the crowd map:", error);
        }
      }
    };

    void read();
    const t = setInterval(read, 45_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [active]);

  useEffect(() => {
    if (share !== "yes") return;

    const send = async () => {
      const m = metres.current;
      if (m === null) return;
      try {
        const device = await getDevice();
        if (!device) return;
        await requestApi("/api/density", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ device, bin: binOfMetres(m) }),
        });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) forgetDevice();
      }
    };

    void send();
    const t = setInterval(send, DENSITY_REPORT_INTERVAL_MS);
    return () => clearInterval(t);
  }, [share]);

  return { density, share, decideShare };
}
