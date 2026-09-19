import Link from "next/link";
import { Logo } from "@/components/ui";
import { BRAND } from "@/lib/brand";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "#features", label: "Features" },
      { href: "#how", label: "How it works" },
      { href: "#pricing", label: "Pricing" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/login", label: "Sign in" },
      { href: "/signup", label: "Get started" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-line bg-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 md:grid-cols-[2fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">{BRAND.tagline}.</p>
          <p className="mt-4 inline-flex items-center rounded-full bg-canvas px-3 py-1 text-xs font-medium text-muted ring-1 ring-line">
            Built at AITX
          </p>
        </div>
        {COLUMNS.map((c) => (
          <div key={c.title}>
            <p className="text-sm font-semibold text-ink">{c.title}</p>
            <ul className="mt-4 space-y-3 text-sm">
              {c.links.map((l) => (
                <li key={l.href}>
                  {/* In-page anchors stay plain links; routes go through next/link. */}
                  {l.href.startsWith("#") ? (
                    <a href={l.href} className="text-muted transition-colors hover:text-ink">
                      {l.label}
                    </a>
                  ) : (
                    <Link href={l.href} className="text-muted transition-colors hover:text-ink">
                      {l.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-6 text-xs text-muted sm:flex-row sm:justify-between">
          <p>
            © {new Date().getFullYear()} {BRAND.name}. All rights reserved.
          </p>
          <p>
            Showcase customer: {BRAND.showcase}, mobile dog grooming in Houston.
          </p>
        </div>
      </div>
    </footer>
  );
}
