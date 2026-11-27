import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useParadeState } from "@/lib/hooks/useParadeState";
import { FakeEventSource, json, mockFetch } from "@/test/api";

function stateApi(serverTs: number, headMetres: number) {
  return {
    paradeId: "d31-1",
    name: "Desfile de Años Viejos",
    state: "in_progress",
    date: "2026-12-31",
    startTime: "14:00",
    courseId: "provisional-pasto-course",
    positions: { head: { post: "head", lat: 1.21, lng: -77.28, metres: headMetres, accuracyM: 8, ts: serverTs } },
    headHistory: [],
    announcements: [],
    serverTs,
  };
}

describe("useParadeState", () => {
  beforeEach(() => {
    FakeEventSource.last = null;
    vi.stubGlobal("EventSource", FakeEventSource);
  });

  it("reads the parade and goes live; the stream keeps it up to date", async () => {
    mockFetch(() => json(stateApi(1000, 500)));
    const { result } = renderHook(() => useParadeState());

    await waitFor(() => expect(result.current.connection).toBe("live"));
    expect(result.current.state?.positions.head?.metres).toBe(500);

    act(() => FakeEventSource.last?.emit(stateApi(2000, 800)));
    expect(result.current.state?.positions.head?.metres).toBe(800);
  });

  it("a value from the cache is not live and never overwrites a newer one", async () => {
    let answer = json(stateApi(1000, 500), 200, { "X-From-Cache": "1" });
    mockFetch(() => answer);
    const { result } = renderHook(() => useParadeState());

    await waitFor(() => expect(result.current.state).not.toBeNull());
    expect(result.current.connection).toBe("offline");

    act(() => FakeEventSource.last?.emit(stateApi(3000, 900)));
    expect(result.current.connection).toBe("live");

    answer = json(stateApi(2000, 600), 200, { "X-From-Cache": "1" });
    await act(async () => result.current.refresh());
    expect(result.current.state?.positions.head?.metres).toBe(900);
    expect(result.current.connection).toBe("retrying");
  });

  it("a 404 means there is no parade, not a network error", async () => {
    mockFetch(() => json({ error: "No hay desfile." }, 404));
    const { result } = renderHook(() => useParadeState());

    await waitFor(() => expect(result.current.connection).toBe("live"));
    expect(result.current.state).toBeNull();
  });

  it("without network and without a copy it says it is offline", async () => {
    mockFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    const { result } = renderHook(() => useParadeState());

    await waitFor(() => expect(result.current.connection).toBe("offline"));
  });
});
