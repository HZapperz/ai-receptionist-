"use client";

import { AlertCircle, FileText, Loader2, RefreshCw, Sparkles } from "lucide-react";
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
      requestVersion.current++;
      if (timerId) clearTimeout(timerId);
    };
  }, []);

  const selectedRun = data?.runs.find((r) => r.id === selectedRunId) || data?.runs[0] || null;
  const isRunActive = Boolean(
    data?.runs.some((r) => r.status === "pending" || r.status === "running")
  );

  return (
    <div className="space-y-6">
      {/* Top Status Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-canvas p-3 rounded-xl border border-line">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-brand" />
          <span className="text-xs font-semibold text-ink">Automated Lead Market Intelligence</span>
          {data?.schedule?.enabled ? (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-600/20">
              Active Schedule
            </span>
          ) : (
            <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-medium text-muted ring-1 ring-line">
              Schedule Paused
            </span>
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={manualRefresh}
          disabled={loading}
          className="text-xs"
        >
          <RefreshCw className={isPolling || loading ? "size-3.5 animate-spin" : "size-3.5"} />
          <span>Refresh Data</span>
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 p-4 text-xs text-red-800 border border-red-200">
          <AlertCircle className="size-4 shrink-0 text-red-600" />
          <span className="flex-1">{error}</span>
          <Button variant="outline" size="sm" onClick={manualRefresh} className="text-xs border-red-300">
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

          {/* Grid Layout: History List & Visual Report Viewer */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            {/* Left Column: History */}
            <div className="lg:col-span-1 space-y-4">
              <LeadReportHistory
                runs={data?.runs || []}
                selectedRunId={selectedRunId}
                onSelectRun={(run) => setSelectedRunId(run.id)}
                onRefreshAll={manualRefresh}
                isPolling={isPolling}
              />
            </div>

            {/* Right Column: Visual Report Viewer */}
            <div className="lg:col-span-2">
              {selectedRun?.report ? (
                <LeadReportView
                  report={selectedRun.report}
                  target={selectedRun.target}
                  createdAt={selectedRun.created_at}
                />
              ) : selectedRun ? (
                <div className="rounded-xl border border-line bg-surface p-8 text-center text-xs text-muted space-y-2">
                  {selectedRun.status === "pending" || selectedRun.status === "running" ? (
                    <Loader2 className="size-6 animate-spin text-brand mx-auto" />
                  ) : (
                    <AlertCircle className="size-6 text-red-500 mx-auto" />
                  )}
                  <p className="font-semibold text-ink">Run Status: {selectedRun.status}</p>
                  <p>
                    Target: {selectedRun.target.term} ({selectedRun.target.area})
                  </p>
                  {selectedRun.error && (
                    <p className="text-red-600 mt-2 font-mono text-[11px]">{selectedRun.error}</p>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-line bg-surface p-10 text-center text-xs text-muted space-y-2">
                  <FileText className="size-8 mx-auto text-muted/50" />
                  <p className="font-medium text-ink">No Report Selected</p>
                  <p className="max-w-sm mx-auto text-muted">
                    Select a report run from the history list or click &quot;Run Research Now&quot; to execute a search.
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
