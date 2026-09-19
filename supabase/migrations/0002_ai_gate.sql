-- 833 gate. The demo borrows Royal Pawz's verified toll-free number. A phone that
-- texts AI_GATE_CODE gets a session and talks to the inbound agent; every other
-- text is forwarded untouched to the production SMS service and never stored here.
create table ai_sessions (
  phone text primary key,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz
);

alter table ai_sessions enable row level security;
create policy anon_read on ai_sessions for select to anon using (true);
