"use client";

import {
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
  Building2,
  CheckCircle2,
  Compass,
  Database,
  ExternalLink,
  FileSearch,
  Globe,
  Info,
  Layers,
  Link2,
  Mail,
  MapPin,
  Phone,
  Scale,
  Sparkles,
  Star,
  Tag,
  Target,
  Users,
} from "lucide-react";
import { Badge, cn } from "@/components/ui";
import {
  type FindingItem,
  type LeadReport,
  type ReportLead,
  type ResearchType,
  safeHref,
  safeMailto,
  safeTel,
} from "@/lib/lead-reports";

export type LeadReportViewProps = {
  report: LeadReport;
  target?: {
    objective?: string;
    research_type?: ResearchType;
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
  const {
    metrics,
    categories = [],
    leads = [],
    recommendations = [],
    limitations = [],
    sources,
    research_plan,
    findings = [],
    comparisons = [],
    evidence_sources = [],
  } = report;

  const researchType: ResearchType =
    target?.research_type || research_plan?.research_type || "lead_discovery";

  const totalLeads = Math.max(1, metrics?.total || leads.length || 1);
  const websitePct = Math.round(((metrics?.with_website ?? 0) / totalLeads) * 100);
  const phonePct = Math.round(((metrics?.with_phone ?? 0) / totalLeads) * 100);
  const emailPct = Math.round(((metrics?.with_email ?? 0) / totalLeads) * 100);

  const hasStructuredResearch = findings.length > 0 || comparisons.length > 0 || Boolean(research_plan);

  return (
    <div className={cn("space-y-6 text-ink w-full max-w-none", isEmbed && "p-2")}>
      {/* 1. Executive Brief Banner */}
      <div className="rounded-xl border border-line bg-surface p-6 shadow-card space-y-4">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
          <div className="space-y-2 min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <ResearchTypeBadge type={researchType} />
              {target?.area && (
                <span className="inline-flex items-center gap-1.5 rounded-md bg-canvas px-2.5 py-1 text-xs font-medium text-muted ring-1 ring-line ring-inset">
                  <MapPin className="size-3 text-muted" />
                  <span>Location: <strong className="text-ink">{target.area}</strong></span>
                </span>
              )}
            </div>

            <h1 className="text-xl font-bold tracking-tight text-ink md:text-2xl leading-snug">
              {report.title || "Market Intelligence & Research Report"}
            </h1>

            {/* Objective summary */}
            {(target?.objective || research_plan?.objective) && (
              <div className="rounded-lg bg-canvas p-3 border border-line text-xs space-y-1">
                <span className="font-semibold text-brand flex items-center gap-1">
                  <Sparkles className="size-3.5" aria-hidden="true" />
                  <span>Owner Research Objective</span>
                </span>
                <p className="text-ink/90 leading-relaxed font-normal">
                  {target?.objective || research_plan?.objective}
                </p>
              </div>
            )}

            {report.summary && (
              <p className="text-sm leading-relaxed text-muted max-w-4xl pt-1">
                {report.summary}
              </p>
            )}
          </div>

          {createdAt && (
            <div className="shrink-0 text-left md:text-right bg-canvas/60 p-3 rounded-lg border border-line/60">
              <span className="block text-[11px] font-medium text-muted">Generated</span>
              <span className="text-xs font-semibold text-ink">
                {new Date(createdAt).toLocaleString("en-US", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 2. Research Plan Banner */}
      {research_plan && (
        <div className="rounded-xl border border-brand/30 bg-brand-soft/30 p-5 shadow-card space-y-3">
          <div className="flex items-center gap-2 text-brand font-semibold text-sm">
            <FileSearch className="size-4" aria-hidden="true" />
            <h2>Research approach</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="space-y-1 bg-surface/80 p-3 rounded-lg border border-line/50">
              <span className="text-[11px] font-medium text-muted block">Planned Search Term</span>
              <span className="font-mono text-xs font-semibold text-ink">{research_plan.search_term}</span>
            </div>
            <div className="space-y-1 bg-surface/80 p-3 rounded-lg border border-line/50 md:col-span-2">
              <span className="text-[11px] font-medium text-muted block">Method Rationale</span>
              <p className="text-ink/90 leading-normal">{research_plan.rationale}</p>
            </div>
          </div>
          {research_plan.evidence_needed && research_plan.evidence_needed.length > 0 && (
            <div className="pt-1 text-xs space-y-1.5">
              <span className="text-[11px] font-semibold text-muted block">Required Market Evidence:</span>
              <div className="flex flex-wrap gap-1.5">
                {research_plan.evidence_needed.map((item, idx) => (
                  <span key={idx} className="rounded-md bg-surface px-2.5 py-1 text-[11px] font-medium text-ink border border-line">
                    • {item}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. Key Market Findings */}
      {findings.length > 0 && (
        <div className="rounded-xl border border-line bg-surface p-5 shadow-card space-y-4">
          <div className="flex items-center gap-2 border-b border-line pb-3">
            <BookOpen className="size-4 text-brand" aria-hidden="true" />
            <h2 className="text-base font-semibold text-ink">What the research found</h2>
            <span className="ml-auto text-xs text-muted font-normal">{findings.length} findings</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {findings.map((finding, idx) => (
              <FindingCard key={idx} finding={finding} />
            ))}
          </div>
        </div>
      )}

      {/* 4. Competitor Comparison Table */}
      {comparisons.length > 0 && (
        <div className="rounded-xl border border-line bg-surface p-5 shadow-card space-y-4">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <div className="flex items-center gap-2">
              <Scale className="size-4 text-brand" aria-hidden="true" />
              <h2 className="text-base font-semibold text-ink">How your business compares</h2>
            </div>
            <span className="text-xs text-muted">Analysis Dimensions</span>
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-line bg-canvas/60 text-muted font-semibold">
                  <th className="py-2.5 px-3 w-1/5">Dimension</th>
                  <th className="py-2.5 px-3 w-1/5">Our Business Position</th>
                  <th className="py-2.5 px-3 w-1/4">Market Evidence</th>
                  <th className="py-2.5 px-3 w-1/5">Strategic Implication</th>
                  <th className="py-2.5 px-3 w-1/6">Citations</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {comparisons.map((item, idx) => (
                  <tr key={idx} className="hover:bg-canvas/40 transition-colors">
                    <td className="py-3 px-3 font-semibold text-ink align-top">{item.dimension}</td>
                    <td className="py-3 px-3 text-ink/90 align-top">{item.our_business || "Unknown"}</td>
                    <td className="py-3 px-3 text-ink/90 align-top">
                      {item.market_evidence ? (
                        <span>{item.market_evidence}</span>
                      ) : (
                        <span className="text-muted italic bg-canvas px-2 py-0.5 rounded">Unknown</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-ink/90 align-top">{item.implication || "Unknown"}</td>
                    <td className="py-3 px-3 align-top">
                      <SourceCitationPills urls={item.source_urls} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card Stack */}
          <div className="md:hidden space-y-3">
            {comparisons.map((item, idx) => (
              <div key={idx} className="rounded-lg border border-line bg-canvas/40 p-4 space-y-2 text-xs">
                <div className="font-semibold text-brand text-sm border-b border-line/60 pb-1">
                  {item.dimension}
                </div>
                <div>
                  <span className="text-muted block text-[11px] font-medium">Our Position:</span>
                  <span className="text-ink">{item.our_business || "Unknown"}</span>
                </div>
                <div>
                  <span className="text-muted block text-[11px] font-medium">Market Evidence:</span>
                  <span className="text-ink">
                    {item.market_evidence || <span className="text-muted italic">Unknown</span>}
                  </span>
                </div>
                <div>
                  <span className="text-muted block text-[11px] font-medium">Implication:</span>
                  <span className="text-ink">{item.implication || "Unknown"}</span>
                </div>
                {item.source_urls && item.source_urls.length > 0 && (
                  <div className="pt-1">
                    <SourceCitationPills urls={item.source_urls} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. Contact Reachability & Lead Opportunities */}
      {(leads.length > 0 || !hasStructuredResearch) && (
        <details open={researchType === "lead_discovery"} className="rounded-xl border border-line bg-surface p-4 space-y-4">
          <summary className="cursor-pointer text-sm font-semibold text-ink">
            {leads.length} businesses researched · contacts & coverage
          </summary>
          <div className="space-y-6">
          {/* KPI Cards Strip */}
          {metrics && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
                <div className="flex items-center justify-between text-muted">
                  <span className="text-xs font-medium">Entities Found</span>
                  <Building2 className="size-4 text-brand" aria-hidden="true" />
                </div>
                <p className="mt-2 text-2xl font-bold text-ink">{metrics.total ?? leads.length}</p>
                <span className="text-[11px] text-muted">Scraped records</span>
              </div>

              <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
                <div className="flex items-center justify-between text-muted">
                  <span className="text-xs font-medium">Websites</span>
                  <Globe className="size-4 text-emerald-600" aria-hidden="true" />
                </div>
                <p className="mt-2 text-2xl font-bold text-ink">{metrics.with_website ?? 0}</p>
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
                <p className="mt-2 text-2xl font-bold text-ink">{metrics.with_phone ?? 0}</p>
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
                <p className="mt-2 text-2xl font-bold text-ink">{metrics.with_email ?? 0}</p>
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
                  {metrics.average_rating != null ? metrics.average_rating.toFixed(1) : "N/A"}
                </p>
                <span className="text-[11px] text-muted">Market rating</span>
              </div>
            </div>
          )}

          {/* Categories & Contact Quality */}
          {categories.length > 0 && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-line bg-surface p-5 shadow-card space-y-3">
                <div className="flex items-center gap-2">
                  <Layers className="size-4 text-brand" aria-hidden="true" />
                  <h2 className="text-sm font-semibold text-ink">Category Distribution</h2>
                </div>
                <div className="space-y-3">
                  {categories.map((cat) => {
                    const pct = Math.round((cat.count / totalLeads) * 100);
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
              </div>

              {/* Reachability */}
              <div className="rounded-xl border border-line bg-surface p-5 shadow-card space-y-3">
                <div className="flex items-center gap-2">
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
          )}

          {/* Extracted Leads List */}
          {leads.length > 0 && (
            <div className="rounded-xl border border-line bg-surface p-5 shadow-card space-y-4">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <div className="flex items-center gap-2">
                  <Building2 className="size-4 text-brand" aria-hidden="true" />
                  <h2 className="text-base font-semibold text-ink">Businesses researched</h2>
                </div>
                <span className="rounded-full bg-canvas px-2.5 py-0.5 text-xs font-medium text-muted ring-1 ring-line ring-inset">
                  {leads.length} records
                </span>
              </div>

              <div className="space-y-3">
                {leads.map((lead, idx) => (
                  <LeadCard key={lead.place_id || `lead-${idx}`} lead={lead} />
                ))}
              </div>
            </div>
          )}
        </div>
        </details>
      )}

      {/* 6. Verified Evidence Sources */}
      {evidence_sources.length > 0 && (
        <div className="rounded-xl border border-line bg-surface p-5 shadow-card space-y-3">
          <div className="flex items-center gap-2 border-b border-line pb-3 text-ink font-semibold text-sm">
            <Link2 className="size-4 text-brand" />
            <h2>Sources reviewed</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
            {evidence_sources.map((src, i) => {
              const safeUrl = safeHref(src.url);
              return (
                <div key={i} className="rounded-lg border border-line bg-canvas/40 p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-semibold text-ink truncate">{src.title || src.kind || "Evidence Source"}</span>
                    {src.kind && <Badge tone="neutral" className="text-[10px]">{src.kind}</Badge>}
                  </div>
                  {safeUrl ? (
                    <a
                      href={safeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-emerald-600 hover:underline truncate max-w-full font-mono text-[11px]"
                    >
                      <span className="truncate">{safeUrl}</span>
                      <ArrowUpRight className="size-3 shrink-0" />
                    </a>
                  ) : (
                    <span className="text-muted font-mono text-[11px] truncate block">{src.url}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 7. Strategic Recommendations vs Data Limitations */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Recommendations */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 shadow-card space-y-3">
          <div className="flex items-center gap-2 text-emerald-900 font-semibold text-sm">
            <Sparkles className="size-4 text-emerald-600" aria-hidden="true" />
            <h2>Suggested next steps</h2>
          </div>
          {recommendations.length === 0 ? (
            <p className="text-xs text-emerald-800">No strategic recommendations generated.</p>
          ) : (
            <ul className="space-y-2">
              {recommendations.map((rec, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-emerald-950">
                  <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600 mt-0.5" aria-hidden="true" />
                  <span className="leading-relaxed">{rec}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Governance & Data Scope */}
        <div className="rounded-xl border border-line bg-surface p-5 shadow-card space-y-3">
          <div className="flex items-center gap-2 text-ink font-semibold text-sm">
            <Info className="size-4 text-muted" aria-hidden="true" />
            <h2>Limitations & unknowns</h2>
          </div>
          <div className="rounded-md bg-amber-50/70 border border-amber-200/80 p-2.5 text-xs text-amber-900 flex items-start gap-2">
            <AlertTriangle className="size-3.5 shrink-0 text-amber-600 mt-0.5" aria-hidden="true" />
            <span>AI market research synthesis is derived from public web evidence. Verify business details prior to outreach.</span>
          </div>
          {limitations.length === 0 ? (
            <p className="text-xs text-muted">Standard market research query bounds applied without extra data constraints.</p>
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

      {/* 8. Source Provenance Footer */}
      {sources && (
        <div className="rounded-xl border border-line bg-canvas p-4 text-xs text-muted space-y-1">
          <div className="flex items-center gap-1.5 font-medium text-ink">
            <Database className="size-3.5 text-muted" aria-hidden="true" />
            <span>Research Execution Provenance</span>
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

function FindingCard({ finding }: { finding: FindingItem }) {
  return (
    <div className="rounded-lg border border-line bg-canvas/40 p-4 space-y-2.5 flex flex-col justify-between">
      <div className="space-y-1.5">
        <h3 className="font-semibold text-ink text-sm leading-snug">{finding.heading}</h3>
        <p className="text-xs text-muted leading-relaxed">{finding.detail}</p>
      </div>
      {finding.source_urls && finding.source_urls.length > 0 && (
        <div className="pt-2 border-t border-line/50">
          <SourceCitationPills urls={finding.source_urls} />
        </div>
      )}
    </div>
  );
}

function SourceCitationPills({ urls }: { urls: string[] }) {
  if (!urls || urls.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
      <span className="text-muted font-medium">Sources:</span>
      {urls.map((url, i) => {
        const safe = safeHref(url);
        if (!safe) return null;
        let hostname = safe;
        try {
          hostname = new URL(safe).hostname.replace(/^www\./, "");
        } catch {
          // fallback
        }
        return (
          <a
            key={i}
            href={safe}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded bg-surface border border-line px-2 py-0.5 font-mono text-brand hover:text-brand-dark hover:border-brand/50 transition-colors"
          >
            <span>{hostname}</span>
            <ExternalLink className="size-2.5" />
          </a>
        );
      })}
    </div>
  );
}

function ResearchTypeBadge({ type }: { type: ResearchType }) {
  switch (type) {
    case "competitor_analysis":
      return (
        <Badge tone="brand" className="text-xs py-1 px-2.5">
          <Target className="size-3 mr-1" /> Competitor Analysis
        </Badge>
      );
    case "custom":
      return (
        <Badge tone="info" className="text-xs py-1 px-2.5">
          <Compass className="size-3 mr-1" /> Custom Research
        </Badge>
      );
    case "lead_discovery":
    default:
      return (
        <Badge tone="success" className="text-xs py-1 px-2.5">
          <Users className="size-3 mr-1" /> Lead Opportunities
        </Badge>
      );
  }
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

        <div className="flex items-center gap-3 ml-auto flex-wrap">
          {websiteUrl && (
            <a
              href={websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 font-medium text-emerald-600 hover:text-emerald-800 hover:underline"
            >
              <Globe className="size-3.5" aria-hidden="true" />
              <span>Website</span>
              <ArrowUpRight className="size-3" aria-hidden="true" />
            </a>
          )}

          {sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-muted hover:text-ink hover:underline"
            >
              <ExternalLink className="size-3.5" aria-hidden="true" />
              <span>Google Maps</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
