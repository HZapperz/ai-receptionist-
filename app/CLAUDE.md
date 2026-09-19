# Manager lane (dashboard half)

@../AGENTS.md

One page, four panels, all reading Supabase directly with the anon key and Realtime: ManagerChat, LeadsPanel (table, draft preview, Send button), InboxPanel (threads by phone) with TracePanel beside it (agent_events, newest first), BookingsPanel.

- The browser never writes to Supabase. RLS gives anon select only.
- Actions go through fetch("/agents/<route>"); next.config rewrites that to AGENTS_URL. Use lib/agents.ts.
- Use lib/useTable.ts for "load rows, then subscribe to inserts and updates".
- Desktop first. It runs on a projector. No auth, no routing beyond the one page.
- The inbox only ever shows AI-session conversations; real customers' texts are forwarded and never stored. Keep it that way.
- This is Next.js 16. Check node_modules/next/dist/docs/ before using an API you remember from older versions.
