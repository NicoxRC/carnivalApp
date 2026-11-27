import type {
  BusinessCategory,
  ServiceCategory,
  OfferTiming,
  BusinessPlan,
} from "@/lib/types";

export const BUSINESS_CATEGORIES: Record<BusinessCategory, string> = {
  restaurant: "Restaurante",
  tasca: "Tasca",
  cafe: "Café",
  ice_cream: "Heladería",
  bakery: "Panadería",
  shop: "Tienda",
  bar: "Bar",
  pharmacy: "Droguería",
};

export const SERVICE_CATEGORIES: Record<ServiceCategory, string> = {
  toilet: "Baños",
  water: "Punto de hidratación",
  first_aid: "Primeros auxilios",
  police: "Policía",
  road_closure: "Cierre vial",
};

export function isService(category: string): category is ServiceCategory {
  return category in SERVICE_CATEGORIES;
}

export function categoryName(category: string): string {
  return (
    (BUSINESS_CATEGORIES as Record<string, string>)[category] ??
    (SERVICE_CATEGORIES as Record<string, string>)[category] ??
    "Sitio"
  );
}

export const BUSINESS_PLANS: Record<BusinessPlan, string> = {
  basic: "Básico",
  featured: "Destacado",
};

export const OFFER_TIMINGS: Record<OfferTiming, string> = {
  always: "Todo el día",
  before: "Solo antes de que pase el desfile",
  after: "Solo después de que pase el desfile",
};
