import { Check } from "lucide-react";
import { Badge, Button, Card, cn } from "@/components/ui";
import { Section, SectionHeading } from "./Section";

// Placeholder tiers for the demo: change the numbers here. Nothing is charged anywhere; every CTA goes to /signup.
const TIERS = [
  {
    name: "Pilot",
    price: "$0",
    cadence: "for 30 days",
    blurb: "Put the Receptionist on your number and see what it books.",
    features: ["The Receptionist on your business number", "Your prices, hours and tone", "Dashboard and Manager chat", "Escalations texted to you"],
    cta: "Start a pilot",
    featured: false,
  },
  {
    name: "Growth",
    price: "$299",
    cadence: "per month",
    blurb: "The whole team: answer every customer and go find new ones.",
    features: [
      "Everything in Pilot",
      "The Prospector: partner leads and drafted emails",
      "Follow-ups on quotes that did not book",
      "An activity log of every tool call",
    ],
    cta: "Get started",
    featured: true,
  },
  {
    name: "Custom",
    price: "Let's talk",
    cadence: "",
    blurb: "Several locations, several numbers, or tools of your own.",
    features: ["Everything in Growth", "More than one location or number", "Your own tools and integrations", "Help loading your services and prices"],
    cta: "Contact us",
    featured: false,
  },
];

export function Pricing() {
  return (
    <Section id="pricing">
      <SectionHeading eyebrow="Pricing" title="Start with the Receptionist. Add the team when you're ready.">
        Every plan runs on your own business config and your own number. No card needed to get started.
      </SectionHeading>

      <div className="mt-14 grid items-stretch gap-6 lg:grid-cols-3">
        {TIERS.map((t) => (
          <Card
            key={t.name}
            className={cn("relative flex flex-col p-7", t.featured && "border-brand/40! shadow-lift! ring-1 ring-brand/30")}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold tracking-tight text-ink">{t.name}</h3>
              {t.featured && <Badge tone="brand">Recommended</Badge>}
            </div>
            <p className="mt-2 text-sm text-muted">{t.blurb}</p>
            <p className="mt-6 flex items-baseline gap-2">
              <span className="text-4xl font-semibold tracking-tight text-ink">{t.price}</span>
              {t.cadence && <span className="text-sm text-muted">{t.cadence}</span>}
            </p>

            <ul className="mt-6 mb-8 space-y-3 text-sm text-ink">
              {t.features.map((f) => (
                <li key={f} className="flex gap-2.5">
                  <Check className="mt-0.5 size-4 shrink-0 text-brand" />
                  {f}
                </li>
              ))}
            </ul>

            <Button href="/signup" variant={t.featured ? "primary" : "outline"} className="mt-auto w-full">
              {t.cta}
            </Button>
          </Card>
        ))}
      </div>
    </Section>
  );
}
