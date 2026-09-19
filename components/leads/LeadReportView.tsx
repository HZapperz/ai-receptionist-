"use client";

import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  Database,
  ExternalLink,
  Globe,
  Info,
  Layers,
  Mail,
  MapPin,
  Phone,
  Sparkles,
  Star,
  Tag,
} from "lucide-react";
import { Badge, cn } from "@/components/ui";
import {
  type LeadReport,
  type ReportLead,
  safeHref,
  safeMailto,
  safeTel,
} from "@/lib/lead-reports";

export type LeadReportViewProps = {
  report: LeadReport;
  target?: {
    term: string;
    area: string;
    limit: number;
  };
  createdAt?: string;
  isEmbed?: boolean;
};

export function LeadReportView({
  report,
  target,
  createdAt,
  isEmbed = false,
}: LeadReportViewProps) {
  const { metrics, categories = [], leads = [], recommendations = [], limitations = [], sources } = report;

  const total = Math.max(1, metrics?.total || leads.length || 1);
  const websitePct = Math.round(((metrics?.with_website ?? 0) / total) * 100);
  const phonePct = Math.round(((metrics?.with_phone ?? 0) / total) * 100);
  const emailPct = Math.round(((metrics?.with_email ?? 0) / total) * 100);

  return (
    <div className={cn("space-y-6 text-ink", isEmbed && "p-2")}>
      {/* Header Banner */}
      <div className="rounded-xl border border-line bg-surface p-5 shadow-card">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
          <div className="space-y-1.5 min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 rounded-md bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand">
                <Sparkles className="size-3.5" aria-hidden="true" />
                Partner Lead Intelligence Report
              </span>
              {target && (
                <span className="inline-flex items-center gap-1.5 rounded-md bg-canvas px-2.5 py-1 text-xs font-medium text-muted ring-1 ring-line ring-inset">
                  <span>Target: <strong className="text-ink">{target.term}</strong> in <strong className="text-ink">{target.area}</strong></span>
                  <span className="text-muted/60">•</span>
                  <span>Limit {target.limit}</span>
                </span>
              )}
            </div>
            <h1 className="text-xl font-bold tracking-tight text-ink md:text-2xl">
              {report.title || "Market Lead Analysis"}
            </h1>
            {report.summary && (
              <p className="text-sm leading-relaxed text-muted max-w-3xl">
                {report.summary}
              </p>
            )}
          </div>
          {createdAt && (
            <div className="shrink-0 text-left md:text-right">
              <span className="block text-xs text-muted">Generated</span>
              <span className="text-xs font-medium text-ink">
                {new Date(createdAt).toLocaleString("en-US", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
          <div className="flex items-center justify-between text-muted">
            <span className="text-xs font-medium">Total Found</span>
            <Building2 className="size-4 text-brand" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-bold text-ink">{metrics?.total ?? leads.length}</p>
          <span className="text-[11px] text-muted">Scraped place entities</span>
        </div>

        <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
          <div className="flex items-center justify-between text-muted">
            <span className="text-xs font-medium">Websites</span>
            <Globe className="size-4 text-emerald-600" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-bold text-ink">{metrics?.with_website ?? 0}</p>
          <div className="mt-1 flex items-center justify-between text-[11px] text-muted">
            <span>Coverage</span>
            <span className="font-semibold text-emerald-600">{websitePct}%</span>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
          <div className="flex items-center justify-between text-muted">
            <span className="text-xs font-medium">Phone Numbers</span>
            <Phone className="size-4 text-blue-600" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-bold text-ink">{metrics?.with_phone ?? 0}</p>
          <div className="mt-1 flex items-center justify-between text-[11px] text-muted">
            <span>Coverage</span>
            <span className="font-semibold text-blue-600">{phonePct}%</span>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
          <div className="flex items-center justify-between text-muted">
            <span className="text-xs font-medium">Email Contacts</span>
            <Mail className="size-4 text-purple-600" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-bold text-ink">{metrics?.with_email ?? 0}</p>
          <div className="mt-1 flex items-center justify-between text-[11px] text-muted">
            <span>Coverage</span>
            <span className="font-semibold text-purple-600">{emailPct}%</span>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-surface p-4 shadow-card col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-muted">
            <span className="text-xs font-medium">Avg Rating</span>
            <Star className="size-4 text-amber-500 fill-amber-500" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-bold text-ink">
            {metrics?.average_rating != null ? metrics.average_rating.toFixed(1) : "N/A"}
          </p>
          <span className="text-[11px] text-muted">Google Maps rating</span>
        </div>
      </div>

      {/* Category Breakdown & Contact Quality Indicators */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Category Breakdown */}
        <div className="rounded-xl border border-line bg-surface p-5 shadow-card">
          <div className="flex items-center gap-2 mb-3">
            <Layers className="size-4 text-brand" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-ink">Category Distribution</h2>
          </div>
          {categories.length === 0 ? (
            <p className="text-xs text-muted py-4 text-center">No categories recorded</p>
          ) : (
            <div className="space-y-3">
              {categories.map((cat) => {
                const pct = Math.round((cat.count / total) * 100);
                return (
                  <div key={cat.label} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-ink truncate max-w-[70%]" title={cat.label}>
                        {cat.label}
                      </span>
                      <span className="text-muted">
                        {cat.count} ({pct}%)
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-canvas ring-1 ring-line ring-inset">
                      <div
                        className="h-full rounded-full bg-brand transition-all duration-500"
                        style={{ width: `${Math.min(100, Math.max(4, pct))}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Contact Data Quality */}
        <div className="rounded-xl border border-line bg-surface p-5 shadow-card">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-ink">Contact Reachability</h2>
          </div>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-medium text-ink">
                  <Globe className="size-3.5 text-emerald-600" /> Website Link
                </span>
                <span className="font-semibold text-ink">{metrics?.with_website ?? 0} of {metrics?.total ?? leads.length} ({websitePct}%)</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-canvas ring-1 ring-line ring-inset">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${websitePct}%` }} />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-medium text-ink">
                  <Phone className="size-3.5 text-blue-600" /> Direct Phone Line
                </span>
                <span className="font-semibold text-ink">{metrics?.with_phone ?? 0} of {metrics?.total ?? leads.length} ({phonePct}%)</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-canvas ring-1 ring-line ring-inset">
                <div className="h-full rounded-full bg-blue-500" style={{ width: `${phonePct}%` }} />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-medium text-ink">
                  <Mail className="size-3.5 text-purple-600" /> Email Address
                </span>
                <span className="font-semibold text-ink">{metrics?.with_email ?? 0} of {metrics?.total ?? leads.length} ({emailPct}%)</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-canvas ring-1 ring-line ring-inset">
                <div className="h-full rounded-full bg-purple-500" style={{ width: `${emailPct}%` }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Extracted Leads Cards List */}
      <div className="rounded-xl border border-line bg-surface p-5 shadow-card space-y-4">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div className="flex items-center gap-2">
            <Building2 className="size-4 text-brand" aria-hidden="true" />
            <h2 className="text-base font-semibold text-ink">Discovered Partner Leads</h2>
          </div>
          <span className="rounded-full bg-canvas px-2.5 py-0.5 text-xs font-medium text-muted ring-1 ring-line ring-inset">
            {leads.length} records
          </span>
        </div>

        {leads.length === 0 ? (
          <p className="text-sm text-muted text-center py-6">No partner leads extracted in this report.</p>
        ) : (
          <div className="space-y-3">
            {leads.map((lead, idx) => (
              <LeadCard key={lead.place_id || `lead-${idx}`} lead={lead} />
            ))}
          </div>
        )}
      </div>

      {/* Strategic Recommendations vs Data Scope & Governance */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Model Strategic Recommendations */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 shadow-card">
          <div className="flex items-center gap-2 mb-3 text-emerald-900">
            <Sparkles className="size-4 text-emerald-600" aria-hidden="true" />
            <h2 className="text-sm font-semibold">AI Recommended Action Items</h2>
          </div>
          {recommendations.length === 0 ? (
            <p className="text-xs text-emerald-800">No AI recommendations provided.</p>
          ) : (
            <ul className="space-y-2">
              {recommendations.map((rec, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-emerald-950">
                  <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600 mt-0.5" aria-hidden="true" />
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Governance & Data Scope */}
        <div className="rounded-xl border border-line bg-surface p-5 shadow-card">
          <div className="flex items-center gap-2 mb-3 text-ink">
            <Info className="size-4 text-muted" aria-hidden="true" />
            <h2 className="text-sm font-semibold">Data Scope & Limitations</h2>
          </div>
          {limitations.length === 0 ? (
            <p className="text-xs text-muted">Standard Google Places search bounds applied without additional limitations.</p>
          ) : (
            <ul className="space-y-2">
              {limitations.map((lim, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-muted">
                  <AlertTriangle className="size-3.5 shrink-0 text-amber-500 mt-0.5" aria-hidden="true" />
                  <span>{lim}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Source Provenance Footer */}
      {sources && (
        <div className="rounded-xl border border-line bg-canvas p-4 text-xs text-muted space-y-1">
          <div className="flex items-center gap-1.5 font-medium text-ink">
            <Database className="size-3.5 text-muted" aria-hidden="true" />
            <span>Research Data Provenance</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-[11px]">
            <span>Actor: <code className="text-ink">{sources.actor_id || "compass/crawler-google-places"}</code></span>
            {sources.run_id && <span>Run ID: <code className="text-ink">{sources.run_id}</code></span>}
            {sources.dataset_id && <span>Dataset ID: <code className="text-ink">{sources.dataset_id}</code></span>}
            {sources.fetched_at && (
              <span>
                Fetched: {new Date(sources.fetched_at).toLocaleString("en-US", { dateStyle: "short", timeStyle: "medium" })}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function LeadCard({ lead }: { lead: ReportLead }) {
  const websiteUrl = safeHref(lead.website);
  const sourceUrl = safeHref(lead.source_url);
  const telLink = safeTel(lead.phone);
  const mailtoLink = safeMailto(lead.email);

  return (
    <div className="rounded-lg border border-line bg-surface p-4 space-y-3 transition-colors hover:border-brand/40">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-ink text-sm truncate">{lead.name}</h3>
            {lead.category && (
              <Badge tone="brand" className="text-[10px]">
                <Tag className="size-2.5 mr-1" aria-hidden="true" />
                {lead.category}
              </Badge>
            )}
          </div>
          {lead.address && (
            <p className="flex items-center gap-1.5 text-xs text-muted truncate">
              <MapPin className="size-3 shrink-0 text-muted" aria-hidden="true" />
              <span className="truncate">{lead.address}</span>
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {lead.rating != null && (
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-600/20 ring-inset">
              <Star className="size-3 fill-amber-500 text-amber-500" aria-hidden="true" />
              {lead.rating.toFixed(1)}
            </span>
          )}
        </div>
      </div>

      {/* Opportunity analysis */}
      {lead.opportunity && (
        <div className="rounded-md bg-canvas p-2.5 border border-line text-xs text-ink/90 space-y-1">
          <div className="flex items-center gap-1 text-[11px] font-semibold text-brand">
            <Sparkles className="size-3" aria-hidden="true" />
            <span>AI Opportunity Assessment</span>
          </div>
          <p className="text-xs text-muted leading-normal">{lead.opportunity}</p>
        </div>
      )}

      {/* Actionable contact links */}
      <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-line/60 text-xs">
        {telLink ? (
          <a
            href={telLink}
            className="flex items-center gap-1.5 font-medium text-blue-600 hover:text-blue-800 hover:underline"
          >
            <Phone className="size-3.5" aria-hidden="true" />
            <span>{lead.phone}</span>
          </a>
        ) : lead.phone ? (
          <span className="flex items-center gap-1.5 text-muted">
            <Phone className="size-3.5" aria-hidden="true" />
            <span>{lead.phone}</span>
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-muted/60">
            <Phone className="size-3.5" aria-hidden="true" />
            <span>No phone</span>
          </span>
        )}

        {mailtoLink ? (
          <a
            href={mailtoLink}
            className="flex items-center gap-1.5 font-medium text-purple-600 hover:text-purple-800 hover:underline"
          >
            <Mail className="size-3.5" aria-hidden="true" />
            <span className="truncate max-w-[180px]">{lead.email}</span>
          </a>
        ) : lead.email ? (
          <span className="flex items-center gap-1.5 text-muted">
            <Mail className="size-3.5" aria-hidden="true" />
            <span>{lead.email}</span>
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-muted/60">
            <Mail className="size-3.5" aria-hidden="true" />
            <span>No email</span>
          </span>
        )}

        {websiteUrl && (
          <a
            href={websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 font-medium text-emerald-600 hover:text-emerald-800 hover:underline ml-auto"
          >
            <Globe className="size-3.5" aria-hidden="true" />
            <span>Website</span>
            <ArrowUpRight className="size-3" aria-hidden="true" />
          </a>
        )}

        {sourceUrl && !websiteUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-muted hover:text-ink hover:underline ml-auto"
          >
            <ExternalLink className="size-3.5" aria-hidden="true" />
            <span>Google Maps</span>
          </a>
        )}
      </div>
    </div>
  );
}
