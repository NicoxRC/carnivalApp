"use client";

import { useEffect, useState } from "react";

import { requestApi } from "@/lib/api/client";
import { parseSchedule, type Schedule } from "@/lib/api/schedule";

export function useSchedule(): Schedule | null {
  const [p, setSchedule] = useState<Schedule | null>(null);

  useEffect(() => {
    let alive = true;
    const read = () =>
      requestApi("/api/schedule")
        .then((r) => r.json())
        .then((json) => {
          if (alive) setSchedule(parseSchedule(json));
        })
        .catch((error: unknown) => {
          if (!(error instanceof TypeError)) console.warn("Could not read the schedule:", error);
        });
    void read();
    const onVisible = () => {
      if (document.visibilityState === "visible") void read();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return p;
}
