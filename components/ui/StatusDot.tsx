import { cn } from "./cn";

const tones = {
  live: "bg-emerald-500",
  idle: "bg-zinc-300",
  error: "bg-rose-500",
};

// A small colored dot; with pulse it radiates like a live indicator. Pair it with text, it has no label.
export function StatusDot({ tone = "live", pulse = false, className }: { tone?: keyof typeof tones; pulse?: boolean; className?: string }) {
  return (
    <span className={cn("relative inline-flex size-2.5 shrink-0", className)} aria-hidden="true">
      {pulse && <span className={cn("absolute inset-0 rounded-full animate-live-pulse", tones[tone])} />}
      <span className={cn("relative size-2.5 rounded-full", tones[tone])} />
    </span>
  );
}
