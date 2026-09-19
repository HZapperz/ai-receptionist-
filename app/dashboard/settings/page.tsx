import { PageHeader } from "@/components/dashboard/PageHeader";
import { SettingsView } from "@/components/dashboard/SettingsView";
import { createClient } from "@/lib/supabase-server";

// Read on the server with the signed-in session; SettingsView only adds the toggles.
export default async function SettingsPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("business_config").select("data").eq("id", 1).maybeSingle();

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <PageHeader title="Settings" description="Your business in one row: services, prices, hours, area, policies and tone." />
      <SettingsView config={(data?.data as Record<string, unknown> | undefined) ?? null} />
    </div>
  );
}
