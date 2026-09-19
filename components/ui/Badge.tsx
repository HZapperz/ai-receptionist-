import type { HTMLAttributes } from "react";
import { cn } from "./cn";

const tones = {
  neutral: "bg-canvas text-ink/70 ring-line",
  brand: "bg-brand-soft text-brand ring-brand/20",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  warning: "bg-amber-50 text-amber-800 ring-amber-600/20",
  danger: "bg-rose-50 text-rose-700 ring-rose-600/20",
  info: "bg-sky-50 text-sky-700 ring-sky-600/20",
};

export function Badge({ tone = "neutral", className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof tones }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset [&_svg]:size-3",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
