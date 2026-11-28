"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Realtime } from "@/lib/google";
import {
  addSums,
  AI_CHANNEL,
  avgTime,
  citedPrompts,
  contentStatus,
  convRate,
  decliningPages,
  engagementRate,
  GA4_DIMS,
  NO_SUMS,
  pathKey,
  RANGE_LABEL,
  rangeOf,
  returningRate,
  returningUsers,
  weekly,
  type CompareMode,
  type ContentStatus,
  type DateRange,
  type Filter,
  type Ga4Dim,
  type Ga4Sums,
  type PageSearch,
  type RangeId,
  type SearchDecline,
} from "@/lib/googleReports";
import type { Ga4Report as Data } from "@/lib/googleReportsServer";
import type { RunAuth } from "@/lib/runner";
import type { ArticleResult } from "@/lib/seoAnalyticsServer";
import type { View } from "@/lib/view";
import { errorText } from "@/lib/errors";
import { BrandLogo } from "../BrandLogo";
import { Dropdown, Pop, useAnchoredPop } from "../Pickers";
import { Arrow, Chevron, ErrorNote, SidePanel, SkeletonRows, Thinking } from "../ui";
import { AI_LOGO, GSC_LOGO, type Call, type Status } from "./google";
import {
  AddFilter,
  ago,
  changeOf,
  compact,
  duration,
  FilterChips,
  GranPick,
  HeadTools,
  isoToday,
  LineChart,
  pinsAt,
  place,
  RangePicker,
  rate,
  ReportTable,
  shortKey,
  Switch,
  TableTabs,
  Tiles,
  usePageActions,
  whole,
  type Col,
  type CsvRef,
  type Line,
  type Metric,
} from "./Report";

// Visibility › Analytics › Google Analytics: GA4's reports inside Arrowsterr, read live from the Data API
// (googleReportsServer.ts). Ranges, compare, filters, checkable totals that draw the chart, and the tables: traffic
// sources with AI assistants as their own channel, AI referrals, landing pages (with Search Console columns), declining
// pages to refresh, the articles published from Arrowsterr, pages, key events, countries and devices. Every table has
// a search box and its own filters. Realtime active users sit by the title.

const METRICS: Metric<Ga4Sums>[] = [
  {
    key: "users",
    label: "Users",
    tone: "is-c1",
    tip: "People who visited the site.",
    get: (s) => s.users,
    fmt: compact,
    change: "pct",
    whole: true,
  },
  {
    key: "sessions",
    label: "Sessions",
    tone: "is-c2",
    tip: "Visits to the site. One person can visit many times.",
    get: (s) => s.sessions,
    fmt: compact,
    change: "pct",
    whole: true,
  },
  {
    key: "engagement",
    label: "Engagement rate",
    tone: "is-c3",
    tip: "Share of visits that lasted 10 seconds or more, saw two pages, or had a key event.",
    get: engagementRate,
    fmt: rate,
    change: "pts",
  },
  {
    key: "time",
    label: "Avg. engagement time",
    tone: "is-c5",
    tip: "How long the site was on screen for each person, on average.",
    get: avgTime,
    fmt: duration,
    change: "pct",
  },
  {
    key: "returning",
    label: "Returning users",
    tone: "is-c6",
    tip: "Share of users who had visited the site before.",
    get: returningRate,
    fmt: rate,
    change: "pts",
  },
  {
    key: "keyEvents",
    label: "Key events",
    tone: "is-c4",
    tip: "Actions marked as key events in GA4, like sign-ups.",
    get: (s) => s.keyEvents,
    fmt: compact,
    change: "pct",
    whole: true,
  },
];
type Tab = "traffic" | "ai" | "landing" | "declining" | "published" | "pages" | "events" | "countries" | "devices";
const TABS: { id: Tab; label: string }[] = [
  { id: "traffic", label: "Traffic sources" },
  { id: "ai", label: "AI referrals" },
  { id: "landing", label: "Landing pages" },
  { id: "declining", label: "Declining pages" },
  { id: "published", label: "Published content" },
  { id: "pages", label: "Pages" },
  { id: "events", label: "Key events" },
  { id: "countries", label: "Countries" },
  { id: "devices", label: "Devices" },
];
type Group = "channel" | "sourceMedium" | "campaign" | "nvr";
const GROUPS: { id: Group; label: string; first: string; search: string }[] = [
  {
    id: "channel",
    label: "Group by: Channel",
    first: "Channel",
    search: "Search channels",
  },
  {
    id: "sourceMedium",
    label: "Group by: Source / medium",
    first: "Source / medium",
    search: "Search sources",
  },
  {
    id: "campaign",
    label: "Group by: Campaign",
    first: "Campaign",
    search: "Search campaigns",
  },
  {
    id: "nvr",
    label: "Group by: New / returning",
    first: "New / returning",
    search: "Search user types",
  },
];
const COMPARE: { id: CompareMode; label: string }[] = [
  { id: "prev", label: "Compare: previous period" },
  { id: "year", label: "Compare: previous year" },
  { id: "none", label: "Compare: none" },
];
const SEARCH: Partial<Record<Tab, string>> = {
  ai: "Search landing pages",
  landing: "Search landing pages",
  declining: "Search landing pages",
  published: "Search articles",
  pages: "Search pages",
  events: "Search key events",
  countries: "Search countries",
  devices: "Search devices",
};
const STATUS_CLASS: Record<ContentStatus, string> = {
  Growing: "aw-status aw-status--ranked",
  New: "aw-status",
  Declining: "aw-status aw-status--warn",
};
const KEY_EVENTS_HELP = "https://support.google.com/analytics/answer/12844695";

// The last table tab, and the key events note once dismissed for a brand, are remembered on this device.
const TAB_KEY = "arrowsterr.analytics.ga4Tab";
const NOTE_KEY = "arrowsterr.analytics.keyEventsNote";
const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    // Private windows and blocked storage: the page works the same, it just doesn't remember.
  }
};

type Decline = {
  sessions: number;
  prev: number;
  change: number;
  search: SearchDecline | null;
};
type Row = {
  key: string;
  label: string;
  logo?: string;
  s: Ga4Sums;
  sub?: React.ReactNode;
  views?: number;
  clicks?: number | null;
  position?: number | null;
  prev?: number | null;
  aiBy?: Record<string, number>;
  cited?: string[];
  decline?: Decline;
  article?: ArticleResult;
  children?: Row[];
};

export function Ga4Report({ status, call, view, auth, sb, canEdit, title, onSetup }: { status: Status; call: Call; view: View; auth: RunAuth; sb: SupabaseClient; canEdit: boolean; title: React.ReactNode; onSetup: () => void }) {
  const [rangeId, setRangeId] = useState<RangeId>("28d");
  const [custom, setCustom] = useState<DateRange | null>(null);
  const [compare, setCompare] = useState<CompareMode>("prev");
  const [filters, setFilters] = useState<Filter<Ga4Dim>[]>([]);
  const [on, setOn] = useState<string[]>(["users", "keyEvents"]);
  const [weeks, setWeeks] = useState(false);
  const [tab, setTabState] = useState<Tab>(() => {
    const t = read(TAB_KEY);
    return TABS.some((x) => x.id === t) ? (t as Tab) : "traffic";
  });
  const [group, setGroup] = useState<Group>("channel");
  const [scCols, setScCols] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState("");
  const [tries, setTries] = useState(0);
  const [live, setLive] = useState<Realtime | null>(null);
  const [search, setSearch] = useState<Map<string, PageSearch> | null>(null);
  const [declines, setDeclines] = useState<Map<string, SearchDecline> | null>(null);
  const [articles, setArticles] = useState<ArticleResult[] | null>(null);
  const [noteHidden, setNoteHidden] = useState(() => read(`${NOTE_KEY}:${view.brand.id}`) === "hidden");
  const [promptsFor, setPromptsFor] = useState<string | null>(null);
  const livePop = useAnchoredPop();
  const csvRef: CsvRef = useRef(null);
  const actions = usePageActions({ view, sb, auth, canEdit });
  const range = useMemo(() => rangeOf(rangeId, isoToday(), custom), [rangeId, custom]);
  const hourly = rangeId === "today";
  const setTab = (t: Tab) => {
    setTabState(t);
    write(TAB_KEY, t);
  };

  // What the page asked Google for. Until that answer lands, the old numbers stay, dimmed.
  const asked = JSON.stringify({ range, compare, filters, hourly });
  const busy = loaded !== asked;

  useEffect(() => {
    let live = true;
    call("/api/seo-analytics", {
      action: "ga4",
      range,
      compare,
      filters,
      hourly,
    })
      .then((d) => {
        if (!live) return;
        setData(d as unknown as Data);
        setError("");
      })
      .catch((e) => live && setError(errorText(e)))
      .finally(() => live && setLoaded(asked));
    return () => {
      live = false;
    };
  }, [call, range, compare, filters, hourly, asked, tries]);

  // Active users in the last 30 minutes, every minute. Hidden when GA4's realtime report fails.
  useEffect(() => {
    let on = true;
    const read = () =>
      call("/api/seo-analytics", { action: "now" })
        .then((d) => on && setLive(typeof d.now === "number" ? (d as unknown as Realtime) : null))
        .catch(() => on && setLive(null));
    void read();
    const t = setInterval(read, 60_000);
    return () => {
      on = false;
      clearInterval(t);
    };
  }, [call]);

  // Search Console clicks and position by page, for the Landing pages table.
  useEffect(() => {
    if (!scCols || !status.gscProperty) return;
    let on = true;
    call("/api/seo-analytics", { action: "join", source: "gsc", range })
      .then((d) => on && setSearch(new Map((d.rows as PageSearch[]).map((r) => [r.path, r]))))
      .catch((e) => on && setError(errorText(e)));
    return () => {
      on = false;
    };
  }, [call, scCols, status.gscProperty, range]);

  // Search Console clicks in both periods and the search each page lost most, for Declining pages.
  useEffect(() => {
    if (tab !== "declining" || !status.gscProperty || compare === "none") return;
    let on = true;
    call("/api/seo-analytics", { action: "declines", range, compare })
      .then((d) => on && setDeclines(new Map((d.rows as SearchDecline[]).map((r) => [r.path, r]))))
      .catch(() => on && setDeclines(new Map()));
    return () => {
      on = false;
    };
  }, [call, tab, status.gscProperty, range, compare]);

  // Before and after for the articles published or refreshed from Arrowsterr, from the daily sync.
  useEffect(() => {
    if (tab !== "published" || articles) return;
    let on = true;
    call("/api/seo-analytics", { action: "results" })
      .then((d) => on && setArticles((d.results as ArticleResult[]) ?? []))
      .catch((e) => on && setError(errorText(e)));
    return () => {
      on = false;
    };
  }, [call, tab, articles]);

  const runs = view.current;
  const domain = view.brand.domain;
  const cited = useMemo(() => citedPrompts(runs.flatMap((r) => r.chats), domain), [runs, domain]);

  const toggle = (k: string) => setOn(on.includes(k) ? (on.length > 1 ? on.filter((x) => x !== k) : on) : METRICS.map((m) => m.key).filter((x) => x === k || on.includes(x)));
  const vs = compare === "none" ? "" : compare === "year" ? "vs last year" : rangeId === "custom" ? "vs previous period" : rangeId === "today" ? "vs yesterday" : `vs previous ${RANGE_LABEL[rangeId]}`;

  const head = (
    <div className="aw-rep-title">
      {title}
      {live ? (
        <>
          <button type="button" className="aw-rep-now" aria-haspopup="dialog" aria-expanded={Boolean(livePop.anchor)} onClick={(e) => livePop.toggle(e.currentTarget)}>
            <i aria-hidden="true" />
            {live.now.toLocaleString("en-US")} active {live.now === 1 ? "user" : "users"} · last 30 min
            <Chevron size={12} />
          </button>
          {livePop.anchor ? (
            <Pop anchor={livePop.anchor} onClose={livePop.close} label="Realtime" width={340}>
              <div className="aw-rep-live">
                <b>Realtime</b>
                <span>Active users by page, last 30 minutes.</span>
                {live.pages.length ? (
                  <table className="aw-table aw-table--compact">
                    <tbody>
                      {live.pages.map((p) => (
                        <tr key={p.name}>
                          <td>{p.name}</td>
                          <td className="aw-num text-right">{whole(p.users)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <span>No one on the site right now.</span>
                )}
                {live.countries.length ? <span>Country: {live.countries.map((c) => `${c.name} ${whole(c.users)}`).join(" · ")}</span> : null}
              </div>
            </Pop>
          ) : null}
        </>
      ) : null}
    </div>
  );

  if (!data)
    return (
      <div className="aw-rep">
        {head}
        {error ? <ErrorNote error={error} onRetry={() => (setError(""), setTries((t) => t + 1))} /> : <Thinking text="Reading Google Analytics..." />}
      </div>
    );

  const points = weeks && !data.hourly ? weekly(data.series, (a, b) => ({ key: a.key, ...addSums(a, b) })) : data.series;
  const keys = points.map((p) => p.key);
  const lines: Line[] = METRICS.filter((m) => on.includes(m.key)).map((m) => ({
    key: m.key,
    label: m.label,
    tone: m.tone,
    fmt: m.fmt,
    whole: m.whole,
    kind: m.change,
    values: points.map((p) => m.get(p)),
  }));

  const row = (key: string, s: Ga4Sums, extra: Partial<Row> = {}): Row => ({
    key,
    label: key,
    s,
    ...extra,
  });
  const totalSessions = data.totals.cur.sessions;
  const ai = data.ai;
  const assistants = ai.assistants.slice(0, 4);
  const compared = compare !== "none" && data.totals.prev !== null;
  let rows: Row[] = [];
  if (tab === "traffic")
    rows =
      group === "channel"
        ? data.channels.map((c) =>
            row(
              c.key,
              c.sums,
              c.children
                ? {
                    children: c.children.map((ch) =>
                      row(`${AI_CHANNEL}:${ch.key}`, ch.sums, {
                        label: ch.key,
                        logo: AI_LOGO[ch.key],
                      }),
                    ),
                  }
                : {},
            ),
          )
        : (group === "sourceMedium" ? data.sourceMedium : group === "campaign" ? data.campaigns : data.newVsReturning).map((x) => row(x.key, x.sums));
  if (tab === "ai")
    rows = ai.pages.map((p) => {
      const c = cited.get(p.path) ?? [];
      return row(p.path, p.sums, {
        aiBy: p.by,
        prev: p.prevSessions,
        cited: c,
        sub: c.length ? `Cited in ${c.length} tracked ${c.length === 1 ? "prompt" : "prompts"}` : "Not cited",
      });
    });
  if (tab === "landing")
    rows = data.landing.map((x) => {
      const g = search?.get(pathKey(x.key));
      return row(
        x.key,
        x.sums,
        scCols && status.gscProperty
          ? {
              clicks: search ? (g?.clicks ?? 0) : null,
              position: g?.position ?? null,
            }
          : {},
      );
    });
  if (tab === "declining")
    rows = decliningPages(data.landing).map((d) =>
      row(
        d.path,
        { ...NO_SUMS, sessions: d.sessions },
        {
          decline: {
            sessions: d.sessions,
            prev: d.prev,
            change: d.change,
            search: declines?.get(d.path) ?? null,
          },
        },
      ),
    );
  if (tab === "published")
    rows = (articles ?? []).map((a) =>
      row(
        a.page,
        {
          ...NO_SUMS,
          sessions: a.result?.sessions.after ?? 0,
          keyEvents: a.result?.conversions.after ?? 0,
        },
        {
          label: a.keyword,
          article: a,
          sub: `${a.page} · ${a.event === "refreshed" ? "Updated by Zippie" : "Zippie"}`,
        },
      ),
    );
  if (tab === "pages")
    rows = data.pages.map((p) =>
      row(
        p.key,
        {
          ...NO_SUMS,
          users: p.users,
          duration: p.duration,
          active: p.active,
          keyEvents: p.keyEvents,
        },
        { views: p.views },
      ),
    );
  if (tab === "events") rows = data.events.map((e) => row(e.key, { ...NO_SUMS, keyEvents: e.count }, { prev: e.prev }));
  if (tab === "countries") rows = data.countries.map((x) => row(x.key, x.sums));
  if (tab === "devices")
    rows = data.devices.map((x) =>
      row(x.key, x.sums, {
        label: x.key ? x.key.charAt(0).toUpperCase() + x.key.slice(1) : x.key,
      }),
    );

  const num = (id: string, label: string, get: (r: Row) => number | null, show: (v: number | null) => string): Col<Row> => ({ id, label, get, show: (r) => show(get(r)) });
  const change = (id: string, label: string, get: (r: Row) => number | null): Col<Row> => ({
    id,
    label,
    get,
    show: (r) => {
      const v = get(r);
      if (v === null) return "–";
      const d = Math.round(v * 100);
      return <span className={d >= 0 ? "text-pos" : "text-neg"}>{`${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(d)}%`}</span>;
    },
  });
  const sessions = num("sessions", "Sessions", (r) => r.s.sessions, whole);
  const users = num("users", "Users", (r) => r.s.users, whole);
  const newUsers = num("newUsers", "New users", (r) => r.s.newUsers, whole);
  const returning = num("returning", "Returning users", (r) => returningUsers(r.s), whole);
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
    show: (r) => (
      <>
        {r.logo !== undefined || r.key.startsWith(`${AI_CHANNEL}:`) ? (
          <span className="inline-flex items-center gap-2">
            <BrandLogo src={r.logo ?? ""} name={r.label} size={16} />
            {r.label}
          </span>
        ) : (
          r.label
        )}
        {r.sub ? <span className="aw-rep-sub">{r.sub}</span> : null}
      </>
    ),
  });
  const tool = (id: string, label: string, show: (r: Row) => React.ReactNode): Col<Row> => ({ id, label, csv: label, tool: true, get: () => null, show });
  const sc = tab === "landing" && scCols && Boolean(status.gscProperty);
  const pos = (v: number | null) => (v === null ? "–" : `#${Math.round(v)}`);
  const groupDef = GROUPS.find((g) => g.id === group)!;
  const cols: Col<Row>[] =
    tab === "traffic"
      ? [first(groupDef.first), sessions, users, newUsers, returning, eng, time, key, conv]
      : tab === "ai"
        ? [
            first("Landing page"),
            num("aiSessions", "AI sessions", (r) => r.s.sessions, whole),
            ...assistants.map((a) => ({
              ...num(`ai:${a}`, a, (r) => r.aiBy?.[a] ?? 0, whole),
              csv: a,
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <BrandLogo src={AI_LOGO[a] ?? ""} name={a} size={14} />
                  {a}
                </span>
              ),
            })),
            time,
            ...(compared ? [change("change", "Change", (r) => (r.prev ? (r.s.sessions - r.prev) / r.prev : null))] : []),
            tool("prompts", "Prompts", (r) =>
              r.cited?.length ? (
                <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => setPromptsFor(r.key)}>
                  Prompts
                </button>
              ) : null,
            ),
          ]
        : tab === "landing"
          ? [first("Landing page"), sessions, eng, time, key, conv, ...(sc ? [num("clicks", "Google clicks", (r) => r.clicks ?? null, whole), num("position", "Position", (r) => r.position ?? null, place)] : [])]
          : tab === "declining"
            ? [
                first("Landing page"),
                num("sessions", "Sessions", (r) => r.decline?.sessions ?? null, whole),
                num("previous", "Previous", (r) => r.decline?.prev ?? null, whole),
                change("change", "Change", (r) => r.decline?.change ?? null),
                ...(status.gscProperty
                  ? [
                      change("organic", "Organic clicks", (r) => (r.decline?.search?.prevClicks ? (r.decline.search.clicks - r.decline.search.prevClicks) / r.decline.search.prevClicks : null)),
                      {
                        id: "query",
                        label: "Top declining query",
                        text: true,
                        get: (r: Row) => r.decline?.search?.query ?? null,
                        show: (r: Row) =>
                          r.decline?.search?.query ? (
                            <span className="aw-rep-query">
                              {r.decline.search.query}
                              <span className="aw-rep-sub">
                                {pos(r.decline.search.from)} <Arrow /> {pos(r.decline.search.to)}
                              </span>
                            </span>
                          ) : declines ? (
                            "–"
                          ) : (
                            <span className="aw-shimmer h-3 w-24" aria-label="Loading" />
                          ),
                      } satisfies Col<Row>,
                    ]
                  : []),
                ...(canEdit
                  ? [
                      tool("refresh", "Refresh", (r) => (
                        <button
                          type="button"
                          className="aw-btn aw-btn--secondary aw-btn--sm"
                          onClick={() => actions.refreshPage(r.key, `Its sessions fell from ${whole(r.decline?.prev ?? null)} to ${whole(r.decline?.sessions ?? null)} between ${range.from} and ${range.to}.`, r.decline?.search?.query)}
                        >
                          Refresh
                        </button>
                      )),
                    ]
                  : []),
              ]
            : tab === "published"
              ? [
                  first("Article"),
                  {
                    id: "published",
                    label: "Published",
                    get: (r) => r.article?.at ?? null,
                    show: (r) => (r.article ? shortKey(r.article.at.slice(0, 10)) : "–"),
                  },
                  num("sessions", "Sessions", (r) => r.article?.result?.sessions.after ?? null, whole),
                  num("keyEvents", "Key events", (r) => r.article?.result?.conversions.after ?? null, whole),
                  {
                    id: "position",
                    label: "Avg. position",
                    get: (r) => r.article?.result?.position.after ?? null,
                    show: (r) => {
                      const p = r.article?.result?.position;
                      return p?.after ? (
                        <>
                          {pos(p.after)}
                          {p.before ? <span className="aw-rep-sub">was {pos(p.before)}</span> : null}
                        </>
                      ) : (
                        "–"
                      );
                    },
                  },
                  num("aiSessions", "AI sessions", (r) => r.article?.result?.ai_sessions.after ?? null, whole),
                  {
                    id: "status",
                    label: "Status",
                    text: true,
                    get: (r) => statusOf(r.article),
                    show: (r) => <span className={STATUS_CLASS[statusOf(r.article)]}>{statusOf(r.article)}</span>,
                  },
                ]
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
  const keyEventsNote = data.source === "live" && !data.hourly && data.totals.cur.sessions > 0 && data.totals.cur.keyEvents === 0 && !noteHidden;
  const empty = busy ? (
    <SkeletonRows rows={6} cols={4} />
  ) : data.source === "synced" ? (
    "Not in the daily sync. It shows again when Google answers."
  ) : tab === "ai" ? (
    "No sessions from AI assistants in this period."
  ) : tab === "declining" ? (
    compared ? (
      "No landing page lost 10% or more of its sessions."
    ) : (
      "Pick a comparison to see which pages lost traffic."
    )
  ) : tab === "published" ? (
    articles ? (
      "Nothing published from Arrowsterr yet. Articles you publish or refresh show here."
    ) : (
      <SkeletonRows rows={4} cols={4} />
    )
  ) : (
    "No data for these settings."
  );
  const aiKeys = data.series.map((p) => p.key);
  const aiDays = new Map(ai.series.map((d) => [d.key, d.by]));
  const aiChange = changeOf("pct", ai.sums.sessions, compared ? ai.prevSessions : null);
  // The prompts that cite the open page, each with the AI engines whose answers cite it.
  const promptList = (promptsFor ? (cited.get(promptsFor) ?? []) : []).map((prompt) => ({
    prompt,
    engines: [
      ...new Set(
        view.current
          .flatMap((r) => r.chats)
          .filter((c) => c.prompt === prompt && c.sources?.some((s) => pathKey(s.url) === promptsFor))
          .map((c) => c.engine),
      ),
    ],
  }));

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
          choices={(d) =>
            d === "channel" ? channelChoices : d === "device" ? (data.devices.length ? data.devices.map((x) => x.key) : ["desktop", "mobile", "tablet"]) : d === "country" && data.countries.length ? data.countries.map((x) => x.key) : null
          }
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
      {error ? <ErrorNote error={error} onRetry={() => (setError(""), setTries((t) => t + 1))} /> : null}
      {keyEventsNote ? (
        <div className="aw-callout aw-rep-note">
          <span className="min-w-0 flex-1">
            <b>No key events set up</b>
            <span>Mark sign-ups or purchases as key events in GA4 to see conversions by page and channel.</span>
          </span>
          <button
            type="button"
            className="aw-btn aw-btn--secondary aw-btn--sm"
            onClick={() => {
              setNoteHidden(true);
              write(`${NOTE_KEY}:${view.brand.id}`, "hidden");
            }}
          >
            Dismiss
          </button>
          <a className="aw-btn aw-btn--primary aw-btn--sm" href={KEY_EVENTS_HELP} target="_blank" rel="noopener noreferrer">
            Set up
          </a>
        </div>
      ) : null}

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
        {tab === "ai" && ai.sums.sessions ? (
          <>
            <div className="aw-stats aw-stats--tight aw-stats--flat" style={{ ["--cols" as string]: 3 }}>
              <div className="aw-stat">
                <div className="aw-stat__lab">AI sessions</div>
                <span className="aw-stat__num">{whole(ai.sums.sessions)}</span>
                {aiChange ? <span className={`aw-rep-tile__delta ${aiChange.good ? "is-up" : "is-down"}`}> {aiChange.text}</span> : null}
              </div>
              <div className="aw-stat">
                <div className="aw-stat__lab">Share of sessions</div>
                <span className="aw-stat__num">{rate(ai.share)}</span>
              </div>
              <div className="aw-stat">
                <div className="aw-stat__lab">Avg. engagement time</div>
                <span className="aw-stat__num">{duration(avgTime(ai.sums))}</span>
              </div>
            </div>
            <LineChart
              keys={aiKeys}
              lines={ai.assistants.slice(0, 5).map((a, i) => ({
                key: a,
                label: a,
                logo: AI_LOGO[a] ?? "",
                tone: `is-c${i + 1}`,
                fmt: whole,
                whole: true,
                kind: "pct",
                values: aiKeys.map((k) => aiDays.get(k)?.[a] ?? 0),
              }))}
              pins={[]}
              axis="AI sessions"
            />
          </>
        ) : null}
        <ReportTable
          key={`${tab}-${group}-${sc}`}
          cols={cols}
          rows={rows}
          rowKey={(r) => r.key}
          initial={{
            key: tab === "pages" ? "views" : tab === "events" ? "count" : tab === "ai" ? "aiSessions" : tab === "declining" ? "previous" : tab === "published" ? "published" : "sessions",
            desc: true,
          }}
          name={tab === "traffic" ? groupDef.first : TABS.find((t) => t.id === tab)!.label}
          search={tab === "traffic" ? groupDef.search : (SEARCH[tab] ?? "Search")}
          csvRef={csvRef}
          empty={empty}
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
        {tab === "declining" && rows.length && canEdit ? <p className="aw-rep-foot aw-rep-foot--note">Refresh sends the page to Zippie. You review the changes before anything goes live.</p> : null}
      </section>

      {promptsFor ? (
        <SidePanel kicker="Prompts" title={promptsFor} onClose={() => setPromptsFor(null)} narrow>
          <p className="aw-small">Tracked prompts whose AI answers cite this page, in the current period.</p>
          <ul className="aw-rep-prompts">
            {promptList.map((p) => (
              <li key={p.prompt}>
                <span>{p.prompt}</span>
                <span className="aw-rep-sub">Cited by {p.engines.join(", ")}</span>
              </li>
            ))}
          </ul>
        </SidePanel>
      ) : null}

      <HeadTools csvRef={csvRef} file={`${view.brand.name} Google Analytics ${range.from} to ${range.to}`} />
    </div>
  );
}

/** An article's status from its before and after (contentStatus in googleReports.ts). */
function statusOf(a: ArticleResult | undefined): ContentStatus {
  const r = a?.result;
  if (!a || !r) return "New";
  return contentStatus({
    days: a.days,
    clicksBefore: r.clicks.before ?? 0,
    clicksAfter: r.clicks.after ?? 0,
    sessionsBefore: r.sessions.before ?? 0,
    sessionsAfter: r.sessions.after ?? 0,
  });
}
