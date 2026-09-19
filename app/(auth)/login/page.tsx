import type { Metadata } from "next";
import Link from "next/link";
import { Info } from "lucide-react";
import { LoginForm } from "@/components/auth/LoginForm";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: `Sign in · ${BRAND.name}` };

// ?next= is set by proxy.ts. Only a same-site path is passed on ("//evil.com" is another site).
function safeNext(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")
    ? value
    : undefined;
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const next = safeNext(params.next);

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-sm text-muted">
          {next ? "Sign in to continue to your dashboard." : `Sign in to your ${BRAND.name} workspace.`}
        </p>
      </div>

      {/* app/auth/confirm sends a link it could not use here: expired, or opened in another browser. */}
      {params.confirm === "failed" && (
        <p role="status" className="flex items-start gap-2 rounded-lg bg-brand-soft px-3 py-2.5 text-sm text-ink/80">
          <Info className="mt-0.5 size-4 shrink-0 text-brand" />
          <span>That link could not sign you in here. If you just confirmed your email, sign in with your password.</span>
        </p>
      )}

      <LoginForm next={next} />

      <p className="flex items-start gap-2 rounded-lg bg-brand-soft px-3 py-2.5 text-sm text-ink/80">
        <Info className="mt-0.5 size-4 shrink-0 text-brand" />
        <span>
          <span className="font-medium text-ink">Here for the demo?</span> The team will give you the demo account login.
        </span>
      </p>

      <p className="text-center text-sm text-muted">
        New to {BRAND.name}?{" "}
        <Link href="/signup" className="font-medium text-brand hover:text-brand-hover hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
