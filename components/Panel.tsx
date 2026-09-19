import type { ReactNode } from "react";

export function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex min-h-0 flex-col rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 text-sm">{children}</div>
    </section>
  );
}

export const time = (iso: unknown) =>
  typeof iso === "string" ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
