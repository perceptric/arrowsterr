"use client";

import type { AuditIssue, AuditResult } from "@/lib/audit";
import { CHECKS, type Area, type Severity } from "@/lib/tech/checks";
import type { AuditRow, IssueChange } from "@/lib/siteAudit";

// Parts the Site Audit tabs share.

export type Row = AuditRow & { step: string; pages: number; error: string | null; finished_at: string | null; heartbeat_at?: string | null; result?: AuditResult | null };

export const SEV: Record<Severity, { name: string; one: string; color: string; cls: string }> = {
  high: { name: "Errors", one: "Error", color: "var(--aw-neg)", cls: "aw-status--missed" },
  medium: { name: "Warnings", one: "Warning", color: "var(--aw-warn)", cls: "aw-status--warn" },
  low: { name: "Notices", one: "Notice", color: "#A3A8B3", cls: "aw-status--pending" },
};
export const WEIGHT: Record<Severity, number> = { high: 15, medium: 7, low: 2 };
export const num = (x: number) => x.toLocaleString("en-US");
export const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
export const tone = (s: number) => (s >= 80 ? "var(--aw-pos)" : s >= 60 ? "var(--aw-warn)" : "var(--aw-neg)");

/** An issue's area: saved on v2 crawls, looked up for older ones. */
export const areaOf = (i: AuditIssue): Area | undefined => i.area ?? CHECKS[i.id]?.area;
/** How to fix it: saved on v2 crawls, looked up for older ones. */
export const howOf = (i: AuditIssue) => i.how ?? CHECKS[i.id]?.how;

/** Impact for ranking "what to fix first": weight times the share of pages it hits; site-wide issues count in full. */
export function impact(i: AuditIssue, pages: number) {
  const siteWide = i.siteWide ?? !i.pages.length;
  return WEIGHT[i.severity] * (siteWide ? 1 : Math.min(1, i.count / Math.max(1, pages)));
}

export const short = (u: string, root?: string) => {
  try {
    const x = new URL(u);
    return root && x.origin === new URL(root).origin ? x.pathname + x.search : u.replace(/^https?:\/\//, "");
  } catch {
    return u;
  }
};

export function ChangeTag({ change }: { change?: IssueChange }) {
  if (!change || change.kind === "same") return <span className="text-muted">–</span>;
  if (change.kind === "new") return <span className="aw-status aw-status--missed">New</span>;
  return change.kind === "more" ? <span className="text-[12px] font-medium whitespace-nowrap text-neg">+{num(change.by)}</span> : <span className="text-[12px] font-medium whitespace-nowrap text-pos">−{num(change.by)}</span>;
}

export function SevDot({ s }: { s: Severity }) {
  return <span className="inline-block h-2 w-2 shrink-0 rounded-[2px]" style={{ background: SEV[s].color }} aria-label={SEV[s].one} />;
}

/** The score on a half dial. A partial crawl shows an empty dial and a dash. */
export function Gauge({ score, size = 200 }: { score: number | null; size?: number }) {
  const len = Math.PI * 70;
  return (
    <svg width={size} height={size * 0.58} viewBox="0 0 180 104" role="img" aria-label={score === null ? "No score" : `Health score ${score} of 100`}>
      <path d="M20 92 A70 70 0 0 1 160 92" fill="none" stroke="var(--aw-surface-2)" strokeWidth="14" strokeLinecap="round" />
      {score !== null ? <path d="M20 92 A70 70 0 0 1 160 92" fill="none" stroke={tone(score)} strokeWidth="14" strokeLinecap="round" strokeDasharray={`${(len * score) / 100} ${len}`} /> : null}
      <text x="90" y="80" textAnchor="middle" fill="var(--aw-ink)" style={{ font: "600 34px Inter, system-ui, sans-serif", fontVariantNumeric: "tabular-nums" }}>
        {score === null ? "–" : score}
      </text>
      <text x="90" y="98" textAnchor="middle" fill="var(--aw-muted)" style={{ font: "11px Inter, system-ui, sans-serif" }}>
        of 100
      </text>
    </svg>
  );
}

/** A small ring for an area score. */
export function Ring({ score, size = 40 }: { score: number; size?: number }) {
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--aw-surface-2)" strokeWidth="4.5" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone(score)} strokeWidth="4.5" strokeLinecap="round" strokeDasharray={`${(score / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </svg>
  );
}
