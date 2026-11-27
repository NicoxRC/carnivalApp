import { bool, list, num, obj, oneOf, withoutInvalid } from "@/lib/api/parse";
import { CROWD_LEVELS, type Density, type DensityBin } from "@/lib/density";

function bin(v: unknown): DensityBin {
  const o = obj(v, "bins[]");
  return {
    bin: num(o, "bin"),
    fromM: num(o, "fromM"),
    toM: num(o, "toM"),
    count: num(o, "count"),
    level: oneOf(CROWD_LEVELS, o, "level"),
  };
}

export function parseDensity(json: unknown): Density {
  const o = obj(json, "the density");
  return {
    bins: withoutInvalid(list(o.bins, "bins"), bin, "a stretch"),
    total: num(o, "total"),
    enough: bool(o, "enough"),
    windowMin: num(o, "windowMin"),
    serverTs: num(o, "serverTs"),
  };
}
