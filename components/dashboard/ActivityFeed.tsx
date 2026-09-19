"use client";

import {
  Activity,
  Brain,
  CalendarCheck,
  CalendarSearch,
  CircleAlert,
  FileText,
  MessageSquareText,
  Search,
  Tag,
  TriangleAlert,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { Empty, Panel, maskPhones } from "@/components/Panel";
import { cn } from "@/components/ui";
import { houstonTime, maskPhone, money } from "@/lib/format";
import type { Row } from "@/lib/useTable";

export type AgentEvent = Row & {
  agent: string;
  kind: string;
  name: string | null;
  input: unknown;
  result: unknown;
  ref: string | null;
  created_at: string;
};

type Line = { icon: LucideIcon; title: string; detail?: string; tone?: "warning" | "danger" };

// "royal_groom" -> "Royal Groom".
export const serviceName = (key: unknown) =>
  typeof key === "string" && key ? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "a service";

// One agent_events row as a sentence an owner can read. null hides the row (sms_dry_run repeats the reply).
function describe(e: AgentEvent): Line | null {
  const i = (e.input ?? {}) as Record<string, unknown>;
  const r = (e.result ?? {}) as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === "string" ? v : undefined);

  if (e.kind === "tool" && r.error) {
    return { icon: CircleAlert, tone: "danger", title: `${serviceName(e.name)} failed`, detail: String(r.error) };
  }
  switch (e.name) {
    case "sms_dry_run":
      return null;
    case "reply":
      return {
        icon: MessageSquareText,
        title: e.agent === "inbound" ? `Texted ${maskPhone(e.ref) || "a customer"}` : `The ${e.agent} agent replied`,
        detail: text(r.text),
      };
    case "quote": {
      const extras = [i.size, i.coat && `${i.coat} coat`].filter(Boolean).join(", ");
      return { icon: Tag, title: `Quoted ${serviceName(i.service)}${extras ? ` (${extras})` : ""}: ${money(r.total_cents as number)}` };
    }
    case "find_slots": {
      const slots = Array.isArray(r.slots) ? (r.slots as { label?: string }[]) : [];
      return {
        icon: CalendarSearch,
        title: slots.length ? `Found ${slots.length} open ${slots.length === 1 ? "slot" : "slots"}` : "Found no openings",
        detail: slots.slice(0, 3).map((s) => s.label).join(" · ") || undefined,
      };
    }
    case "book":
      return {
        icon: CalendarCheck,
        title: `Booked ${text(i.pet_name) ?? "a pet"} for ${text(r.label) ?? "an appointment"}`,
        detail: `${serviceName(i.service)} · ${money(r.total_cents as number)} · ${text(r.status) ?? "confirmed"}`,
      };
    case "escalate":
      return { icon: TriangleAlert, tone: "warning", title: "Flagged for the owner", detail: text(i.summary) };
    case "recall": {
      const notes = Array.isArray(r.notes) ? r.notes.length : 0;
      return { icon: Brain, title: "Checked its memory", detail: notes ? `${notes} saved ${notes === 1 ? "note" : "notes"}` : "Nothing saved yet" };
    }
    case "remember":
      return { icon: Brain, title: "Saved a note for next time", detail: text(i.note) };
    case "save_research_plan":
      return { icon: Search, title: `Planned research: “${text(i.search_term) ?? "leads"}”`, detail: text(i.rationale) };
    case "save_report_synthesis":
      return { icon: FileText, title: `Wrote a report: ${text(i.title) ?? "market research"}`, detail: text(i.summary) };
    case "bad_reply":
      return { icon: CircleAlert, tone: "danger", title: "Held back a reply that failed a check" };
  }
  if (e.kind === "error") return { icon: CircleAlert, tone: "danger", title: `Error: ${e.name ?? "unknown"}` };
  return { icon: Wrench, title: serviceName(e.name ?? e.kind), detail: e.input == null ? undefined : JSON.stringify(e.input) };
}

// Outbound replies are Markdown; a one-line preview reads better without the ** and # marks.
const plain = (text: string) => maskPhones(text.replace(/[*`#>]+/g, "").replace(/\s+/g, " ").trim());

const AGENT_TONES: Record<string, string> = {
  inbound: "bg-sky-50 text-sky-700",
  outbound: "bg-amber-50 text-amber-700",
  manager: "bg-brand-soft text-brand",
};
const ALERT_TONES = { warning: "bg-amber-100 text-amber-800", danger: "bg-rose-50 text-rose-700" };

// What the agents did, newest first, in plain English. The raw tool calls are on the Activity page.
export function ActivityFeed({ events, className }: { events: AgentEvent[]; className?: string }) {
  const lines = events.map((e) => ({ e, line: describe(e) })).filter((x): x is { e: AgentEvent; line: Line } => !!x.line);

  return (
    <Panel
      title="What the AI is doing"
      count={lines.length}
      className={className}
      flush
      action={
        <Link href="/dashboard/activity" className="text-xs font-medium text-brand hover:underline">
          Raw trace
        </Link>
      }
    >
      {lines.length === 0 ? (
        <Empty icon={Activity}>Nothing yet. Every reply, quote and booking shows up here as it happens.</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {lines.map(({ e, line }) => (
            <li key={e.id} className="flex gap-3 px-4 py-2.5">
              <span
                className={cn(
                  "mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg",
                  line.tone ? ALERT_TONES[line.tone] : (AGENT_TONES[e.agent] ?? "bg-canvas text-muted"),
                )}
              >
                <line.icon className="size-3.5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-baseline justify-between gap-3">
                  <span className="truncate font-medium text-ink">{maskPhones(line.title)}</span>
                  <span className="shrink-0 text-xs text-muted tabular-nums">{houstonTime(e.created_at)}</span>
                </p>
                {line.detail && <p className="mt-0.5 line-clamp-2 text-xs text-muted">{plain(line.detail)}</p>}
                <p className="mt-0.5 text-[11px] text-muted/80">{serviceName(e.agent)} agent</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
