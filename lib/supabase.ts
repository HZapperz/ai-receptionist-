import { createClient } from "@supabase/supabase-js";

// Browser client with the anon key. RLS lets it select and nothing else;
// every write goes through the agents service.
// The fallbacks only keep `next build` from crashing when .env.local is missing.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "missing-anon-key",
);
