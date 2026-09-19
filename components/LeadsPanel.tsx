"use client";

import { AlertCircle, Building2, ChevronDown, Loader2, Mail, MapPin, Search, Send, Star } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, cn } from "@/components/ui";
import { getAgents, postAgents } from "@/lib/agents";
import { Empty, Panel, StatusBadge } from "./Panel";

type Lead = {
  id: string | number;
  name: string;
  address: string | null;
  email: string | null;
  rating: number | null;
  status: string;
  draft_subject: string | null;
  draft_body: string | null;
  created_at?: string;
  [key: string]: unknown;
};

type TaskRecord = {
  id: string;
  kind: string;
  status: "pending" | "running" | "done" | "failed";
  result?: {
    found?: number;
    error?: string;
    [key: string]: unknown;
  } | null;
};

export function LeadsPanel({ className }: { className?: string }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadsError, setLeadsError] = useState<string | null>(null);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [open, setOpen] = useState<string | number | null>(null);
  const [note, setNote] = useState("");
  const [noteTone, setNoteTone] = useState<"brand" | "danger" | "success">("brand");
  const [activeTask, setActiveTask] = useState<TaskRecord | null>(null);
  const [finding, setFinding] = useState(false);
  const [sendingId, setSendingId] = useState<string | number | null>(null);
  const [audience, setAudience] = useState("pet-friendly apartment communities");

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadLeads = useCallback(async () => {
    try {
      const data = await getAgents<{ leads: Lead[]; audience?: string }>("/outbound/leads?limit=50");
      if (!isMountedRef.current) return;
      if (data && Array.isArray(data.leads)) {
        setLeads(data.leads);
        if (data.audience) {
          setAudience(data.audience);
        }
        setLeadsError(null);
      }
    } catch (e) {
      if (!isMountedRef.current) return;
      setLeadsError((e as Error).message);
    } finally {
      if (isMountedRef.current) {
        setLoadingInitial(false);
      }
    }
  }, []);

  const isTaskActive = finding || activeTask?.status === "pending" || activeTask?.status === "running";

  // Poll leads: conservative idle interval (12s) when idle, fast (2s) when task is active
  useEffect(() => {
    const initialTimer = setTimeout(() => {
      loadLeads();
    }, 0);
    const intervalMs = isTaskActive ? 2000 : 12000;
    const pollTimer = setInterval(() => {
      loadLeads();
    }, intervalMs);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(pollTimer);
    };
  }, [loadLeads, isTaskActive]);

  // Track active find_leads task status via proxy endpoint GET /outbound/tasks/{id}
  useEffect(() => {
    if (!activeTask?.id) return;
    const taskId = activeTask.id;
    if (activeTask.status === "done" || activeTask.status === "failed") return;


    async function checkTask() {
      try {
        const updated = await getAgents<TaskRecord>(`/outbound/tasks/${encodeURIComponent(taskId)}`);
        if (!isMountedRef.current) return;
        setActiveTask(updated);
        applyTaskState(updated);
      } catch (e) {
        if (!isMountedRef.current) return;
        const errMessage = (e as Error).message || "";
        if (errMessage.includes("404")) {
          setFinding(false);
          setNote("Search task not found");
          setNoteTone("danger");
          setActiveTask((prev) => (prev ? { ...prev, status: "failed" } : null));
        }
      }
    }

    function applyTaskState(task: TaskRecord) {
      if (task.status === "pending") {
        setNote("Task queued: waiting to start...");
        setNoteTone("brand");
      } else if (task.status === "running") {
        setNote("Searching Houston for partner leads...");
        setNoteTone("brand");
      } else if (task.status === "done") {
        setFinding(false);
        const found = task.result?.found;
        setNote(found != null ? `Search complete: ${found} lead${found === 1 ? "" : "s"} found` : "Search complete");
        setNoteTone("success");
        loadLeads();
      } else if (task.status === "failed") {
        setFinding(false);
        const err = task.result?.error || "Lead search task failed";
        setNote(`Search failed: ${err}`);
        setNoteTone("danger");
        loadLeads();
      }
    }

    checkTask();
    const timer = setInterval(checkTask, 1500);
    return () => clearInterval(timer);
  }, [activeTask?.id, activeTask?.status, loadLeads]);
  // Find partners: kick off outbound find task
  async function handleFind() {
    setFinding(true);
    setNote("Requesting lead search...");
    setNoteTone("brand");
    try {
      const res = await postAgents<{ task_id?: string; status?: string; error?: string }>("/outbound/find", {
        term: audience,
        area: "Houston, TX",
        limit: 20,
      });

      if (res.error || !res.task_id) {
        setNote(`Find partners: ${res.error || "No task ID returned"}`);
        setNoteTone("danger");
        setFinding(false);
        return;
      }

      setActiveTask({
        id: res.task_id,
        kind: "find_leads",
        status: (res.status as TaskRecord["status"]) || "pending",
      });
      setNote(res.status === "running" ? "Searching Houston for partner leads..." : "Task queued: waiting to start...");
      setNoteTone("brand");
    } catch (e) {
      setNote(`Find partners: ${(e as Error).message}`);
      setNoteTone("danger");
      setFinding(false);
    }
  }

  // Send email draft for a specific lead
  async function handleSend(lead: Lead) {
    setSendingId(lead.id);
    try {
      const res = await postAgents<{ error?: string }>("/outbound/send", { lead_id: lead.id });
      if (res.error) {
        setNote(`Send to ${lead.name}: ${res.error}`);
        setNoteTone("danger");
      } else {
        setNote(`Email sent to ${lead.name}`);
        setNoteTone("success");
        loadLeads();
      }
    } catch (e) {
      setNote(`Send to ${lead.name}: ${(e as Error).message}`);
      setNoteTone("danger");
    } finally {
      setSendingId(null);
    }
  }

  return (
    <Panel
      title="Leads"
      count={leads.length}
      className={className}
      action={
        <Button variant="outline" size="sm" disabled={isTaskActive} onClick={handleFind}>
          {isTaskActive ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Search aria-hidden="true" />}
          Find partners
        </Button>
      }
    >
      <p className="mb-3 truncate text-xs text-muted" title={audience}>
        Looking for <span className="font-medium text-ink">{audience}</span>
      </p>
      {note && (
        <p
          className={cn(
            "mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
            noteTone === "danger" && "bg-rose-50 text-rose-700 ring-1 ring-rose-200/80",
            noteTone === "success" && "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/80",
            noteTone === "brand" && "bg-brand-soft text-brand"
          )}
        >
          {isTaskActive && <Loader2 className="size-3.5 animate-spin shrink-0" aria-hidden="true" />}
          {noteTone === "danger" && !isTaskActive && <AlertCircle className="size-3.5 shrink-0 text-rose-500" aria-hidden="true" />}
          <span>{note}</span>
        </p>
      )}
      {leadsError ? (
        <div className="rounded-lg bg-rose-50 p-4 text-xs text-rose-700 ring-1 ring-rose-200">
          <div className="flex items-center gap-2 font-medium">
            <AlertCircle className="size-4 shrink-0 text-rose-500" aria-hidden="true" />
            Failed to load leads from database
          </div>
          <p className="mt-1 text-rose-600/90">{leadsError}</p>
        </div>
      ) : loadingInitial && leads.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center text-muted">
          <Loader2 className="size-5 animate-spin text-brand" aria-hidden="true" />
          <p className="text-xs font-medium">Loading leads...</p>
        </div>
      ) : leads.length === 0 ? (
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
                      <Button
                        size="sm"
                        disabled={sendingId === l.id}
                        onClick={() => handleSend(l)}
                      >
                        {sendingId === l.id ? (
                          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <Send aria-hidden="true" />
                        )}
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
