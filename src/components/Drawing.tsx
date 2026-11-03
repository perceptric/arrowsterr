"use client";

import { useId } from "react";

// The drawing on an empty screen, after Omniscient's (its src/components/Drawing.tsx): a tile seen from above at an
// angle, on a soft plate, with the tool's sign on its top. Ink lines, a white top, dotted gray sides. Each sign is
// drawn flat on a 24-unit square and laid onto the tile with one isometric transform, so every drawing shares one
// angle and one line weight. The sign is Signal Blue, the screen's one signal.
// Motion (calm-ui.css): the screen rises in, the tile settles, the sign draws itself, then the tile floats.

export type DrawingKind = "library" | "articles" | "calendar" | "prompts" | "perception" | "sources" | "search";

// Every line has pathLength 1, so one dash animation draws any sign.
const L = { pathLength: 1 } as const;
const SIGNS: Record<DrawingKind, React.ReactNode> = {
  library: (
    <>
      <path {...L} d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
      <path {...L} d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" />
      <path {...L} d="M9 8h7M9 11h5" />
    </>
  ),
  articles: (
    <>
      <path {...L} d="M6 3h9l4 4v14H6z" />
      <path {...L} d="M15 3v4h4M9 11h7M9 14h7M9 17h4" />
    </>
  ),
  calendar: (
    <>
      <rect {...L} x="3" y="5" width="18" height="16" rx="2" />
      <path {...L} d="M3 10h18M8 3v4M16 3v4M8 14h3M8 17h6" />
    </>
  ),
  prompts: (
    <>
      <path {...L} d="M4 5h16v11H9l-5 4z" />
      <path {...L} d="M8 9.5h8M8 12.5h5" />
    </>
  ),
  perception: (
    <>
      <path {...L} d="M12 3l8.5 6.2-3.2 10H6.7L3.5 9.2z" />
      <path {...L} d="M12 8.5l4 2.9-1.5 4.6h-5L8 11.4z" />
    </>
  ),
  sources: (
    <>
      <path {...L} d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path {...L} d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </>
  ),
  search: (
    <>
      <circle {...L} cx="11" cy="11" r="7" />
      <path {...L} d="M20 20l-3.5-3.5" />
    </>
  ),
};

// Flat (x, y) on the tile to the screen: 30° isometric.
const C = 0.866;
const iso = (x: number, y: number, z = 0): [number, number] => [(x - y) * C, (x + y) * 0.5 - z];
const pts = (list: [number, number][]) => list.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

export function Drawing({ kind, size = 220 }: { kind: DrawingKind; size?: number }) {
  const dots = useId().replace(/:/g, "");
  const h = 40; // half the tile's side
  const t = 12; // the tile's thickness
  const P = (x: number, y: number, z = 0) => iso(x, y, z);
  const top = [P(-h, -h, t), P(h, -h, t), P(h, h, t), P(-h, h, t)];
  const left = [P(-h, h, t), P(h, h, t), P(h, h), P(-h, h)];
  const right = [P(h, -h, t), P(h, h, t), P(h, h), P(h, -h)];
  const k = 2.7;
  const sign = `matrix(${C * k} ${0.5 * k} ${-C * k} ${0.5 * k} ${P(-12 * k, -12 * k, t).join(" ")})`;
  const [vx, vy, vw, vh] = [-110, -62, 220, 150];
  return (
    <svg width={size} height={(size * vh) / vw} viewBox={`${vx} ${vy} ${vw} ${vh}`} fill="none" aria-hidden="true" className="aw-drawing shrink-0">
      <defs>
        <pattern id={dots} width="3" height="3" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r="0.55" fill="var(--text-primary)" opacity="0.4" />
        </pattern>
      </defs>
      <g transform={`matrix(${C} 0.5 ${-C} 0.5 0 0)`}>
        <rect x={-h - 22} y={-h - 22} width={2 * h + 44} height={2 * h + 44} rx="22" fill="var(--bg-tertiary)" stroke="var(--border-strong)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </g>
      <ellipse className="aw-drawing__shadow" cx="0" cy={h * 0.5 + 6} rx={h * 1.25} ry={h * 0.42} fill="var(--text-primary)" opacity="0.06" />
      <g className="aw-drawing__tile">
        <g stroke="var(--text-primary)" strokeWidth="1.5" strokeLinejoin="round">
          <polygon points={pts(left)} fill="var(--bg-quaternary)" />
          <polygon points={pts(left)} fill={`url(#${dots})`} />
          <polygon points={pts(right)} fill="var(--bg-tertiary)" />
          <polygon points={pts(right)} fill={`url(#${dots})`} />
          <polygon points={pts(top)} fill="var(--bg-primary)" />
        </g>
        <g transform={sign} stroke="var(--signal)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" className="aw-drawing__sign [&_*]:[vector-effect:non-scaling-stroke]">
          {SIGNS[kind]}
        </g>
      </g>
    </svg>
  );
}

/** An empty screen: the drawing, a short title, one line and the button that makes the first one. */
export function EmptyScreen({ drawing, title, children, action }: { drawing: DrawingKind; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="aw-empty flex min-h-[calc(100dvh-220px)] flex-col items-center justify-center px-6 py-12 text-center">
      <Drawing kind={drawing} />
      <h2 className="aw-empty__title mt-6 text-[17px] font-medium tracking-[-0.01em] text-ink">{title}</h2>
      {children ? <p className="mt-1.5 max-w-sm text-[13.5px] leading-5 text-muted">{children}</p> : null}
      {action ? <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
    </section>
  );
}
