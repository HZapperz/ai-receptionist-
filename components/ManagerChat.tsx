"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import { BRAND } from "@/lib/brand";
import {
  createClientId,
  decideManagerApproval,
  enqueueManagerMessage,
  getManagerState,
  type ManagerMessage,
  type ManagerState,
} from "@/lib/manager";

type OutgoingMessage = {
  clientId: string;
  message: string;
  enqueued: boolean;
  error: string | null;
  eventId?: string;
};

const ALLOWED_MARKDOWN_ELEMENTS = [
  "p",
  "br",
  "strong",
  "em",
  "code",
  "ul",
  "ol",
  "li",
  "a",
] as const;

const MARKDOWN_COMPONENTS: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
  br: () => <br />,
  strong: ({ children }) => (
    <strong className="font-semibold text-zinc-950 dark:text-zinc-50">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  code: ({ children }) => (
    <code className="rounded bg-zinc-200/80 px-1 py-0.5 font-mono text-[13px] text-zinc-900 dark:bg-zinc-800 dark:text-zinc-200">
      {children}
    </code>
  ),
  ul: ({ children }) => (
    <ul className="my-2 list-disc list-outside pl-4 space-y-1 last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2 list-decimal list-outside pl-4 space-y-1 last:mb-0">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 break-words"
    >
      {children}
    </a>
  ),
};

function formatPayloadValue(val: unknown): string {
  if (val == null) return "";
  if (typeof val === "object") {
    try {
      return JSON.stringify(val, null, 2);
    } catch {
      return String(val);
    }
  }
  return String(val);
}

function formatDateTime(val: unknown): string {
  if (!val) return "";
  const str = String(val);
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toLocaleString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return str;
}

export function ManagerChat() {
  const [state, setState] = useState<ManagerState | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const loading = !state && !fetchError;
  const [input, setInput] = useState("");
  const [outgoing, setOutgoing] = useState<OutgoingMessage[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef<number>(0);
  const userJustSentRef = useRef<boolean>(false);

  const fetchLatest = useCallback(() =>
    getManagerState().then((data) => {
      setState(data);
      setFetchError(null);

      // Reconcile optimistic outgoing messages by persisted event linkage, not message text
      setOutgoing((prev) =>
        prev.filter((item) => {
          const directEvent = item.eventId
            ? data.events.find((e) => e.id === item.eventId)
            : undefined;
          const matchingEv = data.events.find(
            (e) => e.dedupe_key === item.clientId || e.dedupe_key === `chat:${item.clientId}`
          );
          const persistedMessage = data.messages.some(
            (message) =>
              message.role === "user" &&
              (message.event_id === item.eventId || message.event_id === matchingEv?.id)
          );

          if (persistedMessage) {
            return false;
          }
          if (
            directEvent &&
            (directEvent.status === "completed" ||
              directEvent.status === "failed" ||
              directEvent.status === "interrupted")
          ) {
            return false;
          }
          if (
            matchingEv &&
            (matchingEv.status === "completed" ||
              matchingEv.status === "failed" ||
              matchingEv.status === "interrupted")
          ) {
            return false;
          }
          return true;
        })
      );
    }).catch((e: Error) => {
      setFetchError(e.message);
    }), []);

  useEffect(() => {
    fetchLatest();
    const interval = setInterval(fetchLatest, 3000);
    return () => clearInterval(interval);
  }, [fetchLatest]);

  // Smart auto-scroll: only scroll if message count increased and user was near bottom or just sent
  useEffect(() => {
    const container = scrollContainerRef.current;
    const currentCount = (state?.messages.length ?? 0) + outgoing.length;

    if (container) {
      const isNearBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight < 120;

      if (currentCount > prevMessageCountRef.current && (isNearBottom || userJustSentRef.current)) {
        endRef.current?.scrollIntoView({ behavior: "smooth" });
        userJustSentRef.current = false;
      }
    }
    prevMessageCountRef.current = currentCount;
  }, [state?.messages, outgoing]);

  async function handleSend(e?: React.FormEvent, retryMessage?: OutgoingMessage) {
    if (e) e.preventDefault();
    const message = retryMessage ? retryMessage.message : input.trim();
    if (!message) return;

    userJustSentRef.current = true;
    const clientId = retryMessage ? retryMessage.clientId : createClientId();

    if (!retryMessage) {
      const newOutgoing: OutgoingMessage = { clientId, message, enqueued: false, error: null };
      setInput("");
      setActionError(null);
      setOutgoing((prev) => [...prev, newOutgoing]);
    } else {
      setOutgoing((prev) =>
        prev.map((item) =>
          item.clientId === clientId ? { ...item, error: null, enqueued: false } : item
        )
      );
    }

    try {
      const res = await enqueueManagerMessage(message, clientId);
      setOutgoing((prev) =>
        prev.map((item) =>
          item.clientId === clientId ? { ...item, enqueued: true, eventId: res.event_id } : item
        )
      );
      fetchLatest();
    } catch (err) {
      const msg = (err as Error).message;
      setOutgoing((prev) =>
        prev.map((item) => (item.clientId === clientId ? { ...item, error: msg } : item))
      );
      setActionError(msg);
    }
  }

  async function handleDecision(approvalId: string, decision: "approve" | "reject") {
    setDecidingId(approvalId);
    setActionError(null);
    try {
      await decideManagerApproval(approvalId, decision);
      await fetchLatest();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setDecidingId(null);
    }
  }

  const runtime = state?.runtime;
  const isUnavailable = runtime?.status === "unavailable";
  const activeEvents = state?.events.filter((e) => e.status === "queued" || e.status === "running") ?? [];
  const pendingApprovals = state?.approvals.filter((a) => a.status === "pending") ?? [];
  const activeTasks = state?.tasks.filter((t) => t.status !== "done") ?? [];

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      {/* Top Bar / Status Banner */}
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div>
          <h1 className="text-base font-semibold tracking-tight">{BRAND.showcase} Manager</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Your business assistant
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {loading && !state ? (
            <span className="rounded bg-zinc-100 px-2 py-1 dark:bg-zinc-800">Connecting…</span>
          ) : isUnavailable ? (
            <span className="rounded bg-amber-100 px-2 py-1 font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-200">
              Runtime Unavailable
            </span>
          ) : activeEvents.length > 0 ? (
            <span className="flex items-center gap-1.5 rounded bg-blue-50 px-2.5 py-1 font-medium text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
              <span className="h-2 w-2 animate-pulse rounded-full bg-blue-600 dark:bg-blue-400" />
              Processing ({activeEvents.length})
            </span>
          ) : (
            <span className="flex items-center gap-1.5 rounded bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Ready
            </span>
          )}
        </div>
      </header>

      {/* Global Error Banners */}
      {fetchError && (
        <div className="border-b border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-950 dark:bg-red-950/40 dark:text-red-300" role="alert">
          <p className="font-semibold">Backend Connection Issue</p>
          <p>{fetchError}</p>
        </div>
      )}

      {actionError && (
        <div className="border-b border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-950 dark:bg-amber-950/40 dark:text-amber-300" role="alert">
          <p className="font-semibold">Action Warning</p>
          <p>{actionError}</p>
        </div>
      )}

      {/* Active Tasks Bar */}
      {activeTasks.length > 0 && (
        <section className="border-b border-zinc-200 bg-zinc-50/80 px-4 py-2 dark:border-zinc-800 dark:bg-zinc-900/50">
          <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
            Current Work Item
          </h2>
          <div className="flex flex-wrap gap-2">
            {activeTasks.map((t) => (
              <div key={t.id} className="flex items-center gap-2 rounded border border-zinc-200 bg-white px-2.5 py-1 text-xs shadow-xs dark:border-zinc-700 dark:bg-zinc-800">
                <span className="font-medium">{t.title}</span>
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] uppercase font-bold ${
                  t.status === "needs_approval" ? "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" :
                  t.status === "working" ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" :
                  "bg-zinc-100 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300"
                }`}>
                  {t.status.replace("_", " ")}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Approvals Panel */}
      {pendingApprovals.length > 0 && (
        <section className="border-b border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/50 dark:bg-amber-950/30" aria-label="Approvals Required">
          <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-200 mb-2 flex items-center gap-1.5">
            <svg className="w-4 h-4 fill-current text-amber-600" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            Approval Required ({pendingApprovals.length})
          </h2>
          <div className="space-y-3">
            {pendingApprovals.map((app) => (
              <div key={app.id} className="rounded-md border border-amber-200 bg-white p-3 shadow-xs dark:border-amber-800/80 dark:bg-zinc-900">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="font-mono text-xs font-semibold uppercase text-amber-800 dark:text-amber-300">
                    Action: {app.kind === "send_sms" ? "Send SMS Message" : "Book Service Slot"}
                  </span>
                  <span className="text-[10px] text-zinc-400">ID: {app.id.slice(0, 8)}</span>
                </div>
                <div className="rounded bg-zinc-50 p-2 font-mono text-xs text-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 overflow-x-auto mb-3">
                  <pre className="whitespace-pre-wrap font-sans space-y-1">
                    {app.kind === "send_sms" ? (
                      <>
                        <div><strong className="font-mono">To:</strong> {String(app.payload.phone || app.payload.to || "Unknown")}</div>
                        <div><strong className="font-mono">Message:</strong> {formatPayloadValue(app.payload.body || app.payload.text)}</div>
                      </>
                    ) : (
                      <>
                        <div><strong className="font-mono">Customer Name:</strong> {String(app.payload.customer_name || "N/A")}</div>
                        <div><strong className="font-mono">Phone:</strong> {String(app.payload.phone || "N/A")}</div>
                        <div><strong className="font-mono">Pet Name:</strong> {String(app.payload.pet_name || "N/A")}</div>
                        {app.payload.size != null && (
                          <div><strong className="font-mono">Size:</strong> {String(app.payload.size)}</div>
                        )}
                        {app.payload.coat != null && (
                          <div><strong className="font-mono">Coat:</strong> {String(app.payload.coat)}</div>
                        )}
                        <div><strong className="font-mono">Service:</strong> {String(app.payload.service || "N/A")}</div>
                        {(app.payload.starts_at || app.payload.start_time || app.payload.time) && (
                          <div>
                            <strong className="font-mono">Time:</strong>{" "}
                            {formatDateTime(app.payload.starts_at || app.payload.start_time || app.payload.time)}
                          </div>
                        )}
                        {app.payload.total_cents != null && (
                          <div><strong className="font-mono">Total Price:</strong> ${(Number(app.payload.total_cents) / 100).toFixed(2)}</div>
                        )}
                        {app.payload.addons != null && (
                          <div><strong className="font-mono">Addons:</strong> {formatPayloadValue(app.payload.addons)}</div>
                        )}
                        {app.payload.details != null && (
                          <div><strong className="font-mono">Details:</strong> {formatPayloadValue(app.payload.details)}</div>
                        )}
                        {app.payload.slot_id != null && (
                          <div className="text-zinc-500 text-[11px] mt-1">
                            <strong className="font-mono">Slot ID (Secondary):</strong> {String(app.payload.slot_id)}
                          </div>
                        )}
                      </>
                    )}
                  </pre>
                </div>
                <div className="flex gap-2">
                  <button
                    className="flex-1 rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50 dark:bg-emerald-500 dark:hover:bg-emerald-600"
                    disabled={decidingId === app.id}
                    onClick={() => handleDecision(app.id, "approve")}
                  >
                    {decidingId === app.id ? "Processing…" : "Approve Action"}
                  </button>
                  <button
                    className="flex-1 rounded border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                    disabled={decidingId === app.id}
                    onClick={() => handleDecision(app.id, "reject")}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Conversation Thread */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4" role="log" aria-live="polite">
        {!state && loading ? (
          <div className="flex h-full items-center justify-center text-sm text-zinc-400">
            Loading conversation history…
          </div>
        ) : state?.messages.length === 0 && outgoing.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center p-6 text-zinc-400">
            <svg className="w-12 h-12 mb-2 stroke-current opacity-40" fill="none" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p className="font-medium text-zinc-600 dark:text-zinc-300">No messages yet</p>
            <p className="text-xs">Ask the manager about today&apos;s bookings, incoming texts, or receptionist tasks.</p>
          </div>
        ) : (
          <>
            {state?.messages.map((m: ManagerMessage) => (
              <div
                key={m.id}
                className={`flex flex-col max-w-[85%] ${
                  m.role === "user" ? "ml-auto items-end" : "mr-auto items-start"
                }`}
              >
                <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 mb-1">
                  <span>{m.role === "user" ? "You" : "Manager"}</span>
                  <span>•</span>
                  <span>{new Date(m.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                </div>
                <div
                  className={`rounded-lg px-3.5 py-2.5 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "bg-black text-white dark:bg-white dark:text-black whitespace-pre-wrap"
                      : "bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800"
                  }`}
                >
                  {m.role === "user" ? (
                    m.content
                  ) : (
                    <ReactMarkdown
                      allowedElements={[...ALLOWED_MARKDOWN_ELEMENTS]}
                      unwrapDisallowed
                      components={MARKDOWN_COMPONENTS}
                    >
                      {m.content}
                    </ReactMarkdown>
                  )}
                </div>
              </div>
            ))}

            {/* Render local outgoing queued messages */}
            {outgoing.map((item) => (
              <div key={item.clientId} className="flex flex-col max-w-[85%] ml-auto items-end">
                <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 mb-1">
                  <span>You</span>
                  <span>•</span>
                  <span className="italic">
                    {item.error ? "Failed" : item.enqueued ? "Queued" : "Sending…"}
                  </span>
                </div>
                <div
                  className={`rounded-lg px-3.5 py-2.5 text-sm whitespace-pre-wrap leading-relaxed opacity-90 ${
                    item.error
                      ? "border border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
                      : "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-black"
                  }`}
                >
                  {item.message}
                </div>
                {item.error && (
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[11px] text-red-600 dark:text-red-400">
                      {item.error}
                    </span>
                    <button
                      className="text-[11px] font-semibold underline text-red-700 dark:text-red-300 hover:text-red-900"
                      onClick={() => handleSend(undefined, item)}
                    >
                      Retry submission
                    </button>
                  </div>
                )}
              </div>
            ))}
          </>
        )}
        <div ref={endRef} />
      </div>

      {/* Input Composer Form */}
      <form
        onSubmit={handleSend}
        className="border-t border-zinc-200 p-3 bg-white dark:border-zinc-800 dark:bg-zinc-950 flex gap-2"
      >
        <input
          type="text"
          className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:placeholder-zinc-500 dark:focus:ring-white disabled:opacity-50"
          placeholder={
            isUnavailable
              ? "Manager runtime currently unavailable…"
              : "Ask manager to check bookings, summarize texts, or approve work…"
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isUnavailable}
          aria-label="Message to Manager"
        />
        <button
          type="submit"
          disabled={isUnavailable || !input.trim()}
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200 transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  );
}
