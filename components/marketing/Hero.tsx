import { ArrowRight, CircleCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui";
import { BRAND } from "@/lib/brand";
import { ActivityMock, PhoneMock, QuoteMock } from "./HeroMocks";

const POINTS = ["Quotes from your real price list", "No email goes out until you click Send", "Hands off to you when it should"];

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden">
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-dot-grid [mask-image:radial-gradient(ellipse_80%_70%_at_50%_0%,black,transparent)]"
      />
      <div aria-hidden="true" className="absolute -top-48 right-[-10%] -z-10 size-[640px] rounded-full bg-brand/10 blur-3xl" />
      <div aria-hidden="true" className="absolute top-72 -left-40 -z-10 size-[420px] rounded-full bg-violet-400/10 blur-3xl" />

      <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 pt-14 pb-20 lg:grid-cols-[1.1fr_1fr] lg:gap-10 lg:pt-16 lg:pb-24">
        <div className="animate-fade-up">
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-muted shadow-card">
            <Sparkles className="size-3.5 text-brand" />
            {BRAND.tagline}
          </p>

          <h1 className="mt-6 text-4xl leading-[1.05] font-semibold tracking-tight text-ink sm:text-5xl xl:text-[3.4rem]">
            <span className="block">Answers every text.</span>
            <span className="block">Books appointments.</span>
            <span className="block bg-linear-to-r from-brand to-violet-600 bg-clip-text pb-1 text-transparent">
              Finds new business.
            </span>
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-pretty text-muted">
            {BRAND.name} gives a local service business three AI agents that share one memory: a{" "}
            <span className="font-medium text-ink">Receptionist</span> that texts with your customers, a{" "}
            <span className="font-medium text-ink">Prospector</span> that finds partners and drafts the outreach, and a{" "}
            <span className="font-medium text-ink">Manager</span> you can simply ask what happened today.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button href="/dashboard" size="lg">
              Open Dashboard
              <ArrowRight />
            </Button>
            <Button href="#how" size="lg" variant="outline">
              See how it works
            </Button>
          </div>

          <ul className="mt-8 flex flex-col gap-2.5 text-sm text-muted sm:flex-row sm:flex-wrap sm:gap-x-6">
            {POINTS.map((p) => (
              <li key={p} className="flex items-center gap-2">
                <CircleCheck className="size-4 shrink-0 text-brand" />
                {p}
              </li>
            ))}
          </ul>
        </div>

        {/* Phone first in the DOM, so on small screens it leads; from xl the cards sit beside it on the left. */}
        <div className="relative flex animate-fade-up flex-col items-center animate-delay-150 xl:flex-row-reverse xl:justify-center">
          <PhoneMock />
          <div className="relative z-10 -mt-14 flex flex-col gap-8 max-xl:translate-x-10 xl:mt-8 xl:-mr-6">
            <QuoteMock className="hidden xl:block" />
            <ActivityMock />
          </div>
        </div>
      </div>
    </section>
  );
}
