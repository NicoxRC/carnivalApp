import { requestApi } from "@/lib/api/client";
import { obj, str } from "@/lib/api/parse";

const KEY = "sed:signed-device";

let inFlight: Promise<string | null> | null = null;

export function getDevice(): Promise<string | null> {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) return Promise.resolve(saved);
  } catch {}
  return (inFlight ??= requestApi("/api/device", { method: "POST" })
    .then((r) => r.json())
    .then((json: unknown) => {
      const device = str(obj(json, "the device"), "device");
      try {
        localStorage.setItem(KEY, device);
      } catch {}
      return device;
    })
    .catch(() => null)
    .finally(() => {
      inFlight = null;
    }));
}

export function forgetDevice() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
