import Link from "next/link";
import type { ReactNode } from "react";
import { BrandPanel } from "@/components/auth/BrandPanel";
import { Logo } from "@/components/ui";
import { BRAND } from "@/lib/brand";

// Login and signup: the form on the left, what the product is on the right. Stacks on small screens.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid flex-1 lg:min-h-dvh lg:grid-cols-2">
      <div className="flex min-h-dvh flex-col px-6 py-8 sm:px-10 lg:min-h-0">
        <Link href="/" className="self-start rounded-lg focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none">
          <Logo />
        </Link>
        <main className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-sm animate-fade-up">{children}</div>
        </main>
        <p className="text-xs text-muted">
          {BRAND.name} · {BRAND.tagline}
        </p>
      </div>
      <BrandPanel />
    </div>
  );
}
