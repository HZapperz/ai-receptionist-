// Domain types and client functions for automated lead market research and reports.

export type Cadence = "daily" | "weekly";

export type ResearchType = "lead_discovery" | "competitor_analysis" | "custom";

export type ScheduleInput = {
  objective: string;
  research_type: ResearchType;
  term?: string; // Kept optional/internal for backward compatibility
  area: string;
  limit: number;
  cadence: Cadence;
  time: string; // "HH:MM"
  timezone: string; // IANA timezone e.g. "America/Chicago"
  weekday: number; // 0..6, Monday = 0
  enabled: boolean;
};

export type Schedule = ScheduleInput & {
  next_run_at: string | null;
  last_run_at: string | null;
};

export type ReportLead = {
  place_id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  rating: number | null;
  category: string;
  opportunity: string;
  source_url: string;
};

export type ReportMetrics = {
  total: number;
  with_website: number;
  with_phone: number;
  with_email: number;
  average_rating: number | null;
};

export type ReportCategory = {
  label: string;
  count: number;
};

export type ReportSources = {
  actor_id?: string;
  run_id?: string;
  dataset_id?: string;
  fetched_at?: string;
};

export type ResearchPlan = {
  objective: string;
  research_type: ResearchType;
  search_term: string;
  rationale: string;
  evidence_needed: string[];
};

export type FindingItem = {
  heading: string;
  detail: string;
  source_urls: string[];
};

export type ComparisonItem = {
  dimension: string;
  our_business: string;
  market_evidence: string;
  implication: string;
  source_urls: string[];
};

export type EvidenceSource = {
  url: string;
  title: string;
  kind: string;
};

export type LeadReport = {
  title: string;
  summary: string;
  metrics?: ReportMetrics;
  categories?: ReportCategory[];
  leads?: ReportLead[];
  recommendations?: string[];
  limitations?: string[];
  sources?: ReportSources;
  // Owner research plan & findings
  research_plan?: ResearchPlan;
  findings?: FindingItem[];
  comparisons?: ComparisonItem[];
  evidence_sources?: EvidenceSource[];
};

export type ReportRunStatus = "pending" | "running" | "done" | "failed";

export type ReportRun = {
  id: string;
  status: ReportRunStatus;
  created_at: string;
  target: {
    objective?: string;
    research_type?: ResearchType;
    term: string;
    area: string;
    limit: number;
  };
  report: LeadReport | null;
  error: string | null;
};

export type ReportsApiResponse = {
  schedule: Schedule | null;
  runs: ReportRun[];
  defaults: {
    objective?: string;
    term: string;
    area: string;
  };
  worker: {
    running: boolean;
    error: string | null;
  };
};

export class ReportConflictError extends Error {
  constructor(message = "A lead report generation run is already in progress.") {
    super(message);
    this.name = "ReportConflictError";
  }
}

// Ensure URL is strictly an http or https address, preventing javascript: or data: injection.
export function safeHref(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
    return null;
  } catch {
    // If it's a domain without protocol like "example.com", prepend https://
    if (/^[a-zA-Z0-9][a-zA-Z0-9-._~%]+\.[a-zA-Z]{2,}(?:\/.*)?$/.test(trimmed)) {
      try {
        const withProtocol = new URL("https://" + trimmed);
        return withProtocol.toString();
      } catch {
        return null;
      }
    }
    return null;
  }
}

// Sanitizes phone for safe tel: links
export function safeTel(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[^\d+]/g, "");
  if (cleaned.length >= 7 && cleaned.length <= 16) {
    return `tel:${cleaned}`;
  }
  return null;
}

// Sanitizes email for safe mailto: links
export function safeMailto(email: string | null | undefined): string | null {
  if (!email) return null;
  const trimmed = email.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return `mailto:${trimmed}`;
  }
  return null;
}

const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

export function formatWeekday(weekday: number): string {
  const idx = Math.max(0, Math.min(6, Math.floor(weekday)));
  return WEEKDAY_NAMES[idx] ?? "Monday";
}

// Format next run with timezone indicator and relative delta
export function formatNextRunDisplay(iso: string | null | undefined, timeZone = "America/Chicago"): string {
  if (!iso) return "Not scheduled";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "Not scheduled";

    const formatted = d.toLocaleString("en-US", {
      timeZone,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });

    const diffMs = d.getTime() - Date.now();
    if (diffMs <= 0) {
      return `${formatted} (due now)`;
    }

    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const relative = diffHours > 24
      ? `in ${Math.round(diffHours / 24)}d`
      : diffHours > 0
      ? `in ${diffHours}h ${diffMinutes}m`
      : `in ${Math.max(1, diffMinutes)}m`;

    return `${formatted} (${relative})`;
  } catch {
    return iso;
  }
}

// Primary API client methods. Calls /agents/outbound/reports endpoints via Next.js proxy rewrite.
export async function fetchReports(): Promise<ReportsApiResponse> {
  const res = await fetch("/agents/outbound/reports", {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to load reports (${res.status}): ${text || res.statusText}`);
  }

  return (await res.json()) as ReportsApiResponse;
}

export async function saveReportSchedule(input: ScheduleInput): Promise<Schedule> {
  const res = await fetch("/agents/outbound/reports/schedule", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to update schedule (${res.status}): ${text || res.statusText}`);
  }

  return (await res.json()) as Schedule;
}

export async function triggerReportRun(): Promise<{ task_id: string }> {
  const res = await fetch("/agents/outbound/reports/run", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({}),
  });

  if (res.status === 409) {
    const text = await res.text().catch(() => "");
    let msg = "A report run is already in progress.";
    try {
      const parsed = JSON.parse(text);
      if (parsed.detail) msg = parsed.detail;
      else if (parsed.error) msg = parsed.error;
    } catch {
      if (text) msg = text;
    }
    throw new ReportConflictError(msg);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to trigger report run (${res.status}): ${text || res.statusText}`);
  }

  return (await res.json()) as { task_id: string };
}

export async function fetchReportRun(taskId: string): Promise<ReportRun> {
  const res = await fetch(`/agents/outbound/reports/${encodeURIComponent(taskId)}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (res.status === 404) {
    throw new Error(`Report run ${taskId} not found.`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to load report run (${res.status}): ${text || res.statusText}`);
  }

  return (await res.json()) as ReportRun;
}

// Common IANA timezones for convenient selection
export const COMMON_TIMEZONES = [
  { value: "America/Chicago", label: "Central Time (US & Canada)" },
  { value: "America/New_York", label: "Eastern Time (US & Canada)" },
  { value: "America/Denver", label: "Mountain Time (US & Canada)" },
  { value: "America/Los_Angeles", label: "Pacific Time (US & Canada)" },
  { value: "America/Phoenix", label: "Arizona (No DST)" },
  { value: "America/Anchorage", label: "Alaska" },
  { value: "Pacific/Honolulu", label: "Hawaii" },
  { value: "UTC", label: "UTC" },
  { value: "Europe/London", label: "London / GMT / BST" },
  { value: "Europe/Paris", label: "Central European Time (Paris, Berlin)" },
  { value: "Asia/Tokyo", label: "Tokyo (JST)" },
  { value: "Australia/Sydney", label: "Sydney (AEST)" },
] as const;
