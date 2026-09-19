import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role client for one job: signUp creates the account already confirmed, so signup works with
// Supabase's "Confirm email" on and no email goes out (the built-in mailer only reaches the team).
// It bypasses RLS, so it stays on the server ("server-only" fails the build if a client component
// imports it) and never touches our tables. null when SUPABASE_SERVICE_ROLE_KEY is not set.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
