"use client";

import {
  AlertCircle,
  Calendar,
  Check,
  Clock,
  Globe,
  MapPin,
  Pause,
  Play,
  PlayCircle,
  RotateCcw,
  Save,
  Search,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { Badge, Button, Input, Label } from "@/components/ui";
import {
  COMMON_TIMEZONES,
  type Cadence,
  ReportConflictError,
  type Schedule,
  type ScheduleInput,
  formatNextRunDisplay,
  formatWeekday,
  saveReportSchedule,
  triggerReportRun,
} from "@/lib/lead-reports";

export type LeadReportScheduleCardProps = {
  schedule: Schedule | null;
  defaults?: { term: string; area: string };
  worker?: { running: boolean; error: string | null };
  onScheduleUpdated: (schedule: Schedule) => void;
  onRunTriggered: (taskId: string) => void;
  isRunActive?: boolean;
};

export function LeadReportScheduleCard({
  schedule,
  defaults = { term: "pet-friendly apartment communities", area: "Houston, TX" },
  worker,
  onScheduleUpdated,
  onRunTriggered,
  isRunActive = false,
}: LeadReportScheduleCardProps) {
  const saved: ScheduleInput = schedule ?? {
    term: defaults.term,
    area: defaults.area,
    limit: 20,
    cadence: "daily",
    time: "09:00",
    timezone: "America/Chicago",
    weekday: 0,
    enabled: true,
  };
  const [draft, setDraft] = useState<ScheduleInput | null>(null);
  const { term, area, limit, cadence, time, timezone, weekday, enabled } = draft ?? saved;
  const isDirty = draft !== null;

  const [saving, setSaving] = useState(false);
  const [runningNow, setRunningNow] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  function updateDraft(changes: Partial<ScheduleInput>) {
    setDraft((current) => ({ ...saved, ...current, ...changes }));
  }

  function resetToSaved() {
    setDraft(null);
  }

  async function handleSave(newEnabledState?: boolean) {
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const targetEnabled = newEnabledState !== undefined ? newEnabledState : enabled;

    const payload: ScheduleInput = {
      term: term.trim(),
      area: area.trim(),
      limit: Math.max(1, Math.min(50, Number(limit) || 20)),
      cadence,
      time: time.trim() || "09:00",
      timezone: timezone.trim() || "America/Chicago",
      weekday: Number(weekday) || 0,
      enabled: targetEnabled,
    };

    try {
      const updated = await saveReportSchedule(payload);
      setDraft(null);
      onScheduleUpdated(updated);
      setSuccessMsg(targetEnabled ? "Report schedule saved & active!" : "Report schedule saved & paused.");
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRunNow() {
    setRunningNow(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await triggerReportRun();
      onRunTriggered(res.task_id);
      setSuccessMsg("Research run initiated!");
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      if (err instanceof ReportConflictError) {
        setErrorMsg("A report generation run is already in progress.");
      } else {
        setErrorMsg((err as Error).message);
      }
    } finally {
      setRunningNow(false);
    }
  }

  return (
    <section className="rounded-xl border border-line bg-surface p-5 shadow-card space-y-5">
      {/* Header with worker status & toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-brand" aria-hidden="true" />
            <h2 className="text-base font-semibold text-ink">Automated Market Research Schedule</h2>
          </div>
          <p className="text-xs text-muted mt-0.5">
            Configure Apify places scraper targets and recurring research execution.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {worker?.error ? (
            <Badge tone="danger" className="text-xs" title={worker.error}>
              Worker Alert
            </Badge>
          ) : worker?.running ? (
            <Badge tone="success" className="text-xs">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse mr-1" />
              Scheduler Active
            </Badge>
          ) : (
            <Badge tone="neutral" className="text-xs">
              Scheduler Offline
            </Badge>
          )}

          <Badge tone={schedule?.enabled ? "brand" : "neutral"} className="text-xs">
            {!schedule ? "Not configured" : schedule.enabled ? "Schedule Enabled" : "Paused"}
          </Badge>
        </div>
      </div>

      {/* Alert Banners */}
      {errorMsg && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-800 border border-red-200">
          <AlertCircle className="size-4 shrink-0 text-red-600" aria-hidden="true" />
          <span className="flex-1">{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="text-red-600 hover:text-red-900 font-bold px-1 cursor-pointer">
            ×
          </button>
        </div>
      )}

      {successMsg && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800 border border-emerald-200">
          <Check className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
          <span className="flex-1">{successMsg}</span>
        </div>
      )}

      {/* Form Fields */}
      <fieldset disabled={saving} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 disabled:opacity-70">
        {/* Search Term */}
        <div className="space-y-1.5">
          <Label htmlFor="search-term" className="text-xs font-medium text-ink flex items-center gap-1.5">
            <Search className="size-3.5 text-muted" /> Search Term
          </Label>
          <Input
            id="search-term"
            value={term}
            onChange={(e) => {
              updateDraft({ term: e.target.value });
            }}
            placeholder="e.g. pet-friendly apartment communities"
            className="text-xs"
          />
        </div>

        {/* Geographic Area */}
        <div className="space-y-1.5">
          <Label htmlFor="search-area" className="text-xs font-medium text-ink flex items-center gap-1.5">
            <MapPin className="size-3.5 text-muted" /> Target Location
          </Label>
          <Input
            id="search-area"
            value={area}
            onChange={(e) => {
              updateDraft({ area: e.target.value });
            }}
            placeholder="e.g. Houston, TX"
            className="text-xs"
          />
        </div>

        {/* Bounded Result Limit */}
        <div className="space-y-1.5">
          <Label htmlFor="search-limit" className="text-xs font-medium text-ink flex items-center gap-1.5">
            Result Limit (1-50)
          </Label>
          <Input
            id="search-limit"
            type="number"
            min={1}
            max={50}
            value={limit}
            onChange={(e) => {
              updateDraft({ limit: Math.max(1, Math.min(50, Number(e.target.value))) });
            }}
            className="text-xs"
          />
        </div>

        {/* Cadence */}
        <div className="space-y-1.5">
          <Label htmlFor="cadence-select" className="text-xs font-medium text-ink flex items-center gap-1.5">
            <Calendar className="size-3.5 text-muted" /> Cadence
          </Label>
          <select
            id="cadence-select"
            value={cadence}
            onChange={(e) => {
              updateDraft({ cadence: e.target.value as Cadence });
            }}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink shadow-xs focus:border-brand focus:outline-none"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>

        {/* Weekday Selection (if weekly) */}
        {cadence === "weekly" && (
          <div className="space-y-1.5">
            <Label htmlFor="weekday-select" className="text-xs font-medium text-ink">
              Day of Week
            </Label>
            <select
              id="weekday-select"
              value={weekday}
              onChange={(e) => {
                updateDraft({ weekday: Number(e.target.value) });
              }}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink shadow-xs focus:border-brand focus:outline-none"
            >
              {[0, 1, 2, 3, 4, 5, 6].map((dayNum) => (
                <option key={dayNum} value={dayNum}>
                  {formatWeekday(dayNum)}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Run Time (HH:MM) */}
        <div className="space-y-1.5">
          <Label htmlFor="time-input" className="text-xs font-medium text-ink flex items-center gap-1.5">
            <Clock className="size-3.5 text-muted" /> Time (24-Hour)
          </Label>
          <Input
            id="time-input"
            type="time"
            value={time}
            onChange={(e) => {
              updateDraft({ time: e.target.value });
            }}
            className="text-xs"
          />
        </div>

        {/* Timezone */}
        <div className="space-y-1.5 md:col-span-2 lg:col-span-1">
          <Label htmlFor="timezone-select" className="text-xs font-medium text-ink flex items-center gap-1.5">
            <Globe className="size-3.5 text-muted" /> Timezone
          </Label>
          <select
            id="timezone-select"
            value={timezone}
            onChange={(e) => {
              updateDraft({ timezone: e.target.value });
            }}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink shadow-xs focus:border-brand focus:outline-none"
          >
            {COMMON_TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label} ({tz.value})
              </option>
            ))}
            {!COMMON_TIMEZONES.some((t) => t.value === timezone) && (
              <option value={timezone}>{timezone}</option>
            )}
          </select>
        </div>
      </fieldset>

      {/* Schedule Info Banner */}
      {schedule && (
        <div className="rounded-lg bg-canvas p-3 border border-line text-xs flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Clock className="size-3.5 text-brand" />
            <span>
              Next Run:{" "}
              <strong className="text-ink">
                {formatNextRunDisplay(schedule.next_run_at, schedule.timezone || timezone)}
              </strong>
            </span>
          </div>
          {schedule.last_run_at && (
            <span className="text-muted">
              Last Run:{" "}
              {new Date(schedule.last_run_at).toLocaleString("en-US", {
                dateStyle: "short",
                timeStyle: "short",
              })}
            </span>
          )}
        </div>
      )}

      {/* Action Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={saving}
            onClick={() => handleSave()}
          >
            <Save className="size-3.5" aria-hidden="true" />
            {saving ? "Saving..." : "Save Schedule"}
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={saving}
            onClick={() => handleSave(!enabled)}
          >
            {enabled ? (
              <>
                <Pause className="size-3.5 text-amber-600" aria-hidden="true" />
                <span>Pause Schedule</span>
              </>
            ) : (
              <>
                <Play className="size-3.5 text-emerald-600" aria-hidden="true" />
                <span>Enable Schedule</span>
              </>
            )}
          </Button>

          {isDirty && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={saving}
              onClick={resetToSaved}
              className="text-muted hover:text-ink text-xs"
            >
              <RotateCcw className="size-3" />
              Reset
            </Button>
          )}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={saving || runningNow || isRunActive || !schedule || isDirty}
          onClick={handleRunNow}
          className="border-brand/40 text-brand hover:bg-brand-soft"
          title={!schedule || isDirty ? "Save your target and schedule before running research." : undefined}
        >
          <PlayCircle className="size-3.5 text-brand" aria-hidden="true" />
          {runningNow || isRunActive ? "Run In Progress..." : "Run Research Now"}
        </Button>
      </div>
    </section>
  );
}
