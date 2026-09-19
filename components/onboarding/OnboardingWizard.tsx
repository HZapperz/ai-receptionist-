"use client";

import { ArrowLeft, ArrowRight, Check, MessageSquareText, Rocket, Store, Tags, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Button, Card, Logo, cn } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { BusinessStep } from "./BusinessStep";
import { ChannelsStep } from "./ChannelsStep";
import { toDraft, type Draft } from "./draft";
import { LaunchStep } from "./LaunchStep";
import { ServicesStep } from "./ServicesStep";
import { AGENTS, TeamStep, type AgentKey } from "./TeamStep";

const STEPS = [
  { label: "Business", icon: Store, title: "Tell us about your business", blurb: "Your AI team introduces itself as part of your business." },
  { label: "Services", icon: Tags, title: "Services and prices", blurb: "What you offer and what it costs, per size. Fix anything we got wrong." },
  { label: "Channels", icon: MessageSquareText, title: "Connect your channels", blurb: "Keep the number your customers already text. We plug in behind it." },
  { label: "AI team", icon: Users, title: "Meet your AI team", blurb: "Three agents share one memory of your business and hand work to each other." },
  { label: "Go live", icon: Rocket, title: "Going live", blurb: "Putting it all together." },
];
const LAST = STEPS.length - 1;

// The demo onboarding. Prefilled from business_config (read only); every edit stays in React state.
export function OnboardingWizard({ firstName, email }: { firstName?: string; email?: string }) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [agents, setAgents] = useState<Record<AgentKey, boolean>>({ receptionist: true, prospector: true, manager: true });

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("business_config")
      .select("data")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setDraft(toDraft(data?.data));
      });
    // If Supabase is slow or unreachable, don't hold the demo: fall back to the showcase config.
    const fallback = setTimeout(() => setDraft((d) => d ?? toDraft(null)), 2500);
    return () => {
      cancelled = true;
      clearTimeout(fallback);
    };
  }, []);

  const update = (patch: Partial<Draft>) => setDraft((d) => d && { ...d, ...patch });

  // Continue is the form's submit button, so Enter moves on and "required" fields are checked first.
  const next = (e: FormEvent) => {
    e.preventDefault();
    setStep((s) => Math.min(s + 1, LAST));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const { title, blurb } = STEPS[step];

  return (
    <div className="flex flex-1 flex-col bg-canvas">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <Link href="/" className="rounded-lg focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none">
            <Logo />
          </Link>
          <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-ink">
            Skip to dashboard
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <p className="text-sm font-medium text-brand">{firstName ? `Welcome, ${firstName}.` : "Welcome."} Let&apos;s set up your AI team.</p>

        <ol className="mt-6 flex items-center" aria-label="Setup progress">
          {STEPS.map(({ label, icon: Icon }, i) => {
            const done = i < step;
            return (
              <li key={label} className={cn("flex items-center", i < LAST && "flex-1")}>
                <button
                  type="button"
                  disabled={!done}
                  onClick={() => setStep(i)}
                  aria-current={i === step ? "step" : undefined}
                  className="group flex items-center gap-2.5 rounded-full enabled:cursor-pointer focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  <span
                    className={cn(
                      "grid size-9 place-items-center rounded-full transition-all duration-300 ring-inset",
                      done && "bg-brand text-white ring-1 ring-brand group-hover:bg-brand-hover",
                      i === step && "bg-white text-brand shadow-card ring-2 ring-brand",
                      i > step && "bg-white text-muted ring-1 ring-line",
                    )}
                  >
                    {done ? <Check className="size-4" /> : <Icon className="size-4" />}
                  </span>
                  <span className={cn("hidden text-sm font-medium md:inline", i <= step ? "text-ink" : "text-muted")}>{label}</span>
                </button>
                {i < LAST && (
                  <span className="mx-3 h-0.5 flex-1 overflow-hidden rounded-full bg-line">
                    <span className={cn("block h-full bg-brand transition-all duration-500", done ? "w-full" : "w-0")} />
                  </span>
                )}
              </li>
            );
          })}
        </ol>

        <Card className="mt-8 overflow-hidden">
          <form onSubmit={next}>
            {/* key restarts the fade on every step change. */}
            <div key={step} className="animate-fade-up p-6 sm:p-8">
              <p className="text-xs font-medium tracking-wide text-muted uppercase">
                Step {step + 1} of {STEPS.length}
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
              <p className="mt-1.5 text-sm text-muted">{blurb}</p>

              <div className="mt-8">
                {!draft ? (
                  <div role="status" aria-label="Loading your business" className="space-y-4">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="h-12 animate-pulse rounded-lg bg-canvas" />
                    ))}
                  </div>
                ) : step === 0 ? (
                  <BusinessStep draft={draft} update={update} />
                ) : step === 1 ? (
                  <ServicesStep draft={draft} update={update} />
                ) : step === 2 ? (
                  <ChannelsStep phone={draft.phone} email={email} />
                ) : step === 3 ? (
                  <TeamStep on={agents} toggle={(key) => setAgents((a) => ({ ...a, [key]: !a[key] }))} tone={draft.tone} />
                ) : (
                  <LaunchStep draft={draft} agentsOn={AGENTS.filter((a) => agents[a.key]).length} />
                )}
              </div>
            </div>

            {step < LAST && (
              <div className="flex items-center justify-between gap-3 border-t border-line bg-canvas/60 px-6 py-4 sm:px-8">
                <Button type="button" variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={step === 0}>
                  <ArrowLeft />
                  Back
                </Button>
                <Button type="submit" disabled={!draft}>
                  {step === LAST - 1 ? "Go live" : "Continue"}
                  {step === LAST - 1 ? <Rocket /> : <ArrowRight />}
                </Button>
              </div>
            )}
          </form>
        </Card>
      </main>
    </div>
  );
}
