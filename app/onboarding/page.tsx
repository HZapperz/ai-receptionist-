import type { Metadata } from "next";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { BRAND } from "@/lib/brand";
import { createClient } from "@/lib/supabase-server";

export const metadata: Metadata = { title: `Set up your workspace · ${BRAND.name}` };

// proxy.ts keeps signed-out visitors out. This only reads who is here, to greet them by name.
export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const fullName = user?.user_metadata?.full_name;
  const firstName = typeof fullName === "string" ? fullName.trim().split(/\s+/)[0] : undefined;

  return <OnboardingWizard firstName={firstName || undefined} email={user?.email} />;
}
