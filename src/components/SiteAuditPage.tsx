"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditIssue, AuditResult } from "@/lib/audit";
import { demoSiteAudit } from "@/lib/demo";
import type { RunAuth } from "@/lib/runner";
import { fixPlayOf, isFull, issueChanges, previousFull, SEVERITY_LABEL, type AuditRow, type IssueChange } from "@/lib/siteAudit";
import { ToolStart, TsDomain } from "./ToolStart";
import { Card, Delta, SidePanel, Thinking } from "./ui";
import { ChangeSetCard, useApi } from "./ZippiePage";

// Site Audit (docs/site-audit.md): the brand's latest crawl, its score against the last full crawl, and every issue
// with the pages it hits. Issues a CMS can fix open a change set to review here. A partial crawl shows no score.

type Row = AuditRow & { step: string; pages: number; error: string | null; finished_at: string | null; result?: AuditResult | null };
type Brand = { id: string; name: string; domain: string };

const SEVERITY_CLASS = { high: "aw-status--missed", medium: "aw-status--warn", low: "aw-status--pending" } as const;
const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const tone = (s: number) => (s >= 80 ? "var(--aw-pos)" : s >= 60 ? "var(--aw-warn)" : "var(--aw-neg)");

export function SiteAuditPage({ brand, sb, auth, canEdit, onConnect }: { brand: Brand; sb: SupabaseClient; auth: RunAuth; canEdit: boolean; onConnect: () => void }) {
  const api = useApi(auth);
  const [auditsState, setAudits] = useState<Row[] | null>(null);
  const [shownState, setShown] = useState<Row | null>(null);
  const [beforeState, setBefore] = useState<Row | null>(null);
  const [weekly, setWeekly] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [setId, setSetId] = useState<string | null>(null);
  const [needsSite, setNeedsSite] = useState("");
  // No crawl yet: the tool's start page (ToolStart) explains it, with this screen on example data inside it.
  // Open the example report shows that screen full size, where every part can be tried.
  const isDemo = auditsState !== null && auditsState.length === 0;
  const [showExample, setShowExample] = useState(false);
  const demoRows = useMemo(() => demoSiteAudit({ name: brand.name, domain: brand.domain }) as unknown as Row[], [brand.name, brand.domain]);
  const audits = isDemo ? demoRows : auditsState;
  const shown = isDemo ? demoRows[0] : shownState;
  const before = isDemo ? demoRows[1] : beforeState;

  const load = useCallback(async () => {
    const { data, error: err } = await sb
      .from("site_audits")
      .select("id, status, step, pages, score, error, created_at, finished_at")
      .eq("brand_id", brand.id)
      .order("created_at", { ascending: false })
      .limit(12);
    if (err) return setError(/brand_id/.test(err.message) ? "Run supabase/061_site_audits.sql with psql on the VPS database." : err.message);
    const rows = (data ?? []) as Row[];
    // The newest finished crawl is the one on screen, with its result. The change arrow compares it to the last full crawl.
    const latest = rows.find((r) => r.status === "done") ?? null;
    let withResult: Row | null = null;
    let prev: Row | null = null;
    if (latest) {
      const { data: full } = await sb.from("site_audits").select("id, result").in("id", rows.filter((r) => r.status === "done").slice(0, 6).map((r) => r.id));
      const results = new Map((full ?? []).map((f) => [f.id as string, f.result as AuditResult]));
      for (const r of rows) r.result = results.get(r.id) ?? null;
      withResult = latest;
      prev = previousFull(rows, latest) as Row | null;
    }
    setAudits(rows);
    setShown(withResult);
    setBefore(prev);
    setError("");
  }, [sb, brand.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    sb.from("brands")
      .select("audit_weekly")
      .eq("id", brand.id)
      .maybeSingle()
      .then(({ data }) => setWeekly(data ? data.audit_weekly !== false : null));
  }, [load, sb, brand.id]);

  const running = audits?.[0]?.status === "running" ? audits[0] : null;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [running, load]);

  async function call(action: string, extra: Record<string, unknown> = {}) {
    return api<Record<string, unknown>>("/api/site-audit", { action, brandId: brand.id, ...extra });
  }
  async function crawl() {
    setBusy("crawl");
    setError("");
    try {
      await call("start");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }
  async function toggleWeekly() {
    const next = !weekly;
    setWeekly(next);
    try {
      await call("weekly", { on: next });
    } catch (e) {
      setWeekly(!next);
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  async function fix(issue: AuditIssue) {
    if (!shown) return;
    setBusy(issue.id);
    setError("");
    setNeedsSite("");
    try {
      const r = await call("fix", { auditId: shown.id, issueId: issue.id });
      setSetId(String(r.setId));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/^Connect /.test(msg)) setNeedsSite(msg);
      else setError(msg);
    } finally {
      setBusy("");
    }
  }

  const result = shown?.result ?? null;
  const issues = useMemo(() => result?.issues ?? [], [result]);
  const { changes, fixed } = useMemo(() => issueChanges(before?.result?.issues ?? null, issues), [before, issues]);
  const history = (audits ?? []).filter(isFull).slice(0, 8).reverse();

  const head = (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <h1 className="aw-h2 mb-0!">Site Audit</h1>
      {isDemo ? (
        <span className="mr-auto flex flex-wrap items-center gap-2">
          <span className="aw-status aw-status--pending">Example data</span>
          <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => setShowExample(false)}>
            About Site Audit
          </button>
        </span>
      ) : null}
      {canEdit && audits?.length ? (
        <div className="flex flex-wrap items-center gap-3">
          {weekly !== null ? (
            <label className="flex cursor-pointer items-center gap-2 text-[13px] text-body">
              <button type="button" role="switch" aria-checked={weekly} aria-label="Weekly crawl" className={`aw-toggle ${weekly ? "is-on" : ""}`} onClick={toggleWeekly} />
              Weekly crawl
            </label>
          ) : null}
          <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" onClick={crawl} disabled={Boolean(running) || busy === "crawl"}>
            {running ? "Crawling" : busy === "crawl" ? "Starting" : "Crawl now"}
          </button>
        </div>
      ) : null}
    </div>
  );

  if (audits === null) return <div className="flex flex-col gap-6">{head}{error ? <p className="aw-error">{error}</p> : <Thinking text="Loading" />}</div>;

  const partial = result?.partial ?? null;
  const score = shown && !partial ? shown.score : null;
  const lastFailed = audits[0]?.status === "failed" ? audits[0] : null;

  const page = (
    <div className="flex flex-col gap-6">
      {head}
      {error ? <p className="aw-error">{error}</p> : null}
      {needsSite ? (
        <div className="aw-callout flex flex-wrap items-center justify-between gap-3">
          <span>{needsSite}</span>
          <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={onConnect}>
            Connect website
          </button>
        </div>
      ) : null}
      {running ? (
        <Thinking text={`${running.step || "Crawling"}${running.pages ? `, ${running.pages} pages read` : ""}`} />
      ) : lastFailed ? (
        <p className="aw-error">The last crawl failed: {lastFailed.error}</p>
      ) : null}

      {shown && result ? (
        <>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <div data-tour="1"><Card>
              <div className="flex flex-col items-center gap-2 px-4 py-5">
                <Gauge score={score} />
                <div className="flex flex-wrap items-center justify-center gap-2 text-[13px] text-muted">
                  <span>{partial ? "No score" : "Health score"}</span>
                  {score !== null && before ? <Delta now={score} before={before.score} digits={0} /> : null}
                </div>
                {history.length > 1 ? <History rows={history} /> : null}
              </div>
            </Card></div>
            <Card>
              <div className="flex flex-col gap-4 px-5 py-4">
                {partial ? (
                  <div className="aw-callout flex flex-wrap items-center justify-between gap-3">
                    <span>Partial crawl: {partial}</span>
                    {canEdit && !running ? (
                      <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={crawl}>
                        Crawl again
                      </button>
                    ) : null}
                  </div>
                ) : null}
                <dl data-tour="2" className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Fact label="Crawled" value={when(shown.finished_at ?? shown.created_at)} />
                  <Fact label="Pages read" value={`${shown.pages}${result.found > shown.pages ? ` of ${result.found}` : ""}`} />
                  <Fact label="Broken links" value={String(result.brokenLinks.length)} bad={result.brokenLinks.length > 0} />
                  <Fact label="AI crawlers blocked" value={result.blockedBots.length ? result.blockedBots.join(", ") : "None"} bad={result.blockedBots.length > 0} />
                </dl>
                {fixed.length ? (
                  <div className="flex flex-wrap items-center gap-2 text-[13px]">
                    <span className="text-muted">Fixed since {before ? when(before.created_at) : "last crawl"}</span>
                    {fixed.map((i) => (
                      <span key={i.id} className="aw-status aw-status--ranked">
                        {i.title}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </Card>
          </div>

          {issues.length ? (
            <div data-tour="3" className="flex flex-col gap-6">{(["high", "medium", "low"] as const).map((sev) => {
              const list = issues.filter((i) => i.severity === sev);
              if (!list.length) return null;
              const max = Math.max(1, shown.pages);
              return (
                <Card key={sev} title={`${SEVERITY_LABEL[sev]} priority`}>
                  <ul className="flex flex-col">
                    {list.map((i) => (
                      <IssueRow
                        key={i.id}
                        issue={i}
                        change={changes.get(i.id)}
                        share={i.pages.length || i.id === "broken_links" ? Math.min(1, i.count / max) : null}
                        open={open === i.id}
                        onOpen={() => setOpen(open === i.id ? null : i.id)}
                        fixable={(canEdit || isDemo) && Boolean(fixPlayOf(i))}
                        locked={isDemo}
                        busy={busy === i.id}
                        onFix={() => fix(i)}
                        broken={i.id === "broken_links" ? result.brokenLinks : null}
                      />
                    ))}
                  </ul>
                </Card>
              );
            })}</div>
          ) : (
            <Card>
              <p className="px-5 py-6 text-[14px] text-body">No issues found on {shown.pages} pages.</p>
            </Card>
          )}
        </>
      ) : null}

      {setId ? (
        <SidePanel title="Review the fix" onClose={() => setSetId(null)}>
          <ChangeSetCard id={setId} api={api} canEdit={canEdit} />
        </SidePanel>
      ) : null}
    </div>
  );

  if (isDemo && !showExample)
    return (
      <ToolStart
        key={brand.id}
        tool="siteaudit"
        error={error}
        example={page}
        onOpenExample={() => setShowExample(true)}
        onCta={canEdit ? crawl : undefined}
        form={
          <div className="ts-q">
            <TsDomain domain={brand.domain} />
            {canEdit ? (
              <button type="button" className="ts-btn ts-btn--primary ts-btn--lg" onClick={crawl} disabled={busy === "crawl"}>
                {busy === "crawl" ? "Starting" : "Start audit"} <span className="ts-arr">→</span>
              </button>
            ) : null}
          </div>
        }
      />
    );
  return page;
}

function Fact({ label, value, bad = false }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd className={`m-0 text-[15px] font-medium wrap-anywhere ${bad ? "text-neg" : "text-ink"}`}>{value}</dd>
    </div>
  );
}

/** The score on a half dial. A partial crawl shows an empty dial and a dash. */
function Gauge({ score }: { score: number | null }) {
  const len = Math.PI * 70;
  return (
    <svg width="200" height="116" viewBox="0 0 180 104" role="img" aria-label={score === null ? "No score" : `Health score ${score} of 100`}>
      <path d="M20 92 A70 70 0 0 1 160 92" fill="none" stroke="var(--aw-surface-2)" strokeWidth="14" strokeLinecap="round" />
      {score !== null ? <path d="M20 92 A70 70 0 0 1 160 92" fill="none" stroke={tone(score)} strokeWidth="14" strokeLinecap="round" strokeDasharray={`${(len * score) / 100} ${len}`} /> : null}
      <text x="90" y="84" textAnchor="middle" fill="var(--aw-ink)" style={{ font: "600 30px Inter, system-ui, sans-serif", fontVariantNumeric: "tabular-nums" }}>
        {score === null ? "–" : score}
      </text>
    </svg>
  );
}

/** Scores of the last full crawls, oldest first. */
function History({ rows }: { rows: Row[] }) {
  const w = 22;
  return (
    <svg width={rows.length * w} height="46" viewBox={`0 0 ${rows.length * w} 46`} role="img" aria-label="Score history">
      {rows.map((r, i) => {
        const s = r.score ?? 0;
        const h = Math.max(3, (s / 100) * 32);
        return (
          <g key={r.id}>
            <title>{`${when(r.created_at)}: ${s}`}</title>
            <rect x={i * w + 4} y={34 - h} width={w - 8} height={h} rx="3" fill={i === rows.length - 1 ? tone(s) : "var(--aw-rule)"} />
            <text x={i * w + w / 2} y="45" textAnchor="middle" fill="var(--aw-muted)" style={{ font: "10px Inter, system-ui, sans-serif" }}>
              {s}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function ChangeTag({ change }: { change?: IssueChange }) {
  if (!change || change.kind === "same") return null;
  if (change.kind === "new") return <span className="aw-status aw-status--missed">New</span>;
  return change.kind === "more" ? <span className="text-[12px] font-medium whitespace-nowrap text-neg">↗ {change.by}</span> : <span className="text-[12px] font-medium whitespace-nowrap text-pos">↘ {change.by}</span>;
}

function IssueRow(p: {
  issue: AuditIssue;
  change?: IssueChange;
  share: number | null;
  open: boolean;
  onOpen: () => void;
  fixable: boolean;
  locked?: boolean;
  busy: boolean;
  onFix: () => void;
  broken: AuditResult["brokenLinks"] | null;
}) {
  const { issue: i } = p;
  return (
    <li className="border-t border-[var(--aw-rule)] first:border-t-0">
      <div className="flex flex-wrap items-start gap-3 px-5 py-3">
        <button type="button" onClick={p.onOpen} aria-expanded={p.open} className="flex min-w-0 flex-1 flex-col items-start gap-1.5 text-left">
          <span className="flex flex-wrap items-center gap-2">
            <span className={`aw-status ${SEVERITY_CLASS[i.severity]}`}>{SEVERITY_LABEL[i.severity]}</span>
            <span className="text-[14px] font-medium text-ink wrap-break-word">{i.title}</span>
          </span>
          {p.share !== null ? (
            <span className="block h-1.5 w-full max-w-md overflow-hidden rounded-full bg-[var(--aw-surface-2)]" aria-hidden="true">
              <span className="block h-full rounded-full" style={{ width: `${Math.max(3, p.share * 100)}%`, background: i.severity === "high" ? "var(--aw-neg)" : i.severity === "medium" ? "var(--aw-warn)" : "var(--aw-muted)" }} />
            </span>
          ) : null}
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <ChangeTag change={p.change} />
          <span className="aw-num text-[13px] whitespace-nowrap text-body">
            {i.count} {i.id === "broken_links" ? (i.count === 1 ? "link" : "links") : i.id === "ai_bots_blocked" ? (i.count === 1 ? "crawler" : "crawlers") : i.pages.length ? (i.count === 1 ? "page" : "pages") : ""}
          </span>
          {p.fixable ? (
            <button type="button" data-tour="4" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={p.onFix} disabled={p.busy || p.locked}>
              {p.busy ? "Preparing" : "Fix"}
            </button>
          ) : null}
        </div>
      </div>
      {p.open ? (
        <div className="flex flex-col gap-3 px-5 pb-4">
          <p className="text-[13px] text-body">{i.why}</p>
          {p.broken?.length ? (
            <div className="aw-table-wrap overflow-x-auto">
              <table className="aw-table">
                <thead>
                  <tr>
                    <th>Broken link</th>
                    <th>Status</th>
                    <th>Found on</th>
                  </tr>
                </thead>
                <tbody>
                  {p.broken.map((b) => (
                    <tr key={`${b.from}>${b.url}`}>
                      <td className="wrap-anywhere">{b.url}</td>
                      <td className="aw-num">{b.status || "No answer"}</td>
                      <td className="wrap-anywhere">{b.from}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : i.pages.length ? (
            <ul className="flex flex-col gap-1 text-[13px]">
              {i.pages.map((u) => (
                <li key={u}>
                  <a href={u} target="_blank" rel="noreferrer" className="text-[var(--signal-ink)] wrap-anywhere hover:underline">
                    {u}
                  </a>
                </li>
              ))}
              {i.count > i.pages.length ? <li className="text-muted">{i.count - i.pages.length} more</li> : null}
            </ul>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
