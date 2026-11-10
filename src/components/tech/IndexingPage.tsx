"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { RunAuth } from "@/lib/runner";
import { coverageGroups, otherCanonical } from "@/lib/tech/google";
import { byUrl } from "@/lib/tech/checks";
import { C, HBars, LineChart, short, Stack } from "../backlinks/charts";
import { downloadCsv } from "../research/shared";
import { Card, Seg, StatStrip, Thinking } from "../ui";
import { IndexingIntro } from "../ToolIntros";
import { useApi } from "../ZippiePage";

// Technical SEO, Indexing (docs/technical-seo-plan.md, phase 2): Google Search Console for the brand's property. Clicks
// by day, why pages aren't indexed (from URL Inspection), sitemaps, clicks by template, pages losing clicks, Google's
// canonical against yours, and every inspected page.

type Brand = { id: string; name: string; domain: string };
type Status = { googleReady: boolean; connected: boolean; email: string | null; site: string | null; syncedAt: string | null; syncError: string | null; backfilled: boolean; inspectedToday: number; inspectPerDay: number; canEdit: boolean };
type Insp = { url: string; inspected_at: string; indexed: boolean; verdict: string; coverage: string; robots: string; google_canonical: string | null; user_canonical: string | null; last_crawl: string | null; crawled_as: string | null; mobile: string | null; rich: { type: string; errors: number; warnings: number }[] };
type PageRow = { page: string; clicks: number; impressions: number; position: number; clicks_prev: number; impressions_prev: number };
type Sitemap = { path: string; last_downloaded: string | null; last_submitted: string | null; pending: boolean; is_index: boolean; errors: number; warnings: number; submitted: number; indexed: number };
type Data = { connected: boolean; site: string | null; daily?: { day: string; clicks: number; impressions: number; position: number }[]; pages?: PageRow[]; inspections?: Insp[]; sitemaps?: Sitemap[]; templates?: { map: Record<string, string>; names: Record<string, string> }; inspectBase?: string };

const num = (x: number) => Math.round(x).toLocaleString("en-US");
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "–");
const path = (u: string) => {
  try {
    const x = new URL(u);
    return x.pathname + x.search;
  } catch {
    return u;
  }
};
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function IndexingPage({ brand, auth, canEdit }: { brand: Brand; auth: RunAuth; canEdit: boolean }) {
  const api = useApi(auth);
  const call = useCallback(<T,>(action: string, extra: Record<string, unknown> = {}) => api<T>("/api/tech", { action, brandId: brand.id, ...extra }), [api, brand.id]);
  const [status, setStatus] = useState<Status | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [sites, setSites] = useState<{ siteUrl: string; permissionLevel?: string }[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [range, setRange] = useState<"90" | "365" | "486">("90");
  const [metric, setMetric] = useState<"clicks" | "impressions" | "position">("clicks");
  const [filter, setFilter] = useState<"all" | "indexed" | "not" | "canonical" | "rich">("all");
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(50);

  const load = useCallback(async () => {
    try {
      const s = await call<Status>("status");
      setStatus(s);
      if (s.connected && s.site) setData(await call<Data>("indexing"));
      else if (s.connected && s.canEdit) setSites((await call<{ sites: { siteUrl: string; permissionLevel?: string }[] }>("sites")).sites);
    } catch (e) {
      setError(msg(e));
    }
  }, [call]);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (p.get("gsc") === "error" || p.get("ga4") === "error") setError(p.get("reason") ?? "Could not connect Search Console.");
    load();
  }, [load]);

  async function connect() {
    setBusy("connect");
    try {
      const r = await api<{ url: string }>("/api/google/connect", { brandId: brand.id, kind: "gsc", back: "/indexing" });
      window.location.href = r.url;
    } catch (e) {
      setError(msg(e));
      setBusy("");
    }
  }
  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action);
    setError("");
    try {
      await call(action, extra);
      setData(null);
      setSites(null);
      await load();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy("");
    }
  }
  async function inspect(url: string) {
    setBusy(url);
    setError("");
    try {
      await call("inspect", { url });
      setData(await call<Data>("indexing"));
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy("");
    }
  }

  const insp = useMemo(() => data?.inspections ?? [], [data]);
  const clicksOf = useMemo(() => Object.fromEntries((data?.pages ?? []).map((p) => [p.page, p.clicks])), [data]);

  if (!status) return <div className="flex flex-col gap-6"><h1 className="aw-h2 mb-0!">Indexing</h1>{error ? <p className="aw-error">{error}</p> : <Thinking text="Loading" />}</div>;

  if (!status.connected)
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="aw-h2 mb-0!">Indexing</h1>
          {canEdit && status.googleReady ? (
            <button type="button" className="aw-btn aw-btn--primary" onClick={connect} disabled={busy === "connect"}>
              {busy === "connect" ? "Opening Google" : "Connect Search Console"}
            </button>
          ) : null}
        </div>
        {error ? <p className="aw-error">{error}</p> : null}
        {!status.googleReady ? <p className="aw-callout">Google sign-in is not set up on the server. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, and add the Search Console API to the Google Cloud project.</p> : null}
        <IndexingIntro />
      </div>
    );

  const head = (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="aw-h2 mb-0!">Indexing</h1>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted">
          <span className="aw-status aw-status--ranked">Search Console connected</span>
          {status.site ? <span className="font-medium text-ink">{status.site}</span> : null}
          {status.email ? <span>{status.email}</span> : null}
          {status.syncedAt ? <span>Synced {day(status.syncedAt)}</span> : <span>First sync running</span>}
          <span>
            {num(status.inspectedToday)} of {num(status.inspectPerDay)} inspections today
          </span>
        </span>
      </div>
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => act("sync")} disabled={Boolean(busy)}>
            {busy === "sync" ? "Starting" : "Sync now"}
          </button>
          {status.site ? (
            <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={async () => setSites((await call<{ sites: { siteUrl: string }[] }>("sites")).sites)}>
              Change property
            </button>
          ) : null}
          <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => act("disconnect")} disabled={Boolean(busy)}>
            Disconnect
          </button>
        </div>
      ) : null}
    </div>
  );

  if (!status.site || sites)
    return (
      <div className="flex flex-col gap-6">
        {head}
        {error ? <p className="aw-error">{error}</p> : null}
        <Card title="Pick the Search Console property for this brand">
          <div className="flex flex-col gap-2 px-5 pb-5">
            {sites === null ? (
              <Thinking text="Loading your properties" />
            ) : sites.length ? (
              sites.map((s) => (
                <button key={s.siteUrl} type="button" className="flex items-center justify-between gap-3 rounded-[10px] border border-[var(--aw-rule)] px-4 py-3 text-left hover:border-[var(--aw-line)]" onClick={() => act("pick", { site: s.siteUrl })} disabled={!canEdit || Boolean(busy)}>
                  <span className="font-medium text-ink wrap-anywhere">{s.siteUrl}</span>
                  <span className="text-[12px] text-muted">{s.siteUrl.startsWith("sc-domain:") ? "Domain property" : "URL prefix"}</span>
                </button>
              ))
            ) : (
              <p className="text-[13.5px] text-body">This Google account has no Search Console properties. Connect the account that owns {brand.domain} in Search Console.</p>
            )}
          </div>
        </Card>
      </div>
    );

  if (!data) return <div className="flex flex-col gap-6">{head}<Thinking text="Loading" /></div>;
  const daily = (data.daily ?? []).slice(-Number(range));
  const last28 = (data.daily ?? []).slice(-28);
  const prev28 = (data.daily ?? []).slice(-56, -28);
  const sum = (rows: { clicks: number }[]) => rows.reduce((a, r) => a + r.clicks, 0);
  const indexed = insp.filter((i) => i.indexed).length;
  const groups = coverageGroups(insp.map((i) => ({ verdict: i.verdict, coverage: i.coverage })));
  const notIndexedGroups = groups.filter((g) => !g.indexed);
  const submitted = (data.sitemaps ?? []).filter((s) => !s.is_index).reduce((a, s) => a + s.submitted, 0) || (data.sitemaps ?? []).reduce((a, s) => a + s.submitted, 0);
  const crawls = insp.map((i) => i.last_crawl).filter((x): x is string => Boolean(x)).sort();
  const median = crawls.length ? crawls[Math.floor(crawls.length / 2)] : null;
  const canon = insp.filter((i) => otherCanonical({ url: i.url, googleCanonical: i.google_canonical, userCanonical: i.user_canonical }));
  const tplClicks = new Map<string, number>();
  for (const p of data.pages ?? []) {
    const t = byUrl(data.templates?.map ?? {}, p.page);
    const name = t ? (data.templates?.names[t] ?? t) : "Not crawled";
    tplClicks.set(name, (tplClicks.get(name) ?? 0) + p.clicks);
  }
  const losing = [...(data.pages ?? [])].filter((p) => p.clicks_prev > 0 && p.clicks < p.clicks_prev).sort((a, b) => a.clicks - a.clicks_prev - (b.clicks - b.clicks_prev)).slice(0, 8);
  const pagesWithClicks = (data.pages ?? []).filter((p) => p.clicks > 0).length;
  const rows = insp.filter((i) => {
    if (filter === "indexed" && !i.indexed) return false;
    if (filter === "not" && i.indexed) return false;
    if (filter === "canonical" && !otherCanonical({ url: i.url, googleCanonical: i.google_canonical, userCanonical: i.user_canonical })) return false;
    if (filter === "rich" && !i.rich.some((r) => r.errors > 0)) return false;
    return !q || i.url.toLowerCase().includes(q.toLowerCase());
  });
  const metricLabel = { clicks: "Clicks", impressions: "Impressions", position: "Average position" }[metric];

  return (
    <div className="flex flex-col gap-4">
      {head}
      {error ? <p className="aw-error">{error}</p> : null}
      {status.syncError ? <p className="aw-callout">The last sync failed: {status.syncError}</p> : null}
      <StatStrip
        spark={last28.length > 1 ? last28.map((d) => d.clicks) : undefined}
        stats={[
          { label: "Clicks, 28 days", value: num(sum(last28)), sub: prev28.length ? `${sum(last28) >= sum(prev28) ? "+" : ""}${num(sum(last28) - sum(prev28))} against the 28 before` : undefined },
          { label: "Indexed", value: insp.length ? num(indexed) : "–", sub: insp.length ? `of ${num(insp.length)} inspected` : "Inspections start with the first sync" },
          { label: "Not indexed", value: num(insp.length - indexed), tone: insp.length - indexed ? "neg" : undefined },
          { label: "Submitted in sitemaps", value: num(submitted) },
          { label: "Pages with clicks", value: num(pagesWithClicks), sub: "last 28 days" },
          { label: "Last Google crawl", value: median === null ? "–" : day(median), sub: "median of inspected pages" },
        ]}
      />

      {daily.length > 1 ? (
        <Card
          title={metric === "position" ? "Average position" : `${metricLabel} by day`}
          action={
            <span className="flex flex-wrap items-center gap-2">
              <Seg label="Metric" value={metric} onChange={setMetric} options={[{ id: "clicks", label: "Clicks" }, { id: "impressions", label: "Impressions" }, { id: "position", label: "Position" }]} />
              <Seg label="Range" value={range} onChange={setRange} options={[{ id: "90", label: "3 months" }, { id: "365", label: "12 months" }, { id: "486", label: "16 months" }]} />
            </span>
          }
        >
          <div className="px-5 pb-5">
            <LineChart
              series={[{ name: metricLabel, color: C.signal, values: daily.map((d) => d[metric]), width: 2 }]}
              labels={daily.map((d) => new Date(d.day).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }))}
              area={metric !== "position"}
              width={1100}
              height={260}
              every={Math.ceil(daily.length / 8)}
              fmt={metric === "position" ? (v) => v.toFixed(1) : short}
              label={`${metricLabel} by day`}
            />
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card title="Why pages aren't indexed">
          <div className="flex flex-col gap-4 px-5 pb-5">
            {insp.length ? (
              <>
                <Stack parts={groups.map((g, i) => ({ label: g.label, value: g.count, color: g.indexed ? C.pos : [C.warn, C.orange, C.neg, C.sky, C.violet, C.grey][i % 6] }))} />
                {notIndexedGroups.length ? <HBars rows={notIndexedGroups.slice(0, 8).map((g) => ({ key: g.label, label: g.label, value: g.count, color: C.warn }))} /> : <p className="text-[13.5px] text-body">Every inspected page is indexed.</p>}
                <span className="text-[12px] text-muted">From URL Inspection of {num(insp.length)} pages. Pages with clicks are inspected first.</span>
              </>
            ) : (
              <p className="text-[13.5px] text-body">The first inspections run with today&apos;s sync.</p>
            )}
          </div>
        </Card>
        <Card title="Sitemaps">
          {(data.sitemaps ?? []).length ? (
            <div className="overflow-x-auto">
              <table className="aw-table">
                <thead>
                  <tr>
                    <th>Sitemap</th>
                    <th className="text-right">Submitted</th>
                    <th className="text-right">Errors</th>
                    <th>Google read it</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.sitemaps ?? []).map((s) => (
                    <tr key={s.path}>
                      <td className="wrap-anywhere">{path(s.path)}</td>
                      <td className="aw-num text-right">{num(s.submitted)}</td>
                      <td className="text-right">{s.errors ? <span className="aw-status aw-status--missed">{s.errors}</span> : s.warnings ? <span className="aw-status aw-status--warn">{s.warnings} warnings</span> : <span className="text-muted">–</span>}</td>
                      <td>{s.pending ? "Pending" : day(s.last_downloaded)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-5 pb-5 text-[13.5px] text-body">No sitemaps submitted in Search Console.</p>
          )}
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Clicks by template" action={<span className="text-[12px] text-muted">Last 28 days</span>}>
          <div className="px-5 pb-5">{tplClicks.size ? <HBars rows={[...tplClicks.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, v]) => ({ key: name, label: name, value: v }))} /> : <p className="text-[13.5px] text-body">No clicks yet.</p>}</div>
        </Card>
        <Card title="Pages losing clicks" action={<span className="text-[12px] text-muted">28 days against the 28 before</span>}>
          <ul className="flex flex-col px-5 pb-4">
            {losing.length ? (
              losing.map((p) => {
                const i = insp.find((x) => x.url === p.page);
                return (
                  <li key={p.page} className="flex flex-wrap items-center gap-3 border-t border-[var(--aw-rule)] py-2.5 first:border-t-0">
                    <span className="min-w-0 flex-1">
                      <a href={p.page} target="_blank" rel="noreferrer" className="block text-[13px] font-medium text-ink wrap-anywhere hover:underline">
                        {path(p.page)}
                      </a>
                      <span className="block text-[12px] text-muted">{i ? (i.indexed ? "Indexed" : i.coverage) : "Not inspected yet"}</span>
                    </span>
                    <span className="aw-num text-[13px] font-semibold text-neg">{num(p.clicks - p.clicks_prev)}</span>
                  </li>
                );
              })
            ) : (
              <li className="py-2 text-[13.5px] text-body">No page lost clicks.</li>
            )}
          </ul>
        </Card>
      </div>

      {canon.length ? (
        <Card title="Google chose a different canonical">
          <div className="overflow-x-auto">
            <table className="aw-table">
              <thead>
                <tr>
                  <th>Page</th>
                  <th>Your canonical</th>
                  <th>Google&apos;s canonical</th>
                </tr>
              </thead>
              <tbody>
                {canon.slice(0, 50).map((i) => (
                  <tr key={i.url}>
                    <td className="wrap-anywhere">{path(i.url)}</td>
                    <td className="wrap-anywhere text-muted">{i.user_canonical ? path(i.user_canonical) : "None"}</td>
                    <td className="font-medium wrap-anywhere text-ink">{i.google_canonical ? path(i.google_canonical) : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <Card
        title={`${num(rows.length)} inspected ${rows.length === 1 ? "page" : "pages"}`}
        action={
          <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" disabled={!rows.length} onClick={() => downloadCsv("indexing.csv", ["url", "indexed", "google status", "last google crawl", "google canonical", "your canonical", "mobile", "rich results", "clicks 28 days", "inspected"], rows.map((i) => [i.url, i.indexed ? "yes" : "no", i.coverage, i.last_crawl ?? "", i.google_canonical ?? "", i.user_canonical ?? "", i.mobile ?? "", i.rich.map((r) => `${r.type}${r.errors ? ` (${r.errors} errors)` : ""}`).join("; "), byUrl(clicksOf, i.url) ?? 0, i.inspected_at]))}>
            Export CSV
          </button>
        }
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--aw-rule)] px-5 pb-3">
          <Seg label="Show" value={filter} onChange={(v) => { setFilter(v); setShown(50); }} options={[{ id: "all", label: "All" }, { id: "indexed", label: "Indexed" }, { id: "not", label: "Not indexed" }, { id: "canonical", label: "Other canonical" }, { id: "rich", label: "Rich result errors" }]} />
          <input className="aw-input py-1.5! text-[13px]!" value={q} onChange={(e) => setQ(e.target.value)} placeholder="URL contains" aria-label="URL contains" />
        </div>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="aw-table">
              <thead>
                <tr>
                  <th>Page</th>
                  <th>Google status</th>
                  <th>Last Google crawl</th>
                  <th>Rich results</th>
                  <th className="text-right">Clicks</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, shown).map((i) => (
                  <tr key={i.url}>
                    <td className="max-w-96 min-w-56 wrap-anywhere">
                      <a href={i.url} target="_blank" rel="noreferrer" className="font-medium text-ink hover:underline">
                        {path(i.url)}
                      </a>
                      <span className="block text-[11.5px] text-muted">Inspected {day(i.inspected_at)}</span>
                    </td>
                    <td>
                      <span className={`aw-status ${i.indexed ? "aw-status--ranked" : /not indexed|noindex|404|error|blocked/i.test(i.coverage) ? "aw-status--missed" : "aw-status--warn"}`}>{i.indexed ? "Indexed" : i.coverage}</span>
                    </td>
                    <td className="whitespace-nowrap">{day(i.last_crawl)}</td>
                    <td className="text-[12.5px]">{i.rich.length ? i.rich.map((r) => <span key={r.type} className={`mr-1 aw-status ${r.errors ? "aw-status--missed" : "aw-status--ranked"}`}>{r.type}{r.errors ? `: ${r.errors}` : ""}</span>) : <span className="text-muted">–</span>}</td>
                    <td className="aw-num text-right">{num(byUrl(clicksOf, i.url) ?? 0)}</td>
                    <td className="text-right whitespace-nowrap">
                      {canEdit ? (
                        <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm mr-2" onClick={() => inspect(i.url)} disabled={busy === i.url}>
                          {busy === i.url ? "Inspecting" : "Inspect again"}
                        </button>
                      ) : null}
                      {!i.indexed && data.inspectBase ? (
                        <a href={`${data.inspectBase}${encodeURIComponent(i.url)}`} target="_blank" rel="noreferrer" className="aw-btn aw-btn--secondary aw-btn--sm">
                          Request indexing
                        </a>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 py-5 text-[13px] text-muted">No pages match.</p>
        )}
        {rows.length > shown ? (
          <div className="px-5 py-4">
            <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => setShown(shown + 50)}>
              Next 50
            </button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
