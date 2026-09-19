import { BatteryFull, Building, Calculator, CalendarCheck, ChevronLeft, MessageSquareText, Plus, Signal, Wifi } from "lucide-react";
import { Badge, Card, StatusDot, cn } from "@/components/ui";
import { BRAND } from "@/lib/brand";
import { money } from "@/lib/format";

// Illustrative only, and labeled so on the page. The numbers match supabase/seed.sql:
// a medium Royal Groom is 16000 cents and a long coat adds 1500.
const BASE = 16000;
const LONG_COAT = 1500;
const TOTAL = money(BASE + LONG_COAT);

const THREAD: { from: "customer" | "ai"; text: string; delay: string }[] = [
  { from: "customer", text: "Hi! How much for a groom? Medium doodle, long coat.", delay: "animate-delay-100" },
  {
    from: "ai",
    text: `Hi, this is ${BRAND.showcase}'s AI assistant. A Royal Groom for a medium doodle with a long coat is ${TOTAL} before tax. When works for you?`,
    delay: "animate-delay-300",
  },
  { from: "customer", text: "Saturday morning?", delay: "animate-delay-500" },
  { from: "ai", text: "Saturday at 9:00 AM is open. Want me to book it?", delay: "animate-delay-700" },
  { from: "customer", text: "Yes please! She's Bella.", delay: "animate-delay-900" },
  {
    from: "ai",
    text: "You're booked: Bella, Royal Groom, Sat 9:00 AM. Could you text a photo of her rabies tag or vet receipt?",
    delay: "animate-delay-1100",
  },
];

// A customer's phone texting the business. Their bubbles are on the right, the AI's on the left.
export function PhoneMock() {
  return (
    <figure className="flex flex-col items-center gap-3">
      <figcaption>
        <Badge tone="brand" className="shadow-card">
          <MessageSquareText />
          Example conversation
        </Badge>
      </figcaption>
      <div className="w-[280px] rounded-[2.6rem] bg-ink p-2 shadow-lift ring-1 ring-black/10">
        <div className="relative overflow-hidden rounded-[2.1rem] bg-white">
          <div className="absolute top-2 left-1/2 h-5 w-20 -translate-x-1/2 rounded-full bg-ink" />
          <div className="flex items-center justify-between px-6 pt-3 pb-1 text-[11px] font-semibold text-ink">
            <span>9:41</span>
            <span className="flex items-center gap-1">
              <Signal className="size-3" />
              <Wifi className="size-3" />
              <BatteryFull className="size-3.5" />
            </span>
          </div>

          <div className="flex items-center gap-2 border-b border-line bg-canvas/70 px-3 pt-3 pb-2.5">
            <ChevronLeft className="size-4 text-brand" />
            <span className="grid size-8 place-items-center rounded-full bg-linear-to-br from-brand to-violet-600 text-[11px] font-semibold text-white">
              RP
            </span>
            <span className="leading-tight">
              <span className="block text-[13px] font-semibold text-ink">{BRAND.showcase}</span>
              <span className="block text-[10px] text-muted">Text message</span>
            </span>
          </div>

          <div className="flex flex-col gap-1.5 px-3 pt-3 pb-4">
            <p className="mb-1 text-center text-[10px] font-medium text-muted">Today 9:12 PM</p>
            {THREAD.map((m) => (
              <p
                key={m.text}
                className={cn(
                  "max-w-[80%] animate-fade-up rounded-2xl px-3 py-2 text-[12.5px] leading-snug",
                  m.delay,
                  m.from === "customer"
                    ? "self-end rounded-br-md bg-brand text-white"
                    : "self-start rounded-bl-md bg-canvas text-ink ring-1 ring-line",
                )}
              >
                {m.text}
              </p>
            ))}
          </div>

          <div className="flex items-center gap-2 px-3 pb-5">
            <span className="grid size-7 place-items-center rounded-full bg-canvas text-muted">
              <Plus className="size-4" />
            </span>
            <span className="h-8 flex-1 rounded-full border border-line px-3 text-[12px] leading-8 text-muted/70">
              Text message
            </span>
          </div>
        </div>
      </div>
    </figure>
  );
}

// The quote in the thread, as the tool computed it. The model only repeats this number.
export function QuoteMock({ className }: { className?: string }) {
  return (
    <Card className={cn("w-60 p-4 shadow-lift!", className)}>
      <p className="flex items-center gap-2 text-xs font-medium text-muted">
        <span className="grid size-6 place-items-center rounded-md bg-brand-soft text-brand">
          <Calculator className="size-3.5" />
        </span>
        Priced in code
      </p>
      <p className="mt-2.5 font-mono text-[11px] text-brand">quote(royal_groom, medium, long)</p>
      <dl className="mt-3 space-y-1.5 text-[13px]">
        <div className="flex justify-between">
          <dt className="text-muted">Royal Groom, medium</dt>
          <dd className="font-medium text-ink tabular-nums">{money(BASE)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">Long coat</dt>
          <dd className="font-medium text-ink tabular-nums">+{money(LONG_COAT)}</dd>
        </div>
        <div className="flex justify-between border-t border-line pt-1.5">
          <dt className="font-medium text-ink">Total before tax</dt>
          <dd className="font-semibold text-ink tabular-nums">{TOTAL}</dd>
        </div>
      </dl>
    </Card>
  );
}

// What the owner sees on the dashboard a moment later.
export function ActivityMock({ className }: { className?: string }) {
  const rows = [
    {
      icon: CalendarCheck,
      tint: "bg-emerald-50 text-emerald-600",
      title: "New booking",
      detail: "Bella · Royal Groom · Sat 9:00 AM",
      side: TOTAL,
    },
    {
      icon: Building,
      tint: "bg-brand-soft text-brand",
      title: "Partner lead replied",
      detail: "Apartment community in Pearland",
      side: "via text",
    },
  ];
  return (
    <Card className={cn("w-60 shadow-lift!", className)}>
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <span className="flex items-center gap-2 text-xs font-semibold text-ink">
          <StatusDot tone="live" pulse />
          Today
        </span>
        <Badge>Example</Badge>
      </div>
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.title} className="flex items-start gap-3 px-4 py-3">
            <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg", r.tint)}>
              <r.icon className="size-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-medium text-ink">{r.title}</span>
                <span className="text-xs font-medium text-muted tabular-nums">{r.side}</span>
              </span>
              <span className="mt-0.5 block text-xs leading-snug text-muted">{r.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
