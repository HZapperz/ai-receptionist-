import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui";
import { BRAND } from "@/lib/brand";

export function CtaBand() {
  return (
    <section className="px-6 pb-20 sm:pb-28">
      <div className="relative isolate mx-auto max-w-6xl overflow-hidden rounded-3xl bg-linear-to-br from-brand to-brand-accent px-6 py-16 text-center shadow-lift sm:px-16 sm:py-20">
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-dot-grid opacity-50 invert" />
        <div aria-hidden="true" className="absolute -top-32 left-1/2 -z-10 size-[520px] -translate-x-1/2 rounded-full bg-white/15 blur-3xl" />

        <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-balance text-white sm:text-4xl">
          Your next customer is texting right now. Let {BRAND.name} answer.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lg text-pretty text-white/80">
          Load your business, connect your number, and watch the first conversation land on your dashboard.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Button href="/dashboard" size="lg" variant="outline">
            Open Dashboard
            <ArrowRight />
          </Button>
          <Link href="/login" className="text-sm font-medium text-white/85 underline-offset-4 hover:text-white hover:underline">
            Already have an account? Sign in
          </Link>
        </div>
      </div>
    </section>
  );
}
