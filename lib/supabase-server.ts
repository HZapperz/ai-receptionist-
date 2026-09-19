import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Server client for Server Components, Server Actions and Route Handlers. It reads the session
// from the request cookies. Used for auth only; the tables are still read from the browser.
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "missing-anon-key",
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // A Server Component cannot set cookies. proxy.ts refreshes the session instead.
          }
        },
      },
    },
  );
}
