"use client";

import { useState } from "react";

import { api, failureText, INPUT_CLASS, POST_COLOR, POST_NAME, SecondaryButton, useTeam, type Can } from "@/components/admin/common";
import { timeAgo } from "@/lib/format";
import { useClock } from "@/lib/hooks/useParadeState";
import { POSTS, type Post, type Role, type TeamUser } from "@/lib/types";

const ROLE_LABEL: Record<Exclude<Role, "ingest">, { name: string; help: string }> = {
  admin: { name: "Admin", help: "todo" },
  coordinator: { name: "Coordinación", help: "el desfile en vivo, avisos, corregir puntos" },
  editor: { name: "Edición", help: "programación, comercios y sus números" },
  moderator: { name: "Moderación", help: "fotos" },
  reporter: { name: "Reportero", help: "camina con el desfile" },
};
const EDITABLE_ROLES = Object.keys(ROLE_LABEL) as (keyof typeof ROLE_LABEL)[];

type Draft = { email: string; name: string; password: string; roles: Role[]; post: Post | null };
const EMPTY: Draft = { email: "", name: "", password: "", roles: ["reporter"], post: "head" };

export function UsersAdmin({ onExpired, can }: { onExpired: () => void; can: Can }) {
  const manage = can("users:manage");
  const { team, error, reload } = useTeam(onExpired);
  const now = useClock(15_000);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  const answer = (r: { ok: true } | { ok: false; error: string; status: number }) => {
    if (r.ok) return true;
    if (r.status === 401) onExpired();
    setFormError(failureText(r));
    return false;
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreated(null);
    const body = { ...draft, email: draft.email.trim(), post: draft.roles.includes("reporter") ? draft.post : null };
    if (answer(await api("/api/admin/users", { method: "POST", body: JSON.stringify(body) }))) {
      setFormError(null);
      setCreated(`${body.name} ya puede entrar con ${body.email} y la contraseña que pusiste.`);
      setDraft(EMPTY);
      void reload();
    }
  };

  const change = async (u: TeamUser, changes: Record<string, unknown>) => {
    if (answer(await api(`/api/admin/users/${encodeURIComponent(u.id)}`, { method: "PATCH", body: JSON.stringify(changes) }))) {
      setFormError(null);
      void reload();
    }
  };

  const newPassword = (u: TeamUser) => {
    const password = prompt(`Nueva contraseña para ${u.name} (al menos 10 caracteres):`);
    if (password) void change(u, { password });
  };

  const remove = async (u: TeamUser) => {
    if (!confirm(`¿Borrar a ${u.name}? Si solo no viene este año, mejor desactivalo.`)) return;
    if (answer(await api(`/api/admin/users/${encodeURIComponent(u.id)}`, { method: "DELETE" }))) void reload();
  };

  const toggleRole = (roles: Role[], role: Role) =>
    roles.includes(role) ? roles.filter((r) => r !== role) : [...roles, role];

  return (
    <div className="space-y-5">
      {manage && (
        <form onSubmit={create} className="rounded-3xl bg-white p-5 shadow-sm">
          <p className="text-[15px] font-extrabold text-ink">Agregar persona del equipo</p>
          <p className="mt-1 text-[13px] text-ink-3">
            Cada persona entra en <b>/reporter</b> o <b>/admin</b> con su correo y su contraseña. Conviene
            tener un suplente por puesto: mientras el titular manda, el suplente queda de respaldo, y si el
            titular se calla un minuto, el suplente toma el puesto solo.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Nombre"
              aria-label="Nombre"
              required
              className={`${INPUT_CLASS} mt-0`}
            />
            <input
              type="email"
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              placeholder="Correo"
              aria-label="Correo"
              autoComplete="off"
              required
              className={`${INPUT_CLASS} mt-0`}
            />
            <input
              type="password"
              value={draft.password}
              onChange={(e) => setDraft({ ...draft, password: e.target.value })}
              placeholder="Contraseña inicial"
              aria-label="Contraseña inicial"
              autoComplete="new-password"
              required
              className={`${INPUT_CLASS} mt-0`}
            />
          </div>
          <fieldset className="mt-4">
            <legend className="text-sm font-bold text-ink">Roles</legend>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
              {EDITABLE_ROLES.map((role) => (
                <label key={role} className="flex items-center gap-2 text-[14px] text-ink-2">
                  <input
                    type="checkbox"
                    checked={draft.roles.includes(role)}
                    onChange={() => setDraft({ ...draft, roles: toggleRole(draft.roles, role) })}
                  />
                  <span>
                    <b className="text-ink">{ROLE_LABEL[role].name}</b> · {ROLE_LABEL[role].help}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {draft.roles.includes("reporter") && (
              <select
                value={draft.post ?? "head"}
                onChange={(e) => setDraft({ ...draft, post: e.target.value as Post })}
                aria-label="Puesto"
                className="rounded-xl border border-line-3 bg-white px-3 py-2.5 text-ink"
              >
                {POSTS.map((p) => (
                  <option key={p} value={p}>
                    {POST_NAME[p]}
                  </option>
                ))}
              </select>
            )}
            <button
              type="submit"
              disabled={!draft.name.trim() || !draft.email.trim() || !draft.password || draft.roles.length === 0}
              className="rounded-full bg-ink px-5 py-2.5 font-bold text-paper disabled:opacity-40"
            >
              Crear
            </button>
          </div>
          {created ? <p className="mt-3 text-sm font-semibold text-ok">{created}</p> : null}
        </form>
      )}

      {formError ?? error ? <p className="text-sm font-semibold text-alert">{formError ?? error}</p> : null}

      <section className="overflow-hidden rounded-3xl bg-white shadow-sm">
        {team === null ? (
          <p className="p-5 text-sm text-ink-3">Cargando…</p>
        ) : team.length === 0 ? (
          <p className="p-5 text-sm text-ink-3">Todavía no hay nadie.</p>
        ) : (
          <ul className="divide-y divide-line">
            {team.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <span className={`size-3 shrink-0 rounded-full ${u.post ? POST_COLOR[u.post] : "bg-line-3"}`} aria-hidden />
                <div className="min-w-48 flex-1">
                  <p className={`font-bold ${u.active ? "text-ink" : "text-ink-4 line-through"}`}>
                    {u.name} <span className="font-normal text-ink-3">· {u.email}</span>
                  </p>
                  <p className="text-[13px] text-ink-3">
                    {u.roles.map((r) => (r === "ingest" ? "Cuenta de servicio" : ROLE_LABEL[r].name)).join(", ")}
                    {u.post ? ` · ${POST_NAME[u.post]}` : ""}
                    {u.roles.includes("reporter")
                      ? u.lastSignalAt
                        ? ` · última señal ${timeAgo(u.lastSignalAt, now)}`
                        : " · nunca ha reportado"
                      : ""}
                  </p>
                </div>
                {manage && (
                  <>
                    {u.roles.includes("reporter") && (
                      <select
                        value={u.post ?? "head"}
                        onChange={(e) => void change(u, { post: e.target.value })}
                        aria-label={`Puesto de ${u.name}`}
                        className="rounded-lg border border-line-3 bg-white px-2 py-1.5 text-[14px] text-ink"
                      >
                        {POSTS.map((p) => (
                          <option key={p} value={p}>
                            {POST_NAME[p]}
                          </option>
                        ))}
                      </select>
                    )}
                    <SecondaryButton onClick={() => void change(u, { active: !u.active })}>
                      {u.active ? "Desactivar" : "Activar"}
                    </SecondaryButton>
                    <SecondaryButton onClick={() => newPassword(u)}>Cambiar contraseña</SecondaryButton>
                    <SecondaryButton danger onClick={() => void remove(u)}>
                      Borrar
                    </SecondaryButton>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
