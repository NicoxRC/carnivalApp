import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LoginForm } from "@/components/LoginForm";
import { json, mockFetch } from "@/test/api";

const USER = { id: "u1", email: "ana@example.com", name: "Ana", roles: ["reporter"], permissions: ["positions:own"], post: "head" };

function fillAndSend() {
  fireEvent.change(screen.getByLabelText("Correo"), { target: { value: " ana@example.com " } });
  fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "secret-pass-1" } });
  fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
}

describe("LoginForm", () => {
  it("logs in, keeps the session and hands over the user", async () => {
    const calls = mockFetch(() => json({ token: "jwt", expiresAt: Date.now() + 60_000, user: USER }));
    const loggedIn = vi.fn();
    render(<LoginForm tone="light" expired={false} onLoggedIn={loggedIn} />);

    fillAndSend();

    await waitFor(() => expect(loggedIn).toHaveBeenCalledWith(USER));
    expect(calls[0].body).toEqual({ email: "ana@example.com", password: "secret-pass-1" });
    expect(JSON.parse(localStorage.getItem("sed:session") ?? "{}").token).toBe("jwt");
  });

  it("shows the backend's message as it comes, and says when there is no connection", async () => {
    mockFetch(() => json({ error: "Correo o contraseña incorrectos." }, 401));
    const { unmount } = render(<LoginForm tone="dark" expired={false} onLoggedIn={() => undefined} />);
    fillAndSend();
    expect(await screen.findByText("Correo o contraseña incorrectos.")).toBeTruthy();
    unmount();

    mockFetch(() => Promise.reject(new TypeError("offline")));
    render(<LoginForm tone="dark" expired={false} onLoggedIn={() => undefined} />);
    fillAndSend();
    expect(await screen.findByText("Sin conexión. Intentá otra vez cuando tengas señal.")).toBeTruthy();
  });

  it("says the session expired when it sends someone back", () => {
    render(<LoginForm tone="light" expired onLoggedIn={() => undefined} />);
    expect(screen.getByText("Tu sesión venció. Entrá otra vez.")).toBeTruthy();
  });
});
