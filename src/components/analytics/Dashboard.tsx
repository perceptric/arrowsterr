"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { addCalendarItems, siteForBrand, type Site } from "@/lib/db";
import type { Keyword } from "@/lib/research";
import { stageFromIntent } from "@/lib/research";
import type { RunAuth } from "@/lib/runner";
import { expectedCtr, type DayPoint, type OppKind, type Opportunity, type RankBucket } from "@/lib/seoAnalytics";
import type { Dashboard as Data, DashMover, DashRow } from "@/lib/seoAnalyticsServer";
import type { View } from "@/lib/view";
import { BrandLogo } from "../BrandLogo";
import { ENGINE_LOGOS } from "../Engines";
import { post } from "../research/shared";
import { favicon, SidePanel, Thinking } from "../ui";
import { useZippieMaybe } from "../zippie/ZippieContext";
import { AI_LOGO, propertyName } from "./google";

// The Analytics dashboard (docs/seo-analytics.md), read top to bottom as the questions people bring to Search Console
// and GA4: how am I doing (six numbers that drive one chart), what should I do next (one ranked list), what changed,
// where visitors come from, am I ranking better, and which pages work. Styles: the "Analytics dashboard" section of
// globals.css (aw-dash-*).

export type Status = {
  ready: boolean;
  connected: boolean;
  email: string | null;
  gsc: boolean;
  gscProperty: string | null;
  ga4Property: string | null;
  ga4Name: string | null;
  state: { gsc_to: string | null; synced_at: string | null; syncing: boolean; backfilled: boolean; error: string | null } | null;
};
export type Call = (path: string, body: Record<string, unknown>) => Promise<Record<string, unknown>>;

const GSC_LOGO = "/logos/search-console.png";
const GA4_LOGO = "/logos/google-analytics.svg";
const RANGES = [
  { days: 7, label: "7 days" },
  { days: 28, label: "28 days" },
  { days: 90, label: "3 months" },
  { days: 365, label: "12 months" },
];

const n = (v: number) => Math.round(v).toLocaleString("en-US");
const compact = (v: number) => (v >= 10_000 ? new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v) : n(v));
const pct = (r: number) => `${(r * 100).toFixed(r < 0.1 ? 1 : 0)}%`;
const day = (iso: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", ...opts });
const addDay = (iso: string, k: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + k * 864e5).toISOString().slice(0, 10);

type MetricKey = "clicks" | "impressions" | "ctr" | "position" | "sessions" | "conversions";
const METRICS: { key: MetricKey; label: string; logo: string; ga4?: boolean; lower?: boolean }[] = [
  { key: "clicks", label: "Clicks", logo: GSC_LOGO },
  { key: "impressions", label: "Impressions", logo: GSC_LOGO },
  { key: "ctr", label: "CTR", logo: GSC_LOGO },
  { key: "position", label: "Avg. position", logo: GSC_LOGO, lower: true },
  { key: "sessions", label: "Sessions", logo: GA4_LOGO, ga4: true },
  { key: "conversions", label: "Sign-ups", logo: GA4_LOGO, ga4: true },
];
const show = (k: MetricKey, v: number | null) => (v === null ? "–" : k === "ctr" ? pct(v) : k === "position" ? v.toFixed(1) : compact(v));

/** A metric's change against the period before, in words and a tone. Null when there is nothing to compare. */
function change(k: MetricKey, now: number | null, before: number | null): { text: string; good: boolean } | null {
  if (now === null || before === null) return null;
  if (k === "position") {
    if (!before || !now) return null;
    const d = Math.round((before - now) * 10) / 10;
    return d === 0 ? { text: "No change", good: true } : { text: d > 0 ? `↑ ${d.toFixed(1)} better` : `↓ ${(-d).toFixed(1)} worse`, good: d > 0 };
  }
  if (k === "ctr") {
    const d = Math.round((now - before) * 1000) / 10;
    return { text: `${d > 0 ? "+" : ""}${d.toFixed(1)} pts`, good: d >= 0 };
  }
  if (!before) return now ? { text: "New", good: true } : null;
  const d = Math.round(((now - before) / before) * 100);
  return { text: `${d > 0 ? "+" : ""}${d}%`, good: d >= 0 };
}

/** The width of an element, kept up to date, so charts draw at real pixels (text never stretches). */
function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    setW(Math.round(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** A round axis step that splits `span` into about five parts: 1, 2, 2.5 or 5 times a power of ten (at least 1 for counts). */
function niceStep(span: number, whole: boolean) {
  const raw = span / 5;
  const p = 10 ** Math.floor(Math.log10(raw));
  const s = [1, 2, 2.5, 5, 10].map((m) => m * p).find((v) => v >= raw) ?? raw;
  return whole ? Math.max(1, Math.ceil(s)) : s;
}

/** A smooth line through points. */
function smooth(pts: [number, number][]) {
  if (!pts.length) return "";
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const cx = (x0 + x1) / 2;
    d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`;
  }
  return d;
}

function Spark({ values, up, width = 64 }: { values: number[]; up: boolean; width?: number }) {
  const h = 22;
  if (values.length < 2) return <svg width={width} height={h} aria-hidden="true" />;
  const mx = Math.max(...values);
  const mn = Math.min(...values);
  const pts = values.map((v, i): [number, number] => [(i * width) / (values.length - 1), h - 3 - ((v - mn) / (mx - mn || 1)) * (h - 6)]);
  return (
    <svg width={width} height={h} viewBox={`0 0 ${width} ${h}`} aria-hidden="true" className="aw-dash-spark">
      <path d={smooth(pts)} className={up ? "is-up" : "is-down"} />
    </svg>
  );
}

// ─────────────── The page ───────────────

type Panel = { query: string; page: string | null; position: number | null; impressions: number; clicks: number };

export function Dashboard({ status, call, sb, auth, view, canEdit, onSetup, onReload }: { status: Status; call: Call; sb: SupabaseClient; auth: RunAuth; view: View; canEdit: boolean; onSetup: () => void; onReload: () => void }) {
  const { brand } = view;
  const zippie = useZippieMaybe();
  const [days, setDays] = useState(28);
  const [compare, setCompare] = useState(true);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [panel, setPanel] = useState<Panel | null>(null);
  const [site, setSite] = useState<Site | null>(null);
  // From a Sources row (?page=/blog/x): that page first in the Pages table.
  const [focus, setFocus] = useState(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("page")));
  const waiting = !status.state?.synced_at || (Boolean(status.gscProperty) && !status.state?.gsc_to);

  useEffect(() => {
    let live = true;
    call("/api/seo-analytics", { action: "dashboard", days, page: focus })
      .then((d) => {
        if (!live) return;
        setData(d as unknown as Data);
        setError("");
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [call, days, focus, status.state?.synced_at]);

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
    const text = `Fix the SEO title and meta description of ${url(o.page ?? "/")}. It ranks ${pos ? `#${pos}` : "on page 1"} for “${o.query}” but only ${pct(Number(o.data.ctr ?? 0))} of searchers click; results at that spot usually get ${pct(Number(o.data.expected ?? expectedCtr(pos)))}. Use the meta play on that page so I can review the change before it goes live.`;
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

  function act(o: Opportunity) {
    if (o.kind === "low_ctr") return fixTitle(o);
    if (o.kind === "new_topic") return void toCalendar({ keyword: o.query ?? o.title, notes: o.why });
    if (o.kind === "links") return addLinks(o);
    if (o.page) refreshPage(o.page, o.why, o.query);
  }

  const research = (r: { query: string; page: string | null; position: number | null; impressions: number; clicks: number }) => setPanel(r);

  return (
    <div className="aw-dash">
      <header className="aw-dash-top">
        <h1>Analytics</h1>
        {status.gscProperty ? (
          <span className="aw-dash-site">
            <BrandLogo src={favicon(propertyName(status.gscProperty).split("/")[0])} name="" size={16} />
            {propertyName(status.gscProperty)}
          </span>
        ) : null}
        <span className="aw-dash-src" title={status.state?.synced_at ? `Synced ${new Date(status.state.synced_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : undefined}>
          {status.gscProperty ? (
            <span className="aw-dash-src__one">
              <BrandLogo src={GSC_LOGO} name="Search Console" size={15} />
              Search Console
              <i className="aw-dash-ok" aria-label="connected" />
            </span>
          ) : canEdit ? (
            <button type="button" className="aw-dash-link" onClick={onSetup}>
              + Pick a Search Console site
            </button>
          ) : null}
          {status.ga4Property ? (
            <span className="aw-dash-src__one">
              <BrandLogo src={GA4_LOGO} name="Google Analytics" size={15} />
              GA4
              <i className="aw-dash-ok" aria-label="connected" />
            </span>
          ) : canEdit ? (
            <button type="button" className="aw-dash-link" onClick={onSetup}>
              + Pick a GA4 property
            </button>
          ) : null}
          {canEdit && status.gscProperty && status.ga4Property ? (
            <button type="button" className="aw-dash-link aw-dash-link--quiet" onClick={onSetup}>
              Change
            </button>
          ) : null}
        </span>
        <span className="aw-dash-top__sp" />
        <div className="aw-dash-seg" role="group" aria-label="Period">
          {RANGES.map((r) => (
            <button key={r.days} type="button" className={days === r.days ? "is-on" : ""} aria-pressed={days === r.days} onClick={() => setDays(r.days)}>
              {r.label}
            </button>
          ))}
        </div>
        <button type="button" role="switch" aria-checked={compare} className="aw-dash-cmp" onClick={() => setCompare(!compare)}>
          <span className={`aw-dash-tog ${compare ? "is-on" : ""}`} aria-hidden="true" />
          vs previous {RANGES.find((r) => r.days === days)?.label}
        </button>
      </header>

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
      ) : !data ? (
        error ? null : <Thinking text="Loading your numbers..." />
      ) : (
        <>
          <Hero data={data} compare={compare} onPickGa4={canEdit ? onSetup : undefined} />
          <Actions list={data.opportunities} canEdit={canEdit} onAct={act} />
          <Movers data={data} />
          <div className="aw-dash-split">
            <Channels data={data} onPickGa4={canEdit ? onSetup : undefined} />
            <Ranks weeks={data.ranks} />
          </div>
          <Table data={data} call={call} days={days} focus={focus} onClearFocus={() => setFocus(null)} url={url} onResearch={research} />
        </>
      )}

      {panel ? (
        <ResearchPanel
          panel={panel}
          days={days}
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

// ─────────────── 1. How am I doing: six numbers drive one chart ───────────────

function Hero({ data, compare, onPickGa4 }: { data: Data; compare: boolean; onPickGa4?: () => void }) {
  const [metric, setMetric] = useState<MetricKey>("clicks");
  const m = METRICS.find((x) => x.key === metric)!;
  const missing = m.ga4 && !data.ga4;
  return (
    <section className="aw-dash-surface">
      <div className="aw-dash-metrics" role="tablist" aria-label="Metric">
        {METRICS.map((x) => {
          const now = data.totals.cur[x.key];
          const c = compare ? change(x.key, now, data.totals.prev[x.key]) : null;
          return (
            <button key={x.key} type="button" role="tab" aria-selected={metric === x.key} className={`aw-dash-m ${metric === x.key ? "is-on" : ""}`} onClick={() => setMetric(x.key)}>
              <span className="aw-dash-m__l">
                <BrandLogo src={x.logo} name="" size={13} />
                {x.label}
              </span>
              <span className="aw-dash-m__v">{show(x.key, now)}</span>
              <span className={`aw-dash-m__d ${c ? (c.good ? "is-up" : "is-down") : ""}`}>{c?.text ?? " "}</span>
            </button>
          );
        })}
      </div>
      {missing ? (
        <div className="aw-dash-chart-empty">
          <p>Pick a GA4 property to see {m.label.toLowerCase()} by day.</p>
          {onPickGa4 ? (
            <button type="button" className="aw-dash-btn" onClick={onPickGa4}>
              Pick a GA4 property
            </button>
          ) : null}
        </div>
      ) : (
        <Chart data={data} metric={m.key} label={m.label} lower={Boolean(m.lower)} compare={compare} />
      )}
    </section>
  );
}

function Chart({ data, metric, label, lower, compare }: { data: Data; metric: MetricKey; label: string; lower: boolean; compare: boolean }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const H = 280;
  const pl = 48;
  const pr = 14;
  const pt = 16;
  const pb = 30;
  const val = (p: DayPoint) => p[metric];
  const cur = data.series.cur.map(val);
  const prev = data.series.prev.map(val);
  const nums = [...cur, ...(compare ? prev : [])].filter((v): v is number => v !== null);
  const count = cur.length;
  const hi = nums.length ? Math.max(...nums) : 1;
  const lo = nums.length ? Math.min(...nums) : 0;
  // Counts get round steps (0, 1, 2, 3 or 0, 100, 200 ...) so small numbers never repeat a label.
  const step = lower ? 0 : niceStep(hi * 1.05 || 1, metric !== "ctr");
  const max = lower ? hi * 1.08 || 1 : Math.max(step, Math.ceil((hi * 1.05) / step) * step);
  const min = lower ? Math.max(0, lo * 0.9) : 0;
  const x = (i: number) => pl + (count > 1 ? (i * (W - pl - pr)) / (count - 1) : 0);
  const y = (v: number) => (lower ? pt + ((v - min) / (max - min || 1)) * (H - pt - pb) : H - pb - ((v - min) / (max - min || 1)) * (H - pt - pb));
  const line = (vals: (number | null)[]) => {
    // Gaps (no position on a day with no impressions) split the line.
    const parts: [number, number][][] = [[]];
    vals.forEach((v, i) => (v === null ? parts.push([]) : parts[parts.length - 1].push([x(i), y(v)])));
    return parts.filter((p) => p.length).map(smooth).join(" ");
  };
  const curPts = cur.map((v, i): [number, number] | null => (v === null ? null : [x(i), y(v)])).filter((p): p is [number, number] => p !== null);
  const area = curPts.length > 1 && !lower ? `${smooth(curPts)} L${curPts[curPts.length - 1][0]},${H - pb} L${curPts[0][0]},${H - pb} Z` : "";
  const ticks = lower ? [0, 0.25, 0.5, 0.75, 1].map((f) => min + (max - min) * f) : Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step);
  const labelAt = [0, Math.round((count - 1) / 4), Math.round((count - 1) / 2), Math.round(((count - 1) * 3) / 4), count - 1].filter((v, i, a) => a.indexOf(v) === i);
  const pins = data.pubs.map((p) => ({ ...p, i: Math.round((Date.parse(`${p.day}T00:00:00Z`) - Date.parse(`${data.from}T00:00:00Z`)) / 864e5) })).filter((p) => p.i >= 0 && p.i < count);
  const h = hover ?? -1;
  const hv = h >= 0 ? cur[h] : null;
  const pv = h >= 0 ? prev[h] : null;
  const hc = h >= 0 && compare ? change(metric, hv, pv) : null;
  const pin = h >= 0 ? pins.filter((p) => p.i === h) : [];

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left - pl) / Math.max(1, W - pl - pr)) * (count - 1));
    setHover(i >= 0 && i < count ? i : null);
  }

  return (
    <div className="aw-dash-chartbox">
      <div className="aw-dash-legend">
        <span>
          <i className="aw-dash-legend__cur" />
          <b>{label}</b> this period
        </span>
        {compare ? (
          <span>
            <i className="aw-dash-legend__prev" />
            Previous period
          </span>
        ) : null}
        {pins.length ? (
          <span>
            <i className="aw-dash-legend__pin" />
            You published
          </span>
        ) : null}
      </div>
      <div ref={ref} className="aw-dash-chart">
        {W ? (
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label={`${label} by day`}>
            <defs>
              <linearGradient id="aw-dash-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#3B82F6" stopOpacity="0.22" />
                <stop offset="1" stopColor="#3B82F6" stopOpacity="0" />
              </linearGradient>
            </defs>
            {ticks.map((v, i) => (
              <g key={i}>
                <line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} className="aw-dash-grid" />
                <text x={pl - 10} y={y(v) + 4} textAnchor="end" className="aw-dash-axis">
                  {show(metric, v)}
                </text>
              </g>
            ))}
            {labelAt.map((i) => (
              <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === count - 1 ? "end" : "middle"} className="aw-dash-axis">
                {day(addDay(data.from, i))}
              </text>
            ))}
            {pins.map((p) => (
              <g key={`${p.i}-${p.title}`}>
                <line x1={x(p.i)} x2={x(p.i)} y1={pt} y2={H - pb} className="aw-dash-pinline" />
                <circle cx={x(p.i)} cy={H - pb} r={6} className="aw-dash-pin" />
              </g>
            ))}
            {compare ? <path d={line(prev)} className="aw-dash-prev" /> : null}
            {area ? <path d={area} fill="url(#aw-dash-fill)" /> : null}
            <path d={line(cur)} className="aw-dash-cur" />
            {h >= 0 ? (
              <>
                <line x1={x(h)} x2={x(h)} y1={pt} y2={H - pb} className="aw-dash-cross" />
                {hv !== null ? <circle cx={x(h)} cy={y(hv)} r={5.5} className="aw-dash-dot" /> : null}
              </>
            ) : null}
          </svg>
        ) : null}
        {h >= 0 && W ? (
          <div className="aw-dash-tip" style={{ left: Math.min(W - 200, x(h) + 16), top: hv !== null ? Math.max(8, y(hv) - 24) : 24 }}>
            <span className="aw-dash-tip__d">{day(addDay(data.from, h), { weekday: "short", month: "short", day: "numeric" })}</span>
            <span>
              <b>{show(metric, hv)}</b> {hc ? <span className={hc.good ? "is-up" : "is-down"}>{hc.text}</span> : null}
            </span>
            {compare ? (
              <span className="aw-dash-tip__row">
                <span>Same day before</span>
                <span>{show(metric, pv)}</span>
              </span>
            ) : null}
            {pin.map((p) => (
              <span key={p.title} className="aw-dash-tip__pin">
                ● {p.event === "refreshed" ? "Refreshed" : "Published"}: {p.title}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ─────────────── 2. Do these next: one ranked list ───────────────

const KIND: Record<OppKind, { label: string; tone: string; button: string }> = {
  low_ctr: { label: "Low CTR", tone: "ctr", button: "Fix title" },
  page2: { label: "Page 2", tone: "p2", button: "Refresh page" },
  losing: { label: "Losing", tone: "dec", button: "Refresh page" },
  new_topic: { label: "New page", tone: "new", button: "Add to Calendar" },
  cannibal: { label: "Two pages", tone: "p2", button: "Refresh page" },
  links: { label: "Needs links", tone: "new", button: "Add links" },
};

function ActionTitle({ o }: { o: Opportunity }) {
  const page = o.page ? <code>{o.page}</code> : null;
  const q = o.query ? `“${o.query}”` : "";
  switch (o.kind) {
    case "low_ctr":
      return page ? <>Rewrite the title of {page}</> : <>Rewrite the title for {q}</>;
    case "page2":
      return page ? <>Push {page} onto page 1</> : <>Push {q} onto page 1</>;
    case "losing":
      return <>Save {page}</>;
    case "new_topic":
      return <>Write about {q}</>;
    case "cannibal":
      return <>Make one page the answer for {q}</>;
    case "links":
      return <>Add internal links to {page}</>;
    default:
      return null;
  }
}

function gainText(o: Opportunity) {
  if (o.kind === "new_topic") return `${n(Number(o.data.impressions ?? 0))} impressions`;
  return `+${n(o.gain_clicks)} clicks/mo${o.gain_signups ? ` · ${o.gain_signups} sign-ups` : ""}`;
}

function Actions({ list, canEdit, onAct }: { list: Opportunity[]; canEdit: boolean; onAct: (o: Opportunity) => void }) {
  const [all, setAll] = useState(false);
  const shown = all ? list : list.slice(0, 4);
  const top = Math.max(1, ...list.map((o) => (o.kind === "new_topic" ? 0 : o.gain_clicks)));
  return (
    <section>
      <div className="aw-dash-sh">
        <h2>Do these next</h2>
        <p>Search Console joined with GA4, ranked by the clicks and sign-ups each one can add.</p>
        {list.length > 4 ? (
          <button type="button" className="aw-dash-link aw-dash-sh__r" onClick={() => setAll(!all)}>
            {all ? "Show fewer" : `See all ${list.length}`}
          </button>
        ) : null}
      </div>
      <div className="aw-dash-surface aw-dash-acts">
        {!list.length ? <p className="aw-dash-none">Nothing to fix yet. Ideas show up here once Google has a few weeks of searches for the site.</p> : null}
        {shown.map((o, i) => {
          const k = KIND[o.kind];
          const size = o.kind === "new_topic" ? 0.22 : Math.max(0.06, o.gain_clicks / top);
          return (
            <div key={o.id} className="aw-dash-act">
              <span className="aw-dash-act__n">{i + 1}</span>
              <div className="min-w-0">
                <div className="aw-dash-act__t">
                  <span className={`aw-dash-kind is-${k.tone}`}>{k.label}</span>
                  <ActionTitle o={o} />
                </div>
                <p className="aw-dash-act__w">{o.why}</p>
              </div>
              <div className="aw-dash-act__imp">
                <b>{gainText(o)}</b>
                <span className="aw-dash-act__bar">
                  <i style={{ width: `${size * 100}%` }} />
                </span>
              </div>
              <div className="aw-dash-act__go">
                {canEdit ? (
                  <button type="button" className={`aw-dash-btn ${i === 0 ? "aw-dash-btn--pri" : ""}`} disabled={!o.page && o.kind !== "new_topic"} onClick={() => onAct(o)}>
                    {k.button}
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─────────────── 3. What changed ───────────────

function Movers({ data }: { data: Data }) {
  const [kind, setKind] = useState<"queries" | "pages">("queries");
  const m = data.movers[kind];
  const col = (rows: DashMover[], up: boolean) => (
    <div className="aw-dash-col">
      <div className={`aw-dash-colh ${up ? "is-up" : "is-down"}`}>{up ? "▲ Gaining" : "▼ Losing"}</div>
      {rows.length ? (
        rows.map((r) => (
          <div key={r.key} className="aw-dash-mv">
            <span className="aw-dash-mv__q">{r.key}</span>
            <Spark values={r.trend} up={up} />
            <span className={`aw-dash-mv__d ${up ? "is-up" : "is-down"}`}>
              {r.change > 0 ? "+" : ""}
              {n(r.change)}
            </span>
          </div>
        ))
      ) : (
        <p className="aw-dash-none">{up ? "Nothing gained clicks in this period." : "Nothing lost clicks in this period."}</p>
      )}
    </div>
  );
  if (!data.gsc) return null;
  return (
    <section>
      <div className="aw-dash-sh">
        <h2>What changed</h2>
        <p>Biggest moves in clicks vs the period before</p>
        <span className="aw-dash-sh__r">
          <span className="aw-dash-tabs" role="group" aria-label="Searches or pages">
            <button type="button" className={kind === "queries" ? "is-on" : ""} aria-pressed={kind === "queries"} onClick={() => setKind("queries")}>
              Searches
            </button>
            <button type="button" className={kind === "pages" ? "is-on" : ""} aria-pressed={kind === "pages"} onClick={() => setKind("pages")}>
              Pages
            </button>
          </span>
        </span>
      </div>
      <div className="aw-dash-surface aw-dash-movers">
        {col(m.up, true)}
        {col(m.down, false)}
      </div>
    </section>
  );
}

// ─────────────── 4. Where visitors come from, and where you rank ───────────────

const CHANNEL_COLOR: Record<string, string> = { "Organic search": "#2563EB", Direct: "#94A3B8", "AI assistants": "#7C3AED", Referral: "#0EA5E9", Social: "#F59E0B", Email: "#10B981", "Paid search": "#EC4899", Other: "#CBD5E1" };

function Channels({ data, onPickGa4 }: { data: Data; onPickGa4?: () => void }) {
  const list = data.channels;
  const total = list?.reduce((a, c) => a + c.sessions, 0) ?? 0;
  const delta = list && data.sessionsPrev ? Math.round(((total - data.sessionsPrev) / data.sessionsPrev) * 100) : null;
  return (
    <section>
      <div className="aw-dash-sh">
        <h2>Where visitors come from</h2>
        <p>GA4 sessions</p>
      </div>
      <div className="aw-dash-surface aw-dash-pad">
        {!data.ga4 ? (
          <div className="aw-dash-empty">
            <p>Pick a GA4 property to see where visitors come from, including ChatGPT, Perplexity and other AI assistants.</p>
            {onPickGa4 ? (
              <button type="button" className="aw-dash-btn" onClick={onPickGa4}>
                Pick a GA4 property
              </button>
            ) : null}
          </div>
        ) : !list ? (
          <p className="aw-dash-none">Channels fill in after the next sync.</p>
        ) : (
          <>
            <div className="aw-dash-big">
              <b>{compact(total)}</b>
              <span>sessions</span>
              {delta !== null ? <span className={delta >= 0 ? "is-up" : "is-down"}>{`${delta > 0 ? "+" : ""}${delta}%`}</span> : null}
            </div>
            <div className="aw-dash-stack" aria-hidden="true">
              {list.map((c) => (
                <span key={c.channel} style={{ flex: c.sessions, background: CHANNEL_COLOR[c.channel] ?? CHANNEL_COLOR.Other }} />
              ))}
            </div>
            <div className="aw-dash-chrows">
              {list.map((c) => (
                <div key={c.channel}>
                  <div className="aw-dash-ch">
                    <span className="aw-dash-ch__dot" style={{ background: CHANNEL_COLOR[c.channel] ?? CHANNEL_COLOR.Other }} />
                    <span>{c.channel}</span>
                    <span className="aw-dash-ch__n">{n(c.sessions)}</span>
                    <span className="aw-dash-ch__p">{total ? Math.round((c.sessions / total) * 100) : 0}%</span>
                  </div>
                  {c.channel === "AI assistants" && data.ai.length ? (
                    <div className="aw-dash-ais">
                      {data.ai.map((a) => (
                        <span key={a.engine} className="aw-dash-ai">
                          {AI_LOGO[a.engine] ? <BrandLogo src={AI_LOGO[a.engine]} name="" size={14} /> : null}
                          {a.engine} <b>{n(a.sessions)}</b>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

const BUCKETS: { key: RankBucket; label: string; color: string }[] = [
  { key: "top3", label: "Top 3", color: "#1D4ED8" },
  { key: "top10", label: "4–10", color: "#60A5FA" },
  { key: "top20", label: "11–20", color: "#BFDBFE" },
];

function Ranks({ weeks }: { weeks: Record<RankBucket, number>[] }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const H = 220;
  const total = (w: Record<RankBucket, number>) => w.top3 + w.top10 + w.top20;
  const first = weeks.findIndex((w) => total(w) > 0);
  const last = weeks[weeks.length - 1];
  const has = first >= 0;
  const page1 = last.top3 + last.top10;
  const since = has ? page1 - (weeks[first].top3 + weeks[first].top10) : 0;
  const ago = weeks.length - 1 - first;
  const mx = Math.max(10, ...weeks.map(total)) * 1.05;
  const step = W ? (W - 8) / weeks.length : 0;
  const bw = Math.max(4, step - 10);
  return (
    <section>
      <div className="aw-dash-sh">
        <h2>Where you rank</h2>
        <p>Searches in Google&apos;s top 20, week by week</p>
      </div>
      <div className="aw-dash-surface aw-dash-pad">
        {!has ? (
          <p className="aw-dash-none">Not enough Search Console history yet. This fills in as the sync goes back in time.</p>
        ) : (
          <>
            <div className="aw-dash-big">
              <b>{n(page1)}</b>
              <span>searches on page 1</span>
              {ago > 0 && since !== 0 ? <span className={since >= 0 ? "is-up" : "is-down"}>{`${since >= 0 ? "+" : ""}${n(since)} in ${ago} week${ago === 1 ? "" : "s"}`}</span> : null}
            </div>
            <div className="aw-dash-rb">
              {BUCKETS.map((b) => (
                <span key={b.key}>
                  <i style={{ background: b.color }} />
                  {b.label} <b>{n(last[b.key])}</b>
                  {ago > 0 && last[b.key] !== weeks[first][b.key] ? (
                    <em className={last[b.key] > weeks[first][b.key] ? "is-up" : "is-down"}>{`${last[b.key] > weeks[first][b.key] ? "+" : ""}${n(last[b.key] - weeks[first][b.key])}`}</em>
                  ) : null}
                </span>
              ))}
            </div>
            <div ref={ref} className="aw-dash-chart">
              {W ? (
                <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Searches by position, week by week">
                  {weeks.map((w, i) => {
                    let top = H - 24;
                    const x0 = 4 + i * step + (step - bw) / 2;
                    return (
                      <g key={i}>
                        {BUCKETS.map((b) => {
                          const h = (w[b.key] / mx) * (H - 34);
                          top -= h;
                          return h > 0 ? <rect key={b.key} x={x0} y={top} width={bw} height={Math.max(0, h - 2)} rx={3} fill={b.color} /> : null;
                        })}
                        {i === weeks.length - 1 || (weeks.length - 1 - i) % 3 === 0 ? (
                          <text x={x0 + bw / 2} y={H - 7} textAnchor="middle" className="aw-dash-axis">
                            {i === weeks.length - 1 ? "Now" : `${weeks.length - 1 - i}w ago`}
                          </text>
                        ) : null}
                      </g>
                    );
                  })}
                </svg>
              ) : null}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

// ─────────────── 5. The detail: pages and searches ───────────────

function Table({ data, call, days, focus, onClearFocus, url, onResearch }: { data: Data; call: Call; days: number; focus: string | null; onClearFocus: () => void; url: (p: string) => string; onResearch: (p: Panel) => void }) {
  const [kind, setKind] = useState<"pages" | "queries">("pages");
  const [extra, setExtra] = useState<{ pages: DashRow[]; queries: DashRow[] }>({ pages: [], queries: [] });
  const [more, setMore] = useState({ pages: data.pages.more, queries: data.queries.more });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // New data (another range, a fresh sync): start the list over.
  const [seen, setSeen] = useState(data);
  if (seen !== data) {
    setSeen(data);
    setExtra({ pages: [], queries: [] });
    setMore({ pages: data.pages.more, queries: data.queries.more });
    setOpen(false);
  }
  const rows = useMemo(() => [...data[kind].rows, ...extra[kind]], [data, extra, kind]);
  const shown = open ? rows : rows.slice(0, 8);
  const maxClicks = Math.max(1, ...rows.map((r) => r.clicks));
  const isP = kind === "pages";

  async function loadMore() {
    setBusy(true);
    try {
      const d = (await call("/api/seo-analytics", { action: "rows", kind, days, offset: rows.length })) as unknown as { rows: DashRow[]; more: boolean };
      setExtra((x) => ({ ...x, [kind]: [...x[kind], ...d.rows] }));
      setMore((m) => ({ ...m, [kind]: d.more }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div className="aw-dash-sh">
        <h2>{isP ? "Pages" : "Searches"}</h2>
        <p>{isP ? "Google clicks next to what visitors did on the page" : "What people typed into Google before they found you"}</p>
        <span className="aw-dash-sh__r">
          <span className="aw-dash-tabs" role="group" aria-label="Pages or searches">
            <button type="button" className={isP ? "is-on" : ""} aria-pressed={isP} onClick={() => setKind("pages")}>
              Pages
            </button>
            <button type="button" className={!isP ? "is-on" : ""} aria-pressed={!isP} onClick={() => setKind("queries")}>
              Searches
            </button>
          </span>
        </span>
      </div>
      {focus && isP ? (
        <p className="aw-dash-focus">
          Showing <code>{focus}</code> first.{" "}
          <button type="button" className="aw-dash-link" onClick={onClearFocus}>
            Clear
          </button>
        </p>
      ) : null}
      <div className="aw-dash-surface aw-dash-tablewrap">
        {rows.length ? (
          <table className="aw-dash-tbl">
            <thead>
              <tr>
                <th>{isP ? "Page" : "Search"}</th>
                <th>Clicks</th>
                <th>Impressions</th>
                <th>CTR</th>
                <th>Position</th>
                {isP ? (
                  <>
                    <th>Sessions</th>
                    <th>Sign-ups</th>
                    <th>Conv. rate</th>
                    <th>From AI</th>
                  </>
                ) : (
                  <th />
                )}
                <th>28 days</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const low = r.ctr !== null && r.position !== null && r.impressions >= 100 && r.ctr < expectedCtr(r.position) * 0.6;
                const up = r.trend.length > 1 && r.trend[r.trend.length - 1] + r.trend[r.trend.length - 2] >= r.trend[0] + r.trend[1];
                return (
                  <tr key={r.key} className={focus === r.key ? "is-focus" : ""}>
                    <td>
                      {isP ? (
                        <span className="aw-dash-pg">
                          <a href={url(r.key)} target="_blank" rel="noopener noreferrer">
                            <b>{r.title ?? r.key}</b>
                          </a>
                          <span>
                            {r.title ? r.key : null}
                            {r.live ? <em className="aw-dash-live">{`${r.live.event === "refreshed" ? "Refreshed" : "Published"} ${day(r.live.at.slice(0, 10))}`}</em> : null}
                          </span>
                        </span>
                      ) : (
                        <b className="aw-dash-q">{r.key}</b>
                      )}
                    </td>
                    <td>
                      <span className="aw-dash-cbar">
                        <i style={{ width: `${Math.max(2, (r.clicks / maxClicks) * 70)}px` }} />
                        {n(r.clicks)}
                      </span>
                    </td>
                    <td>{compact(r.impressions)}</td>
                    <td className={low ? "aw-dash-low" : ""} title={low && r.position !== null ? `Results at position ${r.position.toFixed(1)} usually get about ${pct(expectedCtr(r.position))}` : undefined}>
                      {r.ctr === null ? "–" : `${pct(r.ctr)}${low ? " ↓" : ""}`}
                    </td>
                    <td>
                      {r.position === null ? (
                        "–"
                      ) : (
                        <span className="aw-dash-pos">
                          {r.position.toFixed(1)}
                          {r.position_change ? <small className={r.position_change < 0 ? "is-up" : "is-down"}>{`${r.position_change < 0 ? "↑" : "↓"}${Math.abs(r.position_change).toFixed(1)}`}</small> : null}
                        </span>
                      )}
                    </td>
                    {isP ? (
                      <>
                        <td>{r.sessions === null ? "–" : n(r.sessions)}</td>
                        <td>{r.conversions === null ? "–" : n(r.conversions)}</td>
                        <td className="aw-dash-cr">{r.sessions && r.conversions !== null ? pct(r.conversions / r.sessions) : "–"}</td>
                        <td>
                          <span className="aw-dash-aicol">
                            {r.cited.map((e) => (
                              <span key={e} title={`Cited by ${e} in your tracked prompts`}>
                                <BrandLogo src={ENGINE_LOGOS[e] ?? AI_LOGO[e] ?? ""} name={e} size={14} />
                              </span>
                            ))}
                            {r.ai_sessions === null ? "–" : n(r.ai_sessions)}
                          </span>
                        </td>
                      </>
                    ) : (
                      <td>
                        <button type="button" className="aw-dash-link" onClick={() => onResearch({ query: r.key, page: r.page, position: r.position, impressions: r.impressions, clicks: r.clicks })}>
                          Research
                        </button>
                      </td>
                    )}
                    <td>
                      <Spark values={r.trend} up={up} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="aw-dash-none aw-dash-pad">{isP ? "No pages with clicks or visits in this period yet." : data.gsc ? "No searches in this period yet." : "Pick a Search Console site to see what people search for."}</p>
        )}
        {rows.length ? (
          <div className="aw-dash-tfoot">
            <span>
              Showing {n(shown.length)}
              {more[kind] ? "" : ` of ${n(rows.length)}`}
            </span>
            {!open && rows.length > 8 ? (
              <button type="button" className="aw-dash-link" onClick={() => setOpen(true)}>
                View all
              </button>
            ) : more[kind] ? (
              <button type="button" className="aw-dash-link" onClick={() => {
                  setOpen(true);
                  void loadMore();
                }}
                disabled={busy}
              >
                {busy ? "Loading..." : "Show 25 more"}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

// ─────────────── Research from any search ───────────────

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
  const trend =
    main?.trend?.length && main.trend.length >= 6
      ? (() => {
          const t = main.trend;
          const a = t.slice(0, 3).reduce((x, y) => x + y, 0);
          const b = t.slice(-3).reduce((x, y) => x + y, 0);
          return a ? Math.round(((b - a) / a) * 100) : null;
        })()
      : null;
  const ctr = panel.impressions ? panel.clicks / panel.impressions : 0;
  const top3 = panel.position && panel.position > 3 ? Math.max(0, Math.round((expectedCtr(3) * panel.impressions - panel.clicks) * (30 / days))) : 0;

  return (
    <SidePanel kicker="Keyword research" title={panel.query} onClose={onClose} narrow>
      <div className="flex flex-col gap-5">
        {panel.position ? (
          <div className="aw-callout">
            <b>You rank #{panel.position.toFixed(1)}</b> with {n(panel.impressions)} impressions and a {pct(ctr)} click rate.{" "}
            {top3 ? `The top 3 usually get about ${pct(expectedCtr(3))} of clicks, so moving up could add about ${n(top3)} clicks a month.` : "You're already in the top 3."}
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
            <p className="aw-small">
              Uses 10 tasks from your plan.{" "}
              {panel.page ? (
                <a href={url(panel.page)} target="_blank" rel="noopener noreferrer">
                  Open the page
                </a>
              ) : null}
            </p>
          </>
        )}
      </div>
    </SidePanel>
  );
}
