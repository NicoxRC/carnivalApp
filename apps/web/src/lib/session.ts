import { ApiError, requestApi } from "@/lib/api/client";
import { parseSession, parseSessionUser, type SessionUser } from "@/lib/api/auth";

const KEY = "sed:session";

interface Stored {
  token: string;
  expiresAt: number;
}

export function readToken(now = Date.now()): string | null {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "null") as Stored | null;
    if (stored && typeof stored.token === "string" && stored.expiresAt > now) return stored.token;
  } catch {}
  return null;
}

export function clearSession() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

export async function logIn(email: string, password: string): Promise<SessionUser> {
  const r = await requestApi("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim(), password }),
  });
  const session = parseSession(await r.json());
  try {
    localStorage.setItem(KEY, JSON.stringify({ token: session.token, expiresAt: session.expiresAt }));
  } catch {}
  return session.user;
}

export async function authRequest(path: string, init?: RequestInit): Promise<Response> {
  const token = readToken();
  if (!token) throw new ApiError(401, "Tu sesión venció. Entrá otra vez.");
  try {
    return await requestApi(path, {
      cache: "no-store",
      ...init,
      headers: { ...init?.headers, Authorization: `Bearer ${token}` },
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) clearSession();
    throw error;
  }
}

export async function readMe(): Promise<SessionUser | null> {
  if (!readToken()) return null;
  try {
    return parseSessionUser(await (await authRequest("/api/auth/me")).json());
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}
