import type { Metadata } from "next";
import Link from "next/link";
import { SignupForm } from "@/components/auth/SignupForm";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: `Create your account · ${BRAND.name}` };

export default function SignupPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Hire your AI team</h1>
        <p className="text-sm text-muted">Create your account, then load your business in a few steps.</p>
      </div>

      <SignupForm />

      <p className="text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-brand hover:text-brand-hover hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
