"use client";

import { useState } from "react";

import type { SessionUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { logIn } from "@/lib/session";

const TONES = {
  dark: {
    input:
      "mt-2 w-full rounded-2xl border-2 border-ink-2 bg-[#202024] px-4 py-3.5 text-lg text-paper placeholder:text-ink-3 focus:border-paper focus:outline-none",
    label: "mt-6 block text-sm font-bold",
    error: "mt-3 text-sm font-semibold text-[#ff8a7a]",
    notice: "mt-3 rounded-2xl bg-[#3a2a12] px-4 py-3 text-sm font-semibold text-[#ffc61a]",
    button: "mt-6 w-full rounded-full bg-paper py-4 text-lg font-extrabold text-ink disabled:opacity-40",
  },
  light: {
    input:
      "mt-1.5 w-full rounded-xl border border-line-3 px-3 py-2.5 text-ink focus:border-ink focus:outline-none",
    label: "mt-5 block text-sm font-bold text-ink",
    error: "mt-2 text-sm font-semibold text-alert",
    notice: "mt-3 rounded-xl bg-paper px-3 py-2 text-sm font-semibold text-warn-text",
    button: "mt-5 w-full rounded-full bg-ink py-3 font-bold text-paper disabled:opacity-40",
  },
};

export function LoginForm({
  tone,
  expired,
  onLoggedIn,
}: {
  tone: keyof typeof TONES;
  expired: boolean;
  onLoggedIn: (user: SessionUser) => void;
}) {
  const style = TONES[tone];
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onLoggedIn(await logIn(email, password));
    } catch (failure) {
      setError(
        failure instanceof ApiError && !failure.message.startsWith("Error ")
          ? failure.message
          : failure instanceof ApiError
            ? "No se pudo entrar."
            : "Sin conexión. Intentá otra vez cuando tengas señal.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={send}>
      {expired && !error ? <p className={style.notice}>Tu sesión venció. Entrá otra vez.</p> : null}
      <label className={style.label} htmlFor="email">
        Correo
      </label>
      <input
        id="email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        required
        className={style.input}
      />
      <label className={style.label} htmlFor="password">
        Contraseña
      </label>
      <input
        id="password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
        required
        className={style.input}
      />
      {error ? <p className={style.error}>{error}</p> : null}
      <button type="submit" disabled={busy || !email || !password} className={style.button}>
        {busy ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
