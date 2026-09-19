insert into business_config (id, data) values (1, '{
  "_placeholder": true,
  "name": "Royal Pawz",
  "phone": "TODO",
  "mailing_address": "TODO",
  "hours": "Mon-Sat 8am-6pm",
  "service_area_zips": ["TODO"],
  "services": [
    {"key": "full_groom", "label": "Full groom",
     "base_cents": {"small": 8500, "medium": 10500, "large": 13000, "xl": 16000}},
    {"key": "bath_brush", "label": "Bath and brush",
     "base_cents": {"small": 6000, "medium": 7500, "large": 9500, "xl": 12000}}
  ],
  "coat_surcharge_cents": {"short": 0, "medium": 1000, "long": 2000, "double": 2500},
  "addons": [
    {"key": "nail_grind", "label": "Nail grind", "cents": 1500},
    {"key": "teeth", "label": "Teeth brushing", "cents": 1000},
    {"key": "deshed", "label": "De-shed treatment", "cents": 2500}
  ],
  "policies": "TODO: cancellation, late, aggressive pets, vaccines",
  "tone": "Warm, brief, plain words, no emojis.",
  "outbound": {
    "audience": "pet-friendly apartment communities in Houston",
    "offer": "A monthly on-site grooming day for residents, at no cost to the property.",
    "cta": "Text us at the number below to pick a date.",
    "sender_name": "TODO"
  }
}'::jsonb)
on conflict (id) do update set data = excluded.data;

-- two weeks of slots, three a day, capacity 2 (two vans), Houston time
insert into slots (starts_at, capacity)
select (d + t) at time zone 'America/Chicago', 2
from generate_series(current_date + 1, current_date + 14, interval '1 day') as d,
     unnest(array[interval '9 hours', interval '12 hours', interval '15 hours']) as t;
