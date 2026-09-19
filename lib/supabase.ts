import { createBrowserClient } from "@supabase/ssr";

// Browser client with the anon key. It carries the signed-in user's session (from cookies), so
// queries run as `authenticated`. RLS lets it select and nothing else; every write goes through
// the agents service. Read-only by design.
// The fallbacks only keep `next build` from crashing when .env.local is missing.
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "missing-anon-key",
);
