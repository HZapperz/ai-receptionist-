"use client";

import { ListChecks, Play } from "lucide-react";
import { useState } from "react";
import { Empty, maskPhones, Panel, StatusBadge } from "@/components/Panel";
import { Button } from "@/components/ui";
import { postAgents } from "@/lib/agents";
import { houstonTime, timeAgo } from "@/lib/format";
import { useTable, type Row } from "@/lib/useTable";

type Task = Row & {
  for_agent: string;
  kind: string;
  payload: unknown;
  status: string;
  created_by: string;
  result: { error?: string } | null;
  created_at: string;
};

const KIND_LABELS: Record<string, string> = { find_leads: "Find leads", draft_emails: "Draft emails", follow_up: "Follow up" };

// A follow_up payload holds a phone, so mask before showing.
const short = (v: unknown) => (v == null ? "" : maskPhones(JSON.stringify(v)).slice(0, 140));

// Hand-offs between agents: the manager writes a tasks row, the owning agent picks it up.
export function TasksPanel({ className }: { className?: string }) {
  const tasks = useTable<Task>("tasks");
  const [note, setNote] = useState("");
  const pending = tasks.filter((t) => t.status === "pending").length;

  async function runPending() {
    try {
      await postAgents("/tasks/run", {});
      setNote("Running pending tasks");
    } catch (e) {
      setNote((e as Error).message);
    }
  }

  return (
    <Panel
      title="Tasks"
      count={tasks.length}
      className={className}
      action={
        <Button variant="outline" size="sm" disabled={pending === 0} onClick={runPending}>
          <Play aria-hidden="true" />
          Run pending{pending > 0 && ` (${pending})`}
        </Button>
      }
    >
      {note && <p className="mb-3 rounded-lg bg-brand-soft px-3 py-2 text-xs text-brand">{note}</p>}
      {tasks.length === 0 ? (
        <Empty icon={ListChecks}>No hand-offs yet. Ask the manager to find partners or to follow up with a customer.</Empty>
      ) : (
        <ul className="space-y-2">
          {tasks.map((t) => (
            <li key={t.id} className="rounded-lg border border-line p-3">
              <div className="flex items-center gap-2">
                <span className="min-w-0 truncate font-medium text-ink">
                  {KIND_LABELS[t.kind] ?? t.kind}
                  <span className="text-xs font-normal text-muted"> · {t.for_agent}</span>
                </span>
                <span className="ml-auto flex items-center gap-2">
                  <span className="text-xs text-muted" title={houstonTime(t.created_at, "datetime")}>
                    {timeAgo(t.created_at)}
                  </span>
                  <StatusBadge status={t.status} />
                </span>
              </div>
              <p className="mt-1.5 truncate font-mono text-[11px] text-muted" title={short(t.payload)}>
                {short(t.payload)}
              </p>
              {t.result && (
                <p className={`mt-1 line-clamp-2 font-mono text-[11px] break-all ${t.result.error ? "text-rose-700" : "text-ink/70"}`}>
                  {t.result.error ? `error: ${maskPhones(String(t.result.error))}` : short(t.result)}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
