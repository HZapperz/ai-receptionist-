"use client";

import {
  AlertTriangle,
  ArrowLeft,
  FileText,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { LeadReportView } from "@/components/leads/LeadReportView";
import { Button } from "@/components/ui";
import { type ReportRun, fetchReportRun } from "@/lib/lead-reports";

export default function LeadReportPermalinkPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params.id[0] : "";
  const isEmbed = searchParams.get("embed") === "1";
  return <ReportContent key={id} id={id} isEmbed={isEmbed} />;
}

function ReportContent({ id, isEmbed }: { id: string; isEmbed: boolean }) {

  const [run, setRun] = useState<ReportRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!id) return;
    let isMounted = true;
    let timerId: NodeJS.Timeout | null = null;

    async function pollLoop() {
      let shouldPoll = false;
      try {
        const data = await fetchReportRun(id);
        if (!isMounted) return;
        setRun(data);
        setError(null);
        shouldPoll = data.status === "pending" || data.status === "running";
      } catch (err) {
        if (isMounted) {
          setError((err as Error).message);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
          if (shouldPoll) {
            timerId = setTimeout(pollLoop, 3000);
          }
        }
      }
    }

    pollLoop();

    return () => {
      isMounted = false;
      if (timerId) clearTimeout(timerId);
    };
  }, [id, retry]);

  if (isEmbed) {
    return (
      <div className="p-4 bg-canvas min-h-dvh text-ink">
        {loading && !run ? (
          <div className="flex flex-col items-center justify-center p-12 text-muted gap-2">
            <Loader2 className="size-6 animate-spin text-brand" />
            <p className="text-xs">Loading embedded report...</p>
          </div>
        ) : error ? (
          <div className="p-6 text-center text-xs text-red-600 bg-red-50 rounded-xl border border-red-200">
            <AlertTriangle className="size-6 mx-auto mb-2 text-red-500" />
            <p className="font-semibold">Unable to load report</p>
            <p className="mt-1 text-muted">{error}</p>
          </div>
        ) : run?.report ? (
          <LeadReportView
            report={run.report}
            target={run.target}
            createdAt={run.created_at}
            isEmbed
          />
        ) : (
          <div className="p-6 text-center text-xs text-muted">
            {run?.error || `Run status: ${run?.status || "loading"}`}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-5 p-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader
          title="Market Intelligence & Research Report"
          description={`Report permalink for research run ${id}`}
        />
        <Button href="/dashboard/leads" variant="outline" size="sm">
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          <span>Back to Research & Leads</span>
        </Button>
      </div>

      {loading && !run ? (
        <div className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-line bg-surface p-12 text-muted gap-3">
          <Loader2 className="size-8 animate-spin text-brand" />
          <p className="text-sm font-medium text-ink">Loading market report data...</p>
        </div>
      ) : error ? (
        <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 rounded-xl border border-red-200 bg-red-50/50 p-8 text-center text-red-800">
          <AlertTriangle className="size-8 text-red-500" />
          <h2 className="text-base font-semibold">Report Not Found or Error Loading</h2>
          <p className="max-w-md text-xs text-muted">{error}</p>
          <Button variant="outline" size="sm" onClick={() => {
            setLoading(true);
            setError(null);
            setRetry((value) => value + 1);
          }} className="mt-2">
            <RefreshCw className="size-3.5" />
            <span>Retry</span>
          </Button>
        </div>
      ) : run?.report ? (
        <LeadReportView
          report={run.report}
          target={run.target}
          createdAt={run.created_at}
        />
      ) : (
        <div className="flex min-h-[300px] flex-col items-center justify-center gap-2 rounded-xl border border-line bg-surface p-8 text-center text-muted">
          <FileText className="size-8 text-muted/50" />
          <p className="text-sm font-medium text-ink">No report content available</p>
          <p className="text-xs">
            Run status: <strong className="text-ink">{run?.status || "unknown"}</strong>
          </p>
          {run?.error && <p className="text-xs text-red-600">{run.error}</p>}
        </div>
      )}
    </div>
  );
}
