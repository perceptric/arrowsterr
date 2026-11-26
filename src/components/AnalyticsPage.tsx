"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { addCalendarItems, siteForBrand, type Site } from "@/lib/db";
import type { Keyword } from "@/lib/research";
import { stageFromIntent } from "@/lib/research";
import type { RunAuth } from "@/lib/runner";
import { CHANCE_LABEL, CITED_LABEL, expectedCtr, OPP_LABEL, type Chance, type CitedBucket, type CitedPage, type Opportunity, type OppKind } from "@/lib/seoAnalytics";
import type { ArticleResult, Overview } from "@/lib/seoAnalyticsServer";
import { RESULT_COLS, ResultDelta, resultSpan } from "./analytics/ArticleResults";
import { ENGINE_LOGOS } from "./Engines";
import type { View } from "@/lib/view";
import { BrandLogo } from "./BrandLogo";
import { propertyName } from "./traffic/searchShared";
import { PropertyPicker } from "./analytics/PropertyPicker";
import { AI_LOGO, ga4Properties, TrafficPage } from "./TrafficPage";
import { TrendChart } from "./TrendChart";
import { Delta, Seg, SidePanel, StatStrip, Thinking, YOU_COLOR } from "./ui";
import { post } from "./research/shared";
import { useZippieMaybe } from "./zippie/ZippieContext";

// Visibility › Analytics: Search Console and Google Analytics 4 in one place, from the daily sync
// (seoAnalyticsServer.ts). One Google sign-in, then pick the site and the GA4 property. Opportunities turn into
// title fixes (Zippie's meta play), refreshes and Calendar items; any query opens Keyword Research in a side panel.

type Status = {
  ready: boolean;
  connected: boolean;
  email: string | null;
  gsc: boolean;
  gscProperty: string | null;
  ga4Property: string | null;
  ga4Name: string | null;
  state: { gsc_to: string | null; synced_at: string | null; syncing: boolean; backfilled: boolean; error: string | null } | null;
};
type Call = (path: string, body: Record<string, unknown>) => Promise<Record<string, unknown>>;
type Days = "7" | "28" | "90";

const GSC_LOGO = "/logos/search-console.png";
const GA4_LOGO = "/logos/google-analytics.svg";
const SESSIONS_COLOR = "#E8710A"; // GA4's own orange, next to Signal Blue clicks
const n = (v: number) => Math.round(v).toLocaleString("en-US");
const compact = (v: number) => (v >= 10_000 ? new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v) : n(v));
const pctText = (r: number) => `${(r * 100).toFixed(r < 0.1 ? 1 : 0)}%`;
/** Change against the period before, as a percent. */
const Change = ({ pair }: { pair: [number, number] }) => (pair[1] ? <Delta now={((pair[0] - pair[1]) / pair[1]) * 100} before={0} unit="%" digits={0} /> : null);
const CHANCE_CLASS: Record<Chance, string> = { low_ctr: "aw-status--missed", page2: "aw-status--warn", winning: "aw-status--ranked" };
const OPP_CLASS: Record<OppKind, string> = { low_ctr: "aw-status--missed", page2: "aw-status--warn", losing: "aw-status--missed", new_topic: "aw-status--pending", cannibal: "aw-status--warn", links: "aw-status--pending" };
const CITED_CLASS: Record<CitedBucket, string> = { cited_visits: "aw-status--ranked", cited_few: "aw-status--warn", visits_uncited: "aw-status--pending" };

export function AnalyticsPage({ view, auth, sb, canEdit }: { view: View; auth: RunAuth; sb: SupabaseClient; canEdit: boolean }) {
  const { brand } = view;
  const [tab, setTab] = useState<"overview" | "site">("overview");
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [setup, setSetup] = useState(false);
  // Back from Google's sign-in: say how it went, then tidy the address.
  const [back] = useState(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search)));
  useEffect(() => {
    if (!back?.get("ga4")) return;
    const q = new URLSearchParams(window.location.search);
    q.delete("ga4");
    q.delete("reason");
    window.history.replaceState(null, "", window.location.pathname + (q.size ? `?${q}` : ""));
  }, [back]);

  const call: Call = useCallback(
    async (path, body) => {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await auth.token()}` },
        body: JSON.stringify({ ...body, workspaceId: auth.workspaceId, brandId: brand.id }),
      });
      const data = await res.json().catch(() => ({ error: `The server returned ${res.status}.` }));
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
      return data;
    },
    [auth, brand.id],
  );
  const load = useCallback(() => call("/api/seo-analytics", { action: "status" }).then((s) => setStatus(s as unknown as Status)).catch((e) => setError(e instanceof Error ? e.message : String(e))), [call]);
  useEffect(() => {
    load();
  }, [load]);

  const picked = Boolean(status?.connected && (status.gscProperty || status.ga4Property));
  const tabs = (
    <Seg
      label="Analytics view"
      value={tab}
      onChange={setTab}
      options={[
        { id: "overview", label: "Search & conversions" },
        { id: "site", label: "Site traffic" },
      ]}
    />
  );

  if (tab === "site")
    return (
      <div className="flex flex-col gap-5">
        <div>{tabs}</div>
        <TrafficPage view={view} auth={auth} canEdit={canEdit} />
      </div>
    );
  if (!status) return error ? <p className="aw-error">{error}</p> : <Thinking text="Checking your Google connection..." />;

  return (
    <div className="flex flex-col gap-5">
      <div>{tabs}</div>
      {back?.get("ga4") === "error" ? <p className="aw-error">{back.get("reason") ?? "Could not connect Google."}</p> : null}
      {!picked || setup ? <Setup status={status} canEdit={canEdit} call={call} domain={brand.domain} onDone={() => load().then(() => setSetup(false))} onClose={picked ? () => setSetup(false) : undefined} /> : <Dashboard status={status} call={call} sb={sb} auth={auth} view={view} canEdit={canEdit} onSetup={() => setSetup(true)} onReload={load} />}
    </div>
  );
}

// ─────────────── Connect ───────────────

function Setup({ status, canEdit, call, domain, onDone, onClose }: { status: Status; canEdit: boolean; call: Call; domain: string; onDone: () => void; onClose?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const signedIn = status.connected && status.gsc;

  async function signIn() {
    setBusy(true);
    setError("");
    try {
      const d = await call("/api/google/connect", { back: "/analytics" });
      window.location.href = String(d.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const steps: { title: string; text: string; state: "done" | "now" | "next"; body?: React.ReactNode }[] = [
    {
      title: "Sign in with Google",
      text: signedIn ? `Signed in as ${status.email ?? "your Google account"}. Read-only: we never change your Google data.` : status.connected ? "Your Google sign-in only covers Analytics. Sign in again to add Search Console." : "One sign-in, read-only. We never change your Google data.",
      state: signedIn ? "done" : "now",
    },
    {
      title: "Pick your site",
      text: status.gscProperty ? `Search Console: ${propertyName(status.gscProperty)}` : `The Search Console property for ${domain}`,
      state: status.gscProperty ? "done" : signedIn ? "now" : "next",
      body:
        signedIn && canEdit ? (
          <PropertyPicker
            label="Search Console property"
            initial={status.gscProperty}
            action={status.gscProperty ? "Change site" : "Use this site"}
            empty="No verified Search Console properties on this Google account."
            load={async () => {
              const d = (await call("/api/seo-analytics", { action: "sites" })) as { sites: { url: string }[]; suggested: string | null };
              return [...d.sites].sort((a, b) => Number(b.url === d.suggested) - Number(a.url === d.suggested)).map((s) => ({ id: s.url, label: propertyName(s.url) }));
            }}
            choose={async (id) => {
              await call("/api/seo-analytics", { action: "site", property: id });
              onDone();
            }}
          />
        ) : null,
    },
    {
      title: "Pick your GA4 property",
      text: status.ga4Property ? `Google Analytics: ${status.ga4Name ?? status.ga4Property}` : "So clicks and sign-ups line up by page",
      state: status.ga4Property ? "done" : signedIn ? "now" : "next",
      body:
        status.connected && canEdit ? (
          <PropertyPicker
            label="GA4 property"
            initial={status.ga4Property}
            action={status.ga4Property ? "Change property" : "Use this property"}
            empty="No GA4 properties on this Google account."
            load={() => ga4Properties(call)}
            choose={async (id) => {
              await call("/api/ga4", { action: "select", property: id });
              onDone();
            }}
          />
        ) : null,
    },
  ];

  return (
    <div className="aw-an-connect">
      <div className="flex flex-col gap-5">
        <span className="aw-chip aw-chip--brand self-start">Analytics · New</span>
        <h1 className="aw-an-connect__title">
          Your Google data,
          <br />
          <span>working on your SEO</span>
        </h1>
        <p className="aw-lede">Connect Search Console and Google Analytics once. Arrowsterr reads both every day, finds the pages and keywords worth your time, and turns them into title fixes, refreshes and Calendar items.</p>
        {error ? <p className="aw-error">{error}</p> : null}
        <ol className="aw-an-steps">
          {steps.map((s, i) => (
            <li key={s.title} className={`aw-an-step is-${s.state}`}>
              <span className="aw-an-step__num" aria-hidden="true">
                {s.state === "done" ? <CheckMark /> : i + 1}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <div>
                  <span className="aw-an-step__title">{s.title}</span>
                  <span className="aw-an-step__text">{s.text}</span>
                </div>
                {s.state !== "next" && s.body && (s.state === "now" || onClose) ? s.body : null}
              </div>
            </li>
          ))}
        </ol>
        {!canEdit ? (
          <p className="aw-small">Ask an editor to connect Google.</p>
        ) : !status.ready ? (
          <p className="aw-small">Google sign-in isn&apos;t set up on this server yet.</p>
        ) : !signedIn ? (
          <button type="button" className="aw-btn aw-btn--primary aw-btn--lg aw-btn--block" onClick={signIn} disabled={busy}>
            <BrandLogo src="https://www.google.com/s2/favicons?domain=google.com&sz=64" name="Google" size={18} />
            {busy ? "Opening Google..." : status.connected ? "Sign in again to add Search Console" : "Continue with Google"}
          </button>
        ) : onClose ? (
          <button type="button" className="aw-btn aw-btn--secondary self-start" onClick={onClose}>
            Back to the dashboard
          </button>
        ) : null}
        <ul className="aw-an-trust">
          <li>Read-only</li>
          <li>16 months of Search Console history on day one</li>
          <li>Free: uses no tasks</li>
        </ul>
      </div>
      <Preview />
    </div>
  );
}

const CheckMark = () => (
  <svg className="aw-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="m5 12 5 5 9-10" />
  </svg>
);

/** What the dashboard looks like, with sample numbers, beside the sign-in. */
function Preview() {
  const opps: [OppKind, string, string][] = [
    ["page2", "review management software", "+640 clicks/mo"],
    ["low_ctr", "restaurant guest feedback", "+1,200 clicks/mo"],
    ["losing", "/blog/restaurant-survey-questions", "−38% in 28 days"],
  ];
  return (
    <div className="aw-an-preview" aria-label="Preview with sample data">
      <span className="aw-an-preview__note">Preview with sample data</span>
      <div className="flex items-center gap-2">
        <span className="aw-chip">
          <BrandLogo src={GSC_LOGO} name="Search Console" size={16} />
          Search Console
        </span>
        <span className="text-faint">+</span>
        <span className="aw-chip">
          <BrandLogo src={GA4_LOGO} name="Google Analytics" size={16} />
          Analytics
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[
          ["Clicks", "8,412", "+18%"],
          ["Sessions", "14,920", "+12%"],
          ["From AI", "607", "+41%"],
        ].map(([l, v, d]) => (
          <div key={l} className="aw-an-preview__kpi">
            <span>{l}</span>
            <b className="aw-num">{v}</b>
            <i>{d}</i>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {opps.map(([k, t, g]) => (
          <div key={t} className="aw-an-preview__opp">
            <span className={`aw-status ${OPP_CLASS[k]}`}>{OPP_LABEL[k]}</span>
            <span className="min-w-0 flex-1 truncate font-medium text-ink">{t}</span>
            <span className={`aw-num whitespace-nowrap font-medium ${k === "losing" ? "text-neg" : "text-pos"}`}>{g}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────── Dashboard ───────────────

type Panel = { query: string; page: string | null; position: number | null; impressions: number; clicks: number };

function Dashboard({ status, call, sb, auth, view, canEdit, onSetup, onReload }: { status: Status; call: Call; sb: SupabaseClient; auth: RunAuth; view: View; canEdit: boolean; onSetup: () => void; onReload: () => void }) {
  const { brand } = view;
  const zippie = useZippieMaybe();
  const [days, setDays] = useState<Days>("28");
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState<"all" | Chance>("all");
  const [panel, setPanel] = useState<Panel | null>(null);
  const [site, setSite] = useState<Site | null>(null);
  const waiting = !status.state?.synced_at || (Boolean(status.gscProperty) && !status.state?.gsc_to);

  const [results, setResults] = useState<ArticleResult[] | null>(null);
  const [cited, setCited] = useState<CitedPage[] | null>(null);
  // From a Sources row (?page=/blog/x): that page's Google and AI numbers first.
  const [focus, setFocus] = useState(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("page")));
  useEffect(() => {
    let live = true;
    call("/api/seo-analytics", { action: "overview", days: Number(days) })
      .then((d) => live && setData(d as unknown as Overview))
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    // Results and Cited by AI load beside the numbers; a failure there never hides the dashboard.
    call("/api/seo-analytics", { action: "results" })
      .then((d) => live && setResults((d.results as ArticleResult[]) ?? []))
      .catch(() => live && setResults([]));
    call("/api/seo-analytics", { action: "cited", days: Number(days) })
      .then((d) => live && setCited((d.pages as CitedPage[]) ?? []))
      .catch(() => live && setCited([]));
    return () => {
      live = false;
    };
  }, [call, days, status.state?.synced_at]);

  // The first sync runs in the background: check again every 15 seconds until it lands.
  useEffect(() => {
    if (!waiting && !status.state?.syncing) return;
    const t = setInterval(onReload, 15_000);
    return () => clearInterval(t);
  }, [waiting, status.state?.syncing, onReload]);

  const siteOf = useCallback(async () => site ?? (await siteForBrand(sb, brand, canEdit).then((s) => (setSite(s), s))), [site, sb, brand, canEdit]);
  const url = (page: string) => `https://${brand.domain.replace(/^https?:\/\//, "").replace(/\/$/, "")}${page}`;

  async function toCalendar(item: { keyword: string; page?: string | null; position?: number | null; notes?: string; volume?: number | null; kd?: number | null; intent?: string | null; cpc?: number | null }) {
    setError("");
    try {
      const s = await siteOf();
      if (!s) throw new Error("Set up the brand's website in Research first.");
      const refresh = Boolean(item.page);
      const added = await addCalendarItems(sb, auth.workspaceId, [
        {
          site_id: s.id,
          keyword: item.keyword,
          secondary: [],
          stage: stageFromIntent(item.intent ?? null),
          theme: null,
          volume: item.volume ?? null,
          difficulty: item.kd ?? null,
          intent: item.intent ?? null,
          cpc: item.cpc ?? null,
          source: "analytics",
          ...(refresh ? { action: "update" as const, current_url: url(item.page!), current_rank: item.position ? Math.round(item.position) : null } : {}),
          ...(item.notes ? { notes: item.notes } : {}),
        },
      ]);
      setNotice(added ? (refresh ? `Added a refresh of ${item.page} to the Calendar.` : `Added “${item.keyword}” to the Calendar.`) : `“${item.keyword}” is already in the Calendar.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function fixTitle(o: Opportunity) {
    const pos = Number(o.data.position ?? 0);
    const text = `Fix the SEO title and meta description of ${url(o.page ?? "/")}. It ranks ${pos ? `#${pos}` : "on page 1"} for “${o.query}” but only ${pctText(Number(o.data.ctr ?? 0))} of searchers click; results at that spot usually get ${pctText(Number(o.data.expected ?? expectedCtr(pos)))}. Use the meta play on that page so I can review the change before it goes live.`;
    if (zippie) zippie.send(text);
    else setNotice("Open Zippie and ask it to fix this page's title and meta description.");
  }

  /** Refresh the page: Zippie's refresh_page keeps the sections that still rank and shows the changes on a card. */
  function refreshPage(page: string, why: string, keyword?: string | null) {
    if (zippie) zippie.send(`Refresh ${url(page)} with refresh_page. ${why}`);
    else void toCalendar({ keyword: keyword ?? page.replace(/^\//, "").replace(/[-/]+/g, " "), page, notes: why });
  }

  /** Needs links: Zippie proposes the links from the busier pages, for review before anything changes. */
  function addLinks(o: Opportunity) {
    const sources = (Array.isArray(o.data.sources) ? o.data.sources : []).map((s) => url(String(s)));
    const text = `Add internal links to ${url(o.page ?? "/")} with the words “${o.data.anchor ?? o.query}” (or close to them, using words already in the text) from ${sources.join(", ")}. It ranks #${o.data.position} with ${n(Number(o.data.impressions ?? 0))} impressions, and links from busier pages on the same topic can move it up. Propose the changes with the internal links play so I can review them before anything goes live.`;
    if (zippie) zippie.send(text);
    else setNotice("Open Zippie and ask it to add these internal links.");
  }

  const k = data?.kpis;
  const rows = useMemo(() => (data?.queries ?? []).filter((q) => filter === "all" || q.chance === filter).slice(0, 50), [data, filter]);
  const aiMax = Math.max(1, ...(data?.ai ?? []).map((a) => a.sessions));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="aw-h2">Analytics</h1>
          <p className="aw-small">Search Console and Google Analytics in one place. Research any query without leaving the page.</p>
        </div>
        <Seg
          label="Period"
          value={days}
          onChange={setDays}
          options={[
            { id: "7", label: "7 days" },
            { id: "28", label: "28 days" },
            { id: "90", label: "3 months" },
          ]}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {status.gscProperty ? (
          <span className="aw-chip">
            <BrandLogo src={GSC_LOGO} name="Search Console" size={16} />
            Search Console · {propertyName(status.gscProperty)}
          </span>
        ) : null}
        {status.ga4Property ? (
          <span className="aw-chip">
            <BrandLogo src={GA4_LOGO} name="Google Analytics" size={16} />
            Google Analytics · {status.ga4Name ?? status.ga4Property}
          </span>
        ) : null}
        {canEdit ? (
          <button type="button" className="aw-chip" onClick={onSetup}>
            {!status.gscProperty ? "+ Pick a Search Console site" : !status.ga4Property ? "+ Pick a GA4 property" : "Change"}
          </button>
        ) : null}
        {status.state?.synced_at ? <span className="aw-small ml-auto">Synced {new Date(status.state.synced_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span> : null}
      </div>

      {error ? <p className="aw-error">{error}</p> : null}
      {notice ? (
        <div className="aw-callout flex items-center justify-between gap-3">
          <span>{notice}</span>
          <button type="button" className="aw-text-link text-[13px]" onClick={() => setNotice("")}>
            Close
          </button>
        </div>
      ) : null}
      {status.state?.error ? <p className="aw-error">The last sync failed: {status.state.error}</p> : null}

      {waiting ? (
        <Thinking text="Pulling your Google data. The first sync takes a few minutes, then 16 months of history fills in behind it." />
      ) : !data || !k ? (
        <Thinking text="Loading your numbers..." />
      ) : (
        <>
          <StatStrip
            stats={[
              { label: "Clicks", value: n(k.clicks[0]), delta: <Change pair={k.clicks} /> },
              { label: "Impressions", value: compact(k.impressions[0]), delta: <Change pair={k.impressions} /> },
              { label: "Avg. position", value: k.position[0] === null ? "–" : k.position[0].toFixed(1), delta: <Delta now={k.position[0]} before={k.position[1]} lowerIsBetter /> },
              { label: "Sessions", value: n(k.sessions[0]), delta: <Change pair={k.sessions} /> },
              { label: "Key events", value: n(k.conversions[0]), delta: <Change pair={k.conversions} /> },
              { label: "Visits from AI", value: n(k.ai[0]), delta: <Change pair={k.ai} /> },
            ]}
          />

          {focus ? <PageFocus page={focus} data={data} cited={cited} url={url} canEdit={canEdit} onRefresh={refreshPage} onClose={() => setFocus(null)} /> : null}

          {data.opportunities.length ? (
            <section className="aw-frame">
              <div className="aw-frame__head">
                <h2>Opportunities</h2>
                <span className="aw-small">Search Console joined with GA4, ranked by the clicks and sign-ups you could add.</span>
              </div>
              <div className="aw-an-opps">
                {data.opportunities.slice(0, 8).map((o) => (
                  <article key={o.id} className="aw-an-opp">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`aw-status ${OPP_CLASS[o.kind]}`}>{OPP_LABEL[o.kind]}</span>
                      <span className={`aw-num whitespace-nowrap text-[13px] font-medium ${o.kind === "losing" ? "text-neg" : "text-pos"}`}>
                        {o.kind === "losing" ? `−${n(o.gain_clicks)} clicks/mo` : o.kind === "new_topic" ? `${n(Number(o.data.impressions ?? 0))} impressions` : `+${n(o.gain_clicks)} clicks/mo`}
                      </span>
                    </div>
                    <span className="aw-an-opp__title">{o.title}</span>
                    <p className="aw-an-opp__why">{o.why}</p>
                    {o.gain_signups ? <span className="aw-small">About {o.gain_signups} sign-ups a month</span> : null}
                    {canEdit ? (
                      <div className="flex flex-wrap gap-2">
                        {o.kind === "low_ctr" ? (
                          <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" onClick={() => fixTitle(o)}>
                            Fix title &amp; meta
                          </button>
                        ) : o.kind === "new_topic" ? (
                          <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" onClick={() => toCalendar({ keyword: o.query ?? o.title, notes: o.why })}>
                            Add to Calendar
                          </button>
                        ) : o.kind === "links" ? (
                          <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" onClick={() => addLinks(o)}>
                            Add links
                          </button>
                        ) : (
                          <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" disabled={!o.page} onClick={() => o.page && refreshPage(o.page, o.why, o.query)}>
                            Refresh the page
                          </button>
                        )}
                        {o.query ? (
                          <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => setPanel({ query: o.query!, page: o.page, position: Number(o.data.position ?? 0) || null, impressions: Number(o.data.impressions ?? 0), clicks: Number(o.data.clicks ?? 0) })}>
                            Research
                          </button>
                        ) : o.page ? (
                          <a className="aw-btn aw-btn--secondary aw-btn--sm" href={url(o.page)} target="_blank" rel="noopener noreferrer">
                            Open page
                          </a>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
            <section className="aw-frame">
              <div className="aw-frame__head">
                <h2>Clicks and sessions</h2>
                <span className="aw-small">
                  {data.from} to {data.to}
                </span>
              </div>
              <div className="p-4">
                <TrendChart
                  points={data.series.map((d) => ({ at: d.day, label: new Date(`${d.day}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric" }), values: { "Google clicks": d.clicks, "Site sessions": d.sessions } }))}
                  lines={[
                    { name: "Google clicks", color: YOU_COLOR, isYou: true },
                    { name: "Site sessions", color: SESSIONS_COLOR, isYou: false },
                  ]}
                  metric="count"
                  mode="line"
                />
              </div>
            </section>
            <section className="aw-frame">
              <div className="aw-frame__head">
                <h2>Visits from AI</h2>
                <span className="aw-small">GA4</span>
              </div>
              <div className="flex flex-col gap-3 p-5">
                {data.ai.length ? (
                  data.ai.map((a) => (
                    <div key={a.engine} className="flex items-center gap-3 text-[14px]">
                      {AI_LOGO[a.engine] ? <BrandLogo src={AI_LOGO[a.engine]} name={a.engine} size={18} /> : null}
                      <span className="min-w-0 flex-1 truncate">{a.engine}</span>
                      <span className="aw-an-bar" aria-hidden="true">
                        <i style={{ width: `${(a.sessions / aiMax) * 100}%` }} />
                      </span>
                      <span className="aw-num w-12 text-right font-medium">{n(a.sessions)}</span>
                    </div>
                  ))
                ) : (
                  <p className="aw-small">{status.ga4Property ? "No visits from AI assistants in this period yet." : "Pick a GA4 property to see visits from ChatGPT, Perplexity and more."}</p>
                )}
              </div>
            </section>
          </div>

          <section className="aw-frame">
            <div className="aw-frame__head">
              <h2>Search queries</h2>
              <span className="aw-small">From Search Console. Research any row for volume, difficulty and related keywords.</span>
              <span className="ml-auto">
                <Seg
                  label="Filter queries"
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { id: "all", label: "All" },
                    { id: "page2", label: "Page 2" },
                    { id: "low_ctr", label: "Low CTR" },
                  ]}
                />
              </span>
            </div>
            {rows.length ? (
              <div className="overflow-x-auto">
                <table className="aw-table">
                  <thead>
                    <tr>
                      <th>Query</th>
                      <th className="text-right">Clicks</th>
                      <th className="text-right">Impressions</th>
                      <th className="text-right">CTR</th>
                      <th className="text-right">Position</th>
                      <th>Chance</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((q) => (
                      <tr key={q.query}>
                        <td className="font-medium text-ink">{q.query}</td>
                        <td className="aw-num text-right">{n(q.clicks)}</td>
                        <td className="aw-num text-right">{n(q.impressions)}</td>
                        <td className="aw-num text-right">{pctText(q.ctr)}</td>
                        <td className="aw-num text-right">{q.position.toFixed(1)}</td>
                        <td>{q.chance ? <span className={`aw-status ${CHANCE_CLASS[q.chance]}`}>{CHANCE_LABEL[q.chance]}</span> : null}</td>
                        <td className="text-right">
                          <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => setPanel({ query: q.query, page: q.page, position: q.position, impressions: q.impressions, clicks: q.clicks })}>
                            Research
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="aw-small p-5">{status.gscProperty ? "No queries match this filter in this period." : "Pick a Search Console site to see your queries."}</p>
            )}
          </section>

          <section className="aw-frame">
            <div className="aw-frame__head">
              <h2>Top pages</h2>
              <span className="aw-small">Search Console clicks next to GA4 sessions, visits from AI and key events</span>
            </div>
            {data.pages.length ? (
              <div className="overflow-x-auto">
                <table className="aw-table">
                  <thead>
                    <tr>
                      <th>Page</th>
                      <th className="text-right">Google clicks</th>
                      <th className="text-right">Sessions</th>
                      <th className="text-right">From AI</th>
                      <th className="text-right">Key events</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.pages.slice(0, 25).map((p) => (
                      <tr key={p.page}>
                        <td className="max-w-[420px] truncate font-medium text-ink">
                          <a href={url(p.page)} target="_blank" rel="noopener noreferrer">
                            {p.page}
                          </a>
                        </td>
                        <td className="aw-num text-right">{n(p.clicks)}</td>
                        <td className="aw-num text-right">{n(p.sessions)}</td>
                        <td className="aw-num text-right">{n(p.ai_sessions)}</td>
                        <td className="aw-num text-right">{n(p.conversions)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="aw-small p-5">No pages with data in this period yet.</p>
            )}
          </section>

          <Results results={results} url={url} canEdit={canEdit} onRefresh={refreshPage} />
          <CitedByAi pages={cited} url={url} />
        </>
      )}

      {panel ? (
        <ResearchPanel
          panel={panel}
          days={Number(days)}
          auth={auth}
          canEdit={canEdit}
          siteOf={siteOf}
          url={url}
          onClose={() => setPanel(null)}
          onAdd={toCalendar}
          onRefresh={(page, query) => {
            setPanel(null);
            refreshPage(page, `It ranks #${panel.position?.toFixed(1) ?? "?"} for “${query}” with ${n(panel.impressions)} impressions.`, query);
          }}
        />
      ) : null}
    </div>
  );
}

// ─────────────── One page, from Sources ───────────────

function PageFocus({ page, data, cited, url, canEdit, onRefresh, onClose }: { page: string; data: Overview; cited: CitedPage[] | null; url: (p: string) => string; canEdit: boolean; onRefresh: (page: string, why: string) => void; onClose: () => void }) {
  const p = data.pages.find((x) => x.page === page);
  const c = cited?.find((x) => x.page === page);
  const queries = data.queries.filter((q) => q.page === page).slice(0, 5);
  return (
    <section className="aw-frame">
      <div className="aw-frame__head">
        <h2 className="min-w-0 truncate">
          <a href={url(page)} target="_blank" rel="noopener noreferrer">
            {page}
          </a>
        </h2>
        <span className="aw-small">{c ? `Cited in ${c.answers} AI answer${c.answers === 1 ? "" : "s"} for ${c.prompts} prompt${c.prompts === 1 ? "" : "s"}` : "Not seen in the tracked AI answers in this period"}</span>
        <span className="ml-auto flex gap-2">
          {canEdit && p ? (
            <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => onRefresh(page, `It gets ${n(p.clicks)} Google clicks and ${n(p.ai_sessions)} visits from AI in this period.`)}>
              Refresh the page
            </button>
          ) : null}
          <button type="button" className="aw-btn aw-btn--ghost aw-btn--sm" onClick={onClose}>
            Close
          </button>
        </span>
      </div>
      <div className="flex flex-col gap-4 p-5">
        {p ? (
          <StatStrip
            stats={[
              { label: "Google clicks", value: n(p.clicks) },
              { label: "Avg. position", value: p.position === null ? "–" : p.position.toFixed(1) },
              { label: "Sessions", value: n(p.sessions) },
              { label: "Key events", value: n(p.conversions) },
              { label: "Visits from AI", value: n(p.ai_sessions) },
            ]}
          />
        ) : (
          <p className="aw-small">No Search Console or GA4 data for this page in this period.</p>
        )}
        {c?.engines.length ? (
          <span className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
            Cited by
            {c.engines.map((e) => (
              <span key={e} className="aw-chip">
                <BrandLogo src={ENGINE_LOGOS[e] ?? ""} name={e} size={14} />
                {e}
              </span>
            ))}
          </span>
        ) : null}
        {queries.length ? <span className="aw-small">Top searches: {queries.map((q) => `“${q.query}” (#${q.position.toFixed(1)})`).join(", ")}</span> : null}
      </div>
    </section>
  );
}

// ─────────────── Results: before and after each article and refresh ───────────────

function Results({ results, url, canEdit, onRefresh }: { results: ArticleResult[] | null; url: (p: string) => string; canEdit: boolean; onRefresh: (page: string, why: string, keyword?: string | null) => void }) {
  if (!results) return null;
  return (
    <section className="aw-frame">
      <div className="aw-frame__head">
        <h2>Results</h2>
        <span className="aw-small">Each published article and refresh: the days since it went live against the same number of days before.</span>
      </div>
      {results.length ? (
        <div className="overflow-x-auto">
          <table className="aw-table">
            <thead>
              <tr>
                <th>Article</th>
                <th>Live</th>
                {RESULT_COLS.map((c) => (
                  <th key={c.key} className="text-right">
                    {c.label}
                  </th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {results.map((r) => {
                const res = r.result;
                const slipping = Boolean(res && r.full && (res.clicks.change ?? 0) <= -0.25);
                return (
                  <tr key={r.item_id}>
                    <td className="max-w-[320px]">
                      <span className="block truncate font-medium text-ink">{r.keyword}</span>
                      <a className="block truncate text-[12px]" href={url(r.page)} target="_blank" rel="noopener noreferrer">
                        {r.page}
                      </a>
                    </td>
                    <td className="whitespace-nowrap">
                      <span className={`aw-status ${r.event === "refreshed" ? "aw-status--pending" : "aw-status--ranked"}`}>{r.event === "refreshed" ? "Refreshed" : "Published"}</span>
                      <span className="aw-small block" title={res ? resultSpan(r) : undefined}>
                        {new Date(r.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {r.days ? `${r.days}d` : "today"}
                      </span>
                    </td>
                    {RESULT_COLS.map((c) => (
                      <td key={c.key} className="aw-num text-right whitespace-nowrap">
                        {!res ? (
                          "–"
                        ) : (
                          <span className="inline-flex flex-col items-end">
                            <span>{c.position ? (res.position.after === null ? "–" : res.position.after.toFixed(1)) : n(res[c.key].after ?? 0)}</span>
                            <ResultDelta m={res[c.key]} position={c.position} />
                          </span>
                        )}
                      </td>
                    ))}
                    <td className="text-right">
                      {slipping && canEdit ? (
                        <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => onRefresh(r.page, `Clicks are down ${Math.round(-(res!.clicks.change ?? 0) * 100)}% since it went live.`, r.keyword)}>
                          Refresh
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="aw-small p-5">Articles you publish from Arrowsterr, and pages you refresh, show here with their clicks, position, sessions and sign-ups before and after.</p>
      )}
    </section>
  );
}

// ─────────────── Cited by AI: visits from AI next to the tracked AI answers ───────────────

function CitedByAi({ pages, url }: { pages: CitedPage[] | null; url: (p: string) => string }) {
  if (!pages) return null;
  const groups: { bucket: CitedBucket; text: string }[] = [
    { bucket: "cited_visits", text: "AI cites these pages and people click through." },
    { bucket: "cited_few", text: "AI cites them but few people click: give the answer a reason to visit, like a tool, template or the full numbers." },
    { bucket: "visits_uncited", text: "Visits from AI, but no tracked prompt cites them yet: add the questions that lead here to your prompts." },
  ];
  return (
    <section className="aw-frame">
      <div className="aw-frame__head">
        <h2>Cited by AI</h2>
        <span className="aw-small">GA4 visits from AI next to the AI answers you track (Prompts and Sources).</span>
      </div>
      {pages.length ? (
        <div className="aw-an-cited">
          {groups.map((g) => {
            const list = pages.filter((p) => p.bucket === g.bucket).slice(0, 8);
            return (
              <div key={g.bucket} className="aw-an-cited__group">
                <div className="flex items-center gap-2">
                  <span className={`aw-status ${CITED_CLASS[g.bucket]}`}>{CITED_LABEL[g.bucket]}</span>
                  <span className="aw-num text-[13px] text-muted">{pages.filter((p) => p.bucket === g.bucket).length}</span>
                </div>
                <p className="aw-small">{g.text}</p>
                {list.length ? (
                  <ul className="flex flex-col">
                    {list.map((p) => (
                      <li key={p.page} className="aw-an-cited__row">
                        <a className="min-w-0 flex-1 truncate font-medium text-ink" href={url(p.page)} target="_blank" rel="noopener noreferrer">
                          {p.page}
                        </a>
                        <span className="flex items-center gap-1">
                          {p.engines.slice(0, 4).map((e) => (
                            <span key={e} title={`Cited by ${e}`}>
                              <BrandLogo src={ENGINE_LOGOS[e] ?? ""} name={e} size={16} />
                            </span>
                          ))}
                        </span>
                        <span className="aw-num w-16 text-right text-[13px]" title="Visits from AI in this period">
                          {n(p.ai_sessions)} visits
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="aw-small text-faint">None in this period.</p>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="aw-small p-5">No page of yours is cited in the tracked AI answers or gets visits from AI in this period yet.</p>
      )}
    </section>
  );
}

// ─────────────── Research from any row ───────────────

function ResearchPanel({ panel, days, auth, canEdit, siteOf, url, onClose, onAdd, onRefresh }: { panel: Panel; days: number; auth: RunAuth; canEdit: boolean; siteOf: () => Promise<Site | null>; url: (p: string) => string; onClose: () => void; onAdd: (item: { keyword: string; page?: string | null; position?: number | null; volume?: number | null; kd?: number | null; intent?: string | null; cpc?: number | null }) => void; onRefresh: (page: string, query: string) => void }) {
  const [rows, setRows] = useState<Keyword[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!canEdit) return;
    let live = true;
    siteOf()
      .then(async (site) => {
        if (!site) throw new Error("Set up the brand's website in Research first.");
        const d = await post<{ rows: Keyword[] }>(auth, "/api/research/keywords", { mode: "ideas", query: panel.query, siteId: site.id });
        if (live) setRows(d.rows ?? []);
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [panel.query, auth, canEdit, siteOf]);

  const main = rows?.find((r) => r.keyword.toLowerCase() === panel.query.toLowerCase()) ?? rows?.[0] ?? null;
  const related = (rows ?? []).filter((r) => r !== main).slice(0, 10);
  const trend = main?.trend?.length && main.trend.length >= 6 ? (() => {
    const t = main.trend;
    const a = t.slice(0, 3).reduce((x, y) => x + y, 0), b = t.slice(-3).reduce((x, y) => x + y, 0);
    return a ? Math.round(((b - a) / a) * 100) : null;
  })() : null;
  const ctr = panel.impressions ? panel.clicks / panel.impressions : 0;
  const top3 = panel.position && panel.position > 3 ? Math.max(0, Math.round((expectedCtr(3) * panel.impressions - panel.clicks) * (30 / days))) : 0;

  return (
    <SidePanel kicker="Keyword research" title={panel.query} onClose={onClose} narrow>
      <div className="flex flex-col gap-5">
        {panel.position ? (
          <div className="aw-callout">
            <b>You rank #{panel.position.toFixed(1)}</b> with {n(panel.impressions)} impressions and a {pctText(ctr)} click rate.{" "}
            {top3 ? `The top 3 usually get about ${pctText(expectedCtr(3))} of clicks, so moving up could add about ${n(top3)} clicks a month.` : "You're already in the top 3."}
          </div>
        ) : null}
        {!canEdit ? (
          <p className="aw-small">Ask an editor to run keyword research.</p>
        ) : error ? (
          <p className="aw-error">{error}</p>
        ) : !rows ? (
          <Thinking text="Looking up this keyword..." />
        ) : (
          <>
            {main ? (
              <div className="aw-an-mini">
                <div>
                  <span>Volume</span>
                  <b className="aw-num">{main.volume === null ? "–" : n(main.volume)}</b>
                </div>
                <div>
                  <span>Difficulty</span>
                  <b className="aw-num">{main.kd ?? "–"}</b>
                </div>
                <div>
                  <span>CPC</span>
                  <b className="aw-num">{main.cpc === null ? "–" : `$${main.cpc.toFixed(2)}`}</b>
                </div>
                <div>
                  <span>Trend</span>
                  <b className={`aw-num ${trend === null ? "" : trend >= 0 ? "text-pos" : "text-neg"}`}>{trend === null ? "–" : `${trend >= 0 ? "↑" : "↓"} ${Math.abs(trend)}%`}</b>
                </div>
              </div>
            ) : (
              <p className="aw-small">No data for this keyword yet.</p>
            )}
            {related.length ? (
              <div className="flex flex-col gap-2">
                <span className="aw-label mb-0!">Related keywords</span>
                <table className="aw-table aw-table--compact">
                  <tbody>
                    {related.map((r) => (
                      <tr key={r.keyword}>
                        <td>{r.keyword}</td>
                        <td className="aw-num text-right">{r.volume === null ? "–" : n(r.volume)}</td>
                        <td className="aw-num text-right">{r.kd ?? "–"}</td>
                        <td className="text-right">
                          <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" aria-label={`Add ${r.keyword} to the Calendar`} onClick={() => onAdd({ keyword: r.keyword, volume: r.volume, kd: r.kd, intent: r.intent, cpc: r.cpc })}>
                            +
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button type="button" className="aw-btn aw-btn--secondary" onClick={() => onAdd({ keyword: panel.query, volume: main?.volume, kd: main?.kd, intent: main?.intent, cpc: main?.cpc })}>
                Add to Calendar
              </button>
              {panel.page ? (
                <button type="button" className="aw-btn aw-btn--primary" onClick={() => onRefresh(panel.page!, panel.query)}>
                  Refresh {panel.page}
                </button>
              ) : null}
            </div>
            <p className="aw-small">Uses 10 tasks from your plan. {panel.page ? <a href={url(panel.page)} target="_blank" rel="noopener noreferrer">Open the page</a> : null}</p>
          </>
        )}
      </div>
    </SidePanel>
  );
}
