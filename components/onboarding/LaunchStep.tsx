"use client";

import { ArrowRight, Check, LoaderCircle, PartyPopper } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, cn } from "@/components/ui";
import { maskPhone } from "@/lib/format";
import type { Draft } from "./draft";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Step 5. A checklist that ticks through in about four seconds, then the way into the dashboard.
export function LaunchStep({ draft, agentsOn }: { draft: Draft; agentsOn: number }) {
  const [done, setDone] = useState(0);
  const items = [
    { label: "Loading your services", detail: `${plural(draft.services.length, "service")}, ${plural(draft.addons.length, "add-on")}` },
    { label: "Setting your hours", detail: draft.hours },
    { label: "Training your receptionist on your tone", detail: draft.tone },
    { label: "Connecting your number", detail: maskPhone(draft.phone) },
    { label: "Ready", detail: `${plural(agentsOn, "agent")} on duty` },
  ];
  const finished = done >= items.length;

  useEffect(() => {
    if (finished) return;
    const t = setTimeout(() => setDone((d) => d + 1), 800);
    return () => clearTimeout(t);
  }, [done, finished]);

  return (
    <div className="space-y-8">
      <div className="h-1.5 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-brand transition-all duration-700 ease-out" style={{ width: `${(done / items.length) * 100}%` }} />
      </div>

      <ul className="space-y-1">
        {items.map((item, i) => {
          const state = i < done ? "done" : i === done ? "running" : "waiting";
          return (
            <li key={item.label} className="flex items-center gap-3 rounded-lg px-2 py-2.5">
              <span
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-full transition-colors duration-300",
                  state === "done" && "bg-emerald-500 text-white",
                  state === "running" && "bg-brand-soft text-brand",
                  state === "waiting" && "border border-line text-transparent",
                )}
              >
                {state === "running" ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />}
              </span>
              <span className={cn("font-medium transition-colors", state === "waiting" ? "text-muted" : "text-ink")}>{item.label}</span>
              {state === "done" && item.detail && (
                <span className="ml-auto min-w-0 animate-fade-up truncate pl-4 text-sm text-muted">{item.detail}</span>
              )}
            </li>
          );
        })}
      </ul>

      {finished && (
        <div className="animate-fade-up rounded-xl bg-linear-to-br from-brand-soft to-white p-6 text-center ring-1 ring-brand/15 ring-inset">
          <PartyPopper className="mx-auto size-8 text-brand" />
          <p className="mt-3 text-xl font-semibold tracking-tight">{draft.name.trim() || "Your business"} is live</p>
          <p className="mt-1 text-sm text-muted">Your AI team is answering texts. Watch it work from the dashboard.</p>
          <Button href="/dashboard" size="lg" className="mt-5">
            Open your dashboard
            <ArrowRight />
          </Button>
        </div>
      )}
    </div>
  );
}
