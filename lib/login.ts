// The dashboard login is off while the sign-up flow gets fixed: /dashboard and /onboarding open
// without signing in. Set REQUIRE_LOGIN=true (server env, read at request time) to turn the guard back on.
// Every table is anon-readable already (0001, 0002), so the open dashboard shows nothing the anon key can't.
export function loginRequired(): boolean {
  return process.env.REQUIRE_LOGIN === "true";
}
