"use client";

import { ChevronDown, Globe, MapPin } from "lucide-react";
import type { ReactNode } from "react";
import { Input, Label } from "@/components/ui";
import { BUSINESS_TYPES, type Draft } from "./draft";

function Field({ id, label, className, children }: { id: string; label: string; className?: string; children: ReactNode }) {
  return (
    <div className={className}>
      <Label htmlFor={id} className="mb-1.5 block">
        {label}
      </Label>
      {children}
    </div>
  );
}

// Step 1. Name, type, website and city, prefilled from business_config.
export function BusinessStep({ draft, update }: { draft: Draft; update: (patch: Partial<Draft>) => void }) {
  return (
    <div className="space-y-8">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="biz-name" label="Business name" className="sm:col-span-2">
          <Input id="biz-name" required autoFocus value={draft.name} onChange={(e) => update({ name: e.target.value })} />
        </Field>
        <Field id="biz-type" label="Business type">
          <div className="relative">
            <select
              id="biz-type"
              value={draft.type}
              onChange={(e) => update({ type: e.target.value })}
              className="h-10 w-full cursor-pointer appearance-none rounded-lg border border-line bg-white px-3 pr-9 text-sm text-ink shadow-xs transition-colors focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/20 focus-visible:outline-none"
            >
              {BUSINESS_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted" />
          </div>
        </Field>
        <Field id="biz-city" label="City">
          <div className="relative">
            <MapPin className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <Input id="biz-city" className="pl-9!" value={draft.city} onChange={(e) => update({ city: e.target.value })} />
          </div>
        </Field>
        <Field id="biz-site" label="Website" className="sm:col-span-2">
          <div className="relative">
            <Globe className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <Input
              id="biz-site"
              className="pl-9!"
              placeholder="yourbusiness.com"
              value={draft.website}
              onChange={(e) => update({ website: e.target.value })}
            />
          </div>
          <p className="mt-1.5 text-xs text-muted">We read your services, prices and hours from it in the next step.</p>
        </Field>
      </div>

      <div className="rounded-xl border border-dashed border-line bg-canvas/60 p-4">
        <p className="mb-3 text-xs font-medium tracking-wide text-muted uppercase">Preview: how your receptionist says hello</p>
        <p className="w-fit max-w-md rounded-2xl rounded-bl-sm bg-white px-3.5 py-2.5 text-sm shadow-card ring-1 ring-line">
          Hi! This is the AI assistant for {draft.name.trim() || "your business"}. I can answer questions, quote a price or
          book you in. How can I help?
        </p>
      </div>
    </div>
  );
}
