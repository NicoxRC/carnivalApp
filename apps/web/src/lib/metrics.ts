import { apiUrl } from "@/lib/api/client";
import type { MetricType } from "@/lib/types";

export function countMetric(id: string, type: MetricType) {
  try {
    void fetch(apiUrl("/api/businesses/event"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, type }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {}
}
