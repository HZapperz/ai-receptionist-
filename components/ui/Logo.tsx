import { BRAND } from "@/lib/brand";
import { cn } from "./cn";

// The mark is a hand-off arrow: a message comes in and the AI employee passes it along.
export function Logo({ className, withWordmark = true }: { className?: string; withWordmark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="grid size-8 place-items-center rounded-lg bg-linear-to-br from-brand to-brand-accent text-brand-foreground shadow-sm ring-1 ring-black/5 ring-inset">
        <svg viewBox="0 0 24 24" className="size-4.5" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 12h10" />
          <path d="M10 6.5 15.5 12 10 17.5" />
          <circle cx="19.5" cy="12" r="1.6" fill="currentColor" stroke="none" />
        </svg>
      </span>
      {withWordmark ? (
        <span className="text-lg font-semibold tracking-tight text-ink">{BRAND.name}</span>
      ) : (
        <span className="sr-only">{BRAND.name}</span>
      )}
    </span>
  );
}
