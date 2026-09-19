-- Dashboard login. A signed-in browser queries as "authenticated", not "anon",
-- and every policy so far is "to anon", so without this a logged-in dashboard
-- shows empty panels. Select only, like anon: the browser still never writes.
-- anon_read stays. Safe to run twice.
do $$
declare t text;
begin
  foreach t in array array['business_config','customers','messages','slots','bookings',
                           'leads','tasks','shared_notes','agent_events','ai_sessions']
  loop
    execute format('drop policy if exists auth_read on %I', t);
    execute format('create policy auth_read on %I for select to authenticated using (true)', t);
  end loop;
end $$;
