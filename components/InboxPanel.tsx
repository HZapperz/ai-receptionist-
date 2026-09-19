"use client";

import { useTable, type Row } from "@/lib/useTable";
import { Panel, time } from "./Panel";

type Message = Row & { phone: string; direction: "in" | "out"; body: string; created_at: string };

// Only AI-session conversations are ever stored; real customers' texts are
// forwarded to production by the 833 gate and never reach this table.
export function InboxPanel() {
  const messages = useTable<Message>("messages", 200);
  const threads = new Map<string, Message[]>();
  for (const m of messages) threads.set(m.phone, [...(threads.get(m.phone) ?? []), m]);

  return (
    <Panel title={`Inbox (${threads.size})`}>
      <div className="space-y-4">
        {[...threads.entries()].map(([phone, msgs]) => (
          <div key={phone}>
            <p className="mb-1 text-xs font-semibold text-zinc-500">{phone}</p>
            <ul className="space-y-1">
              {[...msgs].reverse().slice(-8).map((m) => (
                <li key={m.id} className={m.direction === "in" ? "" : "pl-6 text-zinc-600 dark:text-zinc-300"}>
                  <span className="mr-1 text-xs text-zinc-400">{time(m.created_at)}</span>
                  {m.body}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Panel>
  );
}
