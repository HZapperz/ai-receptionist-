import { EXAMPLE_CONFIGS } from "@/lib/example-configs";

// The wizard's working copy of the business. It starts from business_config and lives only in
// React state: the onboarding is a demo and never writes anywhere.
export const SIZES = ["small", "medium", "large", "xl"] as const;
export type Size = (typeof SIZES)[number];

export type Service = { label: string; prices: Record<Size, string> };

export type Draft = {
  name: string;
  type: string;
  website: string;
  city: string;
  phone: string;
  hours: string;
  tone: string;
  sizeGuide: Record<string, unknown>;
  services: Service[];
  addons: { label: string; price: string }[];
};

export const BUSINESS_TYPES = ["Mobile pet grooming", "Auto detailing", "Meal prep", "Home cleaning", "Other"];

type Json = Record<string, unknown>;

const text = (v: unknown) => (typeof v === "string" ? v : "");
const objects = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is Json => typeof x === "object" && x !== null) : []);
// The inputs show dollars: 16000 -> "160", 10950 -> "109.50".
const dollars = (cents: unknown) => (typeof cents === "number" ? (cents / 100).toFixed(cents % 100 ? 2 : 0) : "");

// From a business_config row's data, or from the showcase excerpt when the read came back empty
// (for example before 0003_auth_read.sql is applied and a signed-in browser sees no rows).
export function toDraft(data: unknown): Draft {
  const row = data && typeof data === "object" ? (data as Json) : {};
  const c = objects(row.services).length ? row : EXAMPLE_CONFIGS[0].config;
  const cities = Array.isArray(c.service_area_cities) ? c.service_area_cities : [];
  return {
    name: text(c.name),
    type: BUSINESS_TYPES[0],
    website: text(c.website),
    city: text(cities[0]),
    phone: text(c.phone),
    hours: text(c.hours),
    tone: text(c.tone),
    sizeGuide: c.size_guide && typeof c.size_guide === "object" ? (c.size_guide as Json) : {},
    services: objects(c.services).map((s) => {
      const base = s.base_cents && typeof s.base_cents === "object" ? (s.base_cents as Json) : {};
      return {
        label: text(s.label),
        prices: { small: dollars(base.small), medium: dollars(base.medium), large: dollars(base.large), xl: dollars(base.xl) },
      };
    }),
    addons: objects(c.addons).map((a) => ({ label: text(a.label), price: dollars(a.cents) })),
  };
}
