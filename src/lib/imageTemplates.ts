// Agentic Writing images (docs/agentic-writing.md, section 5): the drawn images as HTML pages in the brand's own
// look. The Fly worker opens each page in Chromium and takes a picture of #canvas. Claude never writes this HTML;
// it fills a small spec (IMAGE_SPEC_SCHEMA), and these fixed templates draw it with the Brand Kit's colors, fonts,
// corners and logo, in the Perceptric illustration style: a dotted canvas, ink outlines and offset color shadows.
// Pure, so tests run it offline. Every text is escaped; every size is fixed, so an image never comes out cramped.
import type { BrandKit } from "./brandKit.ts";
import { fontStack, type Font } from "./reportTheme.ts";
import type { ImageKind } from "./writerImageTypes.ts";

export type DrawnKind = Exclude<ImageKind, "screenshot">;
export const DRAWN_KINDS: readonly DrawnKind[] = ["featured", "chart", "steps", "comparison", "checklist", "anatomy"];
export const WIDTH = 1600;
export const FEATURED_HEIGHT = 840;
/** The screenshot inside a frame keeps its own 1440 pixels, so it is never scaled. */
export const SHOT = { width: 1440, height: 900 };
/** Where the worker puts the screenshot (a data: URL) in a frame page. */
export const SHOT_SLOT = "__SHOT__";

export type SpecItem = { label: string; text: string; value: string };
export type SpecColumn = { title: string; points: string[] };
export type ImageSpec = { kind: DrawnKind; title: string; subtitle: string; source: string; items: SpecItem[]; columns: SpecColumn[]; highlight: string };

// ─────────────── the spec Claude fills ───────────────
const S = { type: "string" } as const;
export const IMAGE_SPEC_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "title", "subtitle", "source", "items", "columns", "highlight"],
  properties: {
    kind: { type: "string", enum: [...DRAWN_KINDS] },
    title: S,
    subtitle: S,
    source: S,
    items: { type: "array", items: { type: "object", additionalProperties: false, required: ["label", "text", "value"], properties: { label: S, text: S, value: S } } },
    columns: { type: "array", items: { type: "object", additionalProperties: false, required: ["title", "points"], properties: { title: S, points: { type: "array", items: S } } } },
    highlight: S,
  },
} as const;

/** How many things each kind may hold, so every one fits at 30px text. */
export const LIMITS: Record<DrawnKind, { min: number; max: number }> = {
  featured: { min: 0, max: 3 },
  chart: { min: 2, max: 8 },
  steps: { min: 2, max: 8 },
  comparison: { min: 2, max: 3 },
  checklist: { min: 2, max: 10 },
  anatomy: { min: 2, max: 7 },
};
const MAX = { title: 110, subtitle: 160, source: 160, label: 60, text: 170, value: 24, point: 110, points: 6 };

/** The first number in a value: "$39/mo" is 39, "1,200" is 1200, "2.5M" is 2500000. Null when there is none. */
export function numberOf(v: string): number | null {
  const m = /(-?\d[\d,]*(?:\.\d+)?)\s*([kmb])?\b/i.exec(v.replace(/(\d),(?=\d{3}\b)/g, "$1"));
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const k = (m[2] ?? "").toLowerCase();
  return n * (k === "k" ? 1e3 : k === "m" ? 1e6 : k === "b" ? 1e9 : 1);
}

const tidy = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

/**
 * Claude's spec, checked. Text is trimmed; a spec with text too long to fit, too few or too many parts, or a chart
 * value with no number is refused with the reason, so the draft keeps a note there instead of a broken picture.
 */
export function cleanSpec(x: unknown, kind?: DrawnKind): { ok: true; spec: ImageSpec } | { ok: false; error: string } {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const k = (kind ?? o.kind) as DrawnKind;
  if (!DRAWN_KINDS.includes(k)) return { ok: false, error: "Unknown image kind." };
  const items: SpecItem[] = (Array.isArray(o.items) ? o.items : [])
    .map((i) => (i && typeof i === "object" ? (i as Record<string, unknown>) : {}))
    .map((i) => ({ label: tidy(i.label), text: tidy(i.text), value: tidy(i.value) }))
    .filter((i) => i.label || i.text || i.value);
  const columns: SpecColumn[] = (Array.isArray(o.columns) ? o.columns : [])
    .map((c) => (c && typeof c === "object" ? (c as Record<string, unknown>) : {}))
    .map((c) => ({ title: tidy(c.title), points: (Array.isArray(c.points) ? c.points : []).map(tidy).filter(Boolean) }))
    .filter((c) => c.title || c.points.length);
  const spec: ImageSpec = { kind: k, title: tidy(o.title), subtitle: tidy(o.subtitle), source: tidy(o.source), items, columns, highlight: tidy(o.highlight) };

  if (!spec.title) return { ok: false, error: "The image has no title." };
  if (spec.title.length > MAX.title) return { ok: false, error: "The title is too long to fit." };
  if (spec.subtitle.length > MAX.subtitle) return { ok: false, error: "The subtitle is too long to fit." };
  if (spec.source.length > MAX.source) return { ok: false, error: "The source line is too long to fit." };
  if (items.some((i) => i.label.length > MAX.label || i.text.length > MAX.text || i.value.length > MAX.value)) return { ok: false, error: "A part's text is too long to fit." };
  const lim = LIMITS[k];
  const count = k === "comparison" ? columns.length : items.length;
  if (count < lim.min) return { ok: false, error: `A ${k} needs at least ${lim.min} parts.` };
  if (count > lim.max) return { ok: false, error: `A ${k} holds at most ${lim.max} parts.` };
  if (k === "comparison" && columns.some((c) => !c.title || !c.points.length || c.points.length > MAX.points || c.points.some((p) => p.length > MAX.point))) return { ok: false, error: "Each column needs a title and 1 to 6 short points." };
  if (k === "chart") {
    if (items.some((i) => !i.label || numberOf(i.value) === null)) return { ok: false, error: "Every bar needs a label and a number." };
    if (items.some((i) => (numberOf(i.value) ?? 0) < 0)) return { ok: false, error: "Bars can't be below zero." };
    if (!spec.source) return { ok: false, error: "A chart needs its source." };
  }
  if ((k === "steps" || k === "checklist" || k === "anatomy") && items.some((i) => !i.label)) return { ok: false, error: "Every part needs a label." };
  return { ok: true, spec };
}

// ─────────────── the look ───────────────
export const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const HEX = /^#[0-9a-f]{6}$/i;
const color = (v: string, fallback: string) => (HEX.test(v) ? v : fallback);

type Look = { primary: string; secondary: string; ink: string; text: string; muted: string; paper: string; surface: string; line: string; dot: string; heading: string; body: string; radius: number; logo: string; name: string; fonts: string };

/** The kit as the templates use it: colors checked, corners kept between 6 and 18, the logo only from a web or data address. */
function look(kit: BrandKit | null): Look {
  const c = kit?.colors;
  const font = (f: Font | undefined): Font => f ?? "Inter";
  const heading = font(kit?.fonts.heading);
  const body = font(kit?.fonts.body);
  const fams = [...new Set([heading, body])].map((f) => `family=${f.replace(/ /g, "+")}${f === "DM Serif Display" || f === "Instrument Serif" ? "" : ":wght@400;500;600;700;800"}`);
  const logo = kit?.logo && (/^https:\/\//i.test(kit.logo) || /^data:image\/(png|jpeg|gif|webp|svg\+xml)[;,]/i.test(kit.logo)) ? kit.logo : "";
  return {
    primary: color(c?.primary ?? "", "#0943B0"),
    secondary: color(c?.secondary ?? "", "#F4B400"),
    ink: color(c?.ink ?? "", "#0B0D12"),
    text: color(c?.text ?? "", "#2D3748"),
    muted: color(c?.muted ?? "", "#5E6675"),
    paper: color(c?.paper ?? "", "#F7F8FC"),
    surface: color(c?.surface ?? "", "#FFFFFF"),
    line: color(c?.line ?? "", "#E3E8F2"),
    dot: "rgba(11,13,18,.16)",
    heading: fontStack(heading),
    body: fontStack(body),
    radius: Math.min(18, Math.max(6, Math.round(kit?.radius ?? 12))),
    logo,
    name: kit?.name ?? "",
    fonts: `https://fonts.googleapis.com/css2?${fams.join("&")}&display=swap`,
  };
}

function page(l: Look, body: string, extraCss: string, fixedHeight?: number) {
  return `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${esc(l.fonts)}"><style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:${l.paper}}
body{font-family:${l.body};color:${l.ink};-webkit-font-smoothing:antialiased}
#canvas{position:relative;width:${WIDTH}px;${fixedHeight ? `height:${fixedHeight}px;overflow:hidden;` : ""}padding:72px 80px 64px;background-color:${l.paper};background-image:radial-gradient(${l.dot} 1.8px,transparent 1.8px);background-size:30px 30px}
h1{font-family:${l.heading};font-size:54px;line-height:1.14;font-weight:700;letter-spacing:-.02em;color:${l.ink};max-width:1340px}
.sub{margin-top:16px;font-size:32px;line-height:1.4;color:${l.text};max-width:1340px}
.foot{margin-top:48px;display:flex;align-items:center;justify-content:space-between;gap:32px}
.src{font-size:30px;line-height:1.35;color:${l.muted}}
.logo{height:44px;max-width:260px;object-fit:contain}
.brand{font-family:${l.heading};font-size:32px;font-weight:700;color:${l.ink}}
.card{background:${l.surface};border:3px solid ${l.ink};border-radius:${l.radius}px}
.sh1{box-shadow:10px 10px 0 ${l.primary}}.sh2{box-shadow:10px 10px 0 ${l.secondary}}.sh3{box-shadow:10px 10px 0 ${l.ink}}
.num{flex:none;display:grid;place-items:center;width:64px;height:64px;border-radius:${Math.max(6, l.radius - 4)}px;border:3px solid ${l.ink};background:${l.primary};color:#fff;font-family:${l.heading};font-size:32px;font-weight:800;font-variant-numeric:tabular-nums}
${extraCss}
</style></head><body><div id="canvas">${body}</div></body></html>`;
}

const SH = ["sh1", "sh2", "sh3"];
const head = (s: ImageSpec) => `<h1>${esc(s.title)}</h1>${s.subtitle ? `<p class="sub">${esc(s.subtitle)}</p>` : ""}`;
/** The source line and the brand's logo (or name) under every drawn image. */
function foot(l: Look, source: string) {
  const mark = l.logo ? `<img class="logo" src="${esc(l.logo)}" alt="" onerror="this.remove()">` : l.name ? `<span class="brand">${esc(l.name)}</span>` : "";
  if (!source && !mark) return "";
  return `<div class="foot"><span class="src">${source ? `Source: ${esc(source.replace(/^source:\s*/i, ""))}` : ""}</span>${mark}</div>`;
}

// ─────────────── each kind ───────────────
function chart(l: Look, s: ImageSpec) {
  const values = s.items.map((i) => numberOf(i.value) ?? 0);
  const max = Math.max(...values, 0) || 1;
  const want = s.highlight.toLowerCase();
  let hi = s.items.findIndex((i) => want && i.label.toLowerCase() === want);
  if (hi < 0) hi = values.indexOf(Math.max(...values));
  const rows = s.items
    .map((i, k) => {
      const w = Math.max(1.5, (values[k] / max) * 100);
      return `<div class="lab">${esc(i.label)}</div><div class="row"><div class="bar${k === hi ? " on" : ""}" style="width:${w.toFixed(2)}%"></div><div class="val">${esc(i.value)}</div></div>${i.text ? `<div></div><div class="note">${esc(i.text)}</div>` : ""}`;
    })
    .join("");
  return page(
    l,
    `${head(s)}<div class="panel card sh1"><div class="bars">${rows}</div></div>${foot(l, s.source)}`,
    `.panel{margin-top:48px;padding:48px 52px}
.bars{display:grid;grid-template-columns:minmax(0,max-content) 1fr;column-gap:32px;row-gap:26px;align-items:center}
.lab{font-size:32px;font-weight:600;line-height:1.25;max-width:520px}
.row{display:flex;align-items:center;gap:20px;min-width:0}
.bar{height:48px;border-radius:0 ${Math.max(4, l.radius - 6)}px ${Math.max(4, l.radius - 6)}px 0;background:#B8BFCC;flex:none;max-width:calc(100% - 200px)}
.bar.on{background:${l.primary}}
.val{font-size:32px;font-weight:700;white-space:nowrap;font-variant-numeric:tabular-nums}
.note{margin-top:-14px;font-size:30px;color:${l.muted};line-height:1.35}`,
  );
}

function steps(l: Look, s: ImageSpec) {
  const n = s.items.length;
  const cols = n <= 4 ? n : 2;
  const tiles = s.items
    .map((i, k) => `<div class="tile card ${SH[k % 3]}"><div class="top"><span class="num">${k + 1}</span><h3>${esc(i.label)}</h3></div>${i.text ? `<p>${esc(i.text)}</p>` : ""}</div>`)
    .join("");
  return page(
    l,
    `${head(s)}<div class="grid" style="grid-template-columns:repeat(${cols},minmax(0,1fr))">${tiles}</div>${foot(l, s.source)}`,
    `.grid{margin-top:52px;display:grid;gap:40px 36px;padding-right:10px}
.tile{padding:32px 32px 36px}
.top{display:flex;align-items:center;gap:20px}
.tile h3{font-family:${l.heading};font-size:34px;line-height:1.2;font-weight:700;letter-spacing:-.01em}
.tile p{margin-top:18px;font-size:30px;line-height:1.42;color:${l.text}}
${cols >= 3 ? ".top{flex-direction:column;align-items:flex-start}" : ""}`,
  );
}

function comparison(l: Look, s: ImageSpec) {
  const cols = s.columns
    .map(
      (c, k) =>
        `<div class="col card ${SH[k % 3]}"><h3>${esc(c.title)}</h3><ul>${c.points.map((p) => `<li><span class="tick" style="background:${k === 0 ? l.primary : k === 1 ? l.secondary : l.ink}"></span><span>${esc(p)}</span></li>`).join("")}</ul></div>`,
    )
    .join("");
  return page(
    l,
    `${head(s)}<div class="grid" style="grid-template-columns:repeat(${s.columns.length},minmax(0,1fr))">${cols}</div>${foot(l, s.source)}`,
    `.grid{margin-top:52px;display:grid;gap:40px;align-items:stretch;padding-right:10px}
.col{padding:36px}
.col h3{font-family:${l.heading};font-size:38px;line-height:1.2;font-weight:700;padding-bottom:22px;margin-bottom:26px;border-bottom:3px solid ${l.ink}}
ul{list-style:none;display:grid;gap:22px}
li{display:flex;gap:18px;font-size:30px;line-height:1.4;color:${l.text}}
.tick{flex:none;width:22px;height:22px;margin-top:10px;border-radius:4px;border:3px solid ${l.ink}}`,
  );
}

function checklist(l: Look, s: ImageSpec) {
  const two = s.items.length > 5;
  const rows = s.items
    .map((i) => `<li><span class="box"><svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span><span><b>${esc(i.label)}</b>${i.text ? `<span class="t">${esc(i.text)}</span>` : ""}</span></li>`)
    .join("");
  return page(
    l,
    `${head(s)}<div class="panel card sh1"><ul class="${two ? "two" : ""}">${rows}</ul></div>${foot(l, s.source)}`,
    `.panel{margin-top:48px;padding:48px 52px}
ul{list-style:none;display:grid;gap:30px}
ul.two{grid-template-columns:1fr 1fr;column-gap:56px}
li{display:flex;gap:22px;align-items:flex-start}
.box{flex:none;display:grid;place-items:center;width:48px;height:48px;border-radius:${Math.max(4, l.radius - 6)}px;border:3px solid ${l.ink};background:${l.primary}}
b{display:block;font-size:32px;line-height:1.3;font-weight:700}
.t{display:block;margin-top:6px;font-size:30px;line-height:1.4;color:${l.text}}`,
  );
}

function anatomy(l: Look, s: ImageSpec) {
  const heights = [64, 104, 84, 120, 72, 96, 68];
  const fills = [l.primary, l.line, l.secondary, l.line, l.primary, l.line, l.secondary];
  const blocks = s.items
    .map((_, k) => `<div class="blk" style="height:${heights[k % heights.length]}px;background:${fills[k % fills.length]}"><span class="num">${k + 1}</span></div>`)
    .join("");
  const legend = s.items.map((i, k) => `<li><span class="num">${k + 1}</span><span><b>${esc(i.label)}</b>${i.text ? `<span class="t">${esc(i.text)}</span>` : ""}</span></li>`).join("");
  return page(
    l,
    `${head(s)}<div class="split"><div class="win card sh1"><div class="bar"><i></i><i></i><i></i></div><div class="blocks">${blocks}</div></div><ul>${legend}</ul></div>${foot(l, s.source)}`,
    `.split{margin-top:52px;display:grid;grid-template-columns:520px 1fr;gap:72px;align-items:center}
.win{overflow:hidden}
.bar{height:56px;border-bottom:3px solid ${l.ink};display:flex;align-items:center;gap:12px;padding:0 22px;background:${l.surface}}
.bar i{width:16px;height:16px;border-radius:50%;border:2.5px solid ${l.ink};background:${l.paper}}
.blocks{display:grid;gap:22px;padding:30px 30px 34px 34px}
.blk{position:relative;border:3px solid ${l.ink};border-radius:${Math.max(4, l.radius - 6)}px}
.blk .num{position:absolute;left:-18px;top:50%;transform:translateY(-50%);width:48px;height:48px;font-size:26px;background:${l.ink}}
ul{list-style:none;display:grid;gap:30px}
li{display:flex;gap:22px;align-items:flex-start}
li .num{width:56px;height:56px;font-size:28px;background:${l.ink}}
b{display:block;font-family:${l.heading};font-size:34px;line-height:1.25;font-weight:700}
.t{display:block;margin-top:6px;font-size:30px;line-height:1.4;color:${l.text}}`,
  );
}

const SPARK = (fill: string, x: number, y: number, size: number) =>
  `<svg style="position:absolute;left:${x}px;top:${y}px" width="${size}" height="${size}" viewBox="0 0 40 40"><path d="M20 0C21.6 12 28 18.4 40 20 28 21.6 21.6 28 20 40 18.4 28 12 21.6 0 20 12 18.4 18.4 12 20 0Z" fill="${fill}"/></svg>`;

/** The post's featured image: the logo, the title and a small wireframe that hints at an article, 1600 by 840. */
function featured(l: Look, s: ImageSpec) {
  const size = s.title.length > 80 ? 52 : s.title.length > 56 ? 60 : 68;
  const labels = s.items.map((i) => i.label).filter(Boolean).slice(0, 3);
  // A logo that fails to load takes its badge with it, so a broken picture never shows.
  const mark = l.logo ? `<img src="${esc(l.logo)}" alt="" onerror="this.parentElement.remove()">` : `<span class="brand">${esc(l.name)}</span>`;
  const card = (x: number, y: number, sh: string, bar: string, label?: string) =>
    `<div class="mini card ${sh}" style="left:${x}px;top:${y}px">${label ? `<span class="ml">${esc(label)}</span>` : `<span class="ln" style="width:150px;background:${bar}"></span>`}<span class="ln g" style="width:200px"></span><span class="ln g" style="width:160px"></span></div>`;
  return page(
    l,
    `${l.logo || l.name ? `<div class="badge card sh1">${mark}</div>` : ""}
<div class="left"><h1 class="ft" style="font-size:${size}px">${esc(s.title)}</h1>${s.subtitle ? `<p class="fs">${esc(s.subtitle)}</p>` : ""}</div>
<div class="win card sh1"><div class="bar"><i></i><i></i><i></i></div>
<span class="ln" style="width:300px;background:${l.ink};top:92px"></span><span class="ln" style="width:220px;background:${l.ink};top:128px"></span>
<span class="ln g s" style="width:380px;top:180px"></span><span class="ln g s" style="width:330px;top:206px"></span>
<span class="blk" style="top:250px"></span>
<span class="ln" style="width:170px;height:40px;border-radius:${Math.max(4, l.radius - 4)}px;background:${l.primary};top:408px"></span>
<span class="ln g s" style="width:360px;top:476px"></span></div>
${card(840, 420, "sh2", l.secondary, labels[0])}${card(1290, 150, "sh3", l.primary, labels[1])}${labels[2] ? card(1300, 600, "sh1", l.primary, labels[2]) : ""}
${SPARK(l.primary, 1460, 60, 52)}${SPARK(l.secondary, 92, 740, 40)}${SPARK(l.primary, 790, 120, 34)}`,
    `#canvas{padding:0}
.badge{position:absolute;left:80px;top:64px;display:flex;align-items:center;height:96px;padding:0 32px;box-shadow:8px 8px 0 ${l.primary}}
.badge img{height:52px;max-width:300px;object-fit:contain}
.left{position:absolute;left:80px;top:190px;bottom:80px;width:720px;display:flex;flex-direction:column;justify-content:center;gap:28px}
.ft{font-family:${l.heading};line-height:1.1;font-weight:800;letter-spacing:-.025em;max-width:none}
.fs{font-size:32px;line-height:1.4;color:${l.text}}
.win{position:absolute;left:900px;top:130px;width:480px;height:560px;overflow:hidden}
.win .bar{height:52px;border-bottom:3px solid ${l.ink};display:flex;align-items:center;gap:10px;padding:0 18px}
.win .bar i{width:14px;height:14px;border-radius:50%;border:2.5px solid ${l.ink};background:${l.paper}}
.ln{position:absolute;left:36px;display:block;height:20px;border-radius:10px}
.ln.g{background:${l.line}}.ln.s{height:13px;border-radius:7px}
.blk{position:absolute;left:36px;width:404px;height:128px;border:3px solid ${l.ink};border-radius:${Math.max(4, l.radius - 4)}px;background:${l.paper}}
.mini{position:absolute;width:280px;height:150px;padding:28px 26px;display:flex;flex-direction:column;gap:14px}
.mini .ln{position:static;height:18px}.mini .ln.g{height:12px}
.ml{font-family:${l.heading};font-size:30px;font-weight:700;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}`,
    FEATURED_HEIGHT,
  );
}

/** A drawn image as a page for the worker to picture (#canvas). */
export function renderImage(spec: ImageSpec, kit: BrandKit | null): string {
  const l = look(kit);
  switch (spec.kind) {
    case "featured":
      return featured(l, spec);
    case "chart":
      return chart(l, spec);
    case "steps":
      return steps(l, spec);
    case "comparison":
      return comparison(l, spec);
    case "checklist":
      return checklist(l, spec);
    case "anatomy":
      return anatomy(l, spec);
  }
}

/**
 * The browser frame a screenshot sits in, with the page's address in the bar, like the blog's framed shots.
 * The worker swaps SHOT_SLOT for the picture it took (a data: URL), so the screenshot keeps its own pixels.
 */
export function renderFrame(address: string, kit: BrandKit | null): string {
  const l = look(kit);
  const shown = address.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "").slice(0, 80);
  const side = (WIDTH - SHOT.width - 6) / 2;
  return page(
    l,
    `<div class="frame"><div class="bar"><i></i><i></i><i></i><span class="addr">${esc(shown)}</span></div><img class="shot" src="${SHOT_SLOT}" width="${SHOT.width}" height="${SHOT.height}" alt=""></div>`,
    `#canvas{padding:44px ${side}px 52px}
.frame{width:${SHOT.width + 6}px;border:3px solid ${l.ink};border-radius:${l.radius + 2}px;overflow:hidden;background:${l.surface};box-shadow:12px 12px 0 ${l.primary}}
.bar{height:68px;display:flex;align-items:center;gap:12px;padding:0 24px;border-bottom:3px solid ${l.ink};background:${l.surface}}
.bar i{flex:none;width:18px;height:18px;border-radius:50%;border:2.5px solid ${l.ink};background:${l.paper}}
.bar i:nth-child(1){background:#FF5F57}.bar i:nth-child(2){background:#FEBC2E}.bar i:nth-child(3){background:#28C840}
.addr{margin-left:20px;flex:1;max-width:900px;height:44px;display:flex;align-items:center;padding:0 22px;border-radius:${Math.max(4, l.radius - 4)}px;background:${l.paper};border:2px solid ${l.line};font-size:30px;color:${l.muted};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.shot{display:block;width:${SHOT.width}px;height:${SHOT.height}px}`,
  );
}
