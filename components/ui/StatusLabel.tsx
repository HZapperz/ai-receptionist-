import type { HTMLAttributes } from "react";
import { cn } from "./cn";

const tones = {
  neutral: "text-muted",
  brand: "text-brand",
  success: "text-emerald-700",
  warning: "text-amber-700",
  danger: "text-rose-700",
  info: "text-sky-700",
};

const dots = {
  neutral: "bg-zinc-400",
  brand: "bg-brand",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-rose-500",
  info: "bg-sky-500",
};

// A status as a small colored dot plus its word — no pill, no fill, no ring. Reads as part of the
// row's text instead of a floating capsule, so a row of three states stays scannable.
export function StatusLabel({
  tone = "neutral",
  dot = true,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof tones; dot?: boolean }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3", tones[tone], className)}
      {...props}
    >
      {dot && <span className={cn("size-1.5 shrink-0 rounded-full", dots[tone])} aria-hidden="true" />}
      {children}
    </span>
  );
}
