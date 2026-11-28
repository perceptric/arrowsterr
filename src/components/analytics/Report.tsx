"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { addCalendarItems, siteForBrand, type Site } from "@/lib/db";
import { cellMatches, RANGE_LABEL, toCsv, type DateRange, type Filter, type FilterOp, OP_LABEL, type RangeId, type TableOp } from "@/lib/googleReports";
import { stageFromIntent } from "@/lib/research";
import type { RunAuth } from "@/lib/runner";
import type { View } from "@/lib/view";
import { BrandLogo } from "../BrandLogo";
import { DateField, Dropdown, Pop, useAnchoredPop } from "../Pickers";
import { Chevron, ErrorNote, Seg, sortRows, SortTh, Tip, useSort, type Sort } from "../ui";
import { useZippieMaybe } from "../zippie/ZippieContext";
import type { CalendarPick, CalendarResult } from "./ResearchPanel";
import { errorText } from "@/lib/errors";

// The parts both Analytics reports share (GscReport.tsx, Ga4Report.tsx): the range picker, filters as chips, the
// checkable number tiles that draw the chart, the line chart, the sortable paged table, the Export menu in the
// header bar, and the page actions (refresh a page, add to the Calendar). Styles: the aw-rep section of globals.css.

// ─────────────── Numbers ───────────────

export const whole = (v: number | null) => (v === null ? "–" : Math.round(v).toLocaleString("en-US"));
export const compact = (v: number | null) => (v === null ? "–" : Math.abs(v) >= 10_000 ? new Intl.NumberFormat("en-US", { notation: "compact", maximumSignificantDigits: 3 }).format(v) : whole(v));
export const rate = (v: number | null) => (v === null ? "–" : `${(v * 100).toFixed(1)}%`);
export const place = (v: number | null) => (v === null ? "–" : v.toFixed(1));
export const duration = (v: number | null) => (v === null ? "–" : `${Math.floor(v / 60)}m ${String(Math.round(v % 60)).padStart(2, "0")}s`);
export const isoToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
/** "2026-11-26" → "Nov 26"; an hour ("2026-11-26T14…") → "2 PM". */
export function shortKey(key: string) {
  if (key.length > 10 && key[10] === "T") {
    const h = Number(key.slice(11, 13));
    return `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;
  }
  return new Date(`${key.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
}
export const longKey = (key: string) => {
  const day = new Date(`${key.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
  return key.length > 10 ? `${day}, ${shortKey(key)}` : day;
};
export const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (m < 2) return "just now";
  if (m < 60) return `${m} minutes ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} hour${h === 1 ? "" : "s"} ago` : `${Math.round(h / 24)} days ago`;
};

// ─────────────── Metrics and tiles ───────────────

/** Change shown as a percent, in points (rates), or in places (position, where lower is better). */
export type ChangeKind = "pct" | "pts" | "places";
export type Metric<T> = { key: string; label: string; tone: string; tip: string; get: (t: T) => number | null; fmt: (v: number | null) => string; change: ChangeKind; lower?: boolean; whole?: boolean };

/** A metric's change against the period before, or null when there is nothing to compare. */
export function changeOf(kind: ChangeKind, now: number | null, before: number | null): { text: string; good: boolean } | null {
  if (now === null || before === null) return null;
  if (kind === "places") {
    const d = Math.round((before - now) * 10) / 10;
    return d === 0 ? null : { text: `${d > 0 ? "↑" : "↓"} ${Math.abs(d).toFixed(1)}`, good: d > 0 };
  }
  if (kind === "pts") {
    const d = Math.round((now - before) * 1000) / 10;
    return d === 0 ? null : { text: `${d > 0 ? "+" : "−"}${Math.abs(d).toFixed(1)} pts`, good: d > 0 };
  }
  if (!before) return now ? { text: "New", good: true } : null;
  const d = Math.round(((now - before) / before) * 100);
  return d === 0 ? { text: "0%", good: true } : { text: `${d > 0 ? "+" : "−"}${Math.abs(d)}%`, good: d > 0 };
}

const Check = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="m5 12 5 5 9-10" />
  </svg>
);

/** The numbers as checkable tiles. Each checked tile draws its line on the chart; one stays checked. */
export function Tiles<T>({ metrics, cur, prev, on, onToggle, vs, end }: { metrics: Metric<T>[]; cur: T; prev: T | null; on: string[]; onToggle: (k: string) => void; vs: string; end?: React.ReactNode }) {
  return (
    <div className="aw-rep-tiles" style={{ "--aw-rep-n": metrics.length } as React.CSSProperties}>
      {metrics.map((m) => {
        const c = prev ? changeOf(m.change, m.get(cur), m.get(prev)) : null;
        const checked = on.includes(m.key);
        return (
          <button key={m.key} type="button" role="checkbox" aria-checked={checked} className={`aw-rep-tile ${m.tone} ${checked ? "is-on" : ""}`} onClick={() => onToggle(m.key)}>
            <span className="aw-rep-tile__label">
              <span className="aw-rep-tile__box">
                <Check />
              </span>
              {m.label}
              <Tip text={m.tip} />
            </span>
            <span className="aw-rep-tile__value">{m.fmt(m.get(cur))}</span>
            <span className={`aw-rep-tile__delta ${c ? (c.good ? "is-up" : "is-down") : ""}`}>
              {c ? c.text : prev ? "No change" : " "}
              {c || prev ? <span> {vs}</span> : null}
            </span>
          </button>
        );
      })}
      {end ? <div className="aw-rep-tiles__end">{end}</div> : null}
    </div>
  );
}

// ─────────────── Chart ───────────────

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

/** A round axis step that splits `span` into about four parts: 1, 2, 2.5 or 5 times a power of ten. */
function niceStep(span: number, whole: boolean) {
  const raw = span / 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  const s = [1, 2, 2.5, 5, 10].map((m) => m * p).find((v) => v >= raw) ?? raw;
  return whole ? Math.max(1, Math.ceil(s)) : s;
}

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

type Scale = { lo: number; hi: number; lower: boolean; ticks: number[] };
function scaleOf(values: number[], lower: boolean, whole: boolean): Scale {
  const hi = values.length ? Math.max(...values) : 0;
  const lo = values.length ? Math.min(...values) : 0;
  if (lower) {
    // Position: 1 at the top. A little room above and below the line.
    const a = Math.max(1, Math.floor(lo - 0.5));
    const b = Math.max(a + 1, Math.ceil(hi + 0.5));
    return { lo: a, hi: b, lower, ticks: [0, 1, 2, 3, 4].map((i) => a + ((b - a) * i) / 4) };
  }
  const step = niceStep(hi * 1.05 || 1, whole);
  const top = Math.max(step, Math.ceil((hi * 1.05 || 1) / step) * step);
  return { lo: 0, hi: top, lower, ticks: Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step) };
}

export type Line = { key: string; label: string; tone: string; values: (number | null)[]; fmt: (v: number | null) => string; lower?: boolean; whole?: boolean; kind: ChangeKind };
export type ChartPin = { i: number; title: string; event: "published" | "refreshed" };

/**
 * The checked metrics as lines. Counts close in size share one axis; otherwise each line gets its own scale and the
 * first two show theirs, left and right. Position runs upside down, with 1 at the top. Purple pins mark pieces
 * published or refreshed from Arrowsterr.
 */
export function LineChart({ keys, lines, pins }: { keys: string[]; lines: Line[]; pins: ChartPin[] }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const counts = lines.every((l) => l.kind === "pct" && !l.lower && l.whole);
  const maxes = lines.map((l) => Math.max(0, ...l.values.filter((v): v is number => v !== null)));
  const shared = lines.length > 1 && counts && Math.max(...maxes) <= 4 * Math.max(1, Math.min(...maxes));
  const one = shared ? scaleOf(lines.flatMap((l) => l.values.filter((v): v is number => v !== null)), false, true) : null;
  const scales: Scale[] = lines.map((l) => one ?? scaleOf(l.values.filter((v): v is number => v !== null), Boolean(l.lower), Boolean(l.whole)));
  const right = !shared && lines.length > 1;
  const H = 260;
  const pt = 12;
  const pb = 28;
  const pl = 52;
  const pr = right ? 52 : 16;
  const count = keys.length;
  const x = (i: number) => pl + (count > 1 ? (i * (W - pl - pr)) / (count - 1) : (W - pl - pr) / 2);
  const y = (s: Scale, v: number) => {
    const f = (v - s.lo) / (s.hi - s.lo || 1);
    return s.lower ? pt + f * (H - pt - pb) : H - pb - f * (H - pt - pb);
  };
  const path = (l: Line, s: Scale) => {
    const parts: [number, number][][] = [[]];
    l.values.forEach((v, i) => (v === null ? parts.push([]) : parts[parts.length - 1].push([x(i), y(s, v)])));
    return parts.filter((p) => p.length).map((p) => (p.length === 1 ? `M${p[0][0] - 1},${p[0][1]} L${p[0][0] + 1},${p[0][1]}` : smooth(p))).join(" ");
  };
  const grid = scales[0]?.ticks ?? [];
  // About one date label per 110 pixels, so they never run into each other on a phone.
  const parts = Math.max(1, Math.min(5, Math.floor((W - pl - pr) / 110)));
  const labelAt = count ? [...new Set(Array.from({ length: parts + 1 }, (_, k) => Math.round(((count - 1) * k) / parts)))] : [];
  const h = hover ?? -1;
  const pinAt = h >= 0 ? pins.filter((p) => p.i === h) : [];

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left - pl) / Math.max(1, W - pl - pr)) * (count - 1));
    setHover(count && i >= 0 && i < count ? i : null);
  }

  return (
    <div className="aw-rep-chart">
      <div className="aw-rep-chart__axes">
        <span>{lines[0]?.label}</span>
        {right ? <span>{lines[1]?.label}</span> : null}
      </div>
      <div ref={ref} className="aw-rep-chart__box">
        {W && count ? (
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label={`${lines.map((l) => l.label).join(", ")} over time`}>
            {grid.map((v, i) => (
              <g key={i}>
                <line x1={pl} x2={W - pr} y1={y(scales[0], v)} y2={y(scales[0], v)} className="aw-rep-chart__grid" />
                <text x={pl - 10} y={y(scales[0], v) + 4} textAnchor="end" className="aw-rep-chart__tick">
                  {lines[0].fmt(v)}
                </text>
              </g>
            ))}
            {right
              ? scales[1].ticks.map((v, i) => (
                  <text key={i} x={W - pr + 10} y={y(scales[1], v) + 4} textAnchor="start" className="aw-rep-chart__tick">
                    {lines[1].fmt(v)}
                  </text>
                ))
              : null}
            {labelAt.map((i) => (
              <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === count - 1 ? "end" : "middle"} className="aw-rep-chart__tick">
                {shortKey(keys[i])}
              </text>
            ))}
            {pins.map((p) => (
              <g key={`${p.i}-${p.title}`}>
                <line x1={x(p.i)} x2={x(p.i)} y1={pt} y2={H - pb} className="aw-rep-chart__pinline" />
                <circle cx={x(p.i)} cy={H - pb} r={5} className="aw-rep-chart__pin" />
              </g>
            ))}
            {lines.map((l, k) => (
              <path key={l.key} d={path(l, scales[k])} className={`aw-rep-chart__line ${l.tone}`} />
            ))}
            {h >= 0 ? (
              <>
                <line x1={x(h)} x2={x(h)} y1={pt} y2={H - pb} className="aw-rep-chart__cross" />
                {lines.map((l, k) => (l.values[h] === null ? null : <circle key={l.key} cx={x(h)} cy={y(scales[k], l.values[h]!)} r={4.5} className={`aw-rep-chart__dot ${l.tone}`} />))}
              </>
            ) : null}
          </svg>
        ) : null}
        {h >= 0 && W ? (
          <div className="aw-rep-chart__tip" style={{ left: Math.max(8, Math.min(W - 228, x(h) + 14)), top: 16 }}>
            <span className="aw-rep-chart__tipday">{longKey(keys[h])}</span>
            {lines.map((l) => (
              <span key={l.key} className="aw-rep-chart__tiprow">
                <i className={l.tone} />
                {l.label}
                <b>{l.fmt(l.values[h])}</b>
              </span>
            ))}
            {pinAt.map((p) => (
              <span key={p.title} className="aw-rep-chart__tippin">
                {p.event === "refreshed" ? "Refreshed" : "Published"}: {p.title}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      {pins.length ? (
        <span className="aw-rep-chart__legend">
          <i />
          You published or refreshed
        </span>
      ) : null}
    </div>
  );
}

/** Pins for the chart: each published or refreshed piece at its day (or the week it falls in). Hourly charts have none. */
export function pinsAt(keys: string[], pins: { day: string; title: string; event: "published" | "refreshed" }[], weeklyBuckets: boolean): ChartPin[] {
  if (!keys.length || keys[0].length > 10) return [];
  return pins.flatMap((p) => {
    let i = -1;
    for (let k = 0; k < keys.length; k++) if (keys[k] <= p.day && (weeklyBuckets || keys[k] === p.day)) i = k;
    if (i < 0 || (!weeklyBuckets && keys[i] !== p.day)) return [];
    return [{ i, title: p.title, event: p.event }];
  });
}

/** Daily or weekly points on the chart. */
export function GranPick({ weeks, onChange }: { weeks: boolean; onChange: (w: boolean) => void }) {
  return <Dropdown label="Daily or weekly" value={weeks ? "weekly" : "daily"} className="aw-dropdown--sm" onChange={(v) => onChange(v === "weekly")} options={[{ id: "daily", label: "Daily" }, { id: "weekly", label: "Weekly" }]} />;
}

// ─────────────── Range, filters, switches ───────────────

/** The range picker: the main ranges in a row, and More for longer ones or exact dates. */
export function RangePicker({ main, more, value, custom, onChange }: { main: RangeId[]; more: RangeId[]; value: RangeId; custom: DateRange | null; onChange: (id: RangeId, custom?: DateRange) => void }) {
  const pop = useAnchoredPop();
  const [from, setFrom] = useState(custom?.from ?? "");
  const [to, setTo] = useState(custom?.to ?? "");
  const inMore = !main.includes(value);
  const moreLabel = value === "custom" && custom ? `${shortKey(custom.from)} – ${shortKey(custom.to)}` : inMore ? RANGE_LABEL[value] : "More";
  return (
    <>
      <Seg
        label="Date range"
        value={inMore ? ("" as RangeId) : value}
        onChange={(id) => onChange(id)}
        options={main.map((id) => ({ id, label: RANGE_LABEL[id] }))}
        extra={
          <button type="button" role="tab" aria-selected={inMore} aria-haspopup="dialog" onClick={(e) => pop.toggle(e.currentTarget)}>
            {moreLabel} <Chevron size={12} />
          </button>
        }
      />
      {pop.anchor ? (
        <Pop anchor={pop.anchor} onClose={pop.close} label="More date ranges" width={280}>
          <div className="aw-pop__list">
            {more.map((id) => (
              <button
                key={id}
                type="button"
                className={`aw-pop__opt ${value === id ? "is-hot" : ""}`}
                onClick={() => {
                  pop.close();
                  onChange(id);
                }}
              >
                {RANGE_LABEL[id]}
                {value === id ? <span className="aw-pop__check">✓</span> : null}
              </button>
            ))}
          </div>
          <div className="aw-rep-form">
            <span className="aw-label mb-0!">Custom dates</span>
            <DateField label="Start date" value={from} onChange={(v) => setFrom(v ?? "")} clearable={false} placeholder="Start" />
            <DateField label="End date" value={to} onChange={(v) => setTo(v ?? "")} clearable={false} placeholder="End" />
            <button
              type="button"
              className="aw-btn aw-btn--primary aw-btn--sm"
              disabled={!from || !to || from > to || to > isoToday()}
              onClick={() => {
                pop.close();
                onChange("custom", { from, to });
              }}
            >
              Apply
            </button>
          </div>
        </Pop>
      ) : null}
    </>
  );
}

export type DimDef<D extends string, O extends FilterOp | TableOp = FilterOp> = { id: D; label: string; ops: O[] };

/**
 * "+ Add filter": pick a dimension or metric, a condition and the value. Lists (`choices`) show as a dropdown; the rest
 * is typed. The report bar filters what Google sends; each table filters its own rows the same way.
 */
export function AddFilter<D extends string, O extends FilterOp | TableOp = FilterOp>({ dims, choices, onAdd }: { dims: DimDef<D, O>[]; choices: (d: D) => string[] | null; onAdd: (f: Filter<D, O>) => void }) {
  const pop = useAnchoredPop();
  const [dim, setDim] = useState<DimDef<D, O> | null>(null);
  const [op, setOp] = useState<O>("contains" as O);
  const [value, setValue] = useState("");
  const list = dim ? choices(dim.id) : null;
  const close = () => {
    pop.close();
    setDim(null);
    setValue("");
  };
  const pick = (d: DimDef<D, O>) => {
    setDim(d);
    setOp(d.ops[0]);
    const c = choices(d.id);
    setValue(c?.[0] ?? "");
  };
  const add = () => {
    if (!dim || !value.trim()) return;
    onAdd({ dim: dim.id, op, value: value.trim() });
    close();
  };
  return (
    <>
      <button type="button" className="aw-ctl" aria-haspopup="dialog" onClick={(e) => (pop.anchor ? close() : pop.toggle(e.currentTarget))}>
        + Add filter
      </button>
      {pop.anchor ? (
        <Pop anchor={pop.anchor} onClose={close} label="Add filter" width={dim ? 300 : 240}>
          {!dim ? (
            <div className="aw-pop__list">
              {dims.map((d) => (
                <button key={d.id} type="button" className="aw-pop__opt" onClick={() => pick(d)}>
                  {d.label}
                  <span className="aw-rep-form__hint">{d.ops.slice(0, 2).map((o) => OP_LABEL[o]).join(", ")}</span>
                </button>
              ))}
            </div>
          ) : (
            <form
              className="aw-rep-form"
              onSubmit={(e) => {
                e.preventDefault();
                add();
              }}
            >
              <span className="aw-label mb-0!">{dim.label}</span>
              <Dropdown label="Condition" value={op} onChange={setOp} options={dim.ops.map((o) => ({ id: o, label: OP_LABEL[o] }))} />
              {list ? (
                <Dropdown label="Value" value={value} onChange={setValue} options={list.map((v) => ({ id: v, label: v }))} />
              ) : (
                <input autoFocus className="aw-input w-full" value={value} onChange={(e) => setValue(e.target.value)} placeholder={dim.id === "country" ? "United States" : op === "gt" || op === "lt" ? "A number, like 100 or 20%" : "Type a value"} aria-label="Value" />
              )}
              <span className="flex justify-between gap-2">
                <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => setDim(null)}>
                  Back
                </button>
                <button type="submit" className="aw-btn aw-btn--primary aw-btn--sm" disabled={!value.trim()}>
                  Apply
                </button>
              </span>
            </form>
          )}
        </Pop>
      ) : null}
    </>
  );
}

/** The active filters as chips. ✕ removes one. */
export function FilterChips<D extends string, O extends FilterOp | TableOp = FilterOp>({ filters, dims, onRemove }: { filters: Filter<D, O>[]; dims: DimDef<D, O>[]; onRemove: (i: number) => void }) {
  return (
    <>
      {filters.map((f, i) => (
        <span key={`${f.dim}-${f.op}-${f.value}`} className="aw-chip aw-chip--brand aw-chip--filter">
          {dims.find((d) => d.id === f.dim)?.label} {OP_LABEL[f.op]} <b>{f.value}</b>
          <button type="button" className="aw-chip__x" aria-label={`Remove the ${dims.find((d) => d.id === f.dim)?.label} filter`} onClick={() => onRemove(i)}>
            ✕
          </button>
        </span>
      ))}
    </>
  );
}

/** An on/off switch with a logo, for the extra columns from the other Google product. */
export function Switch({ on, onChange, logo, children }: { on: boolean; onChange: (v: boolean) => void; logo?: string; children: React.ReactNode }) {
  return (
    <button type="button" role="switch" aria-checked={on} className="aw-rep-switch" onClick={() => onChange(!on)}>
      <span className="aw-rep-switch__track" aria-hidden="true" />
      {logo ? <BrandLogo src={logo} name="" size={14} /> : null}
      {children}
    </button>
  );
}

// ─────────────── Table ───────────────

/** A table column. `text` sorts A to Z and filters by words; `tool` is a button column with no sort, filter or export. */
export type Col<R> = { id: string; label: React.ReactNode; get: (r: R) => string | number | null; show?: (r: R) => React.ReactNode; text?: boolean; tone?: string; csv?: string; tool?: boolean };
const TEXT_OPS: TableOp[] = ["contains", "notContains", "equals", "notEquals"];
const NUM_OPS: TableOp[] = ["gt", "lt", "equals"];
/** What the Export menu downloads: the current table, every row, in its sort order. */
export type CsvRef = React.RefObject<(() => { name: string; rows: (string | number | null)[][] }) | null>;

/**
 * A table of one tab, like GA4's: a search box over the first column, filters on any column, sorted by any column,
 * paged with rows per page. The first column wraps (names are never cut off) and can show an action on hover. Rows
 * with `children` open to show them under the row, indented.
 */
export function ReportTable<R extends { children?: R[] }>({ cols, rows, rowKey, initial, action, name, csvRef, empty, search }: { cols: Col<R>[]; rows: R[]; rowKey: (r: R) => string; initial: Sort; action?: (r: R) => React.ReactNode; name: string; csvRef: CsvRef; empty: React.ReactNode; search: string }) {
  const [sort, setSort] = useSort(initial.key, initial.desc);
  const [per, setPer] = useState(10);
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<Filter<string, TableOp>[]>([]);
  const dims: DimDef<string, TableOp>[] = cols.filter((c) => !c.tool).map((c) => ({ id: c.id, label: typeof c.label === "string" ? c.label : (c.csv ?? c.id), ops: c.text ? TEXT_OPS : NUM_OPS }));
  const name0 = cols[0];
  const kept = rows.filter((r) => (!q.trim() || String(name0?.get(r) ?? "").toLowerCase().includes(q.trim().toLowerCase())) && filters.every((f) => cellMatches(cols.find((c) => c.id === f.dim)?.get(r) ?? null, f.op, f.value)));
  const sorted = sortRows(kept, sort, Object.fromEntries(cols.map((c) => [c.id, c.get])));
  const pages = Math.max(1, Math.ceil(sorted.length / per));
  const at = Math.min(page, pages - 1);
  const shown = sorted.slice(at * per, at * per + per);

  useEffect(() => {
    const out = cols.filter((c) => !c.tool);
    csvRef.current = () => ({ name, rows: [out.map((c) => c.csv ?? (typeof c.label === "string" ? c.label : c.id)), ...sorted.flatMap((r) => [r, ...(r.children ?? [])]).map((r) => out.map((c) => c.get(r)))] });
  });

  const cell = (r: R, c: Col<R>, k: number, sub: boolean) => (
    <td key={c.id} className={`${k ? "aw-num text-right" : ""} ${c.tone ?? ""}`}>
      {k === 0 ? (
        <span className={`aw-rep-name ${sub ? "is-sub" : ""}`}>
          <span className="min-w-0">{c.show ? c.show(r) : (c.get(r) ?? "–")}</span>
          {r.children?.length ? (
            <button
              type="button"
              className="aw-rep-open"
              aria-expanded={open.has(rowKey(r))}
              aria-label={open.has(rowKey(r)) ? "Hide the rows under this one" : "Show the rows under this one"}
              onClick={() => setOpen((s) => (s.has(rowKey(r)) ? new Set([...s].filter((x) => x !== rowKey(r))) : new Set([...s, rowKey(r)])))}
            >
              <span>{r.children.length}</span>
              <Chevron size={12} />
            </button>
          ) : null}
          {action && !sub ? <span className="aw-rep-act">{action(r)}</span> : null}
        </span>
      ) : c.show ? (
        c.show(r)
      ) : (
        (c.get(r) ?? "–")
      )}
    </td>
  );

  const toPage0 = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(0);
  };
  return (
    <>
      <div className="aw-rep-tools">
        <label className="aw-rep-search">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <span className="sr-only">{search}</span>
          <input className="aw-input" value={q} onChange={(e) => toPage0(setQ)(e.target.value)} placeholder={search} />
        </label>
        <AddFilter<string, TableOp> dims={dims} choices={() => null} onAdd={(f) => toPage0(setFilters)([...filters, f])} />
        <FilterChips<string, TableOp> filters={filters} dims={dims} onRemove={(i) => toPage0(setFilters)(filters.filter((_, k) => k !== i))} />
        <span className="aw-rep-tools__count aw-num">{q.trim() || filters.length ? `${kept.length.toLocaleString("en-US")} of ${rows.length.toLocaleString("en-US")} rows` : `${rows.length.toLocaleString("en-US")} ${rows.length === 1 ? "row" : "rows"}`}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="aw-table aw-table--keep">
          <thead>
            <tr>
              {cols.map((c, k) =>
                c.tool ? (
                  <th key={c.id}>
                    <span className="sr-only">{c.csv ?? c.id}</span>
                  </th>
                ) : (
                <SortTh
                  key={c.id}
                  id={c.id}
                  sort={sort}
                  text={c.text}
                  className={k ? "text-right" : ""}
                  onSort={(s) => {
                    setSort(s);
                    setPage(0);
                  }}
                >
                  {c.label}
                </SortTh>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <RowGroup key={rowKey(r)} r={r} cols={cols} cell={cell} open={open.has(rowKey(r))} />
            ))}
            {!shown.length ? (
              <tr>
                <td colSpan={cols.length} className="text-muted">
                  {rows.length ? "No rows match the search and filters." : empty}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="aw-rep-foot">
        <span>Rows per page</span>
        <Dropdown
          label="Rows per page"
          value={per}
          className="aw-dropdown--sm"
          onChange={(v) => {
            setPer(v);
            setPage(0);
          }}
          options={[10, 25, 50, 100].map((v) => ({ id: v, label: String(v) }))}
        />
        <span className="aw-num">{sorted.length ? `${(at * per + 1).toLocaleString("en-US")}–${Math.min(sorted.length, at * per + per).toLocaleString("en-US")} of ${sorted.length.toLocaleString("en-US")}` : "0 of 0"}</span>
        <span className="flex gap-1.5">
          <button type="button" className="aw-iconbtn" aria-label="Previous page" disabled={at === 0} onClick={() => setPage(at - 1)}>
            ‹
          </button>
          <button type="button" className="aw-iconbtn" aria-label="Next page" disabled={at >= pages - 1} onClick={() => setPage(at + 1)}>
            ›
          </button>
        </span>
      </div>
    </>
  );
}

function RowGroup<R extends { children?: R[] }>({ r, cols, cell, open }: { r: R; cols: Col<R>[]; cell: (r: R, c: Col<R>, k: number, sub: boolean) => React.ReactNode; open: boolean }) {
  return (
    <>
      <tr>{cols.map((c, k) => cell(r, c, k, false))}</tr>
      {open
        ? (r.children ?? []).map((ch, i) => (
            <tr key={i} className="aw-rep-subrow">
              {cols.map((c, k) => cell(ch, c, k, true))}
            </tr>
          ))
        : null}
    </>
  );
}

/** A tab row over a table, with the tab's tools on the right. */
export function TableTabs<T extends string>({ tabs, value, onChange, tools }: { tabs: { id: T; label: string }[]; value: T; onChange: (t: T) => void; tools?: React.ReactNode }) {
  return (
    <div className="aw-rep-tabbar">
      <div role="tablist" aria-label="Table" className="aw-tabs">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {tools ? <div className="aw-rep-tabbar__tools">{tools}</div> : null}
    </div>
  );
}

// ─────────────── Header bar: Export ───────────────

/** The header bar's Export menu and "Updates daily", placed in the slot App.tsx leaves for Analytics. */
export function HeadTools({ csvRef, file }: { csvRef: CsvRef; file: string }) {
  const pop = useAnchoredPop();
  // The reports only draw in the browser, after the first load, so the slot is there by now.
  const slot = typeof document === "undefined" ? null : document.getElementById("aw-head-tools");
  if (!slot) return null;
  function download() {
    pop.close();
    const t = csvRef.current?.();
    if (!t) return;
    const blob = new Blob([toCsv(t.rows)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${file} - ${t.name}.csv`.replace(/[\\/:*?"<>|]+/g, "-");
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  return createPortal(
    <>
      <button type="button" className="aw-ctl" aria-haspopup="menu" onClick={(e) => pop.toggle(e.currentTarget)}>
        Export <Chevron size={12} />
      </button>
      {pop.anchor ? (
        <Pop anchor={pop.anchor} onClose={pop.close} label="Export" width={240}>
          <div className="aw-pop__list">
            <button type="button" className="aw-pop__opt" onClick={download}>
              This table as CSV
            </button>
          </div>
        </Pop>
      ) : null}
      <span className="aw-live">Updates daily</span>
    </>,
    slot,
  );
}

// ─────────────── Page actions ───────────────

/** Refresh a page (Zippie's refresh_page, or a Calendar update item without Zippie) and add keywords to the Calendar. */
export function usePageActions({ view, sb, auth, canEdit }: { view: View; sb: SupabaseClient; auth: RunAuth; canEdit: boolean }) {
  const { brand } = view;
  const zippie = useZippieMaybe();
  const [site, setSite] = useState<Site | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const siteOf = useCallback(async () => site ?? (await siteForBrand(sb, brand, canEdit).then((s) => (setSite(s), s))), [site, sb, brand, canEdit]);
  const url = useCallback((page: string) => (/^https?:\/\//.test(page) ? page : `https://${brand.domain.replace(/^https?:\/\//, "").replace(/\/$/, "")}${page}`), [brand.domain]);

  /** Adds one keyword or page refresh. Resolves to "added", "exists" or an error message, so the button that asked can show it. */
  async function toCalendar(item: CalendarPick): Promise<CalendarResult> {
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
      return added ? "added" : "exists";
    } catch (e) {
      const message = errorText(e);
      setError(message);
      return { error: message };
    }
  }

  /** Zippie's refresh_page keeps the sections that still rank and shows the changes on a card. */
  function refreshPage(page: string, why: string, keyword?: string | null) {
    if (zippie) zippie.send(`Refresh ${url(page)} with refresh_page. ${why}`);
    else void toCalendar({ keyword: keyword ?? (page.replace(/^https?:\/\/[^/]+/, "").replace(/^\//, "").replace(/[-/]+/g, " ") || "home page"), page, notes: why });
  }

  const banner = (
    <>
      {error ? <ErrorNote error={error} /> : null}
      {notice ? (
        <div className="aw-callout flex items-center justify-between gap-3">
          <span>{notice}</span>
          <button type="button" className="aw-text-link text-[13px]" onClick={() => setNotice("")}>
            Close
          </button>
        </div>
      ) : null}
    </>
  );
  return { siteOf, url, toCalendar, refreshPage, banner };
}

/** A URL as people read it in a table: the path, or "/" for the home page. */
export const pathOf = (u: string) => u.replace(/^https?:\/\/[^/]+/, "") || "/";
