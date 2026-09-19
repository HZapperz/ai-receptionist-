"use client";

import { Activity, Building2, CalendarCheck, LayoutDashboard, MessageSquareText, RotateCcw, Settings, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo, cn } from "@/components/ui";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/inbox", label: "Inbox", icon: MessageSquareText },
  { href: "/dashboard/leads", label: "Leads", icon: Building2 },
  { href: "/dashboard/bookings", label: "Bookings", icon: CalendarCheck },
  { href: "/dashboard/activity", label: "Activity", icon: Activity },
  { href: "/dashboard/manager", label: "Manager", icon: Sparkles },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

// Full labels on wide screens, icons only below lg.
export function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/dashboard" ? pathname === href : pathname.startsWith(href));

  return (
    <aside className="flex w-16 shrink-0 flex-col border-r border-line bg-surface lg:w-60">
      <Link href="/dashboard" className="flex h-14 items-center justify-center border-b border-line px-4 lg:justify-start">
        <span className="lg:hidden">
          <Logo withWordmark={false} />
        </span>
        <span className="hidden lg:block">
          <Logo />
        </span>
      </Link>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Dashboard">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            title={label}
            aria-current={isActive(href) ? "page" : undefined}
            className={cn(
              "flex items-center justify-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors lg:justify-start",
              isActive(href) ? "bg-brand-soft text-brand" : "text-muted hover:bg-canvas hover:text-ink",
            )}
          >
            <Icon className="size-4.5 shrink-0" aria-hidden="true" />
            <span className="hidden lg:inline">{label}</span>
          </Link>
        ))}
      </nav>

      <div className="border-t border-line p-3">
        <Link
          href="/onboarding"
          title="Run onboarding again"
          className="flex items-center justify-center gap-2 rounded-lg px-2.5 py-2 text-xs text-muted transition-colors hover:bg-canvas hover:text-ink lg:justify-start"
        >
          <RotateCcw className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="hidden lg:inline">Run onboarding again</span>
        </Link>
      </div>
    </aside>
  );
}
