"use client";

// Thread helpers shared by the Inbox page and the Overview's conversation list.
import { cn } from "@/components/ui";
import { houstonTime } from "@/lib/format";
import type { Row } from "@/lib/useTable";

export type Message = Row & { phone: string; direction: "in" | "out"; body: string; created_at: string };
export type Thread = { phone: string; messages: Message[]; last: Message };

export const INBOX_EMPTY = "No conversations yet. Text the code word to the demo number to start one.";

// Rows arrive newest first, so threads come out most recent first; each thread's messages run oldest to newest.
export function groupThreads(messages: Message[]): Thread[] {
  const byPhone = new Map<string, Message[]>();
  for (const m of messages) byPhone.set(m.phone, [...(byPhone.get(m.phone) ?? []), m]);
  return [...byPhone.entries()].map(([phone, msgs]) => ({ phone, messages: [...msgs].reverse(), last: msgs[0] }));
}

// The customer on the left, the AI on the right.
export function Bubble({ message }: { message: Message }) {
  const out = message.direction === "out";
  return (
    <div className={cn("flex flex-col", out ? "items-end" : "items-start")}>
      <p
        className={cn(
          "max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap",
          out ? "rounded-br-md bg-brand text-brand-foreground" : "rounded-bl-md bg-canvas text-ink ring-1 ring-line ring-inset",
        )}
      >
        {message.body}
      </p>
      <span className="mt-1 px-1 text-[11px] text-muted">{houstonTime(message.created_at)}</span>
    </div>
  );
}
