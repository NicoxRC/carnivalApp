import { bool, list, num, obj, oneOfOrNull, str } from "@/lib/api/parse";
import { POSTS, type Post } from "@/lib/types";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  roles: string[];
  permissions: string[];
  post: Post | null;
}

export interface Session {
  token: string;
  expiresAt: number;
  user: SessionUser;
}

function strings(v: unknown, field: string): string[] {
  return list(v, field).map((item) => {
    if (typeof item !== "string") throw new Error(`Invalid API response: ${field} has a non-text value.`);
    return item;
  });
}

export function parseSessionUser(json: unknown): SessionUser {
  const o = obj(json, "the user");
  return {
    id: str(o, "id"),
    email: str(o, "email"),
    name: str(o, "name"),
    roles: strings(o.roles, "roles"),
    permissions: strings(o.permissions, "permissions"),
    post: oneOfOrNull(POSTS, o, "post"),
  };
}

export function parseSession(json: unknown): Session {
  const o = obj(json, "the session");
  return { token: str(o, "token"), expiresAt: num(o, "expiresAt"), user: parseSessionUser(o.user) };
}

export interface PositionsResult {
  saved: number;
  discarded: number;
  waiting: boolean;
  serverTs: number;
}

export function parsePositionsResult(json: unknown): PositionsResult {
  const o = obj(json, "the positions answer");
  return {
    saved: num(o, "saved"),
    discarded: num(o, "discarded"),
    waiting: bool(o, "waiting"),
    serverTs: num(o, "serverTs"),
  };
}
