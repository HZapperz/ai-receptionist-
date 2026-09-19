import { Check, MessageSquareText, MessagesSquare, Telescope } from "lucide-react";
import { Card } from "@/components/ui";
import { Section, SectionHeading } from "./Section";

// The tool names are the real ones from docs/CONTRACTS.md.
const AGENTS = [
  {
    name: "Receptionist",
    channel: "Texts",
    icon: MessageSquareText,
    summary: "Your front desk, on the number customers already text.",
    points: [
      "Answers texts 24/7, in the customer's language",
      "Quotes from your real price list and offers open slots",
      "Books the appointment, or escalates to you when a person should step in",
    ],
    tools: ["quote", "find_slots", "book", "escalate"],
  },
  {
    name: "Prospector",
    channel: "Email",
    icon: Telescope,
    summary: "Finds the partners who can send you steady work.",
    points: [
      "Finds partner leads near you, like pet-friendly apartment communities",
      "Drafts a personal email for each one, from what it learned about them",
      "Sends only when you read the draft and click Send",
    ],
    tools: ["get_lead", "save_draft", "remember"],
  },
  {
    name: "Manager",
    channel: "Chat",
    icon: MessagesSquare,
    summary: "The one you talk to. It knows what the other two did.",
    points: [
      "Ask what happened today, in plain words",
      "Get real numbers: texts, bookings, leads and escalations",
      "Hand work to the Receptionist or the Prospector",
    ],
    tools: ["get_summary", "list_bookings", "create_task"],
  },
];

export function Agents() {
  return (
    <Section id="features">
      <SectionHeading eyebrow="Your AI team" title="Three agents. One employee.">
        Each agent has one job and a short list of tools. They work from the same customers, bookings and leads, so
        what one learns, the others know.
      </SectionHeading>

      <div className="mt-14 grid gap-6 md:grid-cols-3">
        {AGENTS.map((a) => (
          <Card key={a.name} className="group flex flex-col p-6 transition-shadow hover:shadow-lift">
            <div className="flex items-center justify-between">
              <span className="grid size-11 place-items-center rounded-xl bg-brand-soft text-brand ring-1 ring-brand/10 transition-colors group-hover:bg-brand group-hover:text-white">
                <a.icon className="size-5" />
              </span>
              <span className="rounded-full bg-canvas px-2.5 py-0.5 text-xs font-medium text-muted ring-1 ring-line">
                {a.channel}
              </span>
            </div>
            <h3 className="mt-5 text-xl font-semibold tracking-tight text-ink">{a.name}</h3>
            <p className="mt-1.5 text-sm text-muted">{a.summary}</p>

            <ul className="mt-5 mb-6 space-y-3 text-sm text-ink">
              {a.points.map((p) => (
                <li key={p} className="flex gap-2.5">
                  <Check className="mt-0.5 size-4 shrink-0 text-brand" />
                  {p}
                </li>
              ))}
            </ul>

            <div className="mt-auto flex flex-wrap gap-1.5 border-t border-line pt-4">
              {a.tools.map((t) => (
                <code key={t} className="rounded-md bg-canvas px-1.5 py-0.5 font-mono text-[11px] text-muted ring-1 ring-line">
                  {t}
                </code>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </Section>
  );
}
