"use client";

import { useCallback, useEffect, useState } from "react";

import type { SessionUser } from "@/lib/api/auth";
import { clearSession, readMe } from "@/lib/session";

export type SessionState =
  | { state: "loading" }
  | { state: "out"; expired: boolean }
  | { state: "offline" }
  | { state: "in"; user: SessionUser };

export function useSession() {
  const [session, setSession] = useState<SessionState>({ state: "loading" });

  const load = useCallback(() => {
    readMe()
      .then((user) => setSession(user ? { state: "in", user } : { state: "out", expired: false }))
      .catch(() => setSession({ state: "offline" }));
  }, []);

  useEffect(load, [load]);

  const loggedIn = useCallback((user: SessionUser) => setSession({ state: "in", user }), []);
  const logOut = useCallback(() => {
    clearSession();
    setSession({ state: "out", expired: false });
  }, []);
  const expired = useCallback(() => {
    clearSession();
    setSession({ state: "out", expired: true });
  }, []);

  return { session, retry: load, loggedIn, logOut, expired };
}
