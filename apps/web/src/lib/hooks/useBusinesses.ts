"use client";

import { useEffect, useState } from "react";

import { requestApi } from "@/lib/api/client";
import { parseBusinesses } from "@/lib/api/businesses";
import type { Business } from "@/lib/types";

export function useBusinesses(active: boolean): Business[] {
  const [businesses, setBusinesses] = useState<Business[]>([]);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    requestApi("/api/businesses")
      .then((r) => r.json())
      .then((json) => {
        if (alive) setBusinesses(parseBusinesses(json));
      })
      .catch((error: unknown) => {
        if (!(error instanceof TypeError)) console.warn("Could not read the businesses:", error);
      });
    return () => {
      alive = false;
    };
  }, [active]);

  return businesses;
}
