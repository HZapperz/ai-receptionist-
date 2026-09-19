"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Compass,
  ExternalLink,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  Target,
  Users,
} from "lucide-react";
import Link from "next/link";
import { Button, cn, StatusLabel } from "@/components/ui";
import { type ReportRun, type ReportRunStatus, type ResearchType } from "@/lib/lead-reports";

export type LeadReportHistoryProps = {
  runs: ReportRun[];
  selectedRunId: string | null;
  onSelectRun: (run: ReportRun) => void;
  onRefreshAll: () => void;
  isPolling?: boolean;
};

export function LeadReportHistory({
  runs,
  selectedRunId,
  onSelectRun,
  onRefreshAll,
  isPolling = false,
}: LeadReportHistoryProps) {
  const activeRun = runs.find((r) => r.status === "pending" || r.status === "running");

  return (
    <div className="rounded-xl border border-line bg-surface shadow-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-brand" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-ink">Research History</h2>
          <span className="text-xs font-medium text-muted tabular-nums">{runs.length} runs</span>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={onRefreshAll}
          className="text-xs text-muted hover:text-ink"
        >
          <RefreshCw className={cn("size-3.5", isPolling && "animate-spin")} />
          <span>Refresh</span>
        </Button>
      </div>

      {/* Active Processing Banner */}
      {activeRun && (
        <div className="bg-brand-soft/50 border-b border-brand/20 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin text-brand" aria-hidden="true" />
              <span className="text-xs font-semibold text-brand">
                {activeRun.status === "pending"
                  ? "Queued Research Run..."
                  : "Executing AI Market Research Agent..."}
              </span>
            </div>
            <StatusBadge status={activeRun.status} />
          </div>
          <p className="text-xs text-muted line-clamp-1">
            Objective:{" "}
            <strong className="text-ink font-medium">
              {activeRun.target.objective || activeRun.target.term}
            </strong>{" "}
            ({activeRun.target.area})
          </p>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-brand/10">
            <div className="h-full w-2/3 rounded-full bg-brand animate-pulse" />
          </div>
        </div>
      )}

      {/* History List */}
      {runs.length === 0 ? (
        <div className="p-8 text-center text-xs text-muted space-y-2">
          <Clock className="size-8 mx-auto text-muted/50" />
          <p className="font-medium text-ink">No market research runs recorded yet.</p>
          <p className="text-[11px] max-w-xs mx-auto text-muted">
            Configure your objective brief above or click &quot;Run Research Now&quot; to generate your first report.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-line max-h-[360px] overflow-y-auto text-xs">
          {runs.map((run) => {
            const isSelected = run.id === selectedRunId;
            const leadCount = run.report?.metrics?.total ?? run.report?.leads?.length ?? 0;
            const resType = run.target.research_type || run.report?.research_plan?.research_type || "lead_discovery";
            const displayTitle =
              run.report?.title ||
              run.target.objective ||
              run.target.term ||
              "Market Research Report";

            return (
              <li
                key={run.id}
                className={cn(
                  "p-3.5 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:bg-canvas/60",
                  isSelected && "bg-brand-soft/40 border-l-4 border-l-brand"
                )}
                onClick={() => onSelectRun(run)}
              >
                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-ink text-xs sm:text-sm truncate max-w-md">
                      {displayTitle}
                    </span>
                    <StatusBadge status={run.status} />
                  </div>

                  <div className="flex items-center gap-1.5 text-muted flex-wrap text-[11px]">
                    <ResearchTypeLabel type={resType} />
                    <span aria-hidden="true">·</span>
                    <span className="flex items-center gap-1 font-medium text-ink/80">
                      <Search className="size-3 text-muted" />
                      <span>{run.target.area}</span>
                    </span>

                    {run.status === "done" && leadCount > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-medium tabular-nums">{leadCount} leads</span>
                      </>
                    )}

                    {run.report?.findings && run.report.findings.length > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-medium tabular-nums">{run.report.findings.length} findings</span>
                      </>
                    )}

                    <span aria-hidden="true">·</span>
                    <span>
                      {new Date(run.created_at).toLocaleString("en-US", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                  </div>

                  {run.error && (
                    <p className="text-red-600 text-[11px] truncate flex items-center gap-1">
                      <AlertTriangle className="size-3 shrink-0 text-red-500" />
                      <span>{run.error}</span>
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  {run.report && (
                    <Link
                      href={`/dashboard/leads/reports/${run.id}`}
                      target="_blank"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-muted hover:text-ink text-xs p-1.5 rounded hover:bg-canvas"
                      title="Open standalone report permalink"
                    >
                      <span>Permalink</span>
                      <ExternalLink className="size-3" />
                    </Link>
                  )}

                  <Button
                    variant={isSelected ? "primary" : "outline"}
                    size="sm"
                    className="text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectRun(run);
                    }}
                  >
                    <span>{isSelected ? "Viewing" : "View"}</span>
                    <ChevronRight className="size-3 ml-0.5" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// the research type is an attribute of the run, not a state, so it rides in the meta line as
// plain text — the icon alone carries enough of the distinction.
function ResearchTypeLabel({ type }: { type: ResearchType }) {
  switch (type) {
    case "competitor_analysis":
      return (
        <span className="inline-flex items-center gap-1 font-medium">
          <Target className="size-3" /> Competitors
        </span>
      );
    case "custom":
      return (
        <span className="inline-flex items-center gap-1 font-medium">
          <Compass className="size-3" /> Custom
        </span>
      );
    case "lead_discovery":
    default:
      return (
        <span className="inline-flex items-center gap-1 font-medium">
          <Users className="size-3" /> Lead Opportunities
        </span>
      );
  }
}

// the run outcome already has a telling icon, so it stands in for StatusLabel's dot.
function StatusBadge({ status }: { status: ReportRunStatus }) {
  switch (status) {
    case "pending":
      return (
        <StatusLabel tone="warning" dot={false}>
          <Clock /> Pending
        </StatusLabel>
      );
    case "running":
      return (
        <StatusLabel tone="info" dot={false}>
          <Loader2 className="animate-spin" /> Running
        </StatusLabel>
      );
    case "done":
      return (
        <StatusLabel tone="success" dot={false}>
          <CheckCircle2 /> Complete
        </StatusLabel>
      );
    case "failed":
      return (
        <StatusLabel tone="danger" dot={false}>
          <AlertTriangle /> Failed
        </StatusLabel>
      );
    default:
      return <StatusLabel tone="neutral">{status}</StatusLabel>;
  }
}
