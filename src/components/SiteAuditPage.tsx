"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditIssue, AuditResult } from "@/lib/audit";
import type { RunAuth } from "@/lib/runner";
import { setUrl, urlParams } from "@/lib/researchUrl";
import { fixPlayOf, issueChanges, previousFull } from "@/lib/siteAudit";
import type { Area } from "@/lib/tech/checks";
import { DomainField, SearchBar, SearchButton } from "./SearchBar";
import { SidePanel, Thinking } from "./ui";
import { SiteAuditIntro } from "./ToolIntros";
import { ChangeSetCard, useApi } from "./ZippiePage";
import { Issues } from "./siteaudit/Issues";
import { Overview } from "./siteaudit/Overview";
import { Pages } from "./siteaudit/Pages";
import { SettingsPanel } from "./siteaudit/Settings";
import { num, when, type Row } from "./siteaudit/shared";

// Site Audit (docs/site-audit.md, docs/technical-seo-plan.md phase 1): the brand's latest crawl from crawler v2.
// Overview (health and its trend, what to fix first, scores by area, the crawl's charts), Issues (every check that
// failed, with the pages it hits and Fix where a CMS play exists) and Pages (every crawled URL). A partial crawl shows
// no score.

type Brand = { id: string; name: string; domain: string };
type Tab = "overview" | "issues" | "pages";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "issues", label: "Issues" },
  { id: "pages", label: "Pages" },
];

export function SiteAuditPage({ brand, sb, auth, canEdit, onConnect }: { brand: Brand; sb: SupabaseClient; auth: RunAuth; canEdit: boolean; onConnect: () => void }) {
  const api = useApi(auth);
  const [audits, setAudits] = useState<Row[] | null>(null);
  const [shown, setShown] = useState<Row | null>(null);
  const [before, setBefore] = useState<Row | null>(null);
  const [weekly, setWeekly] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [setId, setSetId] = useState<string | null>(null);
  const [needsSite, setNeedsSite] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [area, setArea] = useState<Area | null>(null);
  const [issueFilter, setIssueFilter] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);

  useEffect(() => {
    const v = urlParams().get("view");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (v === "issues" || v === "pages") setTab(v);
  }, []);
  const pick = (t: Tab) => {
    setTab(t);
    setUrl({ view: t === "overview" ? null : t }, false);
  };

  const load = useCallback(async () => {
    const { data, error: err } = await sb.from("site_audits").select("id, status, step, pages, score, error, created_at, finished_at, heartbeat_at").eq("brand_id", brand.id).order("created_at", { ascending: false }).limit(16);
    if (err) {
      // Before 067_crawler.sql there's no heartbeat_at; read without it.
      if (/heartbeat_at/.test(err.message)) {
        const r = await sb.from("site_audits").select("id, status, step, pages, score, error, created_at, finished_at").eq("brand_id", brand.id).order("created_at", { ascending: false }).limit(16);
        if (r.error) return setError(r.error.message);
        return finishLoad((r.data ?? []) as Row[]);
      }
      return setError(/brand_id/.test(err.message) ? "Run supabase/061_site_audits.sql with psql on the VPS database." : err.message);
    }
    await finishLoad((data ?? []) as Row[]);

    async function finishLoad(rows: Row[]) {
      // The newest finished crawl is the one on screen. The last 12 finished crawls bring their results for the trend.
      const done = rows.filter((r) => r.status === "done").slice(0, 12);
      if (done.length) {
        const { data: full } = await sb.from("site_audits").select("id, result").in("id", done.map((r) => r.id));
        const results = new Map((full ?? []).map((f) => [f.id as string, f.result as AuditResult]));
        for (const r of rows) r.result = results.get(r.id) ?? null;
      }
      const latest = rows.find((r) => r.status === "done") ?? null;
      setAudits(rows);
      setShown(latest);
      setBefore(latest ? (previousFull(rows, latest) as Row | null) : null);
      setError("");
    }
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

  const call = useCallback((action: string, extra: Record<string, unknown> = {}) => api<Record<string, unknown>>("/api/site-audit", { action, brandId: brand.id, ...extra }), [api, brand.id]);
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
    if (!shown || !fixPlayOf(issue)) return;
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
  const hasPages = result?.version === 2;

  const head = (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <h1 className="aw-h2 mb-0!">Site Audit</h1>
      {audits?.length ? (
        <div className="flex flex-wrap items-center gap-3">
          {canEdit && weekly !== null ? (
            <label className="flex cursor-pointer items-center gap-2 text-[13px] text-body">
              <button type="button" role="switch" aria-checked={weekly} aria-label="Weekly crawl" className={`aw-toggle ${weekly ? "is-on" : ""}`} onClick={toggleWeekly} />
              Weekly crawl
            </label>
          ) : null}
          <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => setSettings(true)}>
            Crawl settings
          </button>
          {canEdit ? (
            <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" onClick={crawl} disabled={Boolean(running) || busy === "crawl"}>
              {running ? "Crawling" : busy === "crawl" ? "Starting" : "Crawl now"}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
  const panels = (
    <>
      {setId ? (
        <SidePanel title="Review the fix" onClose={() => setSetId(null)}>
          <ChangeSetCard id={setId} api={api} canEdit={canEdit} />
        </SidePanel>
      ) : null}
      {settings ? <SettingsPanel call={call} canEdit={canEdit} onClose={() => setSettings(false)} /> : null}
    </>
  );

  if (audits === null) return <div className="flex flex-col gap-6">{head}{error ? <p className="aw-error">{error}</p> : <Thinking text="Loading" />}</div>;

  if (!audits.length)
    return (
      <div className="flex flex-col gap-6">
        {head}
        <SearchBar onSubmit={crawl}>
          <DomainField domain={brand.domain} />
          {canEdit ? <SearchButton label="Start audit" busyLabel="Starting" busy={busy === "crawl"} /> : null}
        </SearchBar>
        {error ? <p className="aw-error">{error}</p> : null}
        <SiteAuditIntro />
        {panels}
      </div>
    );

  const lastFailed = audits[0]?.status === "failed" ? audits[0] : null;

  return (
    <div className="flex flex-col gap-5">
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
      {running ? <Thinking text={`${running.step || "Crawling"}${running.pages ? `, ${num(running.pages)} pages read` : ""}`} /> : lastFailed ? <p className="aw-error">The last crawl failed: {lastFailed.error}</p> : null}

      {shown && result ? (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-muted">
            <span className="font-medium text-ink">{result.root ?? brand.domain}</span>
            <span>Crawled {when(shown.finished_at ?? shown.created_at)}</span>
            <span>
              {num(shown.pages)} pages{result.found > shown.pages ? ` of ${num(result.found)} found` : ""}
            </span>
            {result.sitemap ? <span>{result.sitemap}</span> : null}
            {!hasPages ? <span>Crawl again to see every page and the scores by area.</span> : null}
          </div>
          <div role="tablist" aria-label="Site Audit view" className="flex gap-1 overflow-x-auto border-b border-[var(--aw-rule)]">
            {TABS.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => pick(t.id)} className={`-mb-px shrink-0 border-b-2 px-3 py-2.5 text-[14px] font-medium whitespace-nowrap ${tab === t.id ? "border-[var(--signal)] text-ink" : "border-transparent text-muted hover:text-ink"}`}>
                {t.label}
                {t.id === "issues" ? <span className="ml-1.5 text-[12px] text-muted">{issues.length}</span> : t.id === "pages" ? <span className="ml-1.5 text-[12px] text-muted">{num(shown.pages)}</span> : null}
              </button>
            ))}
          </div>
          {tab === "overview" ? (
            <Overview
              shown={shown}
              result={result}
              before={before}
              audits={audits}
              fixed={fixed}
              changes={changes}
              canEdit={canEdit}
              busy={busy}
              onFix={fix}
              onIssue={(id) => {
                setOpen(id);
                setArea(null);
                pick("issues");
              }}
              onArea={(a) => {
                setArea(a);
                pick("issues");
              }}
              onCrawl={crawl}
              running={Boolean(running)}
            />
          ) : tab === "issues" ? (
            <Issues
              result={result}
              pages={shown.pages}
              changes={changes}
              area={area}
              onArea={setArea}
              open={open}
              onOpen={setOpen}
              canEdit={canEdit}
              busy={busy}
              onFix={fix}
              hasPages={hasPages}
              onPages={(id) => {
                setIssueFilter(id);
                pick("pages");
              }}
            />
          ) : hasPages ? (
            <Pages sb={sb} auditId={shown.id} result={result} issue={issueFilter} onIssue={setIssueFilter} />
          ) : (
            <p className="text-[14px] text-body">This crawl was made before page-by-page results. Crawl again to see every page.</p>
          )}
        </>
      ) : null}
      {panels}
    </div>
  );
}
