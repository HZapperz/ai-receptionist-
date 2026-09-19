"use client";

import { Bot, MessageSquareText, PawPrint } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Bubble, groupThreads, INBOX_EMPTY, type Message } from "@/components/InboxPanel";
import { Empty } from "@/components/Panel";
import { Card, cn, StatusLabel } from "@/components/ui";
import { houstonTime, maskPhone, timeAgo } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { useTable } from "@/lib/useTable";

type Customer = { name: string | null; pets: { name?: string }[] | null };

// Threads on the left, the selected conversation on the right. Only AI-session phones are stored,
// so every thread here is a conversation the AI handled.
// linked is a message id from a link on the Overview (?m=<id>): it opens that message's thread.
// Links name a message, never a phone, so the number stays out of the URL.
export function InboxView({ linked }: { linked?: string }) {
  const messages = useTable<Message>("messages", 500);
  const threads = groupThreads(messages);
  const [selected, setSelected] = useState<string | null>(null);
  const linkedPhone = linked ? messages.find((m) => String(m.id) === linked)?.phone : undefined;
  const thread = threads.find((t) => t.phone === (selected ?? linkedPhone)) ?? threads[0];
  const phone = thread?.phone;
  const count = thread?.messages.length ?? 0;

  // Name and pets are saved when the AI books; refetch as the conversation grows.
  const [customer, setCustomer] = useState<{ phone: string; data: Customer | null } | null>(null);
  useEffect(() => {
    if (!phone) return;
    let cancelled = false;
    supabase
      .from("customers")
      .select("name, pets")
      .eq("phone", phone)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setCustomer({ phone, data: data as Customer | null });
      });
    return () => {
      cancelled = true;
    };
  }, [phone, count]);
  const who = customer?.phone === phone ? customer?.data : null;
  const pets = (who?.pets ?? []).map((p) => p.name).filter(Boolean);

  // Keep the newest message in view.
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [phone, count]);

  if (!thread) {
    return (
      <Card className="flex flex-1 items-center justify-center">
        <Empty icon={MessageSquareText}>{INBOX_EMPTY}</Empty>
      </Card>
    );
  }

  return (
    <Card className="grid min-h-0 flex-1 grid-cols-[minmax(0,18rem)_minmax(0,1fr)] overflow-hidden xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <ul className="min-h-0 divide-y divide-line overflow-y-auto border-r border-line" aria-label="Conversations">
        {threads.map((t) => (
          <li key={t.phone}>
            <button
              onClick={() => setSelected(t.phone)}
              aria-current={t.phone === phone ? "true" : undefined}
              className={cn(
                "flex w-full cursor-pointer flex-col gap-1 px-4 py-3 text-left transition-colors",
                t.phone === phone ? "bg-brand-soft/70" : "hover:bg-canvas",
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold text-ink">{maskPhone(t.phone)}</span>
                <span className="shrink-0 text-xs text-muted">{timeAgo(t.last.created_at)}</span>
              </span>
              <span className="line-clamp-2 text-xs text-muted">
                {t.last.direction === "out" && <span className="font-medium text-ink/70">AI: </span>}
                {t.last.body}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <section className="flex min-h-0 flex-col" aria-label="Conversation">
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink">
              {maskPhone(thread.phone)}
              {who?.name && <span className="font-normal text-muted"> · {who.name}</span>}
            </p>
            <p className="flex items-center gap-1 truncate text-xs text-muted">
              {pets.length > 0 && (
                <>
                  <PawPrint className="size-3" aria-hidden="true" />
                  {pets.join(", ")} ·{" "}
                </>
              )}
              {count} messages · since {houstonTime(thread.messages[0].created_at, "datetime")}
            </p>
          </div>
          <StatusLabel tone="brand" dot={false} className="shrink-0">
            <Bot aria-hidden="true" />
            Handled by AI
          </StatusLabel>
        </header>
        <div ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {thread.messages.map((m) => (
            <Bubble key={m.id} message={m} />
          ))}
        </div>
      </section>
    </Card>
  );
}
