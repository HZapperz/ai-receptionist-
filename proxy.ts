import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Next 16's middleware. On every page request it refreshes the Supabase session cookie, keeps
// signed-out visitors out of /dashboard and /onboarding, and sends signed-in ones past the login.
// /agents/* never comes through here (see the matcher): it is the rewrite to the agents service.
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // No Supabase config (a fresh clone): let everything through rather than crash.
  if (!url || !key) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      // A refreshed token goes on the request (so pages see it now) and on the response (so the browser keeps it).
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });

  // getUser() asks Supabase to vouch for the token; a cookie alone is not proof of a session.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;
  const redirectTo = (path: string) => {
    const to = NextResponse.redirect(new URL(path, request.url));
    response.cookies.getAll().forEach((cookie) => to.cookies.set(cookie));
    return to;
  };

  if (!user && /^\/(dashboard|onboarding)(\/|$)/.test(pathname)) {
    return redirectTo(`/login?next=${encodeURIComponent(pathname + search)}`);
  }
  if (user && (pathname === "/login" || pathname === "/signup")) {
    return redirectTo("/dashboard");
  }
  return response;
}

export const config = {
  matcher: [
    // Everything except the agents rewrite, Next's static files and images.
    "/((?!agents|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
