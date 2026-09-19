"use client";

import { useState } from "react";
import { postAgents } from "@/lib/agents";
import { Panel } from "./Panel";

type Turn = { role: "user" | "assistant"; content: string };

export function ManagerChat() {
  const [history, setHistory] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    const message = input.trim();
    if (!message || busy) return;
    setInput("");
    setBusy(true);
    setHistory((h) => [...h, { role: "user", content: message }]);
    try {
      const { reply } = await postAgents<{ reply: string }>("/manager", { message, history });
      setHistory((h) => [...h, { role: "assistant", content: reply }]);
    } catch (e) {
      setHistory((h) => [...h, { role: "assistant", content: `Error: ${(e as Error).message}` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Manager">
      <div className="flex h-full flex-col gap-3">
        <div className="flex-1 space-y-2">
          {history.map((t, i) => (
            <p key={i} className={t.role === "user" ? "font-medium" : "text-zinc-600 dark:text-zinc-300"}>
              {t.role === "user" ? "You: " : "Manager: "}
              {t.content}
            </p>
          ))}
          {busy && <p className="text-zinc-400">Thinking…</p>}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <input
            className="flex-1 rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="What happened in the last hour?"
          />
          <button className="rounded bg-black px-3 py-1 text-white disabled:opacity-50 dark:bg-white dark:text-black" disabled={busy}>
            Ask
          </button>
        </form>
      </div>
    </Panel>
  );
}
