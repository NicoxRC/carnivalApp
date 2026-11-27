import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PhotosScreen } from "@/components/PhotosScreen";
import { setLanguage } from "@/lib/i18n";
import { json, mockFetch } from "@/test/api";

vi.mock("@/lib/image", () => ({ shrinkPhoto: async () => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 1, 2])]) }));

const GRANT = {
  id: "p1",
  uploadUrl: "https://bucket.example/incoming/p1.jpg?signed",
  contentType: "image/jpeg",
  token: "t1",
  expiresAt: Date.now() + 300_000,
};

function routes(start: () => Response) {
  return mockFetch((url) => {
    if (url.pathname === "/api/photos") return json({ photos: [] });
    if (url.pathname === "/api/device") return json({ device: "dev.sig" });
    if (url.pathname === "/api/photos/uploads") return start();
    if (url.hostname === "bucket.example") return new Response(null, { status: 200 });
    if (url.pathname === "/api/photos/uploads/p1/done") return json({ ok: true, id: "p1" }, 201);
    return json({}, 404);
  });
}

function choosePhoto(container: HTMLElement) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(["x"], "photo.jpg", { type: "image/jpeg" })] } });
}

describe("PhotosScreen", () => {
  beforeEach(() => act(() => setLanguage("es")));

  it("uploads in three steps: permission, PUT to the bucket, done", async () => {
    const calls = routes(() => json(GRANT, 201));
    const { container } = render(<PhotosScreen />);

    choosePhoto(container);

    expect(await screen.findByText("¡Recibida! Sale en el muro cuando el equipo la apruebe.")).toBeTruthy();
    const steps = calls.filter((c) => c.path !== "/api/photos").map((c) => `${c.method} ${c.path}`);
    expect(steps).toEqual([
      "POST /api/device",
      "POST /api/photos/uploads",
      "PUT /incoming/p1.jpg",
      "POST /api/photos/uploads/p1/done",
    ]);
    expect(calls.find((c) => c.path === "/api/photos/uploads")?.body).toEqual({ device: "dev.sig", size: 5 });
    expect(calls.find((c) => c.method === "PUT")?.headers.get("Content-Type")).toBe("image/jpeg");
    expect(calls.at(-1)?.body).toEqual({ token: "t1", metres: null });
  });

  it("shows the backend's message when it turns the photo down", async () => {
    routes(() => json({ error: "Ya subiste varias fotos. Probá más tarde." }, 429));
    const { container } = render(<PhotosScreen />);

    choosePhoto(container);

    expect(await screen.findByText("Ya subiste varias fotos. Probá más tarde.")).toBeTruthy();
  });

  it("forgets a device the backend does not know", async () => {
    localStorage.setItem("sed:signed-device", "old.sig");
    routes(() => json({ error: "Dispositivo no reconocido." }, 401));
    const { container } = render(<PhotosScreen />);

    choosePhoto(container);

    await waitFor(() => expect(localStorage.getItem("sed:signed-device")).toBeNull());
  });
});
