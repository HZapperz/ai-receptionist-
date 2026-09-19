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
    <>
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
    </>
  );
}
