"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  compareRange,
  countryName,
  daysIn,
  GSC_DIMS,
  GSC_TYPES,
  gscHasQueries,
  pathKey,
  plainWords,
  RANGE_LABEL,
  rangeOf,
  weekly,
  type CompareMode,
  type DateRange,
  type Filter,
  type GscDim,
  type GscType,
  type PageVisits,
  type RangeId,
} from "@/lib/googleReports";
import type { GscItem, GscPoint, GscReport as Data } from "@/lib/googleReportsServer";
import type { RunAuth } from "@/lib/runner";
import type { View } from "@/lib/view";
import { BrandLogo } from "../BrandLogo";
import { Modal } from "../reports/Dialog";
import { ErrorNote, favicon, SkeletonRows, Thinking } from "../ui";
import { GA4_LOGO, propertyName, type Call, type Status } from "./google";
import { AddFilter, ago, compact, FilterChips, GranPick, HeadTools, isoToday, LineChart, longKey, pathOf, shortKey, pinsAt, place, RangePicker, rate, ReportTable, Switch, TableTabs, Tiles, usePageActions, whole, type Col, type CsvRef, type Line, type Metric } from "./Report";
import { ResearchPanel, type Researched } from "./ResearchPanel";
import { errorText } from "@/lib/errors";

// Visibility › Analytics › Search Console: Google's Performance report inside Arrowsterr, read live from the
// Search Analytics API (googleReportsServer.ts). Ranges, search type, filters, four checkable totals that draw the
// chart, and the tables Google shows, with Research on any query and GA4 columns on pages.

type Totals = { clicks: number; impressions: number; ctr: number | null; position: number | null };
const METRICS: Metric<Totals>[] = [
  { key: "clicks", label: "Total clicks", tone: "is-c1", tip: "How many times people clicked through to the site from Google.", get: (t) => t.clicks, fmt: compact, change: "pct", whole: true },
  { key: "impressions", label: "Total impressions", tone: "is-c2", tip: "How many times a page of the site showed in Google's results.", get: (t) => t.impressions, fmt: compact, change: "pct", whole: true },
  { key: "ctr", label: "Average CTR", tone: "is-c3", tip: "Clicks divided by impressions.", get: (t) => t.ctr, fmt: rate, change: "pts" },
  { key: "position", label: "Average position", tone: "is-c4", tip: "The site's average spot in Google's results. 1 is the top.", get: (t) => t.position, fmt: place, change: "places", lower: true },
];
const COLUMN: Record<string, string> = { clicks: "Clicks", impressions: "Impressions", ctr: "CTR", position: "Position" };
const FIRST: Record<GscDim | "days", string> = { query: "Top queries", page: "Top pages", country: "Country", device: "Device", searchAppearance: "Search appearance", days: "Date" };
const TABS: { id: GscDim | "days"; label: string }[] = [
  { id: "query", label: "Queries" },
  { id: "page", label: "Pages" },
  { id: "country", label: "Countries" },
  { id: "device", label: "Devices" },
  { id: "searchAppearance", label: "Search appearance" },
  { id: "days", label: "Days" },
];
const COMPARE: { id: CompareMode; label: string }[] = [
  { id: "prev", label: "Previous period" },
  { id: "year", label: "Same period last year" },
  { id: "none", label: "Don't compare" },
];

/** "Compares with Aug 1 – Aug 28, 2026", or no change shown. */
const dates = (r: DateRange | null) => (r ? `The change under each number compares with ${shortKey(r.from)} – ${shortKey(r.to)}, ${r.to.slice(0, 4)}.` : "No change is shown under the numbers.");

type Row = { key: string; label: string; clicks: number; impressions: number; ctr: number | null; position: number | null; sessions?: number | null; keyEvents?: number | null; children?: Row[] };

/** Two points as one (a week): counts add, position is weighted by impressions. */
function addPoint(a: GscPoint, b: GscPoint): GscPoint {
  const placed = (a.position === null ? 0 : a.impressions) + (b.position === null ? 0 : b.impressions);
  const w = (p: GscPoint) => (p.position ?? 0) * p.impressions;
  return { key: a.key, clicks: a.clicks + b.clicks, impressions: a.impressions + b.impressions, position: placed ? (w(a) + w(b)) / placed : null };
}

export function GscReport({ status, call, view, auth, sb, canEdit, title, onSetup }: { status: Status; call: Call; view: View; auth: RunAuth; sb: SupabaseClient; canEdit: boolean; title: React.ReactNode; onSetup: () => void }) {
  const [rangeId, setRangeId] = useState<RangeId>("3m");
  const [custom, setCustom] = useState<DateRange | null>(null);
  const [type, setType] = useState<GscType>("web");
  const [compare, setCompare] = useState<CompareMode>("prev");
  const [filters, setFilters] = useState<Filter<GscDim>[]>([]);
  const [on, setOn] = useState<string[]>(["clicks", "impressions"]);
  const [weeks, setWeeks] = useState(false);
  const [picked, setTab] = useState<GscDim | "days">("query");
  const [gaCols, setGaCols] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState("");
  const [tries, setTries] = useState(0);
  const [noHourly, setNoHourly] = useState(false);
  const [visits, setVisits] = useState<Map<string, PageVisits> | null>(null);
  const [panel, setPanel] = useState<Researched | null>(null);
  const [dialog, setDialog] = useState(false);
  const csvRef: CsvRef = useRef(null);
  const actions = usePageActions({ view, sb, auth, canEdit });
  const range = useMemo(() => rangeOf(rangeId, isoToday(), custom), [rangeId, custom]);
  const hourly = rangeId === "24h";
  const queries = gscHasQueries(type);
  // Discover and Google News have no queries: their report opens on Pages.
  const tab = !queries && (picked === "query" || picked === "searchAppearance") ? "page" : picked;

  // What the page asked Google for. Until that answer lands, the old numbers stay, dimmed.
  const asked = JSON.stringify({ range, compare, type, filters, hourly });
  const busy = loaded !== asked;

  useEffect(() => {
    let live = true;
    call("/api/seo-analytics", { action: "gsc", range, compare, type, filters, hourly })
      .then((d) => {
        if (!live) return;
        if (d.noHourly) {
          setNoHourly(true);
          setRangeId("7d");
          return;
        }
        setData(d as unknown as Data);
        setError("");
      })
      .catch((e) => live && setError(errorText(e)))
      .finally(() => live && setLoaded(asked));
    return () => {
      live = false;
    };
  }, [call, range, compare, type, filters, hourly, asked, tries]);

  // GA4's sessions and key events by landing page, for the Pages table's GA4 columns.
  useEffect(() => {
    if (!gaCols || !status.ga4Property) return;
    let live = true;
    call("/api/seo-analytics", { action: "join", source: "ga4", range })
      .then((d) => live && setVisits(new Map((d.rows as PageVisits[]).map((r) => [r.path, r]))))
      .catch((e) => live && setError(errorText(e)));
    return () => {
      live = false;
    };
  }, [call, gaCols, status.ga4Property, range]);


  const metrics = METRICS.filter((m) => queries || m.key !== "position");
  const shownOn = on.filter((k) => metrics.some((m) => m.key === k));
  const toggle = (k: string) => setOn(on.includes(k) ? (shownOn.length > 1 ? on.filter((x) => x !== k) : on) : METRICS.map((m) => m.key).filter((x) => x === k || on.includes(x)));
  const vs = compare === "none" ? "" : compare === "year" ? "vs last year" : rangeId === "custom" ? "vs previous period" : `vs previous ${RANGE_LABEL[rangeId]}`;

  async function research(r: Row) {
    setPanel({ query: r.key, page: null, position: r.position, impressions: r.impressions, clicks: r.clicks });
    const d = await call("/api/seo-analytics", { action: "toppage", query: r.key, range }).catch(() => null);
    const page = d?.page ? pathOf(String(d.page)) : null;
    if (page) setPanel((p) => (p && p.query === r.key ? { ...p, page } : p));
  }

  const head = (
    <div className="aw-rep-title">
      {title}
      {status.gscProperty ? (
        <span className="aw-rep-title__end">
          <BrandLogo src={favicon(propertyName(status.gscProperty).split("/")[0])} name="" size={16} />
          {propertyName(status.gscProperty)}
          {canEdit ? (
            <button type="button" className="aw-text-link" onClick={onSetup}>
              Change
            </button>
          ) : null}
        </span>
      ) : null}
    </div>
  );

  if (!data)
    return (
      <div className="aw-rep">
        {head}
        {error ? <ErrorNote error={error} onRetry={() => (setError(""), setTries((t) => t + 1))} /> : <Thinking text="Reading Search Console..." />}
      </div>
    );

  // The chart: days (or weeks, or hours for 24 hours).
  const points = weeks && !data.hourly ? weekly(data.series, addPoint) : data.series;
  const keys = points.map((p) => p.key);
  const lines: Line[] = metrics
    .filter((m) => shownOn.includes(m.key))
    .map((m) => ({
      key: m.key,
      label: COLUMN[m.key],
      tone: m.tone,
      fmt: m.fmt,
      lower: m.lower,
      whole: m.whole,
      kind: m.change,
      values: points.map((p) => m.get({ clicks: p.clicks, impressions: p.impressions, ctr: p.impressions ? p.clicks / p.impressions : null, position: p.position })),
    }));

  // The table for the picked tab.
  const item = (x: GscItem, label: string): Row => ({ ...x, label });
  const tables = data.tables;
  const label = (dim: GscDim, key: string) => (dim === "page" ? pathOf(key) : dim === "country" ? countryName(key) : dim === "device" || dim === "searchAppearance" ? plainWords(key) : key);
  let rows: Row[] =
    tab === "days"
      ? data.series.map((p) => ({ key: p.key, label: longKey(p.key), clicks: p.clicks, impressions: p.impressions, ctr: p.impressions ? p.clicks / p.impressions : null, position: p.position }))
      : (tables[tab] ?? []).map((x) => item(x, label(tab, x.key)));
  const ga = tab === "page" && gaCols && Boolean(status.ga4Property);
  if (ga)
    rows = rows.map((r) => {
      const v = visits?.get(pathKey(r.key));
      return { ...r, sessions: visits ? (v?.sessions ?? 0) : null, keyEvents: visits ? (v?.keyEvents ?? 0) : null };
    });
  const cols: Col<Row>[] = [
    { id: "key", label: FIRST[tab], get: (r) => (tab === "days" ? r.key : r.label), show: (r) => <span title={tab === "page" ? r.key : undefined}>{r.label}</span>, text: tab !== "days", csv: FIRST[tab] },
    ...metrics
      .filter((m) => shownOn.includes(m.key))
      .map((m): Col<Row> => ({ id: m.key, label: COLUMN[m.key], tone: m.tone, get: (r) => m.get(r), show: (r) => (m.key === "clicks" || m.key === "impressions" ? whole(m.get(r)) : m.fmt(m.get(r))) })),
    ...(ga
      ? [
          { id: "sessions", label: "Sessions", get: (r: Row) => r.sessions ?? null, show: (r: Row) => whole(r.sessions ?? null) },
          { id: "keyEvents", label: "Sign-ups", get: (r: Row) => r.keyEvents ?? null, show: (r: Row) => whole(r.keyEvents ?? null) },
          { id: "conv", label: "Conv. rate", get: (r: Row) => (r.sessions ? (r.keyEvents ?? 0) / r.sessions : null), show: (r: Row) => rate(r.sessions ? (r.keyEvents ?? 0) / r.sessions : null) },
        ]
      : []),
  ];
  const tabs = TABS.filter((t) => t.id === "days" || (tables[t.id] !== null && (queries || (t.id !== "query" && t.id !== "searchAppearance"))));
  const typeLabel = GSC_TYPES.find((t) => t.id === type)?.label ?? "Web";

  return (
    <div className={`aw-rep ${busy ? "is-busy" : ""}`}>
      {head}
      <div className="aw-rep-bar">
        <RangePicker
          main={noHourly ? ["7d", "28d", "3m"] : ["24h", "7d", "28d", "3m"]}
          more={["6m", "12m", "16m"]}
          value={rangeId}
          custom={custom}
          onChange={(id, c) => {
            setRangeId(id);
            if (c) setCustom(c);
          }}
        />
        <span className="aw-rep-bar__sep" aria-hidden="true" />
        <button type="button" className="aw-ctl" aria-haspopup="dialog" onClick={() => setDialog(true)}>
          Search type: {typeLabel} ▾
        </button>
        <AddFilter
          dims={GSC_DIMS.filter((d) => queries || (d.id !== "query" && d.id !== "searchAppearance"))}
          choices={(d) => (d === "device" ? ["Desktop", "Mobile", "Tablet"] : d === "country" ? (tables.country?.map((r) => countryName(r.key)) ?? null) : d === "searchAppearance" ? (tables.searchAppearance?.length ? tables.searchAppearance.map((r) => plainWords(r.key)) : null) : null)}
          onAdd={(f) => setFilters([...filters, f])}
        />
        <FilterChips filters={filters} dims={GSC_DIMS} onRemove={(i) => setFilters(filters.filter((_, k) => k !== i))} />
        <span className="aw-rep-bar__end">
          {data.source === "synced" ? "From the daily sync. Google didn't answer just now." : `Last update: ${ago(data.at)}`}
        </span>
      </div>
      {actions.banner}
      {error ? <ErrorNote error={error} onRetry={() => (setError(""), setTries((t) => t + 1))} /> : null}

      <section className="aw-frame">
        <Tiles
          metrics={metrics}
          cur={data.totals.cur}
          prev={data.totals.prev}
          on={shownOn}
          onToggle={toggle}
          vs={vs}
          end={data.hourly ? <span className="aw-rep-form__hint">By hour</span> : <GranPick weeks={weeks} onChange={setWeeks} />}
        />
        <LineChart keys={keys} lines={lines} pins={pinsAt(keys, data.pins, weeks)} />
      </section>

      <section className="aw-frame">
        <TableTabs
          tabs={tabs}
          value={tab}
          onChange={setTab}
          tools={
            tab === "page" && status.ga4Property ? (
              <Switch on={gaCols} onChange={setGaCols} logo={GA4_LOGO}>
                GA4 columns
              </Switch>
            ) : null
          }
        />
        <ReportTable
          key={`${tab}-${ga}`}
          cols={cols}
          rows={rows}
          rowKey={(r) => r.key}
          initial={tab === "days" ? { key: "key", desc: true } : { key: shownOn.includes("clicks") ? "clicks" : shownOn[0], desc: !(shownOn[0] === "position" && !shownOn.includes("clicks")) }}
          name={TABS.find((t) => t.id === tab)!.label}
          csvRef={csvRef}
          empty={busy ? <SkeletonRows rows={6} cols={4} /> : "No data for these settings."}
          action={
            tab === "query"
              ? (r) => (
                  <button type="button" className="aw-text-link" onClick={() => void research(r)}>
                    Research →
                  </button>
                )
              : tab === "page"
                ? (r) => (
                    <a className="aw-text-link" href={actions.url(r.key)} target="_blank" rel="noopener noreferrer">
                      Open page ↗
                    </a>
                  )
                : undefined
          }
        />
      </section>

      <HeadTools csvRef={csvRef} file={`${view.brand.name} Search Console ${range.from} to ${range.to}`} />

      {dialog ? (
        <SearchType
          type={type}
          compare={compare}
          range={range}
          onClose={() => setDialog(false)}
          onApply={(t, c) => {
            setDialog(false);
            setType(t);
            setCompare(c);
          }}
        />
      ) : null}

      {panel ? (
        <ResearchPanel
          panel={panel}
          days={hourly ? 1 : daysIn(range)}
          auth={auth}
          canEdit={canEdit}
          siteOf={actions.siteOf}
          url={actions.url}
          onClose={() => setPanel(null)}
          onAdd={actions.toCalendar}
          onRefresh={(page, query) => {
            setPanel(null);
            actions.refreshPage(page, `It ranks #${panel.position ? Math.round(panel.position) : "?"} for “${query}” with ${whole(panel.impressions)} impressions.`, query);
          }}
        />
      ) : null}
    </div>
  );
}

/** Search type, as in Search Console: Filter picks the type, Compare picks the dates to compare with. */
function SearchType({ type, compare, range, onClose, onApply }: { type: GscType; compare: CompareMode; range: DateRange; onClose: () => void; onApply: (t: GscType, c: CompareMode) => void }) {
  const [tab, setTab] = useState<"filter" | "compare">("filter");
  const [t, setT] = useState(type);
  const [c, setC] = useState(compare);
  return (
    <Modal title="Search type" onClose={onClose} width="max-w-md">
      <div role="tablist" aria-label="Search type" className="aw-tabs">
        <button type="button" role="tab" aria-selected={tab === "filter"} onClick={() => setTab("filter")}>
          Filter
        </button>
        <button type="button" role="tab" aria-selected={tab === "compare"} onClick={() => setTab("compare")}>
          Compare
        </button>
      </div>
      <div className="aw-rep-radios" role="radiogroup" aria-label={tab === "filter" ? "Search type" : "Compare with"}>
        {(tab === "filter" ? GSC_TYPES : COMPARE).map((o) => (
          <label key={o.id} className="aw-rep-radio">
            <input type="radio" name={tab} checked={tab === "filter" ? t === o.id : c === o.id} onChange={() => (tab === "filter" ? setT(o.id as GscType) : setC(o.id as CompareMode))} />
            {o.label}
          </label>
        ))}
      </div>
      {tab === "compare" ? <p className="aw-small">{dates(compareRange(range, c))}</p> : null}
      <div className="tw-modal__actions">
        <button type="button" className="aw-btn aw-btn--secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="aw-btn aw-btn--primary" onClick={() => onApply(t, c)}>
          Apply
        </button>
      </div>
    </Modal>
  );
}
