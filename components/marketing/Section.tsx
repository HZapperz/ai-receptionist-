import type { ReactNode } from "react";
import { cn } from "@/components/ui";

// One vertical rhythm for every landing section. scroll-mt keeps anchored headings clear of the sticky nav.
export function Section({ id, className, children }: { id?: string; className?: string; children: ReactNode }) {
  return (
    <section id={id} className={cn("scroll-mt-16 py-20 sm:py-28", className)}>
      <div className="mx-auto max-w-6xl px-6">{children}</div>
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  children,
  align = "center",
}: {
  eyebrow: string;
  title: ReactNode;
  children?: ReactNode;
  align?: "center" | "left";
}) {
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center")}>
      <p className="text-sm font-semibold text-brand">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight text-balance text-ink sm:text-4xl">{title}</h2>
      {children && <p className="mt-4 text-lg leading-relaxed text-pretty text-muted">{children}</p>}
    </div>
  );
}
