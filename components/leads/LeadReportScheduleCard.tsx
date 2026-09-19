"use client";

import {
  AlertCircle,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Compass,
  Globe,
  HelpCircle,
  MapPin,
  Pause,
  Play,
  PlayCircle,
  RotateCcw,
  Save,
  Sliders,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import { useState } from "react";
import { Badge, Button, Input, Label } from "@/components/ui";
import {
  COMMON_TIMEZONES,
  type Cadence,
  ReportConflictError,
  type ResearchType,
  type Schedule,
  type ScheduleInput,
  formatNextRunDisplay,
  formatWeekday,
  saveReportSchedule,
  triggerReportRun,
} from "@/lib/lead-reports";

export type LeadReportScheduleCardProps = {
  schedule: Schedule | null;
  defaults?: { objective?: string; term: string; area: string };
  worker?: { running: boolean; error: string | null };
  onScheduleUpdated: (schedule: Schedule) => void;
  onRunTriggered: (taskId: string) => void;
  isRunActive?: boolean;
};

const INTENT_PRESETS: Array<{
  type: ResearchType;
  label: string;
  icon: typeof Target;
  objective: string;
  description: string;
}> = [
  {
    type: "lead_discovery",
    label: "Lead Opportunities",
    icon: Users,
    objective: "Identify top partner leads, active local property managers, and direct decision-maker contact details in the target market.",
    description: "Find potential customers or referral partners",
  },
  {
    type: "competitor_analysis",
    label: "Compare Competitors",
    icon: Target,
    objective: "Analyze top local competitors, their service offerings, positioning, pricing signals, and market differentiation.",
    description: "Benchmark offering, positioning & market overlap",
  },
  {
    type: "custom",
    label: "Custom Research",
    icon: Compass,
    objective: "Investigate market expansion trends, local customer demand signals, and strategic partnership opportunities.",
    description: "Tailored exploratory research brief",
  },
];

export function LeadReportScheduleCard({
  schedule,
  defaults = { term: "pet-friendly apartment communities", area: "Houston, TX" },
  worker,
  onScheduleUpdated,
  onRunTriggered,
  isRunActive = false,
}: LeadReportScheduleCardProps) {
  const defaultObjective =
    defaults.objective ||
    schedule?.objective ||
    schedule?.term ||
    defaults.term ||
    "Identify high-potential partner leads and decision-maker contact details.";

  const saved: ScheduleInput = schedule
    ? {
        objective: schedule.objective || schedule.term || defaultObjective,
        research_type: schedule.research_type || "lead_discovery",
        term: schedule.term || defaults.term,
        area: schedule.area || defaults.area,
        limit: schedule.limit ?? 20,
        cadence: schedule.cadence || "daily",
        time: schedule.time || "09:00",
        timezone: schedule.timezone || "America/Chicago",
        weekday: schedule.weekday ?? 0,
        enabled: schedule.enabled ?? true,
      }
    : {
        objective: defaultObjective,
        research_type: "lead_discovery",
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
  const { objective, research_type, term, area, limit, cadence, time, timezone, weekday, enabled } =
    draft ?? saved;
  const isDirty = draft !== null;

  const [showAdvanced, setShowAdvanced] = useState(false);
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

  function applyPreset(preset: (typeof INTENT_PRESETS)[number]) {
    updateDraft({
      research_type: preset.type,
      objective: preset.objective,
    });
  }

  async function handleSave(newEnabledState?: boolean) {
    const trimmedObjective = objective.trim();
    if (!trimmedObjective) {
      setErrorMsg("Please enter a research objective brief.");
      return;
    }
    if (trimmedObjective.length > 2000) {
      setErrorMsg("Objective brief must be 2000 characters or fewer.");
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const targetEnabled = newEnabledState !== undefined ? newEnabledState : enabled;

    const payload: ScheduleInput = {
      objective: trimmedObjective,
      research_type: research_type || "lead_discovery",
      term: term?.trim() || trimmedObjective.slice(0, 100),
      area: area.trim() || defaults.area,
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
      setSuccessMsg(targetEnabled ? "Research schedule saved & active!" : "Research schedule saved & paused.");
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
            Configure owner research objectives, intent presets, and recurring schedule timing.
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
          <button
            onClick={() => setErrorMsg(null)}
            className="text-red-600 hover:text-red-900 font-bold px-1 cursor-pointer"
          >
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

      {/* Main Research Brief Input & Intent Presets */}
      <fieldset disabled={saving} className="space-y-4 disabled:opacity-70">
        {/* Intent Presets Selector */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold text-ink flex items-center justify-between">
            <span>Research Intent Presets</span>
            <span className="text-[11px] font-normal text-muted">Select a template or customize below</span>
          </Label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {INTENT_PRESETS.map((preset) => {
              const Icon = preset.icon;
              const isSelected = research_type === preset.type;
              return (
                <button
                  key={preset.type}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className={`flex flex-col items-start p-3 rounded-lg border text-left transition-all cursor-pointer ${
                    isSelected
                      ? "border-brand bg-brand-soft/50 ring-1 ring-brand/30 shadow-xs"
                      : "border-line bg-canvas/40 hover:border-brand/40 hover:bg-canvas"
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-medium text-xs text-ink mb-1">
                    <Icon className={`size-3.5 ${isSelected ? "text-brand" : "text-muted"}`} />
                    <span>{preset.label}</span>
                  </div>
                  <p className="text-[11px] text-muted leading-snug">{preset.description}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Primary Owner Objective Textarea */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="research-objective" className="text-xs font-semibold text-ink flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-brand" /> What would you like to learn?
            </Label>
            <span className="text-[11px] text-muted">{objective.length}/2000</span>
          </div>
          <textarea
            id="research-objective"
            rows={3}
            maxLength={2000}
            value={objective}
            onChange={(e) => updateDraft({ objective: e.target.value })}
            placeholder="e.g. Compare local competitors in Houston offering 24/7 reception services, analyze pricing models, and identify top property management lead opportunities..."
            className="w-full rounded-lg border border-line bg-surface p-3 text-xs text-ink placeholder:text-muted/60 shadow-xs focus:border-brand focus:outline-none leading-relaxed"
          />
        </div>

        {/* Helper Note */}
        <div className="flex items-center gap-2 rounded-lg bg-canvas p-3 border border-line text-xs text-muted">
          <HelpCircle className="size-4 shrink-0 text-brand" aria-hidden="true" />
          <p className="text-[11px] leading-normal">
            The agent chooses a business search and whether public website evidence is needed to answer your brief.
          </p>
        </div>

        {/* Advanced Parameters Disclosure */}
        <div className="border-t border-line/60 pt-3">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-xs font-semibold text-ink hover:text-brand transition-colors cursor-pointer py-1"
          >
            <Sliders className="size-3.5 text-muted" />
            <span>Location, sample size & schedule</span>
            {showAdvanced ? (
              <ChevronUp className="size-3.5 text-muted ml-auto" />
            ) : (
              <ChevronDown className="size-3.5 text-muted ml-auto" />
            )}
          </button>

          {showAdvanced && (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-3 border-t border-line/40">
              {/* Geographic Area */}
              <div className="space-y-1.5">
                <Label htmlFor="search-area" className="text-xs font-medium text-ink flex items-center gap-1.5">
                  <MapPin className="size-3.5 text-muted" /> Target Location / Market
                </Label>
                <Input
                  id="search-area"
                  value={area}
                  onChange={(e) => updateDraft({ area: e.target.value })}
                  placeholder="e.g. Houston, TX"
                  className="text-xs"
                />
              </div>

              {/* Bounded Result Limit */}
              <div className="space-y-1.5">
                <Label htmlFor="search-limit" className="text-xs font-medium text-ink">
                  Sample Result Limit (1-50)
                </Label>
                <Input
                  id="search-limit"
                  type="number"
                  min={1}
                  max={50}
                  value={limit}
                  onChange={(e) => updateDraft({ limit: Math.max(1, Math.min(50, Number(e.target.value))) })}
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
                  onChange={(e) => updateDraft({ cadence: e.target.value as Cadence })}
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
                    onChange={(e) => updateDraft({ weekday: Number(e.target.value) })}
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
                  onChange={(e) => updateDraft({ time: e.target.value })}
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
                  onChange={(e) => updateDraft({ timezone: e.target.value })}
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
            </div>
          )}
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
          title={!schedule || isDirty ? "Save your research brief before executing run." : undefined}
        >
          <PlayCircle className="size-3.5 text-brand" aria-hidden="true" />
          {runningNow || isRunActive ? "Run In Progress..." : "Run Research Now"}
        </Button>
      </div>
    </section>
  );
}
