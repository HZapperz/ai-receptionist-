"use client";

import { ArrowRight } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Badge, cn } from "@/components/ui";
import { EXAMPLE_CONFIGS } from "@/lib/example-configs";
import { money } from "@/lib/format";
import { Section, SectionHeading } from "./Section";

// About what fits across the code card; the few longer string lines soft-wrap.
const WIDTH = 84;

// Two-space JSON, except that an object or list that fits within WIDTH stays on one line.
function pretty(value: unknown, indent = "", col = 0): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  const inner = indent + "  ";
  const list = Array.isArray(value);
  const items = list
    ? value.map((v) => pretty(v, inner, inner.length))
    : Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${pretty(v, inner, inner.length + k.length + 4)}`);
  const [open, close] = list ? ["[", "]"] : ["{", "}"];
  const flat = `${open}${items.join(", ")}${close}`;
  if (!flat.includes("\n") && col + flat.length <= WIDTH) return flat;
  return `${open}\n${items.map((i) => inner + i).join(",\n")}\n${indent}${close}`;
}

// Colors keys, strings, numbers and literals; punctuation keeps the dim base color.
const TOKEN = /("(?:[^"\\]|\\.)*")(\s*:)?|(\d+(?:\.\d+)?)|\b(true|false|null)\b/g;

function tint(json: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of json.matchAll(TOKEN)) {
    const [text, str, colon, num] = m;
    out.push(json.slice(last, m.index));
    const color = str ? (colon ? "text-sky-300" : "text-emerald-300") : num ? "text-amber-300" : "text-teal-300";
    out.push(
      <span key={m.index} className={color}>
        {str ?? text}
      </span>,
    );
    if (colon) out.push(colon);
    last = m.index + text.length;
  }
  out.push(json.slice(last));
  return out;
}

// What the quote tool would say for the first service at size medium, straight from the row.
function sampleQuote(config: Record<string, unknown>) {
  const [service] = config.services as { key: string; base_cents: Record<string, number> }[];
  const guide = config.size_guide as Record<string, string> | undefined;
  return { key: service.key, cents: service.base_cents.medium, size: guide?.medium };
}

export function SwapRow() {
  const [activeId, setActiveId] = useState(EXAMPLE_CONFIGS[0].id);
  const active = EXAMPLE_CONFIGS.find((c) => c.id === activeId) ?? EXAMPLE_CONFIGS[0];
  const sample = sampleQuote(active.config);

  return (
    <Section>
      <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-10">
        <div>
          <SectionHeading align="left" eyebrow="Swap one row" title="Same three agents. Different business.">
            Services, prices, hours, service area, tone and who to prospect all live in one config row. Swap the row and
            the Receptionist quotes a full detail or a meal plan instead of a groom. The code does not change.
          </SectionHeading>

          <div role="tablist" aria-label="Example businesses" aria-orientation="vertical" className="mt-8 flex flex-col gap-2">
            {EXAMPLE_CONFIGS.map((c) => {
              const selected = c.id === active.id;
              return (
                <button
                  key={c.id}
                  id={`config-tab-${c.id}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls="config-panel"
                  onClick={() => setActiveId(c.id)}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-4 rounded-xl border px-4 py-3 text-left transition",
                    "focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none",
                    selected
                      ? "border-brand/40 bg-surface shadow-card ring-1 ring-brand/20"
                      : "border-transparent hover:border-line hover:bg-canvas",
                  )}
                >
                  <span>
                    <span className={cn("block text-sm font-semibold", selected ? "text-ink" : "text-ink/80")}>
                      {c.business}
                    </span>
                    <span className="block text-sm text-muted">{c.label}</span>
                  </span>
                  {c.id === "royal-pawz" ? <Badge tone="brand">Showcase</Badge> : <Badge>Example</Badge>}
                </button>
              );
            })}
          </div>
        </div>

        <div
          id="config-panel"
          role="tabpanel"
          aria-labelledby={`config-tab-${active.id}`}
          className="overflow-hidden rounded-2xl bg-ink shadow-lift ring-1 ring-black/10"
        >
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
            <span className="flex items-center gap-3">
              <span className="flex gap-1.5" aria-hidden="true">
                <span className="size-2.5 rounded-full bg-white/15" />
                <span className="size-2.5 rounded-full bg-white/15" />
                <span className="size-2.5 rounded-full bg-white/15" />
              </span>
              <span className="font-mono text-xs text-white/60">business_config.data</span>
            </span>
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-white/80">
              {active.id === "royal-pawz" ? `${active.business}, excerpt` : `Example: ${active.business}`}
            </span>
          </div>

          <pre
            tabIndex={0}
            className="max-h-[40rem] overflow-auto p-5 font-mono text-[12px] leading-[1.6] break-words whitespace-pre-wrap text-white/50 focus-visible:outline-none"
          >
            <code key={active.id} className="block animate-fade-up">
              {tint(pretty(active.config))}
            </code>
          </pre>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/10 px-5 py-3 text-xs">
            <span className="text-white/50">Priced in code from this row</span>
            <code className="font-mono text-sky-300">quote({sample.key}, medium)</code>
            <ArrowRight className="size-3.5 text-white/40" />
            <span className="font-semibold text-white tabular-nums">{money(sample.cents)}</span>
            {sample.size && <span className="text-white/50">(medium = {sample.size})</span>}
          </div>
        </div>
      </div>
    </Section>
  );
}
