"use client";

import { ExternalLink, Globe, Mail, Phone, Star } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "@/components/ui";
import { houstonTime } from "@/lib/format";
import {
  type ComparisonItem,
  type LeadReport,
  type ReportLead,
  type ReportMetrics,
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

const TYPE_LABEL: Record<ResearchType, string> = {
  lead_discovery: "Lead discovery",
  competitor_analysis: "Competitor analysis",
  custom: "Custom research",
};

const LEADS_LABEL: Record<ResearchType, string> = {
  lead_discovery: "Leads",
  competitor_analysis: "Competitors",
  custom: "Businesses",
};

// Boilerplate the agent stamps on every report. Dropped so real caveats are the only ones shown;
// the same warning already reads once as the disclaimer inside the bottom disclosure.
const BOILERPLATE_LIMITATIONS = new Set([
  "public contact details are unverified and subject to change.",
  "search sample is bounded and not exhaustive of all businesses in the area.",
  "no outreach or contact has been initiated with listed businesses.",
  "listing details are public data and unverified.",
]);

// The agent's per-lead filler, backfilled onto every lead it did not individualise.
const BOILERPLATE_OPPORTUNITIES = new Set([
  "review this business for referral partnership fit; not yet qualified.",
  "evaluated for market research fit based on public listing details.",
]);

// The agent may write "unknown" (its contract) or the handler may write "N/A"; both mean absent.
function isUnknown(value: string | null | undefined): boolean {
  if (!value) return true;
  return /^(unknown|n\/a|none|not disclosed|not available)$/i.test(value.trim());
}

function cleanOpportunity(text: string | null | undefined): string {
  const trimmed = (text || "").trim();
  if (!trimmed || BOILERPLATE_OPPORTUNITIES.has(trimmed.toLowerCase())) return "";
  return trimmed;
}

// "https://www.example.com/x" -> "example.com". Unparseable input comes back unchanged.
function hostOf(url: string | null | undefined): string {
  const safe = safeHref(url);
  if (!safe) return (url || "").trim();
  try {
    return new URL(safe).hostname.replace(/^www\./, "");
  } catch {
    return safe;
  }
}

function metricsLine(metrics: ReportMetrics | undefined, researchType: ResearchType): string {
  const parts: string[] = [];
  if (researchType === "lead_discovery") {
    if (metrics?.with_website) parts.push(`${metrics.with_website} with a website`);
    if (metrics?.with_phone) parts.push(`${metrics.with_phone} with a phone`);
    if (metrics?.with_email) parts.push(`${metrics.with_email} with an email`);
  }
  if (metrics?.average_rating != null) parts.push(`${metrics.average_rating.toFixed(1)} avg rating`);
  return parts.join(" · ");
}

export function LeadReportView({ report, target, createdAt }: LeadReportViewProps) {
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

  const objective = target?.objective || research_plan?.objective || "";
  const meta = [TYPE_LABEL[researchType], target?.area, houstonTime(createdAt, "datetime")]
    .filter(Boolean)
    .join(" · ");

  const caveats = limitations.filter((lim) => !BOILERPLATE_LIMITATIONS.has(lim.trim().toLowerCase()));
  const primaryIsLeads = researchType === "lead_discovery";
  const hasContent =
    Boolean(report.summary) ||
    leads.length > 0 ||
    findings.length > 0 ||
    comparisons.length > 0 ||
    recommendations.length > 0 ||
    caveats.length > 0;
  const hasProcess = Boolean(research_plan) || evidence_sources.length > 0 || Boolean(sources);

  const leadsBlock =
    leads.length > 0 ? (
      <LeadsSection leads={leads} metrics={metrics} categories={categories} researchType={researchType} />
    ) : null;

  const researchBlock = (
    <>
      {findings.length > 0 && (
        <section>
          <h3 className="border-b border-line pb-2 text-sm font-semibold text-ink">What the research found</h3>
          <ol className="mt-3 list-decimal space-y-4 pl-5 marker:text-xs marker:text-muted">
            {findings.map((finding, idx) => (
              <li key={idx}>
                <p className="text-sm leading-snug font-semibold text-ink">{finding.heading}</p>
                <ClampText
                  text={finding.detail}
                  className="mt-1 max-w-[72ch] text-sm leading-relaxed text-muted"
                  clampLines={4}
                  threshold={360}
                />
                {finding.source_urls && finding.source_urls.length > 0 && (
                  <SourceLinks urls={finding.source_urls} className="mt-1.5" />
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {comparisons.length > 0 && (
        <section>
          <h3 className="border-b border-line pb-2 text-sm font-semibold text-ink">How you compare</h3>
          <ComparisonTable items={comparisons} />
        </section>
      )}
    </>
  );

  return (
    <article className="space-y-6 rounded-xl border border-line bg-surface p-5 text-ink shadow-card">
      <header>
        <h2 className="text-base font-semibold tracking-tight text-ink">{report.title || "Lead report"}</h2>
        {meta && <p className="mt-1 text-xs text-muted">{meta}</p>}
        {objective && objective !== report.title && (
          <p className="mt-1 text-xs text-muted">Objective: {objective}</p>
        )}
      </header>

      {!hasContent && <p className="text-sm text-muted">This report has no content.</p>}

      {report.summary && (
        <ClampText
          text={report.summary}
          className="max-w-[72ch] text-sm leading-relaxed text-ink"
          clampLines={3}
          threshold={320}
        />
      )}

      {recommendations.length > 0 && (
        <section>
          <h3 className="border-b border-line pb-2 text-sm font-semibold text-ink">Next steps</h3>
          <ol className="mt-3 max-w-[72ch] list-decimal space-y-2 pl-5 text-sm text-ink marker:text-muted">
            {recommendations.map((rec, idx) => (
              <li key={idx}>{rec}</li>
            ))}
          </ol>
        </section>
      )}

      {primaryIsLeads ? (
        <>
          {leadsBlock}
          {researchBlock}
        </>
      ) : (
        <>
          {researchBlock}
          {leadsBlock}
        </>
      )}

      {caveats.length > 0 && (
        <section>
          <h3 className="border-b border-line pb-2 text-sm font-semibold text-ink">Caveats</h3>
          <ul className="mt-3 max-w-[72ch] list-disc space-y-1.5 pl-5 text-xs text-muted marker:text-muted">
            {caveats.map((lim, idx) => (
              <li key={idx}>{lim}</li>
            ))}
          </ul>
        </section>
      )}

      {hasProcess && (
        <details className="border-t border-line pt-4">
          <summary className="cursor-pointer text-xs font-medium text-muted select-none hover:text-ink">
            How this was researched
          </summary>
          <div className="mt-3 space-y-3 text-xs text-muted">
            {research_plan?.search_term && (
              <p>
                Search term: <span className="font-mono text-ink">{research_plan.search_term}</span>
              </p>
            )}
            {research_plan?.rationale && <p className="max-w-[72ch]">Why: {research_plan.rationale}</p>}
            {research_plan?.evidence_needed && research_plan.evidence_needed.length > 0 && (
              <div>
                <p>Evidence needed:</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {research_plan.evidence_needed.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {evidence_sources.length > 0 && (
              <div>
                <p>Sources reviewed ({evidence_sources.length})</p>
                <ul className="mt-1 space-y-0.5">
                  {evidence_sources.map((src, idx) => {
                    const safe = safeHref(src.url);
                    const host = hostOf(src.url);
                    // The handler stores the URL itself when the model leaves the title blank,
                    // so fall back to the hostname and never print it twice.
                    const label = src.title && src.title !== src.url ? src.title : host;
                    return (
                      <li key={idx}>
                        {safe ? (
                          <a
                            href={safe}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-brand hover:underline"
                          >
                            {label}
                          </a>
                        ) : (
                          <span>{label}</span>
                        )}
                        {label !== host && <span> · {host}</span>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {sources && (
              <p
                title={[sources.actor_id, sources.run_id, sources.dataset_id].filter(Boolean).join(" · ")}
              >
                {["Google Places", sources.fetched_at && `fetched ${houstonTime(sources.fetched_at, "datetime")}`]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
            <p>Synthesized from public web evidence. Verify details before outreach.</p>
          </div>
        </details>
      )}
    </article>
  );
}

// Long legacy prose stays in the DOM (copy and browser find still work) but reads as a few lines
// until the reader asks for the rest.
function ClampText({
  text,
  className,
  clampLines,
  threshold,
}: {
  text: string;
  className?: string;
  clampLines: 2 | 3 | 4;
  threshold: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const textId = useId();
  const clampable = text.length > threshold;
  const clamp = clampLines === 2 ? "line-clamp-2" : clampLines === 3 ? "line-clamp-3" : "line-clamp-4";

  return (
    <div>
      <p id={textId} className={cn(className, clampable && !expanded && clamp)}>
        {text}
      </p>
      {clampable && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-controls={textId}
          className="mt-1 cursor-pointer text-xs font-medium text-brand hover:underline"
        >
          {expanded ? "Less" : "More"}
        </button>
      )}
    </div>
  );
}

// Citations as plain hostname links. An unsafe URL still shows its host, just without an anchor.
function SourceLinks({ urls, className }: { urls: string[]; className?: string }) {
  if (!urls || urls.length === 0) return null;
  return (
    <p className={cn("text-xs text-muted", className)}>
      {urls.map((url, idx) => {
        const safe = safeHref(url);
        const host = hostOf(url);
        return (
          <span key={idx}>
            {idx > 0 && ", "}
            {safe ? (
              <a href={safe} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
                {host}
              </a>
            ) : (
              <span>{host}</span>
            )}
          </span>
        );
      })}
    </p>
  );
}

const TH = "border-b border-line bg-canvas px-3 py-2 text-left text-xs font-medium text-muted";
const TBODY = "[&_td]:border-b [&_td]:border-line [&_td]:px-3 [&_td]:py-2.5 [&_td]:align-top";

function ComparisonTable({ items }: { items: ComparisonItem[] }) {
  // Rows stored before the length caps tightened hold paragraph-length cells; clamp them so one
  // legacy row cannot grow to 200px, but keep the full text one click away.
  const val = (value: string | null | undefined) =>
    isUnknown(value) ? (
      <span className="text-muted">—</span>
    ) : (
      <ClampText text={value as string} className="text-xs text-muted" clampLines={3} threshold={180} />
    );

  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full border-separate border-spacing-0">
        <thead>
          <tr>
            <th scope="col" className={TH}>
              Dimension
            </th>
            <th scope="col" className={TH}>
              Us
            </th>
            <th scope="col" className={TH}>
              Market
            </th>
            <th scope="col" className={TH}>
              So what
            </th>
            <th scope="col" className={TH}>
              Sources
            </th>
          </tr>
        </thead>
        <tbody className={TBODY}>
          {items.map((item, idx) => (
            <tr key={idx} className="hover:bg-canvas/60">
              <td className="text-sm font-medium whitespace-nowrap text-ink">{item.dimension}</td>
              <td>{val(item.our_business)}</td>
              <td>{val(item.market_evidence)}</td>
              <td>{val(item.implication)}</td>
              <td>
                <SourceLinks urls={item.source_urls} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const VISIBLE_LEADS = 12;

function LeadsSection({
  leads,
  metrics,
  categories,
  researchType,
}: {
  leads: ReportLead[];
  metrics?: ReportMetrics;
  categories: { label: string; count: number }[];
  researchType: ResearchType;
}) {
  const [showAll, setShowAll] = useState(false);

  const statLine = metricsLine(metrics, researchType);
  const topCategories = [...categories].sort((a, b) => b.count - a.count).slice(0, 5);
  const categoryLine = topCategories.length
    ? [
        ...topCategories.map((cat) => `${cat.label} ${cat.count}`),
        categories.length > topCategories.length ? `+${categories.length - topCategories.length} more` : "",
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  // cleanOpportunity already blanks the agent's known backfill. The size guard is a backstop for an
  // unknown future filler and only fires on a list long enough that one repeated sentence is clearly
  // boilerplate - a small report keeps its column even if every lead happens to share a line.
  const opportunities = leads.map((lead) => cleanOpportunity(lead.opportunity)).filter(Boolean);
  const distinct = new Set(opportunities);
  const showOpportunity =
    opportunities.length > 0 &&
    !(distinct.size === 1 && opportunities.length === leads.length && leads.length > 3);

  const visible = showAll ? leads : leads.slice(0, VISIBLE_LEADS);

  return (
    <section>
      <h3 className="border-b border-line pb-2 text-sm font-semibold text-ink">
        {LEADS_LABEL[researchType] || LEADS_LABEL.custom} ({leads.length})
      </h3>
      {statLine && <p className="mt-2 text-xs text-muted">{statLine}</p>}
      {categoryLine && <p className="mt-1 text-xs text-muted">{categoryLine}</p>}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr>
              <th scope="col" className={`${TH} w-[34%]`}>
                Business
              </th>
              <th scope="col" className={`${TH} w-[72px]`}>
                Rating
              </th>
              <th scope="col" className={`${TH} w-[30%]`}>
                Contact
              </th>
              {showOpportunity && (
                <th scope="col" className={`${TH} w-[30%]`}>
                  Opportunity
                </th>
              )}
            </tr>
          </thead>
          <tbody className={TBODY}>
            {visible.map((lead, idx) => (
              <LeadRow
                key={lead.place_id || `lead-${idx}`}
                lead={lead}
                showOpportunity={showOpportunity}
              />
            ))}
          </tbody>
        </table>
      </div>

      {!showAll && leads.length > VISIBLE_LEADS && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-2 cursor-pointer text-xs font-medium text-brand hover:underline"
        >
          Show all {leads.length}
        </button>
      )}
    </section>
  );
}

function LeadRow({ lead, showOpportunity }: { lead: ReportLead; showOpportunity: boolean }) {
  const telLink = safeTel(lead.phone);
  const mailtoLink = safeMailto(lead.email);
  const websiteUrl = safeHref(lead.website);
  const sourceUrl = safeHref(lead.source_url);

  const subtitle = [lead.category, lead.address].filter(Boolean).join(" · ");
  const opportunity = cleanOpportunity(lead.opportunity);
  const hasIconLinks = Boolean(mailtoLink || websiteUrl || sourceUrl);

  return (
    <tr className="hover:bg-canvas/60">
      <td>
        <span className="text-sm leading-snug font-medium text-ink">{lead.name}</span>
        {subtitle && (
          <p className="mt-0.5 truncate text-xs text-muted" title={subtitle}>
            {subtitle}
          </p>
        )}
      </td>
      <td className="whitespace-nowrap">
        {lead.rating != null ? (
          <span className="inline-flex items-center gap-1 text-sm text-muted">
            <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-400" aria-hidden="true" />
            {lead.rating.toFixed(1)}
          </span>
        ) : (
          <span className="text-sm text-muted">—</span>
        )}
      </td>
      <td>
        {telLink ? (
          <a href={telLink} className="inline-flex items-center gap-1.5 text-sm text-brand hover:underline">
            <Phone className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="tabular-nums">{lead.phone}</span>
          </a>
        ) : lead.phone ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-muted">
            <Phone className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="tabular-nums">{lead.phone}</span>
          </span>
        ) : null}
        {hasIconLinks && (
          <div className="mt-1 flex items-center gap-1">
            {mailtoLink && (
              <a
                href={mailtoLink}
                className="-m-1 inline-flex p-1 text-muted hover:text-brand"
                aria-label={`Email ${lead.email}`}
                title={lead.email ?? undefined}
              >
                <Mail className="size-3.5" />
              </a>
            )}
            {websiteUrl && (
              <a
                href={websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="-m-1 inline-flex p-1 text-muted hover:text-brand"
                aria-label={`Website: ${hostOf(lead.website)}`}
                title={hostOf(lead.website)}
              >
                <Globe className="size-3.5" />
              </a>
            )}
            {sourceUrl && (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="-m-1 inline-flex p-1 text-muted hover:text-brand"
                aria-label="Open in Google Maps"
                title="Google Maps"
              >
                <ExternalLink className="size-3.5" />
              </a>
            )}
          </div>
        )}
        {!telLink && !lead.phone && !hasIconLinks && <span className="text-sm text-muted">—</span>}
      </td>
      {showOpportunity && (
        <td>
          {opportunity && (
            <ClampText text={opportunity} className="text-xs text-muted" clampLines={2} threshold={140} />
          )}
        </td>
      )}
    </tr>
  );
}
