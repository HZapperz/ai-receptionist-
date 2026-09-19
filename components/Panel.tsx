import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Badge, cn } from "@/components/ui";
import { houstonTime, maskPhone } from "@/lib/format";

// A card with a header and a scrolling body. The dashboard grid and the full pages are built from these.
// flush drops the body padding, for tables and split panes that bring their own.
export function Panel({
  title,
  action,
  children,
  className,
  count,
  flush = false,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  count?: number;
  flush?: boolean;
}) {
  return (
    <section className={cn("flex min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-card", className)}>
      <header className="flex min-h-12 items-center justify-between gap-3 border-b border-line px-4 py-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
          {title}
          {count != null && (
            <span className="rounded-full bg-canvas px-2 py-0.5 text-xs font-medium text-muted ring-1 ring-line ring-inset">{count}</span>
          )}
        </h2>
        {action}
      </header>
      <div className={cn("min-h-0 flex-1 overflow-y-auto text-sm", !flush && "p-4")}>{children}</div>
    </section>
  );
}

// What a panel shows before its first row arrives.
export function Empty({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-canvas text-muted ring-1 ring-line">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <p className="max-w-64 text-sm text-muted">{children}</p>
    </div>
  );
}

const STATUS_TONES = {
  confirmed: "success",
  cancelled: "danger",
  new: "neutral",
  drafted: "brand",
  sent: "info",
  replied: "success",
  pending: "warning",
  running: "info",
  done: "success",
  failed: "danger",
} as const;

// One badge color per status value in docs/CONTRACTS.md (bookings, leads and tasks).
export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONES[status as keyof typeof STATUS_TONES] ?? "neutral"}>{status}</Badge>;
}

// Masks every phone number inside free text, such as a tool's JSON input or a task payload.
export const maskPhones = (text: string) =>
  text.replace(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, (m) => maskPhone(m));

// Kept for older imports: a Houston clock time.
export const time = (iso: unknown) => houstonTime(iso);
