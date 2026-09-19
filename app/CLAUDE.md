@../AGENTS.md

# Dashboard shell (inbound lane)

The inbound lane owns app/, components/, lib/ and proxy.ts. The one exception is components/ManagerChat.tsx, which belongs to the manager lane: mount it, do not edit it.

## Routes
- `/`: landing page, public. Built from components/marketing/.
- `/login`, `/signup`: Supabase email/password forms.
- `/onboarding`: a dummy demo wizard, prefilled from business_config. It never writes.
- `/dashboard/*`: Overview, Inbox, Leads, Bookings, Activity, Manager (mounts ManagerChat) and Settings, behind the login.

## Auth
- @supabase/ssr. lib/supabase.ts is the browser client (export `supabase`), lib/supabase-server.ts the server client (`await createClient()`), lib/auth-actions.ts the server actions (signIn, signUp, signOut).
- proxy.ts (Next 16's name for middleware) refreshes the session and guards /dashboard and /onboarding. Its matcher must exclude /agents, or the rewrite to the agents service breaks.
- A signed-in browser reads as `authenticated`. Its select policies come from supabase/migrations/0003_auth_read.sql; until that runs, a logged-in dashboard shows empty panels.

## Rules
- The browser never writes to Supabase, logged in or not. RLS gives anon and authenticated select only. Login writes nothing to our tables.
- Actions go through fetch("/agents/<route>"); next.config rewrites that to AGENTS_URL. Use lib/agents.ts.
- Use lib/useTable.ts for "load rows, then subscribe to inserts and updates".
- The inbox only ever shows AI-session conversations; real customers' texts are forwarded and never stored. Keep it that way.
- Show phones through maskPhone() from lib/format.ts. Judges' numbers end up on the projector.
- Light theme, desktop first. It runs on a projector.
- This is Next.js 16. Check node_modules/next/dist/docs/ before using an API you remember from older versions.
