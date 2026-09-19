"use client";

import { useEffect, useState } from "react";
import { postAgents } from "@/lib/agents";
import { supabase } from "@/lib/supabase";
import { useTable, type Row } from "@/lib/useTable";
import { Panel } from "./Panel";

type Lead = Row & {
  name: string;
  address: string | null;
  email: string | null;
  status: string;
  draft_subject: string | null;
  draft_body: string | null;
};

export function LeadsPanel() {
  const leads = useTable<Lead>("leads");
  const [open, setOpen] = useState<string | number | null>(null);
  const [note, setNote] = useState("");
  const [audience, setAudience] = useState("pet-friendly apartment communities");

  useEffect(() => {
    supabase
      .from("business_config")
      .select("data")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data }) => {
        const a = (data?.data as { outbound?: { audience?: string } } | undefined)?.outbound?.audience;
        if (a) setAudience(a);
      });
  }, []);

  async function run(path: string, body: unknown, label: string) {
    try {
      const res = await postAgents<Record<string, unknown>>(path, body);
      setNote(res.error ? `${label}: ${res.error}` : `${label}: started`);
    } catch (e) {
      setNote(`${label}: ${(e as Error).message}`);
    }
  }

  return (
    <Panel
      title={`Leads (${leads.length})`}
      action={
        <button
          className="rounded border border-zinc-300 px-2 py-0.5 text-xs dark:border-zinc-700"
          onClick={() => run("/outbound/find", { term: audience, area: "Houston, TX", limit: 20 }, "Find partners")}
        >
          Find partners
        </button>
      }
    >
      {note && <p className="mb-2 text-xs text-zinc-500">{note}</p>}
      <ul className="space-y-2">
        {leads.map((l) => (
          <li key={l.id} className="rounded border border-zinc-100 p-2 dark:border-zinc-800">
            <div className="flex items-center justify-between gap-2">
              <button className="text-left font-medium" onClick={() => setOpen(open === l.id ? null : l.id)}>
                {l.name}
              </button>
              <span className="text-xs text-zinc-500">{l.status}</span>
            </div>
            {l.address && <p className="text-xs text-zinc-500">{l.address}</p>}
            {open === l.id && (
              <div className="mt-2 space-y-2">
                <p className="font-medium">{l.draft_subject ?? "No draft yet"}</p>
                {l.draft_body && <pre className="whitespace-pre-wrap font-sans text-zinc-600 dark:text-zinc-300">{l.draft_body}</pre>}
                {l.status === "drafted" && (
                  <button
                    className="rounded bg-black px-2 py-0.5 text-xs text-white dark:bg-white dark:text-black"
                    onClick={() => run("/outbound/send", { lead_id: l.id }, `Send to ${l.name}`)}
                  >
                    Send
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
