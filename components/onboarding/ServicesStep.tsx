"use client";

import { Plus, ShieldCheck, Sparkles } from "lucide-react";
import { Badge, Button, Input } from "@/components/ui";
import { SIZES, type Draft, type Service } from "./draft";

const SIZE_LABELS = { small: "Small", medium: "Medium", large: "Large", xl: "XL" };

function MoneyInput({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted">$</span>
      <Input
        aria-label={label}
        inputMode="decimal"
        className="pl-6! tabular-nums"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
      />
    </div>
  );
}

// Step 2. The price list the receptionist quotes from, as editable-looking rows. Edits stay in the browser.
export function ServicesStep({ draft, update }: { draft: Draft; update: (patch: Partial<Draft>) => void }) {
  const setService = (i: number, patch: Partial<Service>) =>
    update({ services: draft.services.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="brand">
          <Sparkles />
          Imported from your website
        </Badge>
        {draft.website && <span className="text-xs text-muted">{draft.website}</span>}
      </div>

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[36rem] text-sm">
          <thead className="bg-canvas text-left text-xs text-muted">
            <tr>
              <th className="px-4 py-2.5 font-medium">Service</th>
              {SIZES.map((size) => (
                <th key={size} className="px-2 py-2.5 font-medium">
                  {SIZE_LABELS[size]}
                  {typeof draft.sizeGuide[size] === "string" && (
                    <span className="block font-normal text-muted/80">{draft.sizeGuide[size] as string}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {draft.services.map((s, i) => (
              <tr key={i} className="animate-fade-up" style={{ animationDelay: `${i * 90}ms` }}>
                <td className="px-3 py-2.5">
                  <Input
                    aria-label="Service name"
                    placeholder="New service"
                    className="font-medium"
                    value={s.label}
                    onChange={(e) => setService(i, { label: e.target.value })}
                  />
                </td>
                {SIZES.map((size) => (
                  <td key={size} className="w-28 px-2 py-2.5">
                    <MoneyInput
                      label={`${s.label || "Service"}, ${SIZE_LABELS[size]}`}
                      value={s.prices[size]}
                      onChange={(value) => setService(i, { prices: { ...s.prices, [size]: value } })}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => update({ services: [...draft.services, { label: "", prices: { small: "", medium: "", large: "", xl: "" } }] })}
      >
        <Plus />
        Add a service
      </Button>

      {draft.addons.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Add-ons</h3>
          <div className="divide-y divide-line rounded-xl border border-line">
            {draft.addons.map((a, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                <Input
                  aria-label="Add-on name"
                  value={a.label}
                  onChange={(e) => update({ addons: draft.addons.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })}
                />
                <div className="w-28 shrink-0">
                  <MoneyInput
                    label={`${a.label || "Add-on"} price`}
                    value={a.price}
                    onChange={(price) => update({ addons: draft.addons.map((x, j) => (j === i ? { ...x, price } : x)) })}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="flex items-start gap-2 text-sm text-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
        Your receptionist quotes only from this table. Every price is computed in code, never made up by the AI.
      </p>
    </div>
  );
}
