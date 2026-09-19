import { BRAND } from "./brand";

// The whole business lives in one business_config row; swap the row and the same agents work for
// another business. Royal Pawz USA is an excerpt of the real seed (prices in cents). The detailer and the
// meal-prep company are fictional: show them with an "Example" label.
export const EXAMPLE_CONFIGS: { id: string; label: string; business: string; config: Record<string, unknown> }[] = [
  {
    id: "royal-pawz",
    label: "Dog grooming",
    business: BRAND.showcase,
    config: {
      name: BRAND.showcase,
      hours: "7 days a week, 8am to 6pm",
      service_area_cities: ["Houston", "Pearland", "League City", "Missouri City", "Sugar Land", "Katy"],
      services: [
        {
          key: "royal_groom",
          label: "Royal Groom",
          base_cents: { small: 13000, medium: 16000, large: 19000, xl: 23000 },
        },
        {
          key: "royal_bath",
          label: "Royal Bath",
          base_cents: { small: 8000, medium: 10900, large: 12400, xl: 15000 },
        },
      ],
      coat_surcharge_cents: { short: 0, medium: 0, long: 1500, double: 2000 },
      addons: [{ key: "de_shed", label: "De-shed treatment", cents: 3000 }],
      tone: "Warm, brief, plain words, no emojis.",
      outbound: {
        audience: "pet-friendly apartment communities in Houston",
        offer: "A monthly on-site grooming day for residents, at no cost to the property.",
      },
    },
  },
  {
    id: "detailer",
    label: "Mobile detailing",
    business: "Northside Mobile Detail",
    config: {
      name: "Northside Mobile Detail",
      hours: "Mon–Sat, 7am–5pm",
      service_area_cities: ["Austin", "Round Rock", "Cedar Park", "Pflugerville"],
      size_guide: { small: "coupe", medium: "sedan", large: "SUV", xl: "truck or van" },
      services: [
        {
          key: "full_detail",
          label: "Full detail",
          base_cents: { small: 14900, medium: 17900, large: 21900, xl: 24900 },
        },
        {
          key: "wash_wax",
          label: "Wash and wax",
          base_cents: { small: 7900, medium: 8900, large: 9900, xl: 11900 },
        },
      ],
      addons: [
        { key: "pet_hair", label: "Pet hair removal", cents: 3500 },
        { key: "ceramic_spray", label: "Ceramic spray coat", cents: 4900 },
      ],
      tone: "Friendly and direct, one question at a time.",
      outbound: {
        audience: "office parks and car dealerships in North Austin",
        offer: "A monthly on-site detailing day for employees, at no cost to the property.",
      },
    },
  },
  {
    id: "meal-prep",
    label: "Meal prep",
    business: "Greenfork Meal Prep",
    config: {
      name: "Greenfork Meal Prep",
      hours: "Order by Thursday 8pm, delivered Sunday 9am–1pm",
      service_area_cities: ["Dallas", "Plano", "Richardson", "Irving"],
      size_guide: { small: "5 meals", medium: "10 meals", large: "15 meals", xl: "21 meals" },
      services: [
        {
          key: "classic_plan",
          label: "Classic weekly plan",
          base_cents: { small: 6500, medium: 11900, large: 16900, xl: 22900 },
        },
        {
          key: "protein_plan",
          label: "High-protein plan",
          base_cents: { small: 7500, medium: 13900, large: 19900, xl: 26900 },
        },
      ],
      addons: [
        { key: "breakfast", label: "Breakfast add-on", cents: 2500 },
        { key: "extra_protein", label: "Extra protein", cents: 1500 },
      ],
      tone: "Upbeat, short, no jargon.",
      outbound: {
        audience: "gyms and yoga studios in Dallas",
        offer: "A member discount and a free tasting day at your studio.",
      },
    },
  },
];
