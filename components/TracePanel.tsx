"use client";

import { useTable, type Row } from "@/lib/useTable";
import { Panel, time } from "./Panel";

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

const short = (v: unknown) => (v == null ? "" : JSON.stringify(v).slice(0, 160));

export function TracePanel() {
  const events = useTable<Event>("agent_events", 100);
  return (
    <Panel title="Trace">
      <ul className="space-y-2 font-mono text-xs">
        {events.map((e) => (
          <li key={e.id}>
            <span className="text-zinc-400">{time(e.created_at)} </span>
            <span className="font-semibold">{e.agent}</span> {e.kind}
            {e.name ? ` ${e.name}` : ""}
            {e.latency_ms != null ? ` (${e.latency_ms} ms)` : ""}
            {e.input != null && <div className="text-zinc-500">in: {short(e.input)}</div>}
            {e.result != null && <div className="text-zinc-500">out: {short(e.result)}</div>}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
