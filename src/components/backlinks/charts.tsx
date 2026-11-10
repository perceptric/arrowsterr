"use client";

import type { ReactNode } from "react";
import type { Week } from "@/lib/backlinks";

// Small SVG charts for the Backlinks screen. Every mark, tick and label is placed on one scale, and each mark carries a
// <title> so hovering shows its value.

export const C = {
  signal: "var(--signal)",
  sky: "#4F7FE0",
  ink: "#1F2937",
  grey: "#6B7280",
  light: "#A3A8B3",
  faint: "#D1D5DB",
  pos: "var(--aw-pos)",
  neg: "var(--aw-neg)",
  warn: "var(--aw-warn)",
  orange: "#E8590C",
  green: "#0E9F6E",
  violet: "#7C3AED",
};
/** Series colours for several sites: blue for the first (usually the brand), then clearly different hues. */
export const SERIES = [C.signal, C.orange, C.green, C.violet, "#DB2777", "#0891B2", "#CA8A04", C.grey, "#9333EA", "#65A30D"];

const n = (x: number) => x.toLocaleString("en-US");
export const short = (x: number) => (Math.abs(x) >= 1e6 ? `${(x / 1e6).toFixed(1)}M` : Math.abs(x) >= 1e4 ? `${Math.round(x / 1e3)}K` : n(Math.round(x)));
const AXIS = { font: "11px Inter, system-ui, sans-serif" };

function niceStep(raw: number) {
  if (raw <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}

export type Series = { name: string; color: string; values: number[]; width?: number };

/** Lines over time on one scale, the first one filled when area is on, each line's last point marked. */
export function LineChart({ series, labels, area = false, height = 240, width = 720, fmt = short, every = 1, zero = false, label }: { series: Series[]; labels: string[]; area?: boolean; height?: number; width?: number; fmt?: (v: number) => string; every?: number; zero?: boolean; label: string }) {
  const W = width;
  const H = height;
  const L = 48;
  const R = 14;
  const T = 12;
  const B = 24;
  const all = series.flatMap((s) => s.values).filter((v) => Number.isFinite(v));
  if (!all.length || labels.length < 2) return null;
  let lo = zero ? 0 : Math.min(...all);
  let hi = Math.max(...all);
  const pad = (hi - lo) * 0.12 || Math.max(1, hi * 0.1);
  lo = zero ? 0 : Math.max(0, lo - pad);
  hi += pad;
  const step = niceStep((hi - lo) / 4);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const x = (i: number) => L + (i * (W - L - R)) / (labels.length - 1);
  const y = (v: number) => T + (H - T - B) * (1 - (v - lo) / (hi - lo || 1));
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 1000; v += step) ticks.push(v);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={label}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--aw-rule)" />
          <text x={L - 8} y={y(v) + 4} textAnchor="end" fill="var(--aw-muted)" style={AXIS}>
            {fmt(v)}
          </text>
        </g>
      ))}
      {labels.map((l, i) =>
        i % every === 0 || i === labels.length - 1 ? (
          <text key={`${l}${i}`} x={x(i)} y={H - 5} textAnchor="middle" fill="var(--aw-muted)" style={AXIS}>
            {l}
          </text>
        ) : null,
      )}
      {series.map((s, si) => {
        const pts = s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
        const last = s.values.length - 1;
        return (
          <g key={s.name}>
            {area && si === 0 ? <polygon points={`${x(0)},${y(lo)} ${pts} ${x(last)},${y(lo)}`} fill={s.color} opacity="0.1" /> : null}
            <polyline points={pts} fill="none" stroke={s.color} strokeWidth={s.width ?? 2} strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={x(last)} cy={y(s.values[last])} r="4" fill={s.color} stroke="white" strokeWidth="2" />
            {s.values.map((v, i) => (
              <circle key={i} cx={x(i)} cy={y(v)} r="9" fill="transparent">
                <title>{`${s.name}, ${labels[i]}: ${fmt(v)}`}</title>
              </circle>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

/** New sites up in green, lost sites down in red, one pair of bars per week, on one scale. */
export function NewLostBars({ weeks }: { weeks: Week[] }) {
  const w = 460;
  const h = 240;
  const L = 30;
  const B = 22;
  const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const max = Math.max(1, ...weeks.map((x) => Math.max(x.newDomains, x.lostDomains)));
  const top = niceStep(max / 2) * 2;
  const mid = 8 + (h - 8 - B) / 2;
  const half = (h - 8 - B) / 2;
  const col = (w - L - 6) / weeks.length;
  const bw = Math.max(4, col * 0.55);
  const y = (v: number) => (v / top) * half;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label="New and lost linking sites by week">
      {[top, top / 2, 0, -top / 2, -top].map((v) => (
        <g key={v}>
          <line x1={L} x2={w - 6} y1={mid - y(v)} y2={mid - y(v)} stroke="var(--aw-rule)" />
          <text x={L - 6} y={mid - y(v) + 4} textAnchor="end" fill="var(--aw-muted)" style={AXIS}>
            {short(Math.abs(v))}
          </text>
        </g>
      ))}
      {weeks.map((wk, i) => {
        const x = L + col * i + (col - bw) / 2;
        return (
          <g key={wk.date}>
            <title>{`Week to ${when(wk.date)}: ${wk.newDomains} new, ${wk.lostDomains} lost`}</title>
            <rect x={x} y={mid - y(wk.newDomains)} width={bw} height={y(wk.newDomains)} rx="3" fill={C.pos} />
            <rect x={x} y={mid} width={bw} height={y(wk.lostDomains)} rx="3" fill={C.neg} opacity="0.75" />
            {i % 3 === 0 || i === weeks.length - 1 ? (
              <text x={x + bw / 2} y={h - 5} textAnchor="middle" fill="var(--aw-muted)" style={AXIS}>
                {when(wk.date)}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

export type Part = { label: string; value: number; color: string };

/** A ring of parts with the first part's share in the middle, and a legend with each share. */
export function Donut({ parts, label }: { parts: Part[]; label: string }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  if (!total) return null;
  const R = 46;
  const L = 2 * Math.PI * R;
  const arcs = parts.reduce<{ p: Part; len: number; off: number }[]>((acc, p) => {
    const off = acc.length ? acc[acc.length - 1].off + acc[acc.length - 1].len : 0;
    return [...acc, { p, len: (p.value / total) * L, off }];
  }, []);
  const pct = (v: number) => `${Math.round((v / total) * 100)}%`;
  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg viewBox="0 0 120 120" width="124" height="124" role="img" aria-label={label} className="shrink-0">
        <circle cx="60" cy="60" r={R} fill="none" stroke="var(--aw-surface-2)" strokeWidth="16" />
        {arcs.map(({ p, len, off }) => (
          <circle key={p.label} cx="60" cy="60" r={R} fill="none" stroke={p.color} strokeWidth="16" strokeDasharray={`${Math.max(0, len - (parts.length > 1 ? 2 : 0))} ${L}`} strokeDashoffset={-off} transform="rotate(-90 60 60)">
            <title>{`${p.label}: ${pct(p.value)} (${n(p.value)})`}</title>
          </circle>
        ))}
        <text x="60" y="60" textAnchor="middle" fill="var(--aw-ink)" style={{ font: "600 20px Inter, system-ui, sans-serif" }}>
          {pct(parts[0].value)}
        </text>
        <text x="60" y="76" textAnchor="middle" fill="var(--aw-muted)" style={{ font: "10px Inter, system-ui, sans-serif" }}>
          {parts[0].label}
        </text>
      </svg>
      <ul className="flex min-w-36 flex-1 flex-col gap-2 text-[13px]">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2 text-body">
              <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: p.color }} />
              <span className="wrap-break-word">{p.label}</span>
            </span>
            <span className="aw-num font-medium text-ink">{pct(p.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type Bar = { label: ReactNode; value: number; color?: string; key?: string; onClick?: () => void };

/** Labelled bars on one scale, the value at the end. */
export function HBars({ rows, unit = "", fmt = n, color = C.signal }: { rows: Bar[]; unit?: string; fmt?: (v: number) => string; color?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((r, i) => (
        <div key={r.key ?? i} className="grid grid-cols-[minmax(0,1fr)_minmax(60px,1.1fr)_64px] items-center gap-3 text-[13px]">
          {r.onClick ? (
            <button type="button" onClick={r.onClick} className="min-w-0 text-left text-body wrap-anywhere hover:underline">
              {r.label}
            </button>
          ) : (
            <span className="min-w-0 text-body wrap-anywhere">{r.label}</span>
          )}
          <span className="block h-2 rounded-full bg-[var(--aw-surface-2)]">
            <span className="block h-full rounded-full" style={{ width: `${Math.max(1.5, (r.value / max) * 100)}%`, background: r.color ?? color }} />
          </span>
          <span className="aw-num text-right font-medium text-ink">
            {fmt(r.value)}
            {unit}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Linking sites per authority band: weak in grey, middle in light blue, strong in blue. */
export function Bands({ bands }: { bands: number[] }) {
  const W = 380;
  const H = 180;
  const L = 30;
  const B = 22;
  const max = Math.max(1, ...bands);
  const top = niceStep(max / 2) * 2;
  const bw = (W - L - 4) / bands.length;
  const y = (v: number) => 8 + (H - 8 - B) * (1 - v / top);
  const tone = (i: number) => (i >= 6 ? C.signal : i >= 3 ? C.sky : C.faint);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Linking sites by authority">
      {[0, top / 2, top].map((v) => (
        <g key={v}>
          <line x1={L} x2={W} y1={y(v)} y2={y(v)} stroke="var(--aw-rule)" />
          <text x={L - 5} y={y(v) + 4} textAnchor="end" fill="var(--aw-muted)" style={AXIS}>
            {short(v)}
          </text>
        </g>
      ))}
      {bands.map((v, i) => (
        <g key={i}>
          <rect x={L + i * bw + 3} y={y(v)} width={bw - 6} height={Math.max(0, y(0) - y(v))} rx="3" fill={tone(i)}>
            <title>{`Authority ${i * 10} to ${i * 10 + 9}: ${n(v)} sites`}</title>
          </rect>
          {i % 2 === 0 ? (
            <text x={L + i * bw + bw / 2} y={H - 5} textAnchor="middle" fill="var(--aw-muted)" style={AXIS}>
              {i * 10}
            </text>
          ) : null}
        </g>
      ))}
    </svg>
  );
}

/** One bar split into parts, for a share at a glance. */
export function Stack({ parts }: { parts: Part[] }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  return (
    <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
      {parts.map((p) =>
        p.value ? (
          <span key={p.label} className="block h-full" style={{ width: `${(p.value / total) * 100}%`, background: p.color }}>
            <title>{`${p.label}: ${Math.round((p.value / total) * 100)}%`}</title>
          </span>
        ) : null,
      )}
    </div>
  );
}

/** A small trend line for a stat. */
export function Trend({ values, color = C.signal }: { values: number[]; color?: string }) {
  if (values.length < 2) return null;
  const W = 120;
  const H = 26;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pts = values.map((v, i) => `${(i * W) / (values.length - 1)},${H - 2 - ((v - lo) / (hi - lo || 1)) * (H - 4)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="26" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Priority 1 to 5 as five small bars. */
export function Priority({ value }: { value: number }) {
  return (
    <span className="inline-flex gap-0.5" title={`Priority ${value} of 5`} aria-label={`Priority ${value} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className="block h-3.5 w-1.5 rounded-[2px]" style={{ background: i <= value ? C.signal : "var(--aw-rule)" }} />
      ))}
    </span>
  );
}
