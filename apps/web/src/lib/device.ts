const KEY = "sed:dispositivo-firmado";

let inFlight: Promise<string | null> | null = null;

export function getDevice(): Promise<string | null> {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) return Promise.resolve(saved);
  } catch {}
  return (inFlight ??= fetch("/api/dispositivo", { method: "POST" })
    .then((r) => (r.ok ? (r.json() as Promise<{ device: string }>) : null))
    .then((d) => {
      if (!d) return null;
      try {
        localStorage.setItem(KEY, d.device);
      } catch {}
      return d.device;
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
