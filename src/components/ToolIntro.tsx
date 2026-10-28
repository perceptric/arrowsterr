"use client";

import { BrandLogo } from "./BrandLogo";
import { favicon } from "./ui";

// The empty state of a tool before the first search: a title, one lead, example searches, then what the tool
// shows, each as a small piece of the real product in a white card set in a grey shell.
// Callers may still pass steps and FAQs; they are not shown.

export type Feature = { title: string; text: string; visual?: React.ReactNode };

export function ToolIntro({
  title,
  lead,
  examples,
  onExample,
  action,
  features,
}: {
  title: string;
  lead?: string;
  examples?: string[];
  onExample?: (x: string) => void;
  action?: React.ReactNode;
  features?: Feature[];
  steps?: string[];
  faqs?: { q: string; a: string }[];
}) {
  return (
    <section className="aw-intro">
      <div className="aw-intro__head">
        <h2 className="aw-intro__title">{title}</h2>
        {lead ? <p className="aw-intro__lead">{lead}</p> : null}
      </div>
      {action ? <div className="flex flex-wrap gap-2">{action}</div> : null}
      {examples?.length ? (
        <div className="aw-intro__try">
          <span>Try</span>
          {examples.map((x) => (
            <button key={x} type="button" className="aw-try" onClick={() => onExample?.(x)} disabled={!onExample}>
              {x}
            </button>
          ))}
        </div>
      ) : null}
      {features?.length ? (
        <div className="aw-intro__grid">
          {features.map((f) => (
            <div key={f.title} className="aw-intro__card">
              {f.visual ? <div className="aw-intro__vis">{f.visual}</div> : null}
              <div className="aw-intro__copy">
                <h3 className="aw-intro__t">{f.title}</h3>
                <p className="aw-intro__x">{f.text}</p>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

// ─────────────── sample visuals ───────────────
// Each one is a small, sharp piece of the real product: Inter, tabular digits, dot tags, rounded bars.

const BRAND = "var(--accent-9, #0943B0)";
const DOMAIN = /^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i;

/** Older pastel fills, read as the color of the dot. */
const DOTS: Record<string, string> = { "#FEF3C7": "#F5A70A", "#DBEAFE": "#0943B0", "#DCFCE7": "#2BAA5E" };

function Dot({ color }: { color: string }) {
  return <i className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />;
}

/** A difficulty gauge: a half ring, the score and a word. */
export function SampleRing({ value = 43, label = "Possible" }: { value?: number; label?: string }) {
  const r = 46;
  const half = Math.PI * r;
  const color = value < 30 ? "#2BAA5E" : value < 50 ? "#F5A70A" : value < 70 ? "#E5484D" : "#B4232C";
  return (
    <span className="relative flex flex-col items-center" aria-hidden="true">
      <svg width="120" height="66" viewBox="0 0 120 66">
        <path d="M 14 60 A 46 46 0 0 1 106 60" fill="none" stroke="var(--bg-quaternary, #EBEBEB)" strokeWidth="10" strokeLinecap="round" />
        <path d="M 14 60 A 46 46 0 0 1 106 60" fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(value / 100) * half} ${half}`} />
      </svg>
      <span className="-mt-7 text-[26px] leading-none font-semibold tracking-tight text-ink tabular-nums">{value}</span>
      <span className="mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[12px] font-medium" style={{ background: `color-mix(in oklab, ${color} 12%, transparent)`, color }}>
        <Dot color={color} />
        {label}
      </span>
    </span>
  );
}

/** A smooth area chart with its total and change on top, like the 12-month trend. */
function Area({ values, total, delta, months = true }: { values: number[]; total?: string; delta?: string; months?: boolean }) {
  const max = Math.max(...values);
  const min = Math.min(...values) * 0.8;
  const w = 220;
  const h = 64;
  const pt = (v: number, i: number) => [(i / (values.length - 1)) * w, h - 4 - ((v - min) / (max - min || 1)) * (h - 10)] as const;
  const pts = values.map(pt);
  // Smooth curve through the points.
  const line = pts.reduce((d, [x, y], i) => {
    if (!i) return `M ${x} ${y}`;
    const [px, py] = pts[i - 1];
    const cx = (px + x) / 2;
    return `${d} C ${cx} ${py}, ${cx} ${y}, ${x} ${y}`;
  }, "");
  const [ex, ey] = pts[pts.length - 1];
  const id = `aw-area-${values.join("-")}`;
  return (
    <span className="flex w-full flex-col gap-2" aria-hidden="true">
      {total ? (
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[18px] leading-none font-semibold tracking-tight text-ink tabular-nums">{total}</span>
          {delta ? (
            <span className="inline-flex shrink-0 items-center whitespace-nowrap gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-medium" style={{ background: "color-mix(in oklab, #2BAA5E 12%, transparent)", color: "#1D7A43" }}>
              ↗ {delta}
            </span>
          ) : null}
        </span>
      ) : null}
      <span className="relative block h-16 w-full">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-16 w-full overflow-visible" preserveAspectRatio="none">
        <defs>
          <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={BRAND} stopOpacity="0.18" />
            <stop offset="100%" stopColor={BRAND} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${line} L ${w} ${h} L 0 ${h} Z`} fill={`url(#${id})`} />
        <path d={line} fill="none" stroke={BRAND} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
        <i
          className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-white"
          style={{ left: `${(ex / w) * 100}%`, top: `${(ey / h) * 100}%`, borderColor: BRAND }}
        />
      </span>
      {months ? (
        <span className="flex justify-between text-[11px] text-muted">
          <span>Nov</span>
          <span>May</span>
          <span>Oct</span>
        </span>
      ) : null}
    </span>
  );
}

/** The 12-month search trend. */
export function SampleBars({ values = [30, 45, 40, 52, 48, 60, 72, 66, 58, 70, 64, 80], total = "3.6K/mo", delta = "+18%" }: { values?: number[]; total?: string; delta?: string }) {
  return <Area values={values} total={total} delta={delta} />;
}

/** Traffic over time. */
export function SampleLine({ values = [12, 14, 13, 18, 17, 22, 26, 25, 31, 35, 34, 41], total = "41K", delta = "+24%" }: { values?: number[]; total?: string; delta?: string }) {
  return <Area values={values} total={total} delta={delta} />;
}

/** Rows with a label, a rounded bar and a value. Site names get their logo. */
export function SampleRows({ rows }: { rows: [string, number, string?][] }) {
  const max = Math.max(...rows.map((r) => r[1]));
  return (
    <span className="flex w-full flex-col" aria-hidden="true">
      {rows.map(([label, v, shown], i) => (
        <span key={label} className={`grid grid-cols-[minmax(0,1fr)_72px_40px] items-center gap-3 py-1.5 text-[12px] ${i ? "border-t border-[var(--row-border,#EFEFEE)]" : ""}`}>
          <span className="flex min-w-0 items-center gap-2">
            {DOMAIN.test(label) ? <BrandLogo src={favicon(label)} name={label} size={14} /> : null}
            <span className="truncate font-medium text-ink">{label}</span>
          </span>
          <span className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-tertiary,#F5F5F5)]">
            <span className="block h-full rounded-full" style={{ width: `${Math.max(8, (v / max) * 100)}%`, background: BRAND }} />
          </span>
          <span className="text-right text-body tabular-nums">{shown ?? v.toLocaleString("en-US")}</span>
        </span>
      ))}
    </span>
  );
}

/** Shares as one rounded bar with dot tags under it, like search intent. */
export function SampleChips({ items }: { items: [string, string][] }) {
  const weights = [48, 32, 20, 12];
  const total = items.reduce((n, _, i) => n + (weights[i] ?? 10), 0);
  return (
    <span className="flex w-full flex-col gap-3" aria-hidden="true">
      <span className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full">
        {items.map(([t, bg], i) => (
          <span key={t} className="h-full" style={{ width: `${((weights[i] ?? 10) / total) * 100}%`, background: DOTS[bg] ?? bg }} />
        ))}
      </span>
      <span className="flex flex-col gap-1.5">
        {items.map(([t, bg], i) => (
          <span key={t} className="flex items-center justify-between gap-3 text-[12px]">
            <span className="flex items-center gap-2 font-medium text-ink">
              <Dot color={DOTS[bg] ?? bg} />
              {t}
            </span>
            <span className="text-body tabular-nums">{Math.round(((weights[i] ?? 10) / total) * 100)}%</span>
          </span>
        ))}
      </span>
    </span>
  );
}

/** A few numbers side by side, each in its own tile. */
export function SampleStats({ items }: { items: [string, string][] }) {
  return (
    <span className="grid w-full grid-cols-3 gap-2" aria-hidden="true">
      {items.map(([lab, v]) => (
        <span key={lab} className="flex flex-col gap-1 rounded-[10px] border border-[var(--card-border,#E5E5E5)] bg-white px-3 py-2.5">
          <span className="text-[11px] font-medium text-muted">{lab}</span>
          <span className="text-[18px] leading-none font-semibold tracking-tight text-ink tabular-nums">{v}</span>
        </span>
      ))}
    </span>
  );
}
