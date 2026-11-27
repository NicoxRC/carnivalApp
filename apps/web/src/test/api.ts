import { vi } from "vitest";

export type Route = (url: URL, init: RequestInit) => Response | Promise<Response>;

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export function mockFetch(route: Route) {
  const calls: { method: string; path: string; body: unknown; headers: Headers }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, "http://localhost:8000");
    const body = typeof init.body === "string" ? JSON.parse(init.body) : init.body;
    calls.push({ method: init.method ?? "GET", path: url.pathname, body, headers: new Headers(init.headers) });
    return route(url, init);
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

export function logIn(permissions: string[] = []) {
  localStorage.setItem("sed:session", JSON.stringify({ token: "test-token", expiresAt: Date.now() + 3_600_000 }));
  return {
    id: "u1",
    email: "ana@example.com",
    name: "Ana",
    roles: [],
    permissions,
    post: null,
  };
}

export class FakeEventSource {
  static last: FakeEventSource | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) {
    FakeEventSource.last = this;
  }
  close() {}
  emit(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}
