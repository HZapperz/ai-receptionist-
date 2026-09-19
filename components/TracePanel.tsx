"use client";

import { Activity } from "lucide-react";
import { useState } from "react";
import { Badge, cn } from "@/components/ui";
import { houstonTime, maskPhone } from "@/lib/format";
import { useTable, type Row } from "@/lib/useTable";
import { Empty, Panel, maskPhones } from "./Panel";

type Event = Row & {
  agent: string;
  kind: string;
  name: string | null;
  input: unknown;
  result: unknown;
  latency_ms: number | null;
  ref: string | null;
  created_at: string;
};

const AGENTS = ["inbound", "outbound", "manager"] as const;
const AGENT_TONES = { inbound: "info", outbound: "warning", manager: "brand" } as const;
const KINDS: Record<string, { border: string; text: string }> = {
  tool: { border: "border-brand", text: "text-brand" },
  message: { border: "border-emerald-500", text: "text-emerald-700" },
  error: { border: "border-rose-500", text: "text-rose-700" },
};
const OTHER_KIND = { border: "border-line", text: "text-muted" };

// Tool inputs and results can hold a phone (a "to", a summary), so mask them too.
const short = (v: unknown) => (v == null ? "" : maskPhones(JSON.stringify(v)).slice(0, 160));

// Every tool call, reply and error, newest first. filters adds agent chips (the Activity page).
export function TracePanel({ className, filters = false }: { className?: string; filters?: boolean }) {
  const events = useTable<Event>("agent_events", filters ? 300 : 100);
  const [agent, setAgent] = useState<string>("all");
  const shown = agent === "all" ? events : events.filter((e) => e.agent === agent);

  return (
    <Panel
      title="Trace"
      count={shown.length}
      className={className}
      action={
        filters && (
          <div className="flex gap-1" role="group" aria-label="Filter by agent">
            {["all", ...AGENTS].map((a) => (
              <button
                key={a}
                onClick={() => setAgent(a)}
                aria-pressed={agent === a}
                className={cn(
                  "cursor-pointer rounded-full px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                  agent === a ? "bg-ink text-white" : "text-muted hover:bg-canvas hover:text-ink",
                )}
              >
                {a}
              </button>
            ))}
          </div>
        )
      }
    >
      {shown.length === 0 ? (
        <Empty icon={Activity}>Nothing yet. Every tool call and reply shows up here as it happens.</Empty>
      ) : (
        <ul className="space-y-3">
          {shown.map((e) => (
            <li key={e.id} className={cn("border-l-2 pl-3", (KINDS[e.kind] ?? OTHER_KIND).border)}>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted tabular-nums">{houstonTime(e.created_at)}</span>
                <Badge tone={AGENT_TONES[e.agent as keyof typeof AGENT_TONES] ?? "neutral"}>{e.agent}</Badge>
                <span className="truncate font-medium text-ink">{e.name ?? e.kind}</span>
                <span className={cn("font-medium", (KINDS[e.kind] ?? OTHER_KIND).text)}>{e.kind}</span>
                {e.latency_ms != null && <span className="text-muted">{e.latency_ms} ms</span>}
                {e.ref && (
                  <span className="ml-auto max-w-36 shrink-0 truncate text-muted" title={maskPhone(e.ref)}>
                    {maskPhone(e.ref)}
                  </span>
                )}
              </div>
              {e.input != null && (
                <p className="mt-1 line-clamp-2 font-mono text-[11px] break-all text-muted">
                  <span className="text-ink/60">in </span>
                  {short(e.input)}
                </p>
              )}
              {e.result != null && (
                <p className="mt-0.5 line-clamp-2 font-mono text-[11px] break-all text-muted">
                  <span className="text-ink/60">out </span>
                  {short(e.result)}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
