export const DEV_API = "http://localhost:8000";

export function resolveApiBase(value: string | undefined, isDev: boolean): string | null {
  const clean = value?.trim().replace(/\/+$/, "");
  if (clean) return clean;
  return isDev ? DEV_API : null;
}

export const API_BASE = resolveApiBase(process.env.NEXT_PUBLIC_API_URL, process.env.NODE_ENV !== "production");

export function apiUrl(path: string, base: string | null = API_BASE): string {
  if (!base) throw new Error("NEXT_PUBLIC_API_URL is missing: the web does not know where the backend is.");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function requestApi(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(apiUrl(path), init);
  if (response.ok) return response;
  let message = `Error ${response.status}`;
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string") {
      message = (body as { error: string }).error;
    }
  } catch {}
  throw new ApiError(response.status, message);
}
