import { LogOut } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Button, StatusDot } from "@/components/ui";
import { signOut } from "@/lib/auth-actions";
import { BRAND } from "@/lib/brand";
import { createClient } from "@/lib/supabase-server";

export const metadata: Metadata = { title: `Dashboard · ${BRAND.name}` };

// The app shell: sidebar, top bar and a scrolling main area. proxy.ts guards these routes too;
// this check covers a request that gets past it.
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: row } = await supabase.from("business_config").select("data").eq("id", 1).maybeSingle();
  const workspace = (row?.data as { name?: string } | undefined)?.name || BRAND.showcase;
  const initials = workspace
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const email = user.email ?? "";

  return (
    <div className="flex h-dvh flex-1 overflow-hidden bg-canvas">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-line bg-surface px-4 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-ink text-xs font-semibold text-white">{initials}</span>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-semibold text-ink">{workspace}</p>
              <p className="text-xs text-muted">Workspace</p>
            </div>
            <span className="ml-2 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-600/20 ring-inset">
              <StatusDot tone="live" pulse />
              Live
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-2 md:flex">
              <span className="grid size-7 place-items-center rounded-full bg-brand-soft text-xs font-semibold text-brand uppercase">
                {email.slice(0, 1) || "?"}
              </span>
              <span className="max-w-56 truncate text-sm text-muted">{email}</span>
            </span>
            <form action={signOut}>
              <Button type="submit" variant="ghost" size="sm" aria-label="Sign out">
                <LogOut aria-hidden="true" />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            </form>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
