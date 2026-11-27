export type Obj = Record<string, unknown>;

function invalid(detail: string): Error {
  return new Error(`Invalid API response: ${detail}.`);
}

export function obj(v: unknown, field: string): Obj {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Obj;
  throw invalid(`${field} is not an object`);
}

export function list(v: unknown, field: string): unknown[] {
  if (Array.isArray(v)) return v;
  throw invalid(`${field} is not a list`);
}

export function str(o: Obj, field: string): string {
  const v = o[field];
  if (typeof v === "string") return v;
  throw invalid(`missing ${field}`);
}

export function strOrNull(o: Obj, field: string): string | null {
  const v = o[field];
  if (v === null || v === undefined) return null;
  return str(o, field);
}

export function num(o: Obj, field: string): number {
  const v = o[field];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  throw invalid(`missing ${field}`);
}

export function numOrNull(o: Obj, field: string): number | null {
  const v = o[field];
  if (v === null || v === undefined) return null;
  return num(o, field);
}

export function bool(o: Obj, field: string): boolean {
  const v = o[field];
  if (typeof v === "boolean") return v;
  throw invalid(`missing ${field}`);
}

export function oneOf<T extends string>(values: readonly T[], o: Obj, field: string): T {
  const v = str(o, field);
  if ((values as readonly string[]).includes(v)) return v as T;
  throw invalid(`unknown ${field} «${v}»`);
}

export function oneOfOrNull<T extends string>(values: readonly T[], o: Obj, field: string): T | null {
  return o[field] === null || o[field] === undefined ? null : oneOf(values, o, field);
}

export function withoutInvalid<T>(items: unknown[], parse: (v: unknown) => T, what: string): T[] {
  const parsed: T[] = [];
  for (const item of items) {
    try {
      parsed.push(parse(item));
    } catch (error) {
      console.warn(`Dropping ${what}:`, error instanceof Error ? error.message : error, item);
    }
  }
  return parsed;
}
