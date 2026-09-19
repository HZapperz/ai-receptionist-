"use client";

import { ChartBar, MessageSquareText, Telescope } from "lucide-react";
import { Badge, cn } from "@/components/ui";

export const AGENTS = [
  {
    key: "receptionist",
    name: "Receptionist",
    channel: "Texts",
    icon: MessageSquareText,
    does: "Answers every text, quotes from your price list and books open slots on your calendar.",
  },
  {
    key: "prospector",
    name: "Prospector",
    channel: "Email",
    icon: Telescope,
    does: "Finds local partners and drafts outreach for you. Nothing is sent until you click Send.",
  },
  {
    key: "manager",
    name: "Manager",
    channel: "Chat",
    icon: ChartBar,
    does: "Tells you what happened today and hands work to the other two.",
  },
] as const;

export type AgentKey = (typeof AGENTS)[number]["key"];

// Step 4. The three agents, all on by default. The toggles are for show; nothing is saved.
export function TeamStep({ on, toggle, tone }: { on: Record<AgentKey, boolean>; toggle: (key: AgentKey) => void; tone: string }) {
  return (
    <div className="space-y-4">
      {AGENTS.map(({ key, name, channel, icon: Icon, does }, i) => (
        // The entrance animation sits on a wrapper: its fill mode would pin the card's opacity at 1.
        <div key={key} className="animate-fade-up" style={{ animationDelay: `${i * 90}ms` }}>
          <div
            className={cn(
              "flex items-start gap-4 rounded-xl border p-4 transition-all duration-300",
              on[key] ? "border-brand/30 bg-white shadow-card" : "border-line bg-canvas opacity-70",
            )}
          >
            <span
              className={cn(
                "grid size-11 shrink-0 place-items-center rounded-xl transition-colors",
                on[key] ? "bg-linear-to-br from-brand to-violet-600 text-white" : "bg-line text-muted",
              )}
            >
              <Icon className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="font-semibold">{name}</p>
                <Badge>{channel}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted">{does}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={on[key]}
              aria-label={`${name} on duty`}
              onClick={() => toggle(key)}
              className={cn(
                "relative mt-1 h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none",
                on[key] ? "bg-brand" : "bg-zinc-300",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-sm transition-transform duration-200",
                  on[key] && "translate-x-5",
                )}
              />
            </button>
          </div>
        </div>
      ))}
      {tone && (
        <p className="rounded-lg bg-canvas px-4 py-3 text-sm text-muted">
          They all write in your voice: <span className="font-medium text-ink">&ldquo;{tone}&rdquo;</span>
        </p>
      )}
    </div>
  );
}
