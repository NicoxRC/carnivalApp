import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useReporting } from "@/lib/hooks/useReporting";
import { json, logIn, mockFetch } from "@/test/api";

let gpsFix: ((position: GeolocationPosition) => void) | null = null;

function giveFix(lat = 1.21, lng = -77.28, accuracy = 8) {
  act(() =>
    gpsFix?.({ coords: { latitude: lat, longitude: lng, accuracy } } as GeolocationPosition),
  );
}

function positionsAnswer(waiting = false, serverTs = Date.now()) {
  return json({ saved: waiting ? 0 : 1, discarded: waiting ? 1 : 0, waiting, serverTs });
}

describe("useReporting", () => {
  beforeEach(() => {
    gpsFix = null;
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        watchPosition: (ok: (position: GeolocationPosition) => void) => {
          gpsFix = ok;
          return 1;
        },
        clearWatch: () => undefined,
      },
    });
    logIn(["positions:own"]);
  });

  it("sends the first good fix with the session token and corrects the clock", async () => {
    const calls = mockFetch(() => positionsAnswer(false, Date.now() + 60_000));
    const { result } = renderHook(() => useReporting(() => undefined));

    act(() => result.current.start());
    giveFix();

    await waitFor(() => expect(result.current.lastSentAt).not.toBeNull());
    expect(calls[0].path).toBe("/api/positions");
    expect(calls[0].headers.get("Authorization")).toBe("Bearer test-token");
    expect(calls[0].body).toEqual([expect.objectContaining({ lat: 1.21, lng: -77.28, accuracyM: 8 })]);
    expect(result.current.network).toBe("ok");

    act(() => void result.current.imHere());
    await waitFor(() => expect(calls).toHaveLength(2));
    // The server is a minute ahead: the next point carries its clock.
    expect((calls[1].body as { ts: number }[])[0].ts).toBeGreaterThan(Date.now() + 50_000);
  });

  it("keeps the points without signal and sends them together when it comes back", async () => {
    let online = false;
    const calls = mockFetch(() => (online ? positionsAnswer() : Promise.reject(new TypeError("offline"))));
    const { result } = renderHook(() => useReporting(() => undefined));

    act(() => result.current.start());
    giveFix();
    await waitFor(() => expect(result.current.network).toBe("no_signal"));
    act(() => void result.current.imHere());
    await waitFor(() => expect(result.current.pending).toBe(2));
    expect(JSON.parse(localStorage.getItem("sed:reporter:queue") ?? "[]")).toHaveLength(2);

    online = true;
    act(() => window.dispatchEvent(new Event("online")));

    await waitFor(() => expect(result.current.pending).toBe(0));
    expect((calls.at(-1)?.body as unknown[]).length).toBe(2);
    expect(result.current.network).toBe("ok");
  });

  it("shows «de respaldo» when another reporter holds the post", async () => {
    mockFetch(() => positionsAnswer(true));
    const { result } = renderHook(() => useReporting(() => undefined));

    act(() => result.current.start());
    giveFix();

    await waitFor(() => expect(result.current.onHold).toBe(true));
  });

  it("drops a batch the server rejects (400) and ends the session on a 401", async () => {
    let status = 400;
    mockFetch(() => json({ error: "Datos inválidos." }, status));
    const expired = vi.fn();
    const { result } = renderHook(() => useReporting(expired));

    act(() => result.current.start());
    giveFix();
    await waitFor(() => expect(result.current.network).toBe("no_signal"));
    expect(result.current.pending).toBe(0);

    status = 401;
    act(() => void result.current.imHere());
    await waitFor(() => expect(expired).toHaveBeenCalled());
    expect(result.current.network).toBe("session_expired");
    expect(localStorage.getItem("sed:session")).toBeNull();
  });
});
