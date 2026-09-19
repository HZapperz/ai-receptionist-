-- Royal Pawz business facts. Every agent reads this one row; nobody writes it at runtime.
-- This statement can be run alone to refresh the config (for example after a price change).
-- Keep the JSON free of single quotes, or double them.
insert into business_config (id, data) values (1, '{
  "name": "Royal Pawz",
  "phone": "(833) 302-8947",
  "website": "royalpawzusa.com",
  "mailing_address": "TODO",
  "hours": "7 days a week, 8am to 6pm",
  "service_area_cities": ["Houston", "Pearland", "League City", "Missouri City", "Sugar Land", "Katy",
                          "Bellaire", "Richmond", "Rosenberg", "Manvel", "Fresno", "Rosharon",
                          "Dickinson", "Humble", "Spring", "Cypress"],
  "service_area_zips": ["77082", "77573", "77584", "77459", "77583", "77024"],
  "services": [
    {"key": "royal_groom", "label": "Royal Groom",
     "description": "Our full groom, done in our mobile grooming van parked at your home: a bath, a haircut and all the extras.",
     "includes": ["bath and brush", "haircut and trim", "nail trim and buffing", "ear cleaning",
                  "gland expression", "teeth cleaning"],
     "minutes_per_dog": 75,
     "base_cents": {"small": 13000, "medium": 16000, "large": 19000, "xl": 23000}},
    {"key": "royal_bath", "label": "Royal Bath",
     "description": "A bath and tidy-up with no haircut, done in our mobile grooming van parked at your home.",
     "includes": ["bath and brush", "nail trim", "ear cleaning", "gland expression"],
     "minutes_per_dog": 60,
     "base_cents": {"small": 8000, "medium": 10900, "large": 12400, "xl": 15000}}
  ],
  "coat_surcharge_cents": {"short": 0, "medium": 0, "long": 1500, "double": 2000},
  "addons": [
    {"key": "de_shed", "label": "De-shed treatment", "cents": 3000,
     "description": "Removes loose undercoat so there is less shedding at home. Best for double coats."}
  ],
  "size_guide": {"small": "under 20 lb", "medium": "20 to 50 lb", "large": "50 to 90 lb", "xl": "over 90 lb"},
  "coat_guide": {
    "short": "Short, smooth coats: labs, pit mixes, beagles, boxers",
    "medium": "Medium coats: spaniels, border collies",
    "long": "Long or curly coats that keep growing: doodles, shih tzus, yorkies, maltese, poodles",
    "double": "Thick double coats that shed: golden retrievers, huskies, german shepherds, pomeranians, corgis"
  },
  "not_offered": ["cats", "daycare", "flea treatment"],
  "price_note": "Prices are before tax.",
  "policies": "Proof of rabies vaccination is required before the appointment; it is not needed for puppies under 4 months. A photo of the rabies tag or a vet receipt works: upload it at royalpawzusa.com under My Pets, or text us a photo. Matted coats need a matted-coat release, which we send to e-sign before the groom. Payment is by card on file, charged after the service, with no deposit. Please give us as much notice as possible to cancel or reschedule, because we route the vans in advance. Nervous dogs are welcome: we go slowly and can send two groomers.",
  "tone": "Warm, brief, plain words, no emojis.",
  "outbound": {
    "audience": "pet-friendly apartment communities in Houston",
    "offer": "A monthly on-site grooming day for residents, at no cost to the property.",
    "cta": "Text us at the number below to pick a date.",
    "sender_name": "TODO"
  },
  "_notes": [
    "To confirm: coat surcharges (short and medium +$0, long +$15, double +$20).",
    "To confirm: xl prices (Royal Groom $230, Royal Bath $150).",
    "To confirm: size cutoffs (small under 20 lb, medium 20 to 50, large 50 to 90, xl over 90).",
    "To confirm: hours, 7 days a week, 8am to 6pm.",
    "mailing_address is TODO. Outbound email footers need a real one before any send."
  ]
}'::jsonb)
on conflict (id) do update set data = excluded.data;

-- two weeks of slots, three a day, capacity 2 (two vans), Houston time.
-- Safe to re-run: a start time that already has a slot is skipped.
insert into slots (starts_at, capacity)
select s.starts_at, 2
from (
  select (d::date + t) at time zone 'America/Chicago' as starts_at  -- d::date, or the zone shift applies twice
  from generate_series(current_date + 1, current_date + 14, interval '1 day') as d,
       unnest(array[interval '9 hours', interval '12 hours', interval '15 hours']) as t
) s
where not exists (select 1 from slots where slots.starts_at = s.starts_at);
