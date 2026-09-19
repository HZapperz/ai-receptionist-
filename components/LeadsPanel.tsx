"use client";

import { Building2, ChevronDown, Mail, MapPin, Search, Send, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, cn } from "@/components/ui";
import { postAgents } from "@/lib/agents";
import { supabase } from "@/lib/supabase";
import { useTable, type Row } from "@/lib/useTable";
import { Empty, Panel, StatusBadge } from "./Panel";

type Lead = Row & {
  name: string;
  address: string | null;
  email: string | null;
  rating: number | null;
  status: string;
  draft_subject: string | null;
  draft_body: string | null;
};

export function LeadsPanel({ className }: { className?: string }) {
  const leads = useTable<Lead>("leads");
  const [open, setOpen] = useState<string | number | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
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

  // The agents service does the work; the browser only asks. Rows update through Realtime.
  async function run(path: string, body: unknown, label: string) {
    setBusy(label);
    try {
      const res = await postAgents<Record<string, unknown>>(path, body);
      setNote(res.error ? `${label}: ${res.error}` : `${label}: started`);
    } catch (e) {
      setNote(`${label}: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Panel
      title="Leads"
      count={leads.length}
      className={className}
      action={
        <Button
          variant="outline"
          size="sm"
          disabled={busy !== null}
          onClick={() => run("/outbound/find", { term: audience, area: "Houston, TX", limit: 20 }, "Find partners")}
        >
          <Search aria-hidden="true" />
          Find partners
        </Button>
      }
    >
      <p className="mb-3 truncate text-xs text-muted" title={audience}>
        Looking for <span className="font-medium text-ink">{audience}</span>
      </p>
      {note && <p className="mb-3 rounded-lg bg-brand-soft px-3 py-2 text-xs text-brand">{note}</p>}
      {leads.length === 0 ? (
        <Empty icon={Building2}>No leads yet. Click Find partners and the outbound agent will search and draft emails.</Empty>
      ) : (
        <ul className="space-y-2">
          {leads.map((l) => (
            <li key={l.id} className={cn("rounded-lg border border-line transition-colors", open === l.id && "bg-canvas/60")}>
              <button
                className="flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-left"
                onClick={() => setOpen(open === l.id ? null : l.id)}
                aria-expanded={open === l.id}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">{l.name}</span>
                  {l.address && (
                    <span className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted">
                      <MapPin className="size-3 shrink-0" aria-hidden="true" />
                      <span className="truncate">{l.address}</span>
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {l.rating != null && (
                    <span className="flex items-center gap-0.5 text-xs text-muted">
                      <Star className="size-3 fill-amber-400 text-amber-400" aria-hidden="true" />
                      {l.rating}
                    </span>
                  )}
                  <StatusBadge status={l.status} />
                  <ChevronDown className={cn("size-4 text-muted transition-transform", open === l.id && "rotate-180")} aria-hidden="true" />
                </span>
              </button>
              {open === l.id && (
                <div className="space-y-3 border-t border-line px-3 py-3">
                  {l.email && (
                    <p className="flex items-center gap-1.5 text-xs text-muted">
                      <Mail className="size-3.5" aria-hidden="true" />
                      {l.email}
                    </p>
                  )}
                  <div className="rounded-lg border border-line bg-surface p-3">
                    <p className="font-medium text-ink">{l.draft_subject ?? "No draft yet"}</p>
                    {l.draft_body && <pre className="mt-2 font-sans text-sm whitespace-pre-wrap text-ink/80">{l.draft_body}</pre>}
                  </div>
                  {l.status === "drafted" && (
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs text-muted">Nothing is sent until you click.</p>
                      <Button size="sm" disabled={busy !== null} onClick={() => run("/outbound/send", { lead_id: l.id }, `Send to ${l.name}`)}>
                        <Send aria-hidden="true" />
                        Send
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
