create extension if not exists pgcrypto;

create table business_config (
  id int primary key default 1 check (id = 1),
  data jsonb not null
);

create table customers (
  phone text primary key,
  name text,
  pets jsonb not null default '[]',
  notes text,
  created_at timestamptz not null default now()
);

create table messages (
  id bigint generated always as identity primary key,
  phone text not null,
  direction text not null check (direction in ('in','out')),
  body text not null,
  twilio_sid text unique,
  created_at timestamptz not null default now()
);
create index messages_phone_idx on messages (phone, created_at);

create table slots (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  capacity int not null default 1,
  booked int not null default 0
);

create table bookings (
  id uuid primary key default gen_random_uuid(),
  phone text references customers(phone),
  service text not null,
  pet_name text,
  details jsonb not null default '{}',
  slot_id uuid references slots(id),
  total_cents int not null,
  status text not null default 'confirmed' check (status in ('confirmed','cancelled')),
  created_at timestamptz not null default now()
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  place_id text unique,
  name text not null,
  address text,
  phone text,
  email text,
  website text,
  rating numeric,
  raw jsonb,
  status text not null default 'new' check (status in ('new','drafted','sent','replied')),
  draft_subject text,
  draft_body text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  for_agent text not null check (for_agent in ('inbound','outbound')),
  kind text not null check (kind in ('find_leads','draft_emails','follow_up')),
  payload jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending','running','done','failed')),
  created_by text not null default 'manager',
  result jsonb,
  created_at timestamptz not null default now()
);

create table shared_notes (
  id bigint generated always as identity primary key,
  about text not null,
  note text not null,
  written_by text not null,
  created_at timestamptz not null default now()
);
create index shared_notes_about_idx on shared_notes (about, created_at);

create table agent_events (
  id bigint generated always as identity primary key,
  agent text not null,
  kind text not null check (kind in ('tool','message','error')),
  name text,
  input jsonb,
  result jsonb,
  latency_ms int,
  ref text,
  created_at timestamptz not null default now()
);

-- take a slot without double booking; returns true when the slot was taken
create or replace function take_slot(p_slot uuid) returns boolean
language sql as $$
  with u as (
    update slots set booked = booked + 1
    where id = p_slot and booked < capacity
    returning 1
  )
  select exists (select 1 from u);
$$;

-- RLS: the browser (anon) can read everything and write nothing.
-- The agents service uses the service role key, which bypasses RLS.
do $$
declare t text;
begin
  foreach t in array array['business_config','customers','messages','slots','bookings',
                           'leads','tasks','shared_notes','agent_events']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy anon_read on %I for select to anon using (true)', t);
  end loop;
end $$;

alter publication supabase_realtime
  add table messages, bookings, leads, tasks, shared_notes, agent_events;
