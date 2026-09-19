import type { ReactNode } from "react";

// Title and one line of context at the top of each dashboard page; children go on the right.
export function PageHeader({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return (
    <div className="flex shrink-0 flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
        <p className="mt-0.5 text-sm text-muted">{description}</p>
      </div>
      {children}
    </div>
  );
}
