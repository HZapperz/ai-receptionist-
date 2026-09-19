"use client";

import { Building2, Sparkles } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { LeadReportsDashboard } from "@/components/leads/LeadReportsDashboard";
import { LeadsPanel } from "@/components/LeadsPanel";
import { cn } from "@/components/ui";

type ViewTab = "outreach" | "reports";

export default function LeadsPage() {
  const [activeTab, setActiveTab] = useState<ViewTab>("reports");

  return (
    <div className="flex h-full flex-col gap-5 p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeader
          title="Leads & Market Research"
          description="Manage partner leads, email drafts, and recurring automated market research reports."
        />

        {/* View Switcher Tabs */}
        <div className="inline-flex items-center rounded-lg bg-canvas p-1 ring-1 ring-line shrink-0 self-start sm:self-auto text-xs font-medium">
          <button
            type="button"
            onClick={() => setActiveTab("reports")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors cursor-pointer",
              activeTab === "reports"
                ? "bg-surface text-brand shadow-sm font-semibold"
                : "text-muted hover:text-ink"
            )}
          >
            <Sparkles className="size-3.5 text-brand" aria-hidden="true" />
            <span>Automated Market Research & Reports</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("outreach")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors cursor-pointer",
              activeTab === "outreach"
                ? "bg-surface text-ink shadow-sm font-semibold"
                : "text-muted hover:text-ink"
            )}
          >
            <Building2 className="size-3.5" aria-hidden="true" />
            <span>Saved Leads & Outreach</span>
          </button>
        </div>
      </div>

      {/* Tab Panels */}
      {activeTab === "outreach" ? (
        <LeadsPanel className="flex-1" />
      ) : (
        <LeadReportsDashboard />
      )}
    </div>
  );
}
