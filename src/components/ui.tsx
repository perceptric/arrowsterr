"use client";

// Small pieces every page shares.
import { Component, useEffect, useMemo, useRef, useState } from "react";
import { errorText, splitRef } from "@/lib/errors";
import { BrandLogo } from "./BrandLogo";

export const favicon = (domain: string) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
export const guessDomain = (name: string) => `${name.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`;
export const pct = (n: number | null | undefined) => (n === null || n === undefined ? "–" : `${Math.round(n)}%`);
export const pos = (n: number | null | undefined) => (n === null || n === undefined ? "–" : `#${n.toFixed(1)}`);
export const score = (n: number | null | undefined) => (n === null || n === undefined ? "–" : `${Math.round(n)}`);

// Your brand is the blue series. Competitors are black and grays.
export const YOU_COLOR = "#0943B0";
export const RIVAL_COLOR = "#111111"; // the competitor in any one-on-one view
export const OTHER_COLORS = ["#111111", "#5C6B89", "#A6AEBB", "#2B3242", "#7C8697", "#3A3A3A", "#8A8A8A", "#C9CED8"];

export function Card({ title, action, children, className = "" }: { title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`aw-frame flex min-w-0 flex-col ${className}`}>
      {title || action ? (
        <div className="aw-frame__head justify-between">
          {title ? <h2 className="aw-h4">{title}</h2> : null}
          {action}
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <ErrorBoundary className="m-4">{children}</ErrorBoundary>
      </div>
    </section>
  );
}

/** A brand's icon and name. Your brand gets a "You" badge. */
export function BrandName({ name, domain, logo, isYou, size = 20 }: { name: string; domain?: string | null; logo?: string; isYou?: boolean; size?: number }) {
  return (
    <span className="flex min-w-0 items-center gap-2 font-medium text-ink">
      <BrandLogo src={logo || favicon(domain || guessDomain(name))} name={name} size={size} />
      <span className="truncate">{name}</span>
      {isYou ? <span className="aw-badge">You</span> : null}
    </span>
  );
}

/** Change since the period before, with an arrow. For position, lower is better. */
export function Delta({ now, before, unit = "", lowerIsBetter = false, digits = 1 }: { now: number | null; before: number | null; unit?: string; lowerIsBetter?: boolean; digits?: number }) {
  if (now === null || before === null) return null;
  const d = now - before;
  const shown = Math.abs(d).toFixed(digits);
  if (Number(shown) === 0) return null;
  const good = lowerIsBetter ? d < 0 : d > 0;
  return (
    <span className={`whitespace-nowrap text-[12px] font-medium ${good ? "text-pos" : "text-neg"}`} title={good ? "Better than the period before" : "Worse than the period before"}>
      {d > 0 ? "↗" : "↘"} {shown}
      {unit}
    </span>
  );
}

/** A row of tabs where one is picked: text on a hairline, the picked one underlined in Signal Blue (brand v5). */
/** A small trend line with a soft fill. Hidden from screen readers: the number beside it says the same. */
export function Spark({ values, color = "var(--signal)", className = "" }: { values: number[]; color?: string; className?: string }) {
  if (values.length < 2) return null;
  const w = 200, h = 44, min = Math.min(...values), span = Math.max(...values) - min || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - 4 - ((v - min) / span) * (h - 10)).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={`aw-spark ${className}`} aria-hidden="true">
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill={color} opacity="0.1" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export type StripStat = { label: string; value: React.ReactNode; delta?: React.ReactNode; tone?: "pos" | "neg" | "warn" | "brand"; sub?: React.ReactNode };
/**
 * A screen's numbers as one strip: the first is the lead (wider, tinted, with an optional trend line or extra part),
 * the rest follow in cells split by hairlines. Use this for KPI rows; never a row of equal boxes.
 */
export function StatStrip({ stats, spark, extra }: { stats: StripStat[]; spark?: number[]; extra?: React.ReactNode }) {
  return (
    <section className="aw-strip" style={{ "--aw-strip-n": Math.max(1, stats.length - 1) } as React.CSSProperties}>
      {stats.map((s, i) => (
        <div key={s.label} className={`aw-strip__cell ${i === 0 ? "aw-strip__lead" : ""}`}>
          <span className="aw-strip__label">{s.label}</span>
          <span className="aw-strip__row">
            <span className={`aw-num aw-strip__num ${s.tone ? `is-${s.tone}` : ""}`}>{s.value}</span>
            {s.delta}
          </span>
          {s.sub ? <span className="aw-strip__sub">{s.sub}</span> : null}
          {i === 0 && spark ? <Spark values={spark} className="aw-strip__spark" /> : null}
          {i === 0 ? extra : null}
        </div>
      ))}
    </section>
  );
}

/** Pick one of a few options. `extra` sits at the end of the group, like a "More" button that opens a menu. */
export function Seg<T extends string>({ value, options, onChange, label, extra }: { value: T; options: { id: T; label: React.ReactNode }[]; onChange: (v: T) => void; label: string; extra?: React.ReactNode }) {
  return (
    <div role="tablist" aria-label={label} className="aw-seg inline-flex max-w-full flex-wrap">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={value === o.id}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
      {extra}
    </div>
  );
}

/** Something is loading: a spinner and one short line of text. When done, a check mark takes the spinner's place. */
export function Thinking({ text, children, done }: { text: string; children?: React.ReactNode; done?: boolean }) {
  return (
    <div className="aw-frame aw-think" role="status" aria-live="polite">
      <span className="aw-think__mark" aria-hidden="true">
        {done ? (
          <span className="aw-think__done">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5 10 17.5 19 7" />
            </svg>
          </span>
        ) : (
          <span className="aw-spin" />
        )}
      </span>
      <span className="aw-h4">{text}</span>
      {children}
    </div>
  );
}

// ─────────────── Sortable tables ───────────────

export type Sort = { key: string; desc: boolean };
type Value = string | number | null | undefined;

/** Which column a table is sorted by. Start with the table's natural order. */
export const useSort = (key: string, desc = true) => useState<Sort>({ key, desc });

/** Sort rows by the picked column. Empty values always go last. */
export function sortRows<T>(rows: T[], sort: Sort, get: Record<string, (row: T) => Value>): T[] {
  const f = get[sort.key];
  if (!f) return rows;
  return [...rows].sort((a, b) => {
    const x = f(a);
    const y = f(b);
    const xe = x === null || x === undefined || x === "";
    const ye = y === null || y === undefined || y === "";
    if (xe || ye) return xe === ye ? 0 : xe ? 1 : -1;
    const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { sensitivity: "base", numeric: true });
    return sort.desc ? -c : c;
  });
}

/**
 * A column header you click to sort. One click sorts the column; the next click flips it.
 * Text columns start A to Z, number columns start high to low.
 */
export function SortTh({ id, sort, onSort, text = false, className = "", children }: { id: string; sort: Sort; onSort: (s: Sort) => void; text?: boolean; className?: string; children: React.ReactNode }) {
  const on = sort.key === id;
  const label = on ? (text ? (sort.desc ? "Z to A" : "A to Z") : sort.desc ? "high to low" : "low to high") : null;
  return (
    <th className={className} aria-sort={on ? (sort.desc ? "descending" : "ascending") : "none"}>
      <button
        type="button"
        className={`aw-sort ${on ? "is-on" : ""}`}
        onClick={() => onSort(on ? { key: id, desc: !sort.desc } : { key: id, desc: !text })}
        title={label ? `Sorted ${label}. Click to flip.` : "Click to sort"}
      >
        {children}
        <span aria-hidden="true" className="aw-sort__arrow">
          {on ? (sort.desc ? "↓" : "↑") : "↕"}
        </span>
      </button>
    </th>
  );
}

/** What each metric means, for tooltips. */
export const TIPS = {
  visibility: "Share of AI answers that name the brand. 50% means half the answers named it.",
  sentiment: "How well AI talks about the brand, from 0 to 100. 50 is neutral, higher is better.",
  position: "Average spot in the list of brands an answer names. #1 is the first brand named.",
  positionScore: "Your average spot as a score: #1 is 100, and each spot down takes 10 points off.",
  mentions: "How many AI answers named the brand in this period.",
  used: "Share of AI answers that cite this site at least once.",
  answers: "How many AI answers cite this site.",
  avgCitations: "Links to this site in each answer that cites it.",
  pages: "Pages on this site that AI answers cite.",
  gap: "Brand A's share minus brand B's share, in points.",
} as const;

/** A small "i" that shows what a metric means on hover or focus. */
export function Tip({ text }: { text: string }) {
  return (
    <span className="group/tip relative ml-1 inline-flex align-middle normal-case">
      <span role="img" aria-label={text} className="inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border border-current font-sans text-[9px] leading-none font-medium opacity-60">
        i
      </span>
      <span
        role="tooltip"
        className="aw-tip pointer-events-none absolute top-full left-1/2 z-40 mt-1.5 w-56 -translate-x-1/2 whitespace-normal text-left opacity-0 transition-opacity group-hover/tip:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}

/**
 * A full height panel that slides in from the right, like the prompt deep dive. Escape or a click outside closes it.
 * `footer` stays pinned to the bottom: put the panel's actions there.
 */
export function SidePanel({ title, kicker, onClose, children, footer, narrow = false }: { title: React.ReactNode; kicker?: React.ReactNode; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; narrow?: boolean }) {
  useEffect(() => {
    const keys = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", keys);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", keys);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);
  return (
    <div className="tw-side-overlay print:hidden" onClick={onClose}>
      <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} className={`tw-side-panel ${narrow ? "tw-side-panel--narrow" : ""}`}>
        <div className="tw-side-panel__bar">
          <div className="tw-side-panel__title">
            {kicker ? <span className="tw-side-panel__kicker">{kicker}</span> : null}
            <h2>{title}</h2>
          </div>
          <button type="button" aria-label="Close" title="Close (Esc)" onClick={onClose} className="aw-iconbtn shrink-0">
            <svg className="aw-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="tw-side-panel__body">{children}</div>
        {footer ? <div className="tw-side-panel__foot">{footer}</div> : null}
      </div>
    </div>
  );
}

// ─────────────── feedback ───────────────

type ToastNote = { id: number; text: string; tone: "ok" | "error" };
const toastListeners = new Set<(t: ToastNote) => void>();
let toastSeq = 0;

/** Show a short note at the bottom right for 5 seconds: "ok" for something done, "error" for something that failed. */
export function toast(text: string, tone: ToastNote["tone"] = "ok") {
  const note = { id: ++toastSeq, text, tone };
  toastListeners.forEach((l) => l(note));
}

/** Where toasts show. Mounted once, in the root layout. A newer toast takes the older one's place; hover pauses it. */
export function Toasts() {
  const [note, setNote] = useState<ToastNote | null>(null);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const show = (t: ToastNote) => setNote(t);
    toastListeners.add(show);
    return () => {
      toastListeners.delete(show);
    };
  }, []);
  useEffect(() => {
    if (!note || paused) return;
    const t = window.setTimeout(() => setNote(null), 5000);
    return () => window.clearTimeout(t);
  }, [note, paused]);
  if (!note) return null;
  return (
    <div
      key={note.id}
      className={`aw-undo print:hidden ${note.tone === "error" ? "aw-undo--error" : ""}`}
      role={note.tone === "error" ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <span className="aw-undo__mark" aria-hidden="true">
        {note.tone === "error" ? "!" : "✓"}
      </span>
      <span className="min-w-0 flex-1">{note.text}</span>
      <button type="button" aria-label="Close" onClick={() => setNote(null)}>
        Close
      </button>
    </div>
  );
}

/**
 * A button for work that takes a moment. While it runs: a spinner, aria-busy, and no second click. Then the done
 * label for 2 seconds (or for good with `stay`). If the work throws, or resolves to { error }, the error shows as a toast.
 * The work may resolve to a string to use as the done label. Pass done={null} when the work shows its own result.
 */
export function BusyButton({
  onClick,
  children,
  done = "Done ✓",
  stay = false,
  className = "aw-btn aw-btn--secondary",
  disabled,
  title,
  label,
}: {
  onClick: () => Promise<unknown> | unknown;
  children: React.ReactNode;
  done?: React.ReactNode;
  stay?: boolean;
  className?: string;
  disabled?: boolean;
  title?: string;
  label?: string;
}) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [doneText, setDoneText] = useState<React.ReactNode>(null);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  useEffect(() => {
    if (state !== "done" || stay) return;
    const t = window.setTimeout(() => setState("idle"), 2000);
    return () => window.clearTimeout(t);
  }, [state, stay]);
  async function run() {
    if (state === "busy") return;
    setState("busy");
    try {
      const r = await onClick();
      if (r && typeof r === "object" && "error" in r && typeof (r as { error: unknown }).error === "string") throw r;
      if (!live.current) return;
      // done={null}: the work shows its own result (a notice, a new row), so the button only goes back.
      if (typeof r !== "string" && done === null) return setState("idle");
      setDoneText(typeof r === "string" ? r : null);
      setState("done");
    } catch (e) {
      if (live.current) setState("idle");
      toast(errorText(e), "error");
    }
  }
  return (
    <button
      type="button"
      className={`${className} ${state === "done" ? "is-done" : ""}`}
      aria-busy={state === "busy" || undefined}
      aria-label={state === "done" ? undefined : label}
      disabled={disabled || state === "busy" || (stay && state === "done")}
      title={title}
      onClick={run}
    >
      {state === "busy" ? <span className="aw-spin" aria-hidden="true" /> : null}
      {state === "done" ? (doneText ?? done) : children}
    </button>
  );
}

/**
 * The error box (aw-error, docs/brand.md › Errors): plain words from errorText, the ref with Copy when there is one,
 * Try again when the work can run again, and Close when it can be dismissed. Pass anything: a message, an Error, a
 * failed reply or a saved error.
 */
export function ErrorNote({ error, onRetry, onClose, className = "" }: { error: unknown; onRetry?: () => void; onClose?: () => void; className?: string }) {
  const [copied, setCopied] = useState(false);
  // An error nobody planned for gets a new ref each time it's read, so read it once per error: the ref stays put.
  const { words, ref } = useMemo(() => splitRef(error ? errorText(error) : ""), [error]);
  if (!error) return null;
  return (
    <div className={`aw-error ${className}`} role="alert">
      <span className="aw-error__icon" aria-hidden="true">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
          <path d="M12 7v6M12 17h.01" />
        </svg>
      </span>
      <span className="aw-error__body">
        {words}
        {ref ? (
          <button
            type="button"
            className="aw-error__ref"
            title="Copy the ref to send to support"
            onClick={() => {
              void navigator.clipboard?.writeText(`Ref ${ref}`).catch(() => {});
              setCopied(true);
            }}
          >
            {copied ? "Copied ✓" : `Ref ${ref}`}
          </button>
        ) : null}
      </span>
      {onRetry ? (
        <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm aw-error__act" onClick={onRetry}>
          Try again
        </button>
      ) : null}
      {onClose ? (
        <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm aw-error__act" onClick={onClose}>
          Close
        </button>
      ) : null}
    </div>
  );
}

/** Keeps one broken panel or card from blanking the page: it shows the error box with Try again in its place. */
export class ErrorBoundary extends Component<{ children: React.ReactNode; className?: string }, { error: unknown }> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) {
    return { error: error ?? new Error("crash") };
  }
  componentDidCatch(error: unknown) {
    console.error("A panel crashed:", error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return <ErrorNote error={new Error("This part of the page didn't load.")} onRetry={() => this.setState({ error: null })} className={this.props.className} />;
  }
}

/** A list that is loading: grey bars in the shape of its rows, as docs/brand.md says. Never the word "Loading". */
export function SkeletonRows({ rows = 5, cols = 3 }: { rows?: number; cols?: number }) {
  return (
    <div className="aw-skel" aria-hidden="true">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="aw-skel__row">
          {Array.from({ length: cols }, (_, c) => (
            <i key={c} style={{ width: c === 0 ? `${48 + ((r * 37) % 32)}%` : `${40 + (((r + c) * 13) % 40)}px` }} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Used out of a limit, as a bar. */
export function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100;
  const full = used >= limit;
  return (
    <div className="aw-card-stat flex flex-col gap-2">
      <span className="aw-small">{label}</span>
      <span className="aw-num text-[22px] font-medium text-ink">
        {used} <span className="text-[15px] font-normal text-muted">of {limit}</span>
      </span>
      <div
        className="h-2 overflow-hidden rounded-full bg-rule-faint"
        role="meter"
        aria-label={label}
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={limit}
      >
        <div className={`h-full ${full ? "bg-neg" : "bg-brand"}`} style={{ width: `${pct}%` }} />
      </div>
      {full ? <span className="text-[13px] font-medium text-neg">Limit reached</span> : null}
    </div>
  );
}

// ─────────────── glyphs ───────────────

const GLYPHS = {
  persona: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" /></>,
  reader: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  compass: <><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></>,
  wave: <path d="M4 10v4M8 6v12M12 9v6M16 4v16M20 10v4" />,
  lines: <path d="M4 6h16M4 12h16M4 18h10" />,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5-9 9" /></>,
  type: <path d="M5 6V4h14v2M12 4v16M9 20h6" />,
  size: <path d="M3 7V5h10v2M8 5v14M6 19h4M14 13v-1h7v1M17.5 12v7M16 19h3" />,
  button: <><rect x="3" y="7" width="18" height="10" rx="5" /><path d="M8 12h8" /></>,
  card: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M3 10h18" /></>,
  link: <><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></>,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>,
  footer: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 16h18" /></>,
};
export type GlyphName = keyof typeof GLYPHS;

/** A small line icon in a soft blue square. Pass bare to get the icon alone. */
export function Glyph({ name, bare }: { name: GlyphName; bare?: boolean }) {
  const svg = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {GLYPHS[name]}
    </svg>
  );
  return bare ? svg : <span className="aw-ico">{svg}</span>;
}

// ─────────────── chevrons and arrows ───────────────

const CHEV = { down: "m6 9 6 6 6-6", up: "m6 15 6-6 6 6", right: "m9 6 6 6-6 6", left: "m15 6-6 6 6 6" } as const;
const ARROW = { right: "M5 12h14M13 6l6 6-6 6", up: "M12 19V5M6 11l6-6 6 6", down: "M12 5v14M6 13l6 6 6-6" } as const;

/** The one chevron for menus, pickers and rows that open: a thin line, never a solid triangle. */
export function Chevron({ dir = "down", size = 14, className = "aw-chev" }: { dir?: keyof typeof CHEV; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d={CHEV[dir]} />
    </svg>
  );
}

/** A thin arrow inside text, like a position moving from #4 to #11. */
export function Arrow({ dir = "right", size = 12 }: { dir?: keyof typeof ARROW; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="aw-arrow">
      <path d={ARROW[dir]} />
    </svg>
  );
}

// ─────────────── button icons ───────────────

const ICON = { width: 14, height: 14, viewBox: "0 0 16 16", "aria-hidden": true, className: "aw-icon shrink-0" } as const;

/** The AI spark: marks every button that hands work to an AI agent. */
export function AiIcon() {
  return (
    <svg {...ICON} fill="currentColor">
      <path d="M8 1l1.6 4.4L14 7l-4.4 1.6L8 13l-1.6-4.4L2 7l4.4-1.6z" />
      <path d="M13 11l.6 1.4L15 13l-1.4.6L13 15l-.6-1.4L11 13l1.4-.6z" opacity=".7" />
    </svg>
  );
}

/** Put on the Editorial Calendar. */
export function CalendarIcon() {
  return (
    <svg {...ICON} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <rect x="2" y="3" width="12" height="11" rx="1.5" />
      <path d="M2 6.5h12M5 1.5v3M11 1.5v3" />
    </svg>
  );
}

/** Upload a file. */
export function UploadIcon() {
  return (
    <svg {...ICON} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 10V2M5 5l3-3 3 3M2 11v3h12v-3" />
    </svg>
  );
}
