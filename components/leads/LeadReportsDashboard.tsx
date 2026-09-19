"use client";

import { AlertCircle, ChevronDown, ChevronUp, History, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { LeadReportScheduleCard } from "@/components/leads/LeadReportScheduleCard";
import { LeadReportHistory } from "@/components/leads/LeadReportHistory";
import { LeadReportView } from "@/components/leads/LeadReportView";
import { Button } from "@/components/ui";
import {
  type ReportsApiResponse,
  fetchReports,
} from "@/lib/lead-reports";

export function LeadReportsDashboard() {
  const [data, setData] = useState<ReportsApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const requestVersion = useRef(0);

  const manualRefresh = useCallback(async () => {
    setIsPolling(true);
    const version = ++requestVersion.current;
    try {
      const res = await fetchReports();
      if (version !== requestVersion.current) return;
      setData(res);
      setSelectedRunId((prev) => prev || (res.runs.length > 0 ? res.runs[0].id : null));
      setError(null);
    } catch (err) {
      if (version === requestVersion.current) setError((err as Error).message);
    } finally {
      if (version === requestVersion.current) {
        setLoading(false);
        setIsPolling(false);
      }
    }
  }, []);

  // Primary Polling Engine - single loop mounted once
  useEffect(() => {
    let isMounted = true;
    let timerId: NodeJS.Timeout | null = null;

    async function pollLoop() {
      setIsPolling(true);
      const version = ++requestVersion.current;
      let hasActiveRun = false;
      try {
        const res = await fetchReports();
        if (!isMounted || version !== requestVersion.current) return;
        hasActiveRun = res.runs.some((r) => r.status === "pending" || r.status === "running");
        setData(res);
        setSelectedRunId((prev) => prev || (res.runs.length > 0 ? res.runs[0].id : null));
        setError(null);
      } catch (err) {
        if (isMounted && version === requestVersion.current) {
          setError((err as Error).message);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
          setIsPolling(false);

          const nextDelay = hasActiveRun ? 3000 : 15000;
          timerId = setTimeout(pollLoop, nextDelay);
        }
      }
    }

    // Start poll loop on mount
    pollLoop();

    return () => {
      isMounted = false;
      if (timerId) clearTimeout(timerId);
    };
  }, []);

  const selectedRun = data?.runs.find((r) => r.id === selectedRunId) || data?.runs[0] || null;
  const isRunActive = Boolean(
    data?.runs.some((r) => r.status === "pending" || r.status === "running")
  );

  return (
    <div className="space-y-6 w-full max-w-none">
      {/* Top Status Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-canvas p-3.5 rounded-xl border border-line">
        <div className="flex items-center gap-2 flex-wrap">
          <Sparkles className="size-4 text-brand" />
          <span className="text-xs font-semibold text-ink">Automated Market Research & Intelligence</span>
          {data?.schedule?.enabled ? (
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-600/20">
              Active Schedule
            </span>
          ) : (
            <span className="rounded-full bg-canvas px-2.5 py-0.5 text-[11px] font-medium text-muted ring-1 ring-line">
              {data?.schedule ? "Schedule Paused" : "Not configured"}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {data?.runs && data.runs.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowHistory(!showHistory)}
              className="text-xs"
            >
              <History className="size-3.5" />
              <span>History ({data.runs.length})</span>
              {showHistory ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={manualRefresh}
            disabled={loading}
            className="text-xs"
          >
            <RefreshCw className={isPolling || loading ? "size-3.5 animate-spin" : "size-3.5"} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-rose-50 p-4 text-xs text-rose-800 border border-rose-200">
          <AlertCircle className="size-4 shrink-0 text-rose-700" />
          <span className="flex-1">{error}</span>
          <Button variant="outline" size="sm" onClick={manualRefresh} className="text-xs border-rose-300">
            Retry
          </Button>
        </div>
      )}

      {loading && !data ? (
        <div className="flex min-h-[240px] flex-col items-center justify-center rounded-xl border border-line bg-surface p-8 text-muted gap-2">
          <Loader2 className="size-6 animate-spin text-brand" />
          <p className="text-xs font-medium text-ink">Loading market research schedule and report history...</p>
        </div>
      ) : (
        <>
          {/* Schedule Form */}
          <LeadReportScheduleCard
            schedule={data?.schedule || null}
            defaults={data?.defaults}
            worker={data?.worker}
            onScheduleUpdated={(updatedSchedule) => {
              requestVersion.current++;
              setData((prev) => (prev ? { ...prev, schedule: updatedSchedule } : null));
            }}
            onRunTriggered={(taskId) => {
              setSelectedRunId(taskId);
              manualRefresh();
            }}
            isRunActive={isRunActive}
          />

          {/* Toggleable / Expandable Compact History Selector */}
          {(showHistory || (!selectedRun && data?.runs && data.runs.length > 0)) && (
            <div className="w-full">
              <LeadReportHistory
                runs={data?.runs || []}
                selectedRunId={selectedRunId}
                onSelectRun={(run) => {
                  setSelectedRunId(run.id);
                  // Auto-collapse history on mobile after selection for seamless reading
                }}
                onRefreshAll={manualRefresh}
                isPolling={isPolling}
              />
            </div>
          )}

          {/* Full-Width Report Viewer */}
          <div className="w-full">
            {selectedRun?.report ? (
              <LeadReportView
                report={selectedRun.report}
                target={selectedRun.target}
                createdAt={selectedRun.created_at}
              />
            ) : selectedRun ? (
              <div className="rounded-xl border border-line bg-surface p-10 text-center text-xs text-muted space-y-3">
                {selectedRun.status === "pending" || selectedRun.status === "running" ? (
                  <div className="space-y-2">
                    <Loader2 className="size-7 animate-spin text-brand mx-auto" />
                    <p className="font-semibold text-ink text-sm">Research Run In Progress...</p>
                    <p className="max-w-md mx-auto text-muted">
                      Searching, reading sources and writing the report.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <AlertCircle className="size-7 text-rose-500 mx-auto" />
                    <p className="font-semibold text-ink text-sm">Run Failed: {selectedRun.status}</p>
                  </div>
                )}
                <p className="text-muted">
                  Objective / Target: <strong className="text-ink">{selectedRun.target.objective || selectedRun.target.term}</strong> ({selectedRun.target.area})
                </p>
                {selectedRun.error && (
                  <p className="text-rose-700 mt-2 font-mono text-xs bg-rose-50 p-3 rounded-lg border border-rose-200 max-w-lg mx-auto">
                    {selectedRun.error}
                  </p>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-line bg-surface p-12 text-center text-xs text-muted space-y-3">
                <Sparkles className="size-8 mx-auto text-brand/60" />
                <p className="font-semibold text-ink text-sm">No Report Selected</p>
                <p className="max-w-md mx-auto text-muted leading-relaxed">
                  Configure your owner research objective brief above or select a past report from history to inspect source-backed findings and competitor comparisons.
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
