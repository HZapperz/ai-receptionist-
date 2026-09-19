"use client";

import { ArrowDownLeft, ArrowUpRight, Building2, DollarSign, Radio, TriangleAlert, type LucideIcon } from "lucide-react";
import { Card, StatusDot, cn } from "@/components/ui";
import { money } from "@/lib/format";
import { useStats } from "@/lib/useStats";

type Tile = { label: string; value: string; hint: string; icon: LucideIcon; alert?: boolean; live?: boolean };

// Today's headline numbers, counted live from the database. "—" until the first load.
export function KpiStrip() {
  const s = useStats();
  const n = (v: number | undefined) => (v == null ? "—" : v.toLocaleString("en-US"));
  const leadTotal = s ? s.leads.new + s.leads.drafted + s.leads.sent + s.leads.replied : undefined;
  // Only the statuses that have leads, so the hint fits a narrow tile.
  const leadHint = s
    ? (["new", "drafted", "sent", "replied"] as const)
        .filter((k) => s.leads[k])
        .map((k) => `${s.leads[k]} ${k}`)
        .join(" · ") || "none yet"
    : "by status";

  const tiles: Tile[] = [
    { label: "Texts in", value: n(s?.textsIn), hint: "today", icon: ArrowDownLeft },
    { label: "AI replies", value: n(s?.textsOut), hint: "today", icon: ArrowUpRight },
    {
      label: "Booked revenue",
      value: money(s?.revenueCents),
      hint: s ? `${s.bookings} confirmed ${s.bookings === 1 ? "booking" : "bookings"}` : "confirmed",
      icon: DollarSign,
    },
    {
      label: "Partner leads",
      value: n(leadTotal),
      hint: leadHint,
      icon: Building2,
    },
    { label: "Escalations", value: n(s?.escalations), hint: "today, sent to owner", icon: TriangleAlert, alert: !!s?.escalations },
    { label: "Live AI sessions", value: n(s?.activeSessions), hint: "texting right now", icon: Radio, live: !!s?.activeSessions },
  ];

  return (
    <div className="grid shrink-0 grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {tiles.map(({ label, value, hint, icon: Icon, alert, live }) => (
        <Card key={label} className="flex items-center gap-3 px-4 py-3">
          <span
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-lg",
              alert ? "bg-amber-50 text-amber-700" : "bg-brand-soft text-brand",
            )}
          >
            <Icon className="size-4.5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate text-xs font-medium text-muted">
              {label}
              {live && <StatusDot tone="live" pulse />}
            </p>
            <p className="text-xl leading-7 font-semibold tracking-tight text-ink">{value}</p>
            <p className="truncate text-[11px] text-muted" title={hint}>
              {hint}
            </p>
          </div>
        </Card>
      ))}
    </div>
  );
}
