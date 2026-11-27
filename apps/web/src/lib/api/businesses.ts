import { bool, list, num, obj, oneOf, oneOfOrNull, str, strOrNull, withoutInvalid } from "@/lib/api/parse";
import {
  BUSINESS_CATEGORY_IDS,
  BUSINESS_PLAN_IDS,
  OFFER_TIMING_IDS,
  SERVICE_CATEGORY_IDS,
  type Business,
  type MenuItem,
} from "@/lib/types";

const CATEGORIES = [...BUSINESS_CATEGORY_IDS, ...SERVICE_CATEGORY_IDS] as const;

function menuItem(v: unknown): MenuItem {
  const o = obj(v, "menu[]");
  return { name: str(o, "name"), price: str(o, "price") };
}

function business(v: unknown): Business {
  const o = obj(v, "businesses[]");
  return {
    id: str(o, "id"),
    name: str(o, "name"),
    category: oneOf(CATEGORIES, o, "category"),
    description: str(o, "description"),
    address: str(o, "address"),
    hours: str(o, "hours"),
    lat: num(o, "lat"),
    lng: num(o, "lng"),
    plan: oneOfOrNull(BUSINESS_PLAN_IDS, o, "plan"),
    offer: strOrNull(o, "offer"),
    offerTiming: oneOf(OFFER_TIMING_IDS, o, "offerTiming"),
    menu: list(o.menu, "menu").map(menuItem),
    whatsapp: strOrNull(o, "whatsapp"),
    link: strOrNull(o, "link"),
    visible: bool(o, "visible"),
  };
}

export type Metrics = Record<string, Record<string, number>>;

function metrics(v: unknown): Metrics {
  const result: Metrics = {};
  for (const [id, counters] of Object.entries(obj(v, "metrics"))) {
    const o = obj(counters, `metrics.${id}`);
    result[id] = Object.fromEntries(Object.keys(o).map((type) => [type, num(o, type)]));
  }
  return result;
}

export function parseAdminBusinesses(json: unknown): { businesses: Business[]; metrics: Metrics } {
  const o = obj(json, "the businesses");
  return {
    businesses: withoutInvalid(list(o.businesses, "businesses"), business, "a business"),
    metrics: o.metrics === undefined ? {} : metrics(o.metrics),
  };
}

export function parseBusinesses(json: unknown): Business[] {
  return withoutInvalid(list(obj(json, "the businesses").businesses, "businesses"), business, "a business");
}
