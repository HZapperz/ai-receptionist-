import { BellRing, Calculator, MousePointerClick, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui";
import { Section, SectionHeading } from "./Section";

// The first three are enforced in code in the agents service (see CLAUDE.md "Rules" and the 833 gate).
// The last is the escalate tool, which texts OWNER_PHONE.
const RULES = [
  {
    icon: Calculator,
    title: "Prices and times come from your data",
    text: "Quotes and open slots are computed in code from your config and your calendar. The AI never states a price or a time that a tool did not return.",
  },
  {
    icon: MousePointerClick,
    title: "No email without a click",
    text: "The Prospector writes drafts. A person reads each one and clicks Send, and only then does anything leave your outbox.",
  },
  {
    icon: ShieldCheck,
    title: "Customers opt in first",
    text: "The AI only texts customers who started a session with it. Everyone else reaches your team exactly as before.",
  },
  {
    icon: BellRing,
    title: "You hear about it right away",
    text: "Refunds, complaints, medical questions and partner leads are texted to you the moment they come up, with a short summary.",
  },
];

export function Guardrails() {
  return (
    <Section className="border-y border-line bg-canvas">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-16">
        <SectionHeading align="left" eyebrow="Guardrails" title="Safe to leave alone with your customers.">
          An AI employee is only useful if you can stop watching it. The rules that matter most are enforced in code, so
          the model cannot talk its way around them.
        </SectionHeading>

        <div className="grid gap-5 sm:grid-cols-2">
          {RULES.map((r) => (
            <Card key={r.title} className="p-6">
              <span className="grid size-10 place-items-center rounded-lg bg-brand-soft text-brand">
                <r.icon className="size-5" />
              </span>
              <h3 className="mt-4 font-semibold tracking-tight text-ink">{r.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{r.text}</p>
            </Card>
          ))}
        </div>
      </div>
    </Section>
  );
}
