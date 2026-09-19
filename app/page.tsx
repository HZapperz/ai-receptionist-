// Public landing page. The dashboard lives at /dashboard, behind the login.
import { Agents } from "@/components/marketing/Agents";
import { CtaBand } from "@/components/marketing/CtaBand";
import { Footer } from "@/components/marketing/Footer";
import { Guardrails } from "@/components/marketing/Guardrails";
import { Hero } from "@/components/marketing/Hero";
import { HowItWorks } from "@/components/marketing/HowItWorks";
import { Nav } from "@/components/marketing/Nav";
import { Pricing } from "@/components/marketing/Pricing";
import { SwapRow } from "@/components/marketing/SwapRow";

export default function Landing() {
  return (
    // "marketing" swaps in the teal palette for this subtree only (app/globals.css); the column
    // layout lives here rather than on the body, which this wrapper now stands between.
    <div className="marketing flex min-h-dvh flex-col bg-surface text-ink">
      <Nav />
      <main className="flex-1">
        <Hero />
        <Agents />
        <HowItWorks />
        <SwapRow />
        <Guardrails />
        <Pricing />
        <CtaBand />
      </main>
      <Footer />
    </div>
  );
}
