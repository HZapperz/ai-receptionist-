"use client";

import { Check, CircleCheck, CircleX, MessageSquareText, PawPrint, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { BookingsPanel } from "@/components/BookingsPanel";
import { groupThreads, INBOX_EMPTY, type Message, type Thread } from "@/components/InboxPanel";
import { Empty, Panel, maskPhones } from "@/components/Panel";
import { Badge, StatusDot } from "@/components/ui";
import { maskPhone, timeAgo } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { useNow } from "@/lib/useNow";
import { useTable, type Row } from "@/lib/useTable";
import { ActivityFeed, type AgentEvent } from "./ActivityFeed";

type Booking = Row & { phone: string | null; status: string };
type Task = Row & { kind: string; status: string; result: { error?: string } | null; created_at: string };
type Customer = { phone: string; name: string | null; pets: { name?: string }[] | null };

const DAY = 24 * 60 * 60 * 1000;
const TASK_LABELS: Record<string, string> = { find_leads: "Lead research", draft_emails: "Email drafts", follow_up: "Follow-up" };

// Phones with an open AI session. ai_sessions is not in the Realtime publication, so poll it.
function useLivePhones(): Set<string> {
  const [phones, setPhones] = useState<Set<string>>(new Set());
  useEffect(() => {
    const load = () =>
      supabase
        .from("ai_sessions")
        .select("phone")
        .is("ended_at", null)
        .gt("expires_at", new Date().toISOString())
        .then(({ data }) => data && setPhones(new Set(data.map((s) => s.phone as string))));
    load();
    const poll = setInterval(load, 20_000);
    return () => clearInterval(poll);
  }, []);
  return phones;
}

// Name and pets per phone, saved when the AI books. Refetched as conversations grow.
function useCustomers(phones: string[], version: number): Map<string, Customer> {
  const [customers, setCustomers] = useState<Map<string, Customer>>(new Map());
  const key = phones.join(",");
  useEffect(() => {
    if (!key) return;
    supabase
      .from("customers")
      .select("phone, name, pets")
      .in("phone", key.split(","))
      .then(({ data }) => data && setCustomers(new Map((data as Customer[]).map((c) => [c.phone, c]))));
  }, [key, version]);
  return customers;
}

// Escalations the viewer marked handled, kept in this browser only: there is no shared "resolved"
// column. Falls back to memory when storage is blocked, so the button still works for the visit.
const HANDLED_KEY = "handled-escalations";
const handledListeners = new Set<() => void>();
let handledMemory = "[]";

function readHandled(): string {
  try {
    return localStorage.getItem(HANDLED_KEY) ?? handledMemory;
  } catch {
    return handledMemory;
  }
}

function useHandled(): [Set<string>, (id: string) => void] {
  const raw = useSyncExternalStore(
    (onChange) => {
      handledListeners.add(onChange);
      return () => handledListeners.delete(onChange);
    },
    readHandled,
    () => "[]",
  );
  const handled = useMemo(() => {
    try {
      return new Set<string>(JSON.parse(raw));
    } catch {
      return new Set<string>();
    }
  }, [raw]);
  const add = (id: string) => {
    handledMemory = JSON.stringify([...handled, id]);
    try {
      localStorage.setItem(HANDLED_KEY, handledMemory);
    } catch {}
    handledListeners.forEach((notify) => notify());
  };
  return [handled, add];
}

// The Overview's four panels. The data is loaded once here and shared, so each table has one subscription.
export function OverviewPanels() {
  const messages = useTable<Message>("messages", 300);
  const events = useTable<AgentEvent>("agent_events", 150);
  const bookings = useTable<Booking>("bookings", 100);
  const tasks = useTable<Task>("tasks", 30);
  const live = useLivePhones();
  const threads = groupThreads(messages);
  const customers = useCustomers(threads.map((t) => t.phone), messages.length);
  const [handled, markHandled] = useHandled();
  const now = useNow();

  const openEscalations = events.filter((e) => e.name === "escalate" && e.ref && !handled.has(String(e.id)));
  const escalatedPhones = new Set(openEscalations.map((e) => e.ref as string));
  const bookedPhones = new Set(bookings.filter((b) => b.status === "confirmed").map((b) => b.phone));
  // The newest message from a phone, so a link can open that conversation without putting the number in the URL.
  const lastMessage = new Map(threads.map((t) => [t.phone, t.last.id]));

  const failedTasks = tasks.filter((t) => t.status === "failed" && now - new Date(t.created_at).getTime() < DAY);

  return (
    <div className="grid gap-4 max-lg:*:h-[28rem] md:grid-cols-2 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,22rem)] lg:grid-rows-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,25rem)]">
      <Panel
        title="Conversations"
        count={threads.length}
        className="lg:row-span-2"
        flush
        action={
          <Link href="/dashboard/inbox" className="text-xs font-medium text-brand hover:underline">
            Open inbox
          </Link>
        }
      >
        {threads.length === 0 ? (
          <Empty icon={MessageSquareText}>{INBOX_EMPTY}</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {threads.map((t) => (
              <ThreadRow
                key={t.phone}
                thread={t}
                customer={customers.get(t.phone)}
                live={live.has(t.phone)}
                booked={bookedPhones.has(t.phone)}
                escalated={escalatedPhones.has(t.phone)}
              />
            ))}
          </ul>
        )}
      </Panel>

      <ActivityFeed events={events} className="lg:row-span-2" />

      <Panel title="Needs you" count={openEscalations.length + failedTasks.length} flush>
        {openEscalations.length + failedTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
            <span className="grid size-10 place-items-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-600/20">
              <CircleCheck className="size-5" aria-hidden="true" />
            </span>
            <p className="text-sm font-medium text-ink">All clear</p>
            <p className="max-w-64 text-xs text-muted">When the AI hands a customer to you, or a job fails, it shows up here.</p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {openEscalations.map((e) => {
              const input = (e.input ?? {}) as { summary?: string; reason?: string };
              const msg = lastMessage.get(e.ref as string);
              return (
                <li key={e.id} className="flex gap-3 px-4 py-3">
                  <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-800">
                    <TriangleAlert className="size-3.5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-medium text-ink">{maskPhones(input.summary ?? "A customer needs a person.")}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {maskPhone(e.ref)} · {(input.reason ?? "other").replace(/_/g, " ")} · {timeAgo(e.created_at)}
                    </p>
                    <div className="mt-2 flex gap-3 text-xs font-medium">
                      {msg != null && (
                        <Link href={`/dashboard/inbox?m=${encodeURIComponent(String(msg))}`} className="text-brand hover:underline">
                          Open conversation
                        </Link>
                      )}
                      <button onClick={() => markHandled(String(e.id))} className="inline-flex cursor-pointer items-center gap-1 text-muted hover:text-ink">
                        <Check className="size-3.5" aria-hidden="true" />
                        Mark handled
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
            {failedTasks.map((t) => (
              <li key={t.id} className="flex gap-3 px-4 py-3">
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-rose-50 text-rose-700">
                  <CircleX className="size-3.5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{TASK_LABELS[t.kind] ?? t.kind} failed</p>
                  {t.result?.error && <p className="mt-0.5 line-clamp-2 text-xs text-muted">{maskPhones(String(t.result.error))}</p>}
                  <p className="mt-1 text-xs">
                    <span className="text-muted">{timeAgo(t.created_at)} · </span>
                    <Link href="/dashboard/activity" className="font-medium text-brand hover:underline">
                      See activity
                    </Link>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <BookingsPanel />
    </div>
  );
}

// One conversation: who, what was said last, and where it stands.
function ThreadRow({
  thread,
  customer,
  live,
  booked,
  escalated,
}: {
  thread: Thread;
  customer?: Customer;
  live: boolean;
  booked: boolean;
  escalated: boolean;
}) {
  const pets = (customer?.pets ?? []).map((p) => p.name).filter(Boolean);
  const who = [customer?.name, pets.join(", ")].filter(Boolean).join(" · ");

  return (
    <li>
      <Link href={`/dashboard/inbox?m=${encodeURIComponent(String(thread.last.id))}`} className="flex gap-3 px-4 py-3 transition-colors hover:bg-canvas">
        <span className="relative mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
          <PawPrint className="size-4" aria-hidden="true" />
          {live && <StatusDot tone="live" pulse className="absolute -right-0.5 -bottom-0.5 ring-2 ring-surface" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-semibold text-ink">
              {maskPhone(thread.phone)}
              {who && <span className="font-normal text-muted"> · {who}</span>}
            </span>
            <span className="shrink-0 text-xs text-muted">{timeAgo(thread.last.created_at)}</span>
          </p>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted">
            {thread.last.direction === "out" && <span className="font-medium text-ink/70">AI: </span>}
            {thread.last.body}
          </p>
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {escalated && <Badge tone="warning">Needs you</Badge>}
            {booked && <Badge tone="success">Booked</Badge>}
            {live ? <Badge tone="info">AI texting</Badge> : <Badge>Session ended</Badge>}
            <span className="text-[11px] text-muted">{thread.messages.length} messages</span>
          </p>
        </div>
      </Link>
    </li>
  );
}
