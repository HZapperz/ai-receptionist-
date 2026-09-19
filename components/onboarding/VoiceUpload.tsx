"use client";

import { useRef, useState } from "react";
import { Check, FileText, Loader2, Upload, X } from "lucide-react";
import { cn } from "@/components/ui";

// Step 4, under the agent list. The owner uploads past conversations so the agents write
// the way they already text. Like the toggles above it, this is for show: the file is read
// in the browser to count its lines and is never uploaded or stored anywhere.
const ACCEPT = ".txt,.csv,.json,.md";

function countMessages(text: string): number {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  return lines.length;
}

export function VoiceUpload({ tone }: { tone: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; messages: number } | null>(null);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);

  async function accept(picked: File | undefined) {
    if (!picked) return;
    setReading(true);
    const text = await picked.text().catch(() => "");
    // A beat, so the owner sees it being read rather than a result appearing instantly.
    await new Promise((r) => setTimeout(r, 900));
    setFile({ name: picked.name, messages: countMessages(text) });
    setReading(false);
  }

  function clear() {
    setFile(null);
    if (input.current) input.current.value = "";
  }

  return (
    <div className="rounded-xl border border-line bg-white p-4 shadow-card">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-linear-to-br from-brand to-violet-600 text-white">
          <FileText className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Teach them your voice</p>
          <p className="mt-1 text-sm text-muted">
            Upload past texts or emails with customers. The agents learn your wording, your greetings and
            your shorthand, so replies sound like you wrote them.
          </p>
        </div>
      </div>

      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={(e) => accept(e.target.files?.[0])}
      />

      {file ? (
        <div className="mt-4 flex items-center gap-3 rounded-lg border border-brand/30 bg-brand-soft px-4 py-3">
          <Check className="size-4 shrink-0 text-brand" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-ink">{file.name}</span>
            <span className="block text-xs text-muted">
              Learned from {file.messages.toLocaleString()} message{file.messages === 1 ? "" : "s"}
              {tone ? ` · matched against "${tone}"` : ""}
            </span>
          </span>
          <button
            type="button"
            onClick={clear}
            aria-label="Remove uploaded conversation history"
            className="shrink-0 cursor-pointer rounded-md p-1 text-muted transition-colors hover:bg-canvas hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void accept(e.dataTransfer.files?.[0]);
          }}
          disabled={reading}
          className={cn(
            "mt-4 flex w-full cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-dashed px-4 py-6 transition-colors",
            "focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none",
            dragging ? "border-brand bg-brand-soft" : "border-line bg-canvas hover:border-brand/40 hover:bg-brand-soft/40",
            reading && "cursor-wait opacity-70",
          )}
        >
          {reading ? (
            <>
              <Loader2 className="size-5 animate-spin text-brand" />
              <span className="text-sm font-medium text-ink">Reading your conversations…</span>
            </>
          ) : (
            <>
              <Upload className="size-5 text-muted" />
              <span className="text-sm font-medium text-ink">Drop a file, or click to choose</span>
              <span className="text-xs text-muted">.txt, .csv, .json or .md export — up to 12 months</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}
