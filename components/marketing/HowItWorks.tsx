import { Database, MessageSquareText, MessagesSquare, Phone, Rocket, SlidersHorizontal, Telescope } from "lucide-react";
import { Card } from "@/components/ui";
import { BRAND } from "@/lib/brand";
import { Section, SectionHeading } from "./Section";

const STEPS = [
  {
    icon: Phone,
    title: "Connect your business number",
    text: `Point your texting number at ${BRAND.name}. Customers keep texting the number on your website and your cards.`,
  },
  {
    icon: SlidersHorizontal,
    title: "Load your business",
    text: "One config row holds your services, prices, hours, service area and tone. Every agent reads it; none of them makes it up.",
  },
  {
    icon: Rocket,
    title: "Go live",
    text: "The Receptionist starts answering, the Prospector starts looking for partners, and you watch every conversation on one dashboard.",
  },
];

const AGENTS = [
  { name: "Receptionist", icon: MessageSquareText },
  { name: "Prospector", icon: Telescope },
  { name: "Manager", icon: MessagesSquare },
];

// Real table names from supabase/migrations.
const TABLES = ["customers", "bookings", "slots", "leads", "tasks", "shared_notes", "agent_events"];

export function HowItWorks() {
  return (
    <Section id="how" className="border-y border-line bg-canvas">
      <SectionHeading eyebrow="How it works" title="Live in three steps">
        No new app for your customers. They text the number they already have, and {BRAND.name} answers.
      </SectionHeading>

      <div className="relative mt-14">
        <div aria-hidden="true" className="absolute top-6 right-[16.7%] left-[16.7%] hidden h-px bg-line md:block" />
        <ol className="grid gap-10 md:grid-cols-3 md:gap-8">
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative flex flex-col items-center text-center">
              <span className="relative grid size-12 place-items-center rounded-full bg-surface text-brand shadow-card ring-1 ring-line">
                <s.icon className="size-5" />
                <span className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-brand text-[11px] font-semibold text-brand-foreground">
                  {i + 1}
                </span>
              </span>
              <h3 className="mt-5 text-lg font-semibold tracking-tight text-ink">{s.title}</h3>
              <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
      </div>

      <Card className="mt-16 grid items-center gap-10 p-6 sm:p-10 lg:grid-cols-2">
        <div>
          <p className="text-sm font-semibold text-brand">Under the hood</p>
          <h3 className="mt-2 text-2xl font-semibold tracking-tight text-balance text-ink">
            The agents never talk to each other. They share one database.
          </h3>
          <p className="mt-4 leading-relaxed text-muted">
            When the Manager wants a follow-up, it leaves a task. When the Receptionist learns a dog is nervous, it
            writes a note. Everyone reads the same customers, bookings and leads, and every tool call lands in an
            activity log you can read on the dashboard.
          </p>
        </div>

        <div aria-hidden="true">
          <div className="grid grid-cols-3 gap-3">
            {AGENTS.map((a) => (
              <div
                key={a.name}
                className="flex flex-col items-center gap-2 rounded-xl border border-line bg-surface px-2 py-3 shadow-card"
              >
                <span className="grid size-9 place-items-center rounded-lg bg-brand-soft text-brand">
                  <a.icon className="size-4" />
                </span>
                <span className="text-xs font-medium text-ink sm:text-sm">{a.name}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {AGENTS.map((a) => (
              <span key={a.name} className="mx-auto h-10 border-l-2 border-dashed border-brand/35" />
            ))}
          </div>
          <div className="rounded-xl border border-brand/20 bg-brand-soft/60 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Database className="size-4 text-brand" />
              One shared database
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {TABLES.map((t) => (
                <code key={t} className="rounded-md bg-surface px-1.5 py-0.5 font-mono text-[11px] text-muted ring-1 ring-line">
                  {t}
                </code>
              ))}
            </div>
          </div>
        </div>
      </Card>
    </Section>
  );
}
