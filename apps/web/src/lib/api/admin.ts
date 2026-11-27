import { bool, list, num, numOrNull, obj, oneOf, oneOfOrNull, str } from "@/lib/api/parse";
import { POSTS, ROLES, type Role, type TeamUser } from "@/lib/types";

export function parseTeamUser(v: unknown): TeamUser {
  const o = obj(v, "the user");
  return {
    id: str(o, "id"),
    email: str(o, "email"),
    name: str(o, "name"),
    roles: list(o.roles, "roles").map((role) => oneOf(ROLES, { role }, "role") as Role),
    post: oneOfOrNull(POSTS, o, "post"),
    active: bool(o, "active"),
    lastSignalAt: numOrNull(o, "lastSignalAt"),
    createdAt: num(o, "createdAt"),
  };
}

export function parseTeam(json: unknown): TeamUser[] {
  return list(json, "the users").map(parseTeamUser);
}
