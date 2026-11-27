import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AdminPanel } from "@/components/admin/AdminPanel";
import { json, logIn, mockFetch } from "@/test/api";

function asUserWith(permissions: string[]) {
  const user = logIn(permissions);
  mockFetch((url) => {
    if (url.pathname === "/api/auth/me") return json(user);
    if (url.pathname === "/api/admin/parades") return json({ parades: [], currentId: null });
    if (url.pathname === "/api/admin/events") return json({ events: [] });
    if (url.pathname === "/api/admin/businesses") return json({ businesses: [], metrics: {} });
    if (url.pathname === "/api/admin/photos") return json({ photos: [] });
    return json({}, 404);
  });
  render(<AdminPanel />);
}

const tabs = () => screen.getAllByRole("button").map((b) => b.textContent);

describe("AdminPanel", () => {
  it("an editor sees schedule and businesses, never users", async () => {
    asUserWith(["parades:edit", "schedule:edit", "businesses:edit", "metrics:view"]);

    expect(await screen.findByText("Programación")).toBeTruthy();
    expect(tabs()).toContain("Comercios");
    expect(tabs()).not.toContain("Usuarios");
    expect(tabs()).not.toContain("En vivo");
  });

  it("a moderator only sees the photos", async () => {
    asUserWith(["photos:moderate"]);

    expect(await screen.findByText("Fotos")).toBeTruthy();
    expect(tabs()).not.toContain("Programación");
    expect(tabs()).not.toContain("Comercios");
  });

  it("someone who only reports is told they have no access", async () => {
    asUserWith(["positions:own"]);

    expect(await screen.findByText(/no tiene acceso a la administración/)).toBeTruthy();
  });

  it("without a session it shows the login", async () => {
    mockFetch(() => json({}, 401));
    render(<AdminPanel />);

    expect(await screen.findByRole("button", { name: "Entrar" })).toBeTruthy();
  });
});
