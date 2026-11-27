"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useMemo, useRef, useState } from "react";
import { addSums, AI_CHANNEL, avgTime, convRate, engagementRate, GA4_DIMS, NO_SUMS, pathKey, RANGE_LABEL, rangeOf, weekly, type CompareMode, type DateRange, type Filter, type Ga4Dim, type Ga4Sums, type PageSearch, type RangeId } from "@/lib/googleReports";
import type { Ga4Report as Data } from "@/lib/googleReportsServer";
import type { RunAuth } from "@/lib/runner";
import type { View } from "@/lib/view";
import { BrandLogo } from "../BrandLogo";
import { Dropdown } from "../Pickers";
import { SkeletonRows, Thinking } from "../ui";
import { AI_LOGO, GSC_LOGO, type Call, type Status } from "./google";
import { AddFilter, ago, changeOf, compact, duration, FilterChips, GranPick, HeadTools, isoToday, LineChart, pinsAt, place, RangePicker, rate, ReportTable, Switch, TableTabs, Tiles, usePageActions, whole, type Col, type CsvRef, type Line, type Metric } from "./Report";

// Visibility › Analytics › Google Analytics: GA4's reports inside Arrowsterr, read live from the Data API
// (googleReportsServer.ts). Ranges, compare, filters, five checkable totals that draw the chart, traffic sources with
// AI assistants as their own channel, landing pages with Search Console columns, pages, key events, countries, devices.

const METRICS: Metric<Ga4Sums>[] = [
  { key: "users", label: "Users", tone: "is-c1", tip: "People who visited the site.", get: (s) => s.users, fmt: compact, change: "pct", whole: true },
  { key: "sessions", label: "Sessions", tone: "is-c2", tip: "Visits to the site. One person can visit many times.", get: (s) => s.sessions, fmt: compact, change: "pct", whole: true },
  { key: "engagement", label: "Engagement rate", tone: "is-c3", tip: "Share of visits that lasted 10 seconds or more, saw two pages, or had a key event.", get: engagementRate, fmt: rate, change: "pts" },
  { key: "time", label: "Avg. engagement time", tone: "is-c5", tip: "How long the site was on screen for each person, on average.", get: avgTime, fmt: duration, change: "pct" },
  { key: "keyEvents", label: "Key events", tone: "is-c4", tip: "Actions marked as key events in GA4, like sign-ups.", get: (s) => s.keyEvents, fmt: compact, change: "pct", whole: true },
];
type Tab = "traffic" | "landing" | "pages" | "events" | "countries" | "devices";
const TABS: { id: Tab; label: string }[] = [
  { id: "traffic", label: "Traffic sources" },
  { id: "landing", label: "Landing pages" },
  { id: "pages", label: "Pages" },
  { id: "events", label: "Key events" },
  { id: "countries", label: "Countries" },
  { id: "devices", label: "Devices" },
];
type Group = "channel" | "sourceMedium" | "campaign";
const GROUPS: { id: Group; label: string }[] = [
  { id: "channel", label: "Group by: Channel" },
  { id: "sourceMedium", label: "Group by: Source / medium" },
  { id: "campaign", label: "Group by: Campaign" },
];
const COMPARE: { id: CompareMode; label: string }[] = [
  { id: "prev", label: "Compare: previous period" },
  { id: "year", label: "Compare: previous year" },
  { id: "none", label: "Compare: none" },
];

type Row = { key: string; label: string; logo?: string; s: Ga4Sums; views?: number; clicks?: number | null; position?: number | null; prev?: number | null; children?: Row[] };

export function Ga4Report({ status, call, view, auth, sb, canEdit, title, onSetup }: { status: Status; call: Call; view: View; auth: RunAuth; sb: SupabaseClient; canEdit: boolean; title: React.ReactNode; onSetup: () => void }) {
  const [rangeId, setRangeId] = useState<RangeId>("28d");
  const [custom, setCustom] = useState<DateRange | null>(null);
  const [compare, setCompare] = useState<CompareMode>("prev");
  const [filters, setFilters] = useState<Filter<Ga4Dim>[]>([]);
  const [on, setOn] = useState<string[]>(["users", "keyEvents"]);
  const [weeks, setWeeks] = useState(false);
  const [tab, setTab] = useState<Tab>("traffic");
  const [group, setGroup] = useState<Group>("channel");
  const [scCols, setScCols] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState("");
  const [now, setNow] = useState<number | null>(null);
  const [search, setSearch] = useState<Map<string, PageSearch> | null>(null);
  const csvRef: CsvRef = useRef(null);
  const actions = usePageActions({ view, sb, auth, canEdit });
  const range = useMemo(() => rangeOf(rangeId, isoToday(), custom), [rangeId, custom]);
  const hourly = rangeId === "today";

  // What the page asked Google for. Until that answer lands, the old numbers stay, dimmed.
  const asked = JSON.stringify({ range, compare, filters, hourly });
  const busy = loaded !== asked;

  useEffect(() => {
    let live = true;
    call("/api/seo-analytics", { action: "ga4", range, compare, filters, hourly })
      .then((d) => {
        if (!live) return;
        setData(d as unknown as Data);
        setError("");
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => live && setLoaded(asked));
    return () => {
      live = false;
    };
  }, [call, range, compare, filters, hourly, asked]);

  // People on the site now, every minute. Hidden when GA4's realtime report fails.
  useEffect(() => {
    let live = true;
    const read = () =>
      call("/api/seo-analytics", { action: "now" })
        .then((d) => live && setNow(typeof d.now === "number" ? d.now : null))
        .catch(() => live && setNow(null));
    void read();
    const t = setInterval(read, 60_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [call]);

  // Search Console clicks and position by page, for the Landing pages table.
  useEffect(() => {
    if (!scCols || !status.gscProperty) return;
    let live = true;
    call("/api/seo-analytics", { action: "join", source: "gsc", range })
      .then((d) => live && setSearch(new Map((d.rows as PageSearch[]).map((r) => [r.path, r]))))
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [call, scCols, status.gscProperty, range]);

  const toggle = (k: string) => setOn(on.includes(k) ? (on.length > 1 ? on.filter((x) => x !== k) : on) : METRICS.map((m) => m.key).filter((x) => x === k || on.includes(x)));
  const vs = compare === "none" ? "" : compare === "year" ? "vs last year" : rangeId === "custom" ? "vs previous period" : rangeId === "today" ? "vs yesterday" : `vs previous ${RANGE_LABEL[rangeId]}`;

  const head = (
    <div className="aw-rep-title">
      {title}
      {now !== null ? (
        <span className="aw-rep-now">
          <i aria-hidden="true" />
          {now.toLocaleString("en-US")} {now === 1 ? "person" : "people"} on the site now
        </span>
      ) : null}
    </div>
  );

  if (!data)
    return (
      <div className="aw-rep">
        {head}
        {error ? <p className="aw-error">{error}</p> : <Thinking text="Reading Google Analytics..." />}
      </div>
    );

  const points = weeks && !data.hourly ? weekly(data.series, (a, b) => ({ key: a.key, ...addSums(a, b) })) : data.series;
  const keys = points.map((p) => p.key);
  const lines: Line[] = METRICS.filter((m) => on.includes(m.key)).map((m) => ({ key: m.key, label: m.label, tone: m.tone, fmt: m.fmt, whole: m.whole, kind: m.change, values: points.map((p) => m.get(p)) }));

  const row = (key: string, s: Ga4Sums, extra: Partial<Row> = {}): Row => ({ key, label: key, s, ...extra });
  const totalSessions = data.totals.cur.sessions;
  let rows: Row[] = [];
  if (tab === "traffic")
    rows =
      group === "channel"
        ? data.channels.map((c) => row(c.key, c.sums, c.children ? { children: c.children.map((ch) => row(`${AI_CHANNEL}:${ch.key}`, ch.sums, { label: ch.key, logo: AI_LOGO[ch.key] })) } : {}))
        : (group === "sourceMedium" ? data.sourceMedium : data.campaigns).map((x) => row(x.key, x.sums));
  if (tab === "landing")
    rows = data.landing.map((x) => {
      const g = search?.get(pathKey(x.key));
      return row(x.key, x.sums, scCols && status.gscProperty ? { clicks: search ? (g?.clicks ?? 0) : null, position: g?.position ?? null } : {});
    });
  if (tab === "pages") rows = data.pages.map((p) => row(p.key, { ...NO_SUMS, users: p.users, duration: p.duration, active: p.active, keyEvents: p.keyEvents }, { views: p.views }));
  if (tab === "events") rows = data.events.map((e) => row(e.key, { ...NO_SUMS, keyEvents: e.count }, { prev: e.prev }));
  if (tab === "countries") rows = data.countries.map((x) => row(x.key, x.sums));
  if (tab === "devices") rows = data.devices.map((x) => row(x.key, x.sums, { label: x.key ? x.key.charAt(0).toUpperCase() + x.key.slice(1) : x.key }));

  const num = (id: string, label: string, get: (r: Row) => number | null, show: (v: number | null) => string): Col<Row> => ({ id, label, get, show: (r) => show(get(r)) });
  const sessions = num("sessions", "Sessions", (r) => r.s.sessions, whole);
  const users = num("users", "Users", (r) => r.s.users, whole);
  const eng = num("engagement", "Engagement rate", (r) => engagementRate(r.s), rate);
  const time = num("time", "Avg. engagement time", (r) => avgTime(r.s), duration);
  const key = num("keyEvents", "Key events", (r) => r.s.keyEvents, whole);
  const conv = num("conv", "Conv. rate", (r) => convRate(r.s), rate);
  const first = (label: string): Col<Row> => ({
    id: "name",
    label,
    text: true,
    get: (r) => r.label,
    csv: label,
    show: (r) =>
      r.logo !== undefined || r.key.startsWith(`${AI_CHANNEL}:`) ? (
        <span className="inline-flex items-center gap-2">
          <BrandLogo src={r.logo ?? ""} name={r.label} size={16} />
          {r.label}
        </span>
      ) : (
        r.label
      ),
  });
  const sc = tab === "landing" && scCols && Boolean(status.gscProperty);
  const cols: Col<Row>[] =
    tab === "traffic"
      ? [first(group === "channel" ? "Channel" : group === "sourceMedium" ? "Source / medium" : "Campaign"), sessions, users, eng, time, key, conv]
      : tab === "landing"
        ? [first("Landing page"), sessions, eng, time, key, conv, ...(sc ? [num("clicks", "Google clicks", (r) => r.clicks ?? null, whole), num("position", "Position", (r) => r.position ?? null, place)] : [])]
        : tab === "pages"
          ? [first("Page path"), num("views", "Views", (r) => r.views ?? null, whole), users, num("time", "Avg. engagement time", (r) => avgTime(r.s), duration), key]
          : tab === "events"
            ? [
                first("Key event"),
                num("count", "Count", (r) => r.s.keyEvents, whole),
                {
                  id: "change",
                  label: "Change",
                  get: (r) => (r.prev ? (r.s.keyEvents - r.prev) / r.prev : null),
                  show: (r) => {
                    const c = changeOf("pct", r.s.keyEvents, r.prev ?? null);
                    return c ? <span className={c.good ? "text-pos" : "text-neg"}>{c.text}</span> : "–";
                  },
                },
                num("conv", "Conv. rate", (r) => (totalSessions ? r.s.keyEvents / totalSessions : null), rate),
              ]
            : [first(tab === "countries" ? "Country" : "Device"), sessions, users, eng, key, conv];

  const channelChoices = [...new Set([...data.channels.map((c) => c.key), "Organic Search", "Direct", "Referral", AI_CHANNEL])];

  return (
    <div className={`aw-rep ${busy ? "is-busy" : ""}`}>
      {head}
      <div className="aw-rep-bar">
        <RangePicker
          main={["today", "7d", "28d", "3m"]}
          more={["6m", "12m"]}
          value={rangeId}
          custom={custom}
          onChange={(id, c) => {
            setRangeId(id);
            if (c) setCustom(c);
          }}
        />
        <span className="aw-rep-bar__sep" aria-hidden="true" />
        <Dropdown label="Compare" value={compare} onChange={setCompare} options={COMPARE} />
        <AddFilter
          dims={GA4_DIMS}
          choices={(d) => (d === "channel" ? channelChoices : d === "device" ? (data.devices.length ? data.devices.map((x) => x.key) : ["desktop", "mobile", "tablet"]) : d === "country" && data.countries.length ? data.countries.map((x) => x.key) : null)}
          onAdd={(f) => setFilters([...filters, f])}
        />
        <FilterChips filters={filters} dims={GA4_DIMS} onRemove={(i) => setFilters(filters.filter((_, k) => k !== i))} />
        <span className="aw-rep-bar__end">
          {data.source === "synced" ? "From the daily sync. Google didn't answer just now." : `Property: ${status.ga4Name ?? "GA4"} · ${status.ga4Property} · ${ago(data.at)}`}
          {canEdit ? (
            <button type="button" className="aw-text-link" onClick={onSetup}>
              Change
            </button>
          ) : null}
        </span>
      </div>
      {actions.banner}
      {error ? <p className="aw-error">{error}</p> : null}

      <section className="aw-frame">
        <Tiles metrics={METRICS} cur={data.totals.cur} prev={data.totals.prev} on={on} onToggle={toggle} vs={vs} end={data.hourly ? <span className="aw-rep-form__hint">By hour</span> : <GranPick weeks={weeks} onChange={setWeeks} />} />
        <LineChart keys={keys} lines={lines} pins={pinsAt(keys, data.pins, weeks)} />
      </section>

      <section className="aw-frame">
        <TableTabs
          tabs={TABS}
          value={tab}
          onChange={setTab}
          tools={
            tab === "traffic" ? (
              <Dropdown label="Group by" value={group} onChange={setGroup} className="aw-dropdown--sm" options={GROUPS} />
            ) : tab === "landing" && status.gscProperty ? (
              <Switch on={scCols} onChange={setScCols} logo={GSC_LOGO}>
                Search Console columns
              </Switch>
            ) : null
          }
        />
        <ReportTable
          key={`${tab}-${group}-${sc}`}
          cols={cols}
          rows={rows}
          rowKey={(r) => r.key}
          initial={{ key: tab === "pages" ? "views" : tab === "events" ? "count" : "sessions", desc: true }}
          name={tab === "traffic" ? GROUPS.find((g) => g.id === group)!.label.replace("Group by: ", "") : TABS.find((t) => t.id === tab)!.label}
          csvRef={csvRef}
          empty={busy ? <SkeletonRows rows={6} cols={4} /> : data.source === "synced" ? "Not in the daily sync. It shows again when Google answers." : "No data for these settings."}
          action={
            tab === "landing" && canEdit
              ? (r) => (
                  <button type="button" className="aw-text-link" onClick={() => actions.refreshPage(r.key, `It had ${whole(r.s.sessions)} sessions and ${whole(r.s.keyEvents)} key events from ${range.from} to ${range.to}.`)}>
                    Refresh page →
                  </button>
                )
              : undefined
          }
        />
      </section>

      <HeadTools csvRef={csvRef} file={`${view.brand.name} Google Analytics ${range.from} to ${range.to}`} />
    </div>
  );
}
