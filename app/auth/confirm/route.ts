import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";

// Where Supabase's email links land (signup's emailRedirectTo). @supabase/ssr uses PKCE, so the link
// arrives with ?code= to trade for a session; an email template that links here directly sends
// ?token_hash=&type= instead. Either way the visitor ends up signed in on /onboarding.
// A code only works in the browser that signed up. From another browser or an expired link it fails,
// but Supabase has confirmed the email by then, so /login asks for the password.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type");

  let ok = false;
  const supabase = await createClient();
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  }
  return NextResponse.redirect(new URL(ok ? "/onboarding" : "/login?confirm=failed", request.url));
}
