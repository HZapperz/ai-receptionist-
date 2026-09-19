"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "./supabase-admin";
import { createClient } from "./supabase-server";

// Email and password login for the dashboard. The forms use these with useActionState.
// redirect() throws on purpose, so it is always called outside try/catch.
export type AuthState = { error?: string; message?: string } | undefined;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

// Supabase's messages are written for developers; show a short one instead.
function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "Wrong email or password.";
  if (m.includes("not confirmed")) return "Confirm your email first, then sign in.";
  // signUp says "already registered", the admin createUser "has already been registered".
  if (/already (been )?registered|already exists/.test(m)) return "That email already has an account. Sign in instead.";
  if (m.includes("rate limit") || m.includes("too many")) return "Too many tries. Wait a minute and try again.";
  if (m.includes("password")) return "Pick a stronger password.";
  if (m.includes("fetch") || m.includes("network")) return "Can't reach the sign-in service. Try again in a moment.";
  // The real reason goes to the server log (Vercel runtime logs), never to the page.
  console.error("auth:", message);
  return "Something went wrong. Try again.";
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = field(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!EMAIL.test(email)) return { error: "Enter a valid email address." };
  if (!password) return { error: "Enter your password." };

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: friendly(error.message) };
  } catch (e) {
    return { error: friendly(e instanceof Error ? e.message : "") };
  }

  // Optional hidden "next" field brings the user back to the page proxy.ts bounced them from.
  const next = field(formData, "next");
  revalidatePath("/", "layout");
  redirect(next.startsWith("/dashboard") ? next : "/dashboard");
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const name = field(formData, "name");
  const email = field(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!EMAIL.test(email)) return { error: "Enter a valid email address." };
  if (password.length < 8) return { error: "Use at least 8 characters for your password." };

  const metadata = name ? { full_name: name } : undefined;

  let hasSession = false;
  try {
    const supabase = await createClient();
    const admin = createAdminClient();
    if (admin) {
      // With the service key: create the account confirmed, then sign in. No email, whatever "Confirm email" says.
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: metadata });
      if (created.error) return { error: friendly(created.error.message) };
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error: friendly(error.message) };
      hasSession = true;
    } else {
      // Without it: the public signup. With "Confirm email" on, the link lands on /auth/confirm.
      const origin = (await headers()).get("origin");
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: metadata, emailRedirectTo: origin ? `${origin}/auth/confirm` : undefined },
      });
      if (error) return { error: friendly(error.message) };
      hasSession = Boolean(data.session);
    }
  } catch (e) {
    return { error: friendly(e instanceof Error ? e.message : "") };
  }

  // With "Confirm email" on and no service key, Supabase returns no session until the link is clicked.
  if (!hasSession) return { message: "Check your email to confirm your account, then sign in." };
  revalidatePath("/", "layout");
  redirect("/onboarding");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}
