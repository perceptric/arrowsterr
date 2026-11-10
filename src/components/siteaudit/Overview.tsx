"use client";

import type { AuditIssue, AuditResult } from "@/lib/audit";
import { AREAS, type Area } from "@/lib/tech/checks";
import { isFull, type IssueChange } from "@/lib/siteAudit";
import { Card, Delta, StatStrip } from "../ui";
import { C, Donut, HBars, LineChart, Stack } from "../backlinks/charts";
import { areaOf, Gauge, impact, num, Ring, SEV, SevDot, when, type Row } from "./shared";

// The hub: health with its trend, what to fix first, the numbers, scores by area and the crawl's charts.

const DEPTH_LABELS = ["Home", "1", "2", "3", "4", "5", "6+"];

export function Overview(p: {
  shown: Row;
  result: AuditResult;
  before: Row | null;
  audits: Row[];
  fixed: AuditIssue[];
  changes: Map<string, IssueChange>;
  canEdit: boolean;
  busy: string;
  onFix: (i: AuditIssue) => void;
  onIssue: (id: string) => void;
  onArea: (a: Area) => void;
  onCrawl: () => void;
  running: boolean;
}) {
  const { shown, result, before } = p;
  const partial = result.partial ?? null;
  const score = partial ? null : shown.score;
  const issues = result.issues;
  const count = (s: "high" | "medium" | "low") => issues.filter((i) => i.severity === s).length;
  const pagesHit = (s: "high" | "medium" | "low") => issues.filter((i) => i.severity === s).reduce((a, i) => a + i.count, 0);
  const history = p.audits.filter(isFull).slice(0, 12).reverse();
  // Errors first, then warnings, then notices; inside each, the one that hits the biggest share of the site.
  const rankOf = { high: 0, medium: 1, low: 2 };
  const top = [...issues].sort((a, b) => rankOf[a.severity] - rankOf[b.severity] || impact(b, shown.pages) - impact(a, shown.pages)).slice(0, 5);
  const st = result.stats;
  const idx = st?.indexability;
  const totalIdx = idx ? idx.indexable + idx.noindex + idx.canonical + idx.redirect + idx.error : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card title="Health" action={score !== null && before?.score != null ? <Delta now={score} before={before.score} digits={0} /> : undefined}>
          <div className="flex flex-col gap-4 px-5 pb-5">
            <div className="flex flex-wrap items-center gap-6">
              <Gauge score={score} />
              <div className="min-w-56 flex-1">
                {history.length > 1 ? (
                  <LineChart series={[{ name: "Health", color: C.signal, values: history.map((h) => h.score ?? 0), width: 2.5 }]} labels={history.map((h) => new Date(h.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }))} area height={170} width={460} zero every={Math.ceil(history.length / 4)} label="Health over the last crawls" />
                ) : (
                  <span className="text-[13px] text-muted">The trend shows after your next crawl.</span>
                )}
              </div>
            </div>
            {partial ? (
              <div className="aw-callout flex flex-wrap items-center justify-between gap-3">
                <span>Partial crawl, so no score: {partial}</span>
                {p.canEdit && !p.running ? (
                  <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={p.onCrawl}>
                    Crawl again
                  </button>
                ) : null}
              </div>
            ) : null}
            {p.fixed.length ? (
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="text-muted">Fixed since {before ? when(before.created_at) : "the last crawl"}</span>
                {p.fixed.map((i) => (
                  <span key={i.id} className="aw-status aw-status--ranked">
                    {i.title}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </Card>
        <Card title="What to fix first">
          <ul className="flex flex-col px-5 pb-4">
            {top.length ? (
              top.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-3 border-t border-[var(--aw-rule)] py-2.5 first:border-t-0">
                  <SevDot s={i.severity} />
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => p.onIssue(i.id)}>
                    <span className="block text-[13.5px] font-medium text-ink hover:underline">{i.title}</span>
                    <span className="block text-[12px] text-muted">
                      {i.pages.length ? `${num(i.count)} ${i.count === 1 ? "page" : "pages"}` : "Whole site"}
                      {areaOf(i) ? `, ${AREAS.find((a) => a.id === areaOf(i))?.label}` : ""}
                    </span>
                  </button>
                  {p.changes.get(i.id)?.kind === "new" ? <span className="aw-status aw-status--missed">New</span> : null}
                  {p.canEdit && i.play ? (
                    <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => p.onFix(i)} disabled={p.busy === i.id}>
                      {p.busy === i.id ? "Preparing" : "Fix"}
                    </button>
                  ) : null}
                </li>
              ))
            ) : (
              <li className="py-3 text-[14px] text-body">Nothing to fix. Every check passed.</li>
            )}
          </ul>
        </Card>
      </div>

      <StatStrip
        stats={[
          { label: "Pages crawled", value: num(shown.pages), sub: result.found > shown.pages ? `of ${num(result.found)} found` : `crawled ${when(shown.finished_at ?? shown.created_at)}` },
          { label: SEV.high.name, value: num(count("high")), tone: count("high") ? "neg" : undefined, sub: `${num(pagesHit("high"))} hits` },
          { label: SEV.medium.name, value: num(count("medium")), tone: count("medium") ? "warn" : undefined, sub: `${num(pagesHit("medium"))} hits` },
          { label: SEV.low.name, value: num(count("low")), sub: `${num(pagesHit("low"))} hits` },
          { label: "Indexable", value: totalIdx ? `${Math.round(((idx?.indexable ?? 0) / totalIdx) * 100)}%` : "–", sub: "of crawled pages" },
          { label: "Broken links", value: num(issues.find((i) => i.id === "broken_links")?.count ?? result.brokenLinks.length), tone: result.brokenLinks.length ? "neg" : undefined },
        ]}
      />

      {result.areas ? (
        <Card title="Scores by area">
          <div className="grid grid-cols-2 gap-2.5 px-5 pb-5 sm:grid-cols-3 lg:grid-cols-5">
            {AREAS.map((a) => {
              const s = result.areas?.[a.id] ?? 100;
              const n = issues.filter((i) => areaOf(i) === a.id).length;
              return (
                <button key={a.id} type="button" onClick={() => p.onArea(a.id)} className="flex items-center gap-3 rounded-[12px] border border-[var(--aw-rule)] bg-white p-2.5 text-left transition-colors hover:border-[var(--aw-line)]">
                  <Ring score={s} />
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-medium text-muted">{a.label}</span>
                    <span className="aw-num block text-[18px] font-semibold text-ink">{s}</span>
                    <span className="block text-[11.5px] text-muted">{n ? `${n} ${n === 1 ? "issue" : "issues"}` : "All clear"}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {history.length > 1 ? (
          <Card title="Issues over time">
            <div className="flex flex-col gap-2 px-5 pb-5">
              <IssueBars rows={history} />
              <span className="flex flex-wrap gap-3 text-[12px] text-body">
                {(["high", "medium", "low"] as const).map((s) => (
                  <span key={s} className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: SEV[s].color }} />
                    {SEV[s].name}
                  </span>
                ))}
              </span>
            </div>
          </Card>
        ) : null}
        {st ? (
          <Card title="Status codes">
            <div className="px-5 pb-5">
              <Donut
                label="Status codes"
                parts={[
                  { label: "2xx OK", value: st.statuses.ok, color: C.pos },
                  { label: "3xx Redirect", value: st.statuses.redirect, color: C.sky },
                  { label: "4xx Client error", value: st.statuses.client, color: C.warn },
                  { label: "5xx Server error", value: st.statuses.server, color: C.neg },
                  { label: "No answer", value: st.statuses.none, color: C.light },
                ].filter((x) => x.value > 0)}
              />
            </div>
          </Card>
        ) : null}
        {idx && totalIdx ? (
          <Card title="Indexability">
            <div className="flex flex-col gap-4 px-5 pb-5">
              <Stack
                parts={[
                  { label: "Indexable", value: idx.indexable, color: C.signal },
                  { label: "noindex", value: idx.noindex, color: C.warn },
                  { label: "Canonical elsewhere", value: idx.canonical, color: C.sky },
                  { label: "Redirect", value: idx.redirect, color: C.light },
                  { label: "Error", value: idx.error, color: C.neg },
                ]}
              />
              <HBars
                rows={[
                  { label: "Indexable", value: idx.indexable, color: C.signal },
                  { label: "noindex", value: idx.noindex, color: C.warn },
                  { label: "Canonical elsewhere", value: idx.canonical, color: C.sky },
                  { label: "Redirect", value: idx.redirect, color: C.light },
                  { label: "Error or no answer", value: idx.error, color: C.neg },
                ]}
              />
            </div>
          </Card>
        ) : null}
        {st ? (
          <Card title="Crawl depth">
            <div className="flex flex-col gap-2 px-5 pb-5">
              <HBars rows={st.depth.map((v, i) => ({ key: String(i), label: i === 0 ? "Home" : `${DEPTH_LABELS[i]} ${i === 1 ? "click" : "clicks"}`, value: v, color: i >= 4 ? C.orange : C.signal }))} />
              <span className="text-[12px] text-muted">Pages 4 or more clicks from home get crawled less often.</span>
            </div>
          </Card>
        ) : null}
        {st?.templates.length ? (
          <Card title="Templates">
            <div className="px-5 pb-5">
              <HBars rows={st.templates.slice(0, 8).map((t) => ({ key: t.pattern, label: `${t.name} (${t.pattern})`, value: t.pages, color: C.ink }))} />
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

/** Errors, warnings and notices per full crawl, stacked. */
function IssueBars({ rows }: { rows: Row[] }) {
  const counts = rows.map((r) => (["high", "medium", "low"] as const).map((s) => (r.result?.issues ?? []).filter((i) => i.severity === s).length));
  const W = 420;
  const H = 180;
  const L = 28;
  const B = 22;
  const top = Math.max(4, ...counts.map((c) => c[0] + c[1] + c[2]));
  const col = (W - L) / rows.length;
  const bw = Math.min(28, col * 0.6);
  const y = (v: number) => 8 + (H - 8 - B) * (1 - v / top);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Issues per crawl">
      {[0, Math.round(top / 2), top].map((v) => (
        <g key={v}>
          <line x1={L} x2={W} y1={y(v)} y2={y(v)} stroke="var(--aw-rule)" />
          <text x={L - 5} y={y(v) + 4} textAnchor="end" fill="var(--aw-muted)" style={{ font: "11px Inter, system-ui, sans-serif" }}>
            {v}
          </text>
        </g>
      ))}
      {counts.map((c, i) => {
        const x = L + i * col + (col - bw) / 2;
        let acc = 0;
        return (
          <g key={rows[i].id}>
            {c.map((v, k) => {
              const y0 = y(acc);
              acc += v;
              return (
                <rect key={k} x={x} y={y(acc)} width={bw} height={Math.max(0, y0 - y(acc))} fill={SEV[(["high", "medium", "low"] as const)[k]].color}>
                  <title>{`${when(rows[i].created_at)}: ${v} ${SEV[(["high", "medium", "low"] as const)[k]].name.toLowerCase()}`}</title>
                </rect>
              );
            })}
            {i % Math.ceil(rows.length / 4) === 0 || i === rows.length - 1 ? (
              <text x={x + bw / 2} y={H - 5} textAnchor="middle" fill="var(--aw-muted)" style={{ font: "11px Inter, system-ui, sans-serif" }}>
                {new Date(rows[i].created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
