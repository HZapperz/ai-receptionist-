"use client";

import {
  ArrowLeftRight,
  Ban,
  Braces,
  Building2,
  CircleAlert,
  Eye,
  LayoutGrid,
  MapPin,
  Megaphone,
  Plus,
  Scissors,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Empty } from "@/components/Panel";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, cn } from "@/components/ui";
import { EXAMPLE_CONFIGS } from "@/lib/example-configs";
import { maskPhone, money } from "@/lib/format";

type Config = Record<string, unknown>;
type Service = { key?: string; label?: string; description?: string; includes?: string[]; minutes_per_dog?: number; base_cents?: Record<string, number> };
type Addon = { key?: string; label?: string; cents?: number; description?: string };

// The config is free-form JSON, so read each key defensively.
const list = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const text = (v: unknown) => (typeof v === "string" ? v : "");
const record = <T,>(v: unknown): Record<string, T> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, T>) : {});

// Policies are one paragraph in the seed; show one sentence per line.
const sentences = (s: string) => s.split(/\.\s+(?=[A-Z])/).map((part, i, all) => (i < all.length - 1 ? `${part}.` : part));

// The business_config row as the agents read it. Read only: nothing on this page writes.
export function SettingsView({ config }: { config: Config | null }) {
  const [view, setView] = useState("cards");

  if (!config) {
    return (
      <Card>
        <Empty icon={CircleAlert}>
          No business config found. Run supabase/seed.sql, and 0003_auth_read.sql so a signed-in browser can read it.
        </Empty>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Every agent reads this one row. Prices are computed from it in code; the model never makes one up.
        </p>
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "cards", label: "Readable", icon: LayoutGrid },
            { value: "json", label: "Raw JSON", icon: Braces },
          ]}
        />
      </div>

      {view === "json" ? (
        <Card>
          <pre className="max-h-[36rem] overflow-auto p-5 font-mono text-xs leading-relaxed text-ink">{JSON.stringify(config, null, 2)}</pre>
        </Card>
      ) : (
        <ConfigCards config={config} />
      )}

      <SwapCard live={config} />
    </div>
  );
}

function ConfigCards({ config }: { config: Config }) {
  const sizeGuide = record<string>(config.size_guide);
  const coatGuide = record<string>(config.coat_guide);
  const coats = record<number>(config.coat_surcharge_cents);
  const outbound = record<string>(config.outbound);
  const policies = Array.isArray(config.policies) ? list<string>(config.policies) : sentences(text(config.policies));
  const notes = list<string>(config._notes);
  const facts = [
    ["Business number", maskPhone(config.phone)],
    ["Website", text(config.website)],
    ["Hours", text(config.hours)],
    ["Tone", text(config.tone)],
  ].filter(([, v]) => v);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-3">
        <InfoCard icon={Building2} title={text(config.name) || "Business"} description="The basics every agent starts from.">
          <dl className="space-y-3">
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs font-medium text-muted">{label}</dt>
                <dd className="text-sm text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </InfoCard>

        <InfoCard
          icon={Scissors}
          title="Services"
          description={`Base price by size${text(config.price_note) ? `. ${text(config.price_note)}` : "."}`}
          className="xl:col-span-2"
        >
          <div className="space-y-5">
            {list<Service>(config.services).map((s) => (
              <div key={s.key ?? s.label}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold text-ink">{s.label ?? s.key}</p>
                  {s.minutes_per_dog ? <span className="text-xs text-muted">about {s.minutes_per_dog} min per pet</span> : null}
                </div>
                {s.description && <p className="mt-0.5 text-sm text-muted">{s.description}</p>}
                {s.includes && s.includes.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {s.includes.map((item) => (
                      <Badge key={item}>{item}</Badge>
                    ))}
                  </div>
                )}
                <PriceTable prices={s.base_cents} guide={sizeGuide} className="mt-3" />
              </div>
            ))}
          </div>
        </InfoCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <InfoCard icon={Plus} title="Coat surcharges" description="Added to the base price.">
          <ul className="divide-y divide-line">
            {Object.entries(coats).map(([coat, cents]) => (
              <li key={coat} className="py-2 first:pt-0 last:pb-0">
                <p className="flex justify-between gap-2 text-sm">
                  <span className="font-medium text-ink capitalize">{coat}</span>
                  <span className="font-semibold text-ink">{cents ? `+${money(cents)}` : "Included"}</span>
                </p>
                {coatGuide[coat] && <p className="text-xs text-muted">{coatGuide[coat]}</p>}
              </li>
            ))}
          </ul>
        </InfoCard>

        <InfoCard icon={Plus} title="Add-ons" description="Optional extras the AI can quote.">
          <ul className="space-y-3">
            {list<Addon>(config.addons).map((a) => (
              <li key={a.key ?? a.label}>
                <p className="flex justify-between gap-2 text-sm">
                  <span className="font-medium text-ink">{a.label ?? a.key}</span>
                  <span className="font-semibold text-ink">+{money(a.cents)}</span>
                </p>
                {a.description && <p className="text-xs text-muted">{a.description}</p>}
              </li>
            ))}
          </ul>
        </InfoCard>

        <InfoCard icon={MapPin} title="Service area" description="Cities and ZIP codes the business serves.">
          <Chips items={list<string>(config.service_area_cities)} />
          {list<string>(config.service_area_zips).length > 0 && (
            <>
              <p className="mt-4 mb-1.5 text-xs font-medium text-muted">Top ZIP codes</p>
              <Chips items={list<string>(config.service_area_zips)} />
            </>
          )}
          {list<string>(config.not_offered).length > 0 && (
            <>
              <p className="mt-4 mb-1.5 flex items-center gap-1 text-xs font-medium text-muted">
                <Ban className="size-3" aria-hidden="true" />
                Not offered
              </p>
              <Chips items={list<string>(config.not_offered)} />
            </>
          )}
        </InfoCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <InfoCard icon={ShieldCheck} title="Policies" description="The AI answers policy questions from this text.">
          <ul className="list-disc space-y-1.5 pl-4 text-sm text-ink marker:text-muted">
            {policies.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </InfoCard>

        <div className="space-y-6">
          <InfoCard icon={Megaphone} title="Outbound" description="Who the prospecting agent looks for, and the offer.">
            <dl className="space-y-3">
              {(["audience", "offer", "cta"] as const)
                .filter((k) => outbound[k])
                .map((k) => (
                  <div key={k}>
                    <dt className="text-xs font-medium text-muted capitalize">{k === "cta" ? "Call to action" : k}</dt>
                    <dd className="text-sm text-ink">{outbound[k]}</dd>
                  </div>
                ))}
            </dl>
          </InfoCard>

          {notes.length > 0 && (
            <InfoCard icon={CircleAlert} title="To confirm" description="Assumptions in this config that still need a yes from the owner.">
              <ul className="space-y-2">
                {notes.map((n) => (
                  <li key={n} className="flex gap-2 text-sm text-ink">
                    <Badge tone="warning" className="mt-0.5 shrink-0">
                      Open
                    </Badge>
                    {n.replace(/^To confirm:\s*/i, "")}
                  </li>
                ))}
              </ul>
            </InfoCard>
          )}
        </div>
      </div>
    </div>
  );
}

// Tabs between the live row and the fictional examples. A preview: it never writes.
function SwapCard({ live }: { live: Config }) {
  const examples = EXAMPLE_CONFIGS.filter((e) => e.id !== "royal-pawz");
  const [tab, setTab] = useState("live");
  const example = examples.find((e) => e.id === tab);
  const config = example?.config ?? live;
  const outbound = record<string>(config.outbound);

  return (
    <Card>
      <CardHeader className="flex-row! flex-wrap items-start justify-between gap-4!">
        <div className="flex gap-3">
          <IconBadge icon={ArrowLeftRight} />
          <div>
            <CardTitle>Swap one row</CardTitle>
            <CardDescription>The same three agents run a different business when this row changes.</CardDescription>
          </div>
        </div>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "live", label: `Live: ${text(live.name) || "your business"}` },
            ...examples.map((e) => ({ value: e.id, label: e.business })),
          ]}
        />
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-lg font-semibold tracking-tight text-ink">{text(config.name)}</p>
              {example ? <Badge tone="warning">Example · {example.label}</Badge> : <Badge tone="success">Live</Badge>}
            </div>
            <p className="text-sm text-muted">
              {text(config.hours)}
              {list<string>(config.service_area_cities).length > 0 && ` · ${list<string>(config.service_area_cities).join(", ")}`}
            </p>
            {list<Service>(config.services).map((s) => (
              <div key={s.key ?? s.label}>
                <p className="mb-1.5 text-sm font-medium text-ink">{s.label ?? s.key}</p>
                <PriceTable prices={s.base_cents} guide={record<string>(config.size_guide)} />
              </div>
            ))}
            {list<Addon>(config.addons).length > 0 && (
              <Chips items={list<Addon>(config.addons).map((a) => `${a.label ?? a.key} +${money(a.cents)}`)} />
            )}
            {outbound.audience && (
              <p className="text-sm text-muted">
                Prospects: <span className="text-ink">{outbound.audience}</span>
              </p>
            )}
          </div>
          <pre className="max-h-96 overflow-auto rounded-lg border border-line bg-canvas p-4 font-mono text-xs leading-relaxed text-ink">
            {JSON.stringify(config, null, 2)}
          </pre>
        </div>
        <p className="mt-4 flex items-center gap-1.5 text-xs text-muted">
          <Eye className="size-3.5" aria-hidden="true" />
          Preview only. Nothing is written; the agents keep reading the live row.
        </p>
      </CardContent>
    </Card>
  );
}

function InfoCard({
  icon,
  title,
  description,
  className,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={className}>
      <CardHeader className="flex-row! gap-3!">
        <IconBadge icon={icon} />
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function IconBadge({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
      <Icon className="size-4.5" aria-hidden="true" />
    </span>
  );
}

// One column per size key, in the config's own order.
function PriceTable({ prices, guide, className }: { prices?: Record<string, number>; guide: Record<string, string>; className?: string }) {
  const sizes = Object.entries(prices ?? {});
  if (sizes.length === 0) return null;
  return (
    <div className={cn("grid divide-x divide-line overflow-hidden rounded-lg border border-line", className)} style={{ gridTemplateColumns: `repeat(${sizes.length}, minmax(0, 1fr))` }}>
      {sizes.map(([size, cents]) => (
        <div key={size} className="px-3 py-2">
          <p className="text-xs font-medium text-muted capitalize">{size}</p>
          <p className="text-base font-semibold text-ink">{money(cents)}</p>
          {guide[size] && <p className="truncate text-[11px] text-muted" title={guide[size]}>{guide[size]}</p>}
        </div>
      ))}
    </div>
  );
}

function Chips({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <Badge key={item}>{item}</Badge>
      ))}
    </div>
  );
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; icon?: LucideIcon }[];
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-lg bg-canvas p-1 ring-1 ring-line ring-inset" role="tablist">
      {options.map(({ value: v, label, icon: Icon }) => (
        <button
          key={v}
          role="tab"
          aria-selected={value === v}
          onClick={() => onChange(v)}
          className={cn(
            "inline-flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            value === v ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink",
          )}
        >
          {Icon && <Icon className="size-3.5" aria-hidden="true" />}
          {label}
        </button>
      ))}
    </div>
  );
}
