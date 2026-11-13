"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CrawlSettings } from "@/lib/audit/crawl";
import type { CrawlStats } from "@/lib/audit/graph";
import { PARTIAL_TEXT, SPEED_LABELS, stageText, VIEW_LABELS, type PageView } from "@/lib/audit/labels";
import type { RunAuth } from "@/lib/runner";
import { useStash } from "@/lib/stash";
import { EmptyScreen } from "./Drawing";
import { Modal } from "./reports/Dialog";
import { ago } from "./reports/reportApi";
import { post } from "./research/shared";
import { Card, Seg, SidePanel, StatStrip, Thinking } from "./ui";

// Audit (docs/audit-features.md): one crawl of the brand's site, read by Overview, Internal links and Pages.
// Phase 1: the crawl, its progress and settings, the link numbers, every crawled page and each page's links.

export type AuditTab = "overview" | "links" | "pages";

type Compare = { added: number; gone: number; addedSample: string[]; goneSample: string[] } | null;
type AuditRow = {
  id: string;
  root: string;
  settings: CrawlSettings;
  status: "queued" | "running" | "done" | "partial" | "failed";
  stage: string;
  partial_reason: string | null;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  pages_found: number;
  pages_done: number;
  over_limit: number;
  stats: (CrawlStats & { compare: Compare }) | null;
  trigger: "manual" | "weekly";
  created_at: string;
};
type Overview = {
  running: AuditRow | null;
  latest: AuditRow | null;
  history: { id: string; status: string; finished_at: string; pages: number; stats: CrawlStats | null }[];
  settings: CrawlSettings;
  weekly: boolean;
  limits: { pages: number; everyDays: number };
  canCrawl: boolean;
};
type PageRow = {
  url_hash: string;
  url: string;
  final_url: string | null;
  status: number;
  error: string | null;
  content_type: string | null;
  title: string | null;
  depth: number | null;
  links_in: number;
  body_links_in: number;
  links_out: number;
  link_score: number;
  orphan: boolean;
  bad_links_out: number;
  ai_citations: number;
  value: number;
  indexable: boolean;
  words: number;
  in_sitemap: boolean;
  found_from: string;
  canonical: string | null;
  meta_robots: string | null;
};
type PageDetail = {
  page: PageRow & { h1: string[]; h2: string[]; redirect_chain: { url: string; status: number }[] | null; published_at: string | null; modified_at: string | null; sitemap_lastmod: string | null; ext_links: number; ms: number | null };
  linksIn: { url: string; title: string | null; status: number; anchor: string; rel: string; place: string }[];
  linksOut: { url: string; title: string | null; status: number | null; anchor: string; rel: string; place: string }[];
};

const fmt = (n: number | null | undefined) => (n == null ? "–" : n.toLocaleString("en-US"));
const pathOf = (url: string) => {
  try {
    const u = new URL(url);
    return u.pathname + u.search || "/";
  } catch {
    return url;
  }
};
const statusTone = (s: number) => (s >= 200 && s < 300 ? "" : s >= 300 && s < 400 ? "text-warn" : "text-neg");
const statusText = (s: number, error?: string | null) => (s === 0 ? error || "No answer" : String(s));
const took = (a: AuditRow) => {
  if (!a.started_at || !a.finished_at) return null;
  const m = Math.round((Date.parse(a.finished_at) - Date.parse(a.started_at)) / 60_000);
  return m < 1 ? "under a minute" : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};

export function AuditPage({ auth, canEdit, brand, tab, onTab }: { auth: RunAuth; canEdit: boolean; brand: { id: string; name: string; domain: string }; tab: AuditTab; onTab: (t: AuditTab) => void }) {
  const [data, setData] = useStash<Overview | null>(`audit:${brand.id}`, null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [view, setView] = useState<PageView>("all");

  const load = useCallback(async () => {
    try {
      setData(await post<Overview>(auth, "/api/audit", { action: "overview", brandId: brand.id }));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [auth, brand.id, setData]);
  useEffect(() => {
    // Loading on first render is the point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // While a crawl runs, its progress every 3 seconds, and the whole screen again when it ends.
  const runningId = data?.running?.id ?? null;
  useEffect(() => {
    if (!runningId) return;
    const t = setInterval(async () => {
      try {
        const { audit } = await post<{ audit: AuditRow }>(auth, "/api/audit", { action: "status", auditId: runningId });
        if (audit.status === "queued" || audit.status === "running") setData((d) => (d ? { ...d, running: audit } : d));
        else load();
      } catch {
        // The next tick tries again.
      }
    }, 3000);
    return () => clearInterval(t);
  }, [auth, runningId, load, setData]);

  async function crawlNow() {
    setStarting(true);
    try {
      await post(auth, "/api/audit", { action: "start", brandId: brand.id });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  }

  const head = (
    <header className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="aw-h2 mb-0!">Audit</h1>
        {canEdit && data ? (
          <span className="flex flex-wrap items-center gap-2">
            <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => setEditing(true)}>
              Crawl settings
            </button>
            <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" onClick={crawlNow} disabled={starting || Boolean(data.running) || !data.canCrawl}>
              {data.running ? "Crawling..." : starting ? "Starting..." : "Crawl now"}
            </button>
          </span>
        ) : null}
      </div>
      <Seg<AuditTab>
        label="Audit"
        value={tab}
        onChange={onTab}
        options={[
          { id: "overview", label: "Overview" },
          { id: "links", label: "Internal links" },
          { id: "pages", label: "Pages" },
        ]}
      />
    </header>
  );

  if (!data)
    return (
      <div className="flex flex-col gap-6">
        {head}
        {error ? <p className="aw-error">{error}</p> : <Thinking text="Loading the audit..." />}
      </div>
    );

  const settingsDialog = editing ? (
    <SettingsDialog
      auth={auth}
      brandId={brand.id}
      domain={brand.domain}
      settings={data.settings}
      weekly={data.weekly}
      limits={data.limits}
      onClose={() => setEditing(false)}
      onSaved={() => {
        setEditing(false);
        load();
      }}
    />
  ) : null;

  const latest = data.latest;
  const usable = latest && latest.status !== "failed" && latest.stats ? latest : null;
  return (
    <div className="flex flex-col gap-6">
      {head}
      {error ? <p className="aw-error">{error}</p> : null}
      {data.running ? <Progress audit={data.running} /> : null}
      {latest && latest.status !== "done" && latest.partial_reason ? (
        <p className={latest.status === "failed" ? "aw-error" : "aw-small text-warn!"}>{PARTIAL_TEXT[latest.partial_reason] ?? latest.error ?? "The last crawl didn't finish."}</p>
      ) : null}
      {!usable ? (
        data.running ? null : (
          <EmptyScreen
            drawing="link"
            title={`Crawl ${brand.domain}`}
            action={
              canEdit ? (
                <button type="button" className="aw-btn aw-btn--primary" onClick={crawlNow} disabled={starting || !data.canCrawl}>
                  {starting ? "Starting..." : "Crawl now"}
                </button>
              ) : null
            }
          >
            We read every page of your site the way a search engine does, and map how the pages link to each other. You see orphans, pages buried too deep, and links that hit redirects or broken pages. Up to {fmt(data.limits.pages)} pages on your plan.
          </EmptyScreen>
        )
      ) : tab === "overview" ? (
        <OverviewTab audit={usable} history={data.history} weekly={data.weekly} everyDays={data.limits.everyDays} onView={(v) => {
          setView(v);
          onTab("pages");
        }} />
      ) : tab === "links" ? (
        <LinksTab audit={usable} onView={(v) => {
          setView(v);
          onTab("pages");
        }} />
      ) : (
        <PagesTab key={usable.id} auth={auth} audit={usable} view={view} onView={setView} />
      )}
      {settingsDialog}
    </div>
  );
}

function Progress({ audit }: { audit: AuditRow }) {
  const share = audit.pages_found ? Math.min(1, audit.pages_done / audit.pages_found) : 0;
  return (
    <Card>
      <div className="flex flex-col gap-2 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="aw-h4">{stageText(audit)}</span>
          <span className="text-[13px] text-muted">Started {ago(audit.started_at ?? audit.created_at)}</span>
        </div>
        <div className="aw-progress" role="progressbar" aria-valuenow={Math.round(share * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="aw-progress__fill" style={{ width: `${Math.round(share * 100)}%` }} />
        </div>
        <span className="text-[13px] text-muted">You can leave this page. The crawl keeps going, and the numbers below update when it ends.</span>
      </div>
    </Card>
  );
}

function OverviewTab({ audit, history, weekly, everyDays, onView }: { audit: AuditRow; history: Overview["history"]; weekly: boolean; everyDays: number; onView: (v: PageView) => void }) {
  const s = audit.stats!;
  const compare = s.compare;
  return (
    <div className="flex flex-col gap-6">
      <StatStrip
        spark={history.length >= 2 ? history.map((h) => h.pages) : undefined}
        stats={[
          { label: "Pages crawled", value: fmt(s.pages), sub: `${fmt(s.ok)} answer, ${fmt(s.redirects)} redirect, ${fmt(s.broken + s.noAnswer)} broken` },
          { label: "Orphans", value: fmt(s.orphans), tone: s.orphans ? "warn" : undefined, sub: "No links in" },
          { label: "4+ clicks deep", value: fmt(s.deep), tone: s.deep ? "warn" : undefined, sub: s.avgDepth == null ? undefined : `${s.avgDepth} clicks on average` },
          { label: "Bad links", value: fmt(s.badLinks), tone: s.badLinks ? "neg" : undefined, sub: `On ${fmt(s.pagesWithBadLinks)} pages` },
        ]}
      />
      <div className="grid gap-6 md:grid-cols-2">
        <Card title="Fix first">
          <ul className="flex flex-col divide-y divide-rule-faint px-5 py-2">
            {[
              { v: "bad_links" as PageView, n: s.pagesWithBadLinks, text: "pages link to redirects or broken pages" },
              { v: "orphans" as PageView, n: s.orphans, text: "pages have no links in from the rest of the site" },
              { v: "unreachable" as PageView, n: s.unreachable, text: "pages can't be reached from the home page" },
              { v: "deep" as PageView, n: s.deep, text: "pages sit 4 or more clicks from the home page" },
              { v: "broken" as PageView, n: s.broken + s.noAnswer, text: "pages are broken or didn't answer" },
            ]
              .filter((x) => x.n > 0)
              .map((x) => (
                <li key={x.v} className="flex items-center justify-between gap-3 py-2.5">
                  <span>
                    <span className="aw-num font-semibold">{fmt(x.n)}</span> {x.text}
                  </span>
                  <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm shrink-0" onClick={() => onView(x.v)}>
                    See pages
                  </button>
                </li>
              ))}
            {[s.pagesWithBadLinks, s.orphans, s.unreachable, s.deep, s.broken + s.noAnswer].every((n) => !n) ? <li className="py-2.5 text-muted">Nothing to fix in the links. Every page answers and is close to home.</li> : null}
          </ul>
        </Card>
        <Card title="This crawl">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 p-5 text-[14px]">
            <dt className="text-muted">Finished</dt>
            <dd>{ago(audit.finished_at)}{took(audit) ? `, took ${took(audit)}` : ""}</dd>
            <dt className="text-muted">Started from</dt>
            <dd className="break-all">{audit.root}</dd>
            <dt className="text-muted">Pages read</dt>
            <dd>
              {fmt(audit.pages_done)} of {fmt(audit.pages_found)} found
              {audit.over_limit ? <span className="text-muted">. {fmt(audit.over_limit)} more were past the page limit.</span> : null}
            </dd>
            <dt className="text-muted">Started by</dt>
            <dd>{audit.trigger === "weekly" ? "The scheduled crawl" : "Crawl now"}</dd>
            <dt className="text-muted">Next crawl</dt>
            <dd>{weekly && audit.finished_at ? `About ${new Date(Date.parse(audit.finished_at) + everyDays * 864e5).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "Off. Turn it on in Crawl settings."}</dd>
          </dl>
        </Card>
      </div>
      {compare ? (
        <Card title="Since the last crawl">
          <div className="grid gap-6 p-5 md:grid-cols-2">
            <ChangeList title={`${fmt(compare.added)} pages added`} urls={compare.addedSample} more={compare.added - compare.addedSample.length} />
            <ChangeList title={`${fmt(compare.gone)} pages gone`} urls={compare.goneSample} more={compare.gone - compare.goneSample.length} />
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function ChangeList({ title, urls, more }: { title: string; urls: string[]; more: number }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="aw-h4">{title}</span>
      {urls.length ? (
        <ul className="flex flex-col gap-1 text-[13px]">
          {urls.slice(0, 8).map((u) => (
            <li key={u} className="truncate" title={u}>
              {pathOf(u)}
            </li>
          ))}
          {more + Math.max(0, urls.length - 8) > 0 ? <li className="text-muted">and {fmt(more + Math.max(0, urls.length - 8))} more</li> : null}
        </ul>
      ) : (
        <span className="text-[13px] text-muted">None</span>
      )}
    </div>
  );
}

function LinksTab({ audit, onView }: { audit: AuditRow; onView: (v: PageView) => void }) {
  const s = audit.stats!;
  const rows: { v: PageView; n: number; text: string; why: string }[] = [
    { v: "orphans", n: s.orphans, text: "Orphans", why: "In your sitemap or cited by AI, but no page links to them. Search engines find them late, if at all." },
    { v: "unreachable", n: s.unreachable, text: "Not reachable from home", why: "No path of links leads to them from the home page." },
    { v: "deep", n: s.deep, text: "4 or more clicks deep", why: "Pages far from home get crawled less and pass on less value." },
    { v: "one_link", n: s.oneLinkIn, text: "One link in", why: "A single link is easy to lose in a redesign." },
    { v: "bad_links", n: s.pagesWithBadLinks, text: "Link to redirects or broken pages", why: `${fmt(s.badLinks)} links send readers and crawlers through a redirect or to a dead end.` },
  ];
  return (
    <div className="flex flex-col gap-6">
      <StatStrip
        stats={[
          { label: "Internal links", value: fmt(s.internalLinks), sub: "Once per page and target" },
          { label: "Pages that answer", value: fmt(s.ok) },
          { label: "Average depth", value: s.avgDepth == null ? "–" : `${s.avgDepth} clicks` },
          { label: "Orphans", value: fmt(s.orphans), tone: s.orphans ? "warn" : undefined },
        ]}
      />
      <Card title="Problems">
        <ul className="flex flex-col divide-y divide-rule-faint px-5 py-2">
          {rows.map((r) => (
            <li key={r.v} className="flex items-start justify-between gap-4 py-3">
              <span className="flex flex-col gap-0.5">
                <span>
                  <span className={`aw-num font-semibold ${r.n ? "" : "text-muted"}`}>{fmt(r.n)}</span> {r.text}
                </span>
                <span className="text-[13px] text-muted">{r.why}</span>
              </span>
              <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm shrink-0" onClick={() => onView(r.v)} disabled={!r.n}>
                See pages
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

const SORTABLE: { id: string; label: string; num: boolean }[] = [
  { id: "url", label: "Page", num: false },
  { id: "status", label: "Status", num: true },
  { id: "depth", label: "Depth", num: true },
  { id: "links_in", label: "Links in", num: true },
  { id: "links_out", label: "Links out", num: true },
  { id: "link_score", label: "Link score", num: true },
  { id: "bad_links_out", label: "Bad links", num: true },
  { id: "value", label: "Value", num: true },
];

function PagesTab({ auth, audit, view, onView }: { auth: RunAuth; audit: AuditRow; view: PageView; onView: (v: PageView) => void }) {
  const [rows, setRows] = useState<PageRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [sort, setSort] = useState<{ id: string; desc: boolean }>({ id: "value", desc: true });
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    const n = ++seq.current;
    post<{ pages: PageRow[]; total: number }>(auth, "/api/audit", { action: "pages", auditId: audit.id, view, sort: sort.id, desc: sort.desc, offset, q: search })
      .then((r) => {
        if (n !== seq.current) return; // a newer request is on its way
        setRows(r.pages);
        setTotal(r.total);
        setError("");
      })
      .catch((e) => n === seq.current && setError(e instanceof Error ? e.message : String(e)));
  }, [auth, audit.id, view, sort, offset, search]);

  const setSortBy = (id: string) => {
    setOffset(0);
    setSort((s) => (s.id === id ? { id, desc: !s.desc } : { id, desc: id !== "url" }));
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <select className="aw-input w-auto!" aria-label="Pages to show" value={view} onChange={(e) => {
          setOffset(0);
          onView(e.target.value as PageView);
        }}>
          {(Object.keys(VIEW_LABELS) as PageView[]).map((v) => (
            <option key={v} value={v}>
              {VIEW_LABELS[v]}
            </option>
          ))}
        </select>
        <input className="aw-input max-w-80" placeholder="Search address or title" value={q} onChange={(e) => {
          setOffset(0);
          setQ(e.target.value);
        }} />
        <span className="text-[13px] text-muted">{fmt(total)} pages</span>
      </div>
      {error ? <p className="aw-error">{error}</p> : null}
      {!rows ? (
        <Thinking text="Loading pages..." />
      ) : !rows.length ? (
        <p className="text-muted">No pages here.</p>
      ) : (
        <>
        {/* Phones get a list: the app stacks tables on small screens and the numbers would lose their column names. */}
        <ul className="aw-table-wrap flex flex-col divide-y divide-rule-faint min-[721px]:hidden">
          {rows.map((r) => (
            <li key={r.url_hash}>
              <button type="button" className="flex w-full flex-col gap-0.5 px-4 py-3 text-left" onClick={() => setOpen(r.url_hash)}>
                <span className="truncate font-medium">{pathOf(r.url)}</span>
                {r.title ? <span className="truncate text-[12px] text-muted">{r.title}</span> : null}
                <span className="text-[12px] text-muted">
                  <span className={statusTone(r.status)}>{statusText(r.status, r.error)}</span> · {r.depth == null ? "no path from home" : `${r.depth} ${r.depth === 1 ? "click" : "clicks"} deep`} · {fmt(r.links_in)} links in
                  {r.bad_links_out ? <span className="text-neg"> · {fmt(r.bad_links_out)} bad links</span> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="aw-table-wrap max-[720px]:hidden">
          <table className="aw-table">
            <thead>
              <tr>
                {SORTABLE.map((c) => (
                  <th key={c.id} className={c.num ? "text-right" : ""} aria-sort={sort.id === c.id ? (sort.desc ? "descending" : "ascending") : "none"}>
                    <button type="button" className="font-inherit" onClick={() => setSortBy(c.id)}>
                      {c.label}
                      {sort.id === c.id ? (sort.desc ? " ↓" : " ↑") : ""}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.url_hash} className="cursor-pointer" onClick={() => setOpen(r.url_hash)}>
                  <td className="max-w-[420px]">
                    <span className="block truncate font-medium" title={r.url}>
                      {pathOf(r.url)}
                    </span>
                    {r.title ? <span className="block truncate text-[12px] text-muted">{r.title}</span> : null}
                    <span className="flex flex-wrap gap-1">
                      {r.orphan ? <span className="aw-chip">Orphan</span> : null}
                      {r.status >= 200 && r.status < 300 && !r.indexable ? <span className="aw-chip">Not indexable</span> : null}
                      {r.ai_citations ? <span className="aw-chip aw-chip--brand">Cited by AI {r.ai_citations}</span> : null}
                    </span>
                  </td>
                  <td className={`text-right aw-num ${statusTone(r.status)}`}>{statusText(r.status, r.error)}</td>
                  <td className="text-right aw-num">{r.depth ?? "–"}</td>
                  <td className="text-right aw-num">{fmt(r.links_in)}</td>
                  <td className="text-right aw-num">{fmt(r.links_out)}</td>
                  <td className="text-right aw-num">{r.link_score.toFixed(1)}</td>
                  <td className={`text-right aw-num ${r.bad_links_out ? "text-neg" : ""}`}>{fmt(r.bad_links_out)}</td>
                  <td className="text-right">
                    <span className="inline-block h-1.5 w-14 bg-rule-faint align-middle" title={`${Math.round(r.value * 100)} of 100`}>
                      <span className="block h-full bg-brand" style={{ width: `${Math.round(r.value * 100)}%` }} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
      {total > 100 ? (
        <div className="flex items-center justify-end gap-2 text-[13px]">
          <span className="text-muted">
            {fmt(offset + 1)} to {fmt(Math.min(total, offset + 100))} of {fmt(total)}
          </span>
          <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 100))}>
            Back
          </button>
          <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" disabled={offset + 100 >= total} onClick={() => setOffset(offset + 100)}>
            Next
          </button>
        </div>
      ) : null}
      {open ? <PagePanel auth={auth} auditId={audit.id} hash={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

function PagePanel({ auth, auditId, hash, onClose }: { auth: RunAuth; auditId: string; hash: string; onClose: () => void }) {
  const [detail, setDetail] = useState<PageDetail | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"overview" | "in" | "out" | "search">("overview");
  useEffect(() => {
    let live = true;
    post<PageDetail>(auth, "/api/audit", { action: "page", auditId, hash })
      .then((d) => live && setDetail(d))
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [auth, auditId, hash]);
  const p = detail?.page;
  return (
    <SidePanel title={p ? pathOf(p.url) : "Page"} kicker="Page" onClose={onClose}>
      {error ? <p className="aw-error">{error}</p> : !detail || !p ? (
        <Thinking text="Loading the page..." />
      ) : (
        <div className="flex flex-col gap-5">
          <a href={p.url} target="_blank" rel="noreferrer" className="aw-small break-all underline">
            {p.url}
          </a>
          <Seg
            label="Page"
            value={tab}
            onChange={setTab}
            options={[
              { id: "overview", label: "Overview" },
              { id: "in", label: `Links in (${fmt(detail.linksIn.length)})` },
              { id: "out", label: `Links out (${fmt(detail.linksOut.length)})` },
              { id: "search", label: "Search" },
            ]}
          />
          {tab === "overview" ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[14px]">
              <dt className="text-muted">Status</dt>
              <dd className={statusTone(p.status)}>{statusText(p.status, p.error)}</dd>
              {p.redirect_chain?.length ? (
                <>
                  <dt className="text-muted">Redirects</dt>
                  <dd className="flex flex-col gap-0.5 break-all text-[13px]">
                    {p.redirect_chain.map((h, i) => (
                      <span key={i}>
                        {h.status} {h.url}
                      </span>
                    ))}
                  </dd>
                </>
              ) : null}
              <dt className="text-muted">Title</dt>
              <dd>{p.title || "–"}</dd>
              <dt className="text-muted">H1</dt>
              <dd>{p.h1?.join(" · ") || "–"}</dd>
              <dt className="text-muted">Indexable</dt>
              <dd>{p.indexable ? "Yes" : p.status >= 200 && p.status < 300 ? `No${p.meta_robots ? ` (robots: ${p.meta_robots})` : p.canonical ? ` (canonical: ${pathOf(p.canonical)})` : ""}` : "No"}</dd>
              <dt className="text-muted">Clicks from home</dt>
              <dd>{p.depth ?? "No path from home"}</dd>
              <dt className="text-muted">Links in</dt>
              <dd>
                {fmt(p.links_in)} pages, {fmt(p.body_links_in)} from the main text
              </dd>
              <dt className="text-muted">Link score</dt>
              <dd>{p.link_score.toFixed(1)} of 10</dd>
              <dt className="text-muted">Words</dt>
              <dd>{fmt(p.words)}</dd>
              <dt className="text-muted">In the sitemap</dt>
              <dd>{p.in_sitemap ? `Yes${p.sitemap_lastmod ? `, last changed ${p.sitemap_lastmod.slice(0, 10)}` : ""}` : "No"}</dd>
              <dt className="text-muted">Cited by AI</dt>
              <dd>{p.ai_citations ? `${fmt(p.ai_citations)} answers in the last 30 days` : "Not in the last 30 days"}</dd>
              {p.published_at ? (
                <>
                  <dt className="text-muted">Published</dt>
                  <dd>{p.published_at.slice(0, 10)}{p.modified_at ? `, updated ${p.modified_at.slice(0, 10)}` : ""}</dd>
                </>
              ) : null}
            </dl>
          ) : tab === "in" ? (
            <LinkList links={detail.linksIn.map((l) => ({ ...l, status: l.status as number | null }))} empty="No crawled page links here." />
          ) : tab === "out" ? (
            <LinkList links={detail.linksOut} empty="This page links to no other page on the site." />
          ) : (
            <p className="text-muted">Clicks, impressions and position for this page show here once Search Console is connected.</p>
          )}
        </div>
      )}
    </SidePanel>
  );
}

function LinkList({ links, empty }: { links: { url: string; title: string | null; status: number | null; anchor: string; rel: string; place: string }[]; empty: string }) {
  if (!links.length) return <p className="text-muted">{empty}</p>;
  return (
    <ul className="flex flex-col divide-y divide-rule-faint">
      {links.map((l, i) => (
        <li key={`${l.url}-${i}`} className="flex flex-col gap-0.5 py-2">
          <span className="flex items-baseline justify-between gap-3">
            <span className="truncate font-medium" title={l.url}>
              {pathOf(l.url)}
            </span>
            {l.status != null && (l.status < 200 || l.status >= 300) ? <span className={`aw-num text-[12px] ${statusTone(l.status)}`}>{statusText(l.status)}</span> : null}
          </span>
          <span className="text-[12px] text-muted">
            {l.anchor ? `"${l.anchor}"` : "No anchor text"} · {l.place === "body" ? "in the text" : l.place === "nav" ? "in the menu" : "in the footer"}
            {l.rel.includes("nofollow") ? " · nofollow" : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

function SettingsDialog({ auth, brandId, domain, settings, weekly, limits, onClose, onSaved }: { auth: RunAuth; brandId: string; domain: string; settings: CrawlSettings; weekly: boolean; limits: Overview["limits"]; onClose: () => void; onSaved: () => void }) {
  const [start, setStart] = useState(settings.start);
  const [include, setInclude] = useState(settings.include.join("\n"));
  const [exclude, setExclude] = useState(settings.exclude.join("\n"));
  const [speed, setSpeed] = useState(settings.speed);
  const [limit, setLimit] = useState(String(settings.limit));
  const [subdomains, setSubdomains] = useState(settings.subdomains);
  const [scheduled, setScheduled] = useState(weekly);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function saveIt() {
    setBusy(true);
    try {
      await post(auth, "/api/audit", { action: "settings", brandId, weekly: scheduled, settings: { start, include, exclude, speed, limit: Number(limit), subdomains } });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }
  const every = limits.everyDays === 1 ? "every day" : limits.everyDays === 7 ? "every week" : `every ${limits.everyDays} days`;
  return (
    <Modal title="Crawl settings" onClose={onClose}>
      <div className="mt-4 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="aw-field-label">Start address</span>
          <input className="aw-input" value={start} onChange={(e) => setStart(e.target.value)} placeholder={`https://${domain}/`} />
        </label>
        <label className="flex items-center gap-2 text-[14px]">
          <input type="checkbox" checked={subdomains} onChange={(e) => setSubdomains(e.target.checked)} />
          Crawl subdomains too, like blog.{domain}
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="aw-field-label">Only these paths</span>
            <textarea className="aw-input h-24! py-2!" value={include} onChange={(e) => setInclude(e.target.value)} placeholder={"Leave empty for the whole site\n/blog/*"} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="aw-field-label">Never these paths</span>
            <textarea className="aw-input h-24! py-2!" value={exclude} onChange={(e) => setExclude(e.target.value)} placeholder={"/tag/*\n/search"} />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="aw-field-label">Speed</span>
            <select className="aw-input" value={speed} onChange={(e) => setSpeed(e.target.value as CrawlSettings["speed"])}>
              {(Object.keys(SPEED_LABELS) as CrawlSettings["speed"][]).map((s) => (
                <option key={s} value={s}>
                  {SPEED_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="aw-field-label">Page limit</span>
            <input className="aw-input" type="number" min={10} max={limits.pages} value={limit} onChange={(e) => setLimit(e.target.value)} />
            <span className="text-[12px] text-muted">Up to {fmt(limits.pages)} on your plan</span>
          </label>
        </div>
        <label className="flex items-center gap-2 text-[14px]">
          <input type="checkbox" checked={scheduled} onChange={(e) => setScheduled(e.target.checked)} />
          Crawl again on its own, {every}
        </label>
        <p className="text-[12px] text-muted">We always follow your robots.txt. Our crawler is ArrowsterrBot.</p>
        {error ? <p className="aw-error">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" className="aw-btn aw-btn--secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="aw-btn aw-btn--primary" onClick={saveIt} disabled={busy}>
            {busy ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
