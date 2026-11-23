// Interactive blocks a writer adds by hand from the editor's slash menu or the command menu: a calculator, a
// sample-size checker, an FAQ accordion, a trend chart, a rating scale and a checklist. Each is built by code from a
// small spec into one self-contained HTML block (inline CSS and JS, no outside scripts, no network). The block is
// saved as the editor's embed node, so it runs in the same sandbox and publishes through the same module contract
// (wpModules.ts) as every other interactive element. The spec rides along on the root (data-aw-block and
// data-aw-spec), so the block can be opened and changed later. The brand's colors and fonts come in as the --aw-*
// variables (blockTheme), with plain fallbacks. Each block reads without scripts: the default result is in the markup.
// Pure, shared by the browser and tests.
import type { BrandKit } from "./brandKit.ts";
import { calcResult, calculatorHtml, formulaLine, type CalcFormula, type CalculatorSpec } from "./interactiveTemplates.ts";

export const BLOCK_KINDS = ["calculator", "sample", "faq", "chart", "scale", "checklist"] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];
export const isBlockKind = (k: unknown): k is BlockKind => typeof k === "string" && (BLOCK_KINDS as readonly string[]).includes(k);

export const BLOCK_INFO: Record<BlockKind, { label: string; hint: string; keys: string }> = {
  calculator: { label: "Calculator", hint: "Readers enter a number and see the result", keys: "calculator calc number formula interactive" },
  sample: { label: "Sample-size checker", hint: "How many survey responses a group needs", keys: "sample size survey responses margin interactive" },
  faq: { label: "FAQ accordion", hint: "Questions that open to show the answer", keys: "faq questions accordion answers interactive" },
  chart: { label: "Trend chart", hint: "A line chart of values over time", keys: "chart graph trend line data interactive" },
  scale: { label: "Rating scale", hint: "Readers pick a score and see what it means", keys: "scale rating score slider nps interactive" },
  checklist: { label: "Checklist", hint: "Items readers tick off as they go", keys: "checklist todo tick list interactive" },
};

export type SampleSpec = { title: string; population: number; margin: number; rate: number; populationLabel: string };
export type FaqSpec = { items: { q: string; a: string }[] };
export type ChartSpec = { title: string; prefix: string; suffix: string; rows: { label: string; value: number }[]; note: string };
export type ScaleBand = { upTo: number; label: string; text: string };
export type ScaleSpec = { question: string; min: number; max: number; start: number; bands: ScaleBand[] };
export type ChecklistSpec = { title: string; items: string[] };
export type BlockSpec = {
  calculator: CalculatorSpec;
  sample: SampleSpec;
  faq: FaqSpec;
  chart: ChartSpec;
  scale: ScaleSpec;
  checklist: ChecklistSpec;
};

export const LIMITS = { faq: 12, chartRows: 24, checklist: 20, bands: 5 };

export const DEFAULT_SPEC: { [K in BlockKind]: BlockSpec[K] } = {
  calculator: {
    title: "Work out your number",
    formula: "multiply",
    input: { label: "Your monthly visitors", value: 1000, min: 0, max: 100000, step: 100, prefix: "", suffix: "" },
    factor: { low: 2, high: 2, label: "conversion rate" },
    result: { label: "Expected sign-ups", prefix: "", suffix: "" },
    note: "",
  },
  sample: { title: "How many responses do you need?", population: 5000, margin: 5, rate: 10, populationLabel: "People you can survey each month" },
  faq: { items: [{ q: "", a: "" }] },
  chart: { title: "", prefix: "", suffix: "", rows: [{ label: "Jan", value: 0 }], note: "" },
  scale: {
    question: "On a scale of 0 to 10, how likely are you to recommend us to a friend or colleague?",
    min: 0,
    max: 10,
    start: 8,
    bands: [
      { upTo: 6, label: "Detractor", text: "A score from 0 to 6 pulls the score down." },
      { upTo: 8, label: "Passive", text: "A 7 or 8 counts toward the total but does not move the score." },
      { upTo: 10, label: "Promoter", text: "A 9 or 10 adds to the score." },
    ],
  },
  checklist: { title: "", items: [""] },
};

// ─────────────── cleaning ───────────────
const str = (v: unknown, max: number, fallback = "") => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : fallback);
const num = (v: unknown, fallback: number, lo = -1e9, hi = 1e9) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};
const arr = (v: unknown) => (Array.isArray(v) ? v : []);
const rec = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

/** A spec from anywhere (a form, a saved block) made safe: every field present, in range and short enough. */
export function cleanSpec<K extends BlockKind>(kind: K, raw: unknown): BlockSpec[K] {
  const x = rec(raw);
  const d = DEFAULT_SPEC[kind];
  switch (kind) {
    case "calculator": {
      const c = d as CalculatorSpec;
      const i = rec(x.input);
      const f = rec(x.factor);
      const r = rec(x.result);
      const formula: CalcFormula = x.formula === "divide" || x.formula === "percent" ? x.formula : "multiply";
      const min = num(i.min, c.input.min);
      const max = Math.max(min + 1, num(i.max, c.input.max));
      const low = num(f.low, c.factor.low);
      const spec: CalculatorSpec = {
        title: str(x.title, 120, c.title) || c.title,
        formula,
        input: { label: str(i.label, 80, c.input.label) || c.input.label, value: num(i.value, c.input.value, min, max), min, max, step: num(i.step, c.input.step, 0.0001, max - min), prefix: str(i.prefix, 6), suffix: str(i.suffix, 12) },
        factor: { low, high: num(f.high, low), label: str(f.label, 80, c.factor.label) },
        result: { label: str(r.label, 80, c.result.label) || c.result.label, prefix: str(r.prefix, 6), suffix: str(r.suffix, 12) },
        note: str(x.note, 200),
      };
      return spec as BlockSpec[K];
    }
    case "sample": {
      const s = d as SampleSpec;
      return {
        title: str(x.title, 120, s.title) || s.title,
        population: Math.round(num(x.population, s.population, 1, 1e8)),
        margin: [3, 5, 10].includes(Number(x.margin)) ? Number(x.margin) : s.margin,
        rate: num(x.rate, s.rate, 1, 100),
        populationLabel: str(x.populationLabel, 80, s.populationLabel) || s.populationLabel,
      } as BlockSpec[K];
    }
    case "faq":
      return { items: arr(x.items).slice(0, LIMITS.faq).map((it) => ({ q: str(rec(it).q, 200), a: str(rec(it).a, 1200) })) } as BlockSpec[K];
    case "chart":
      return {
        title: str(x.title, 120),
        prefix: str(x.prefix, 6),
        suffix: str(x.suffix, 12),
        rows: arr(x.rows)
          .slice(0, LIMITS.chartRows)
          .map((r) => ({ label: str(rec(r).label, 24), value: num(rec(r).value, 0) })),
        note: str(x.note, 200),
      } as BlockSpec[K];
    case "scale": {
      const s = d as ScaleSpec;
      const min = Math.round(num(x.min, s.min, 0, 99));
      const max = Math.round(Math.max(min + 1, num(x.max, s.max, 1, 100)));
      const bands = arr(x.bands)
        .slice(0, LIMITS.bands)
        .map((b) => ({ upTo: Math.round(num(rec(b).upTo, max, min, max)), label: str(rec(b).label, 40), text: str(rec(b).text, 240) }))
        .sort((a, b) => a.upTo - b.upTo);
      if (bands.length && bands[bands.length - 1].upTo < max) bands[bands.length - 1].upTo = max;
      return { question: str(x.question, 240, s.question) || s.question, min, max, start: Math.round(num(x.start, s.start, min, max)), bands } as BlockSpec[K];
    }
    case "checklist":
      return { title: str(x.title, 120), items: arr(x.items).slice(0, LIMITS.checklist).map((t) => str(t, 200)) } as BlockSpec[K];
  }
  return d;
}

/** What must be filled in before a block can go in the article. Empty when it's ready. */
export function blockProblems<K extends BlockKind>(kind: K, spec: BlockSpec[K]): string[] {
  const out: string[] = [];
  if (kind === "faq") {
    const s = spec as FaqSpec;
    if (!s.items.some((i) => i.q && i.a)) out.push("Add at least one question with its answer.");
    if (s.items.some((i) => (i.q && !i.a) || (!i.q && i.a))) out.push("Every question needs an answer.");
  } else if (kind === "chart") {
    const s = spec as ChartSpec;
    if (!s.title) out.push("Give the chart a title.");
    if (s.rows.filter((r) => r.label).length < 2) out.push("Add at least two points, each with a label.");
  } else if (kind === "checklist") {
    const s = spec as ChecklistSpec;
    if (!s.title) out.push("Give the checklist a title.");
    if (!s.items.some(Boolean)) out.push("Add at least one item.");
  } else if (kind === "scale") {
    const s = spec as ScaleSpec;
    if (!s.bands.length || s.bands.some((b) => !b.label)) out.push("Every range needs a label.");
  } else if (kind === "calculator") {
    const s = spec as CalculatorSpec;
    if (!Number.isFinite(s.factor.low) || (s.formula === "divide" && s.input.min <= 0 && s.input.value === 0)) out.push("Check the numbers.");
  }
  return out;
}

// ─────────────── shared markup ───────────────
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const js = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");
const n2 = (n: number) => (Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 10) / 10).toLocaleString("en-US", { maximumFractionDigits: 1 });

/** The block's own look, from the --aw-* variables, with plain fallbacks for places that don't set them. */
const BASE = `.awb{--p:var(--aw-primary,#0943B0);--k:var(--aw-ink,#111111);--t:var(--aw-text,#2B3242);--m:var(--aw-muted,#5C6B89);--pa:var(--aw-paper,#FFFFFF);--su:var(--aw-surface,#F6F7F9);--l:var(--aw-line,#E3E6EB);--r:var(--aw-radius,6px);font-family:var(--aw-font-body,system-ui,-apple-system,"Segoe UI",sans-serif);color:var(--t);background:var(--su);border:1px solid var(--l);border-radius:var(--r);padding:20px;margin:0;font-size:16px;line-height:1.5;box-sizing:border-box}
.awb *{box-sizing:border-box}
.awb h3{font-family:var(--aw-font-heading,inherit);color:var(--k);font-size:18px;line-height:1.3;margin:0 0 14px}
.awb label{color:var(--k);font-weight:600;font-size:14px}
.awb input[type=number],.awb select{width:100%;min-height:40px;padding:0 10px;font:inherit;color:var(--k);background:var(--pa);border:1px solid var(--l);border-radius:var(--r)}
.awb .o{margin:16px 0 0;padding:14px 16px;background:var(--pa);border-radius:var(--r)}
.awb .o strong{display:block;color:var(--p);font-family:var(--aw-font-heading,inherit);font-size:28px;line-height:1.2}
.awb .s{margin:10px 0 0;font-size:14px;color:var(--m)}
.awb .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.awb :focus-visible{outline:2px solid var(--p);outline-offset:2px}`;

const PLAIN_VARS = "--aw-primary:#0943B0;--aw-ink:#111111;--aw-text:#2B3242;--aw-muted:#5C6B89;--aw-paper:#FFFFFF;--aw-surface:#F6F7F9;--aw-line:#E3E6EB;--aw-radius:6px;--aw-font-heading:system-ui,sans-serif;--aw-font-body:system-ui,sans-serif";

/** The root every block shares: the spec for editing later and the height a fixed CMS frame needs. */
const root = (kind: BlockKind, spec: unknown, height: number, body: string, css = "") =>
  `<div class="awb awb-${kind}" data-aw-block="${kind}" data-aw-spec="${encodeURIComponent(JSON.stringify(spec))}" data-aw-h="${Math.min(1400, Math.max(160, Math.ceil(height / 10) * 10))}"><style>${BASE}${css}</style>${body}</div>`;
const lines = (t: string, per: number) => Math.max(1, Math.ceil(t.length / per));

/** Sample size for a share at 95% confidence, corrected for a finite group. */
export function sampleSize(population: number, marginPoints: number) {
  const n0 = (1.96 * 1.96 * 0.25) / Math.pow(marginPoints / 100, 2);
  return Math.min(population, Math.ceil(n0 / (1 + (n0 - 1) / population)));
}

/** The chart's points on a 600 by 240 grid, with a y scale that starts at 0 or below and ends on a round step. */
export function chartScale(values: number[]) {
  let lo = Math.min(0, ...values);
  let hi = Math.max(0, ...values);
  const span = Math.max(hi - lo, 1);
  const raw = span / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= 5) ?? 10 * mag;
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  if (hi === lo) hi = lo + step;
  return { lo, hi, step };
}

// ─────────────── the blocks ───────────────
function sampleHtml(s: SampleSpec) {
  const n = sampleSize(s.population, s.margin);
  const send = Math.ceil(n / (s.rate / 100));
  const note = (nn: number, sd: number, pop: number, rate: number) =>
    sd > pop ? `At a ${rate}% response rate you'd need about ${sd.toLocaleString("en-US")} invitations, more than ${pop.toLocaleString("en-US")}. Widen the margin or raise the response rate.` : `At a ${rate}% response rate, send about ${sd.toLocaleString("en-US")} invitations. Uses a 95% confidence level.`;
  const css = `.awb .g{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}.awb .g label{display:flex;flex-direction:column;gap:6px}`;
  const body = `<h3>${esc(s.title)}</h3><div class="g"><label>${esc(s.populationLabel)}<input type="number" id="awb-p" min="1" inputmode="numeric" value="${s.population}"></label><label>Margin of error<select id="awb-m">${[3, 5, 10].map((m) => `<option value="${m}"${m === s.margin ? " selected" : ""}>± ${m} points</option>`).join("")}</select></label><label>Response rate (%)<input type="number" id="awb-r" min="1" max="100" inputmode="numeric" value="${s.rate}"></label></div><div class="o" aria-live="polite"><strong id="awb-n">${n.toLocaleString("en-US")} responses</strong><p class="s" id="awb-t">${esc(note(n, send, s.population, s.rate))}</p></div><script>(function(){var g=function(i){return document.getElementById(i)};function z(p,m){var n0=1.96*1.96*.25/Math.pow(m/100,2);return Math.min(p,Math.ceil(n0/(1+(n0-1)/p)))}function f(x){return x.toLocaleString("en-US")}function go(){var p=Math.max(1,Math.round(parseFloat(g("awb-p").value)||0)),m=parseFloat(g("awb-m").value)||5,r=Math.min(100,Math.max(1,parseFloat(g("awb-r").value)||10)),n=z(p,m),s=Math.ceil(n/(r/100));g("awb-n").textContent=f(n)+" responses";g("awb-t").textContent=s>p?"At a "+r+"% response rate you'd need about "+f(s)+" invitations, more than "+f(p)+". Widen the margin or raise the response rate.":"At a "+r+"% response rate, send about "+f(s)+" invitations. Uses a 95% confidence level."}["awb-p","awb-m","awb-r"].forEach(function(i){g(i).addEventListener("input",go)})})();</script>`;
  return root("sample", s, 72 + lines(s.title, 26) * 24 + 3 * 70 + 140, body, css);
}

function faqHtml(s: FaqSpec) {
  const items = s.items.filter((i) => i.q && i.a);
  const css = `.awb details{border-top:1px solid var(--l)}.awb details:first-of-type{border-top:0}.awb summary{cursor:pointer;list-style:none;display:flex;gap:12px;align-items:center;justify-content:space-between;padding:12px 0;font-weight:600;color:var(--k)}.awb summary::-webkit-details-marker{display:none}.awb summary:after{content:"+";color:var(--m);font-size:20px;line-height:1}.awb details[open] summary:after{content:"–"}.awb details p{margin:0 0 14px;color:var(--t)}`;
  const body = items.map((i, n) => `<details${n === 0 ? " open" : ""}><summary>${esc(i.q)}</summary><p>${esc(i.a)}</p></details>`).join("");
  const h = 72 + items.reduce((a, i, n) => a + 26 + lines(i.q, 26) * 24 + (n === 0 ? lines(i.a, 30) * 24 + 14 : 0), 0);
  return root("faq", s, h, body, css);
}

function chartHtml(s: ChartSpec) {
  const rows = s.rows.filter((r) => r.label);
  const W = 600;
  const H = 240;
  const L = 52;
  const R = 20;
  const T = 26;
  const B = 30;
  const { lo, hi, step } = chartScale(rows.map((r) => r.value));
  const x = (i: number) => (rows.length === 1 ? (L + W - R) / 2 : L + 14 + ((W - R - 10 - (L + 14)) * i) / (rows.length - 1));
  const y = (v: number) => T + ((H - T - B) * (hi - v)) / (hi - lo);
  const fmtV = (v: number) => `${s.prefix}${n2(v)}${s.suffix}`;
  const pts = rows.map((r, i) => [Math.round(x(i) * 10) / 10, Math.round(y(r.value) * 10) / 10]);
  const base = Math.round(y(Math.max(lo, Math.min(0, hi))) * 10) / 10;
  let grid = "";
  for (let v = lo; v <= hi + step / 1000; v += step) grid += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="${Math.abs(v) < step / 1000 ? "z" : "g"}"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${esc(fmtV(v))}</text>`;
  const path = pts.map((p) => p.join(",")).join("L");
  const last = rows.length - 1;
  const marks = pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="${i === last ? 5 : 4}" class="${i === last ? "e" : "d"}"/><text x="${p[0]}" y="${p[1] - 11}" text-anchor="middle" class="v">${esc(fmtV(rows[i].value))}</text><text x="${p[0]}" y="${H - 8}" text-anchor="middle">${esc(rows[i].label)}</text>`).join("");
  const area = rows.length > 1 ? `<path class="a" d="M${pts[0][0]},${base}L${path}L${pts[last][0]},${base}Z"/>` : "";
  const css = `.awb svg{display:block;width:100%;height:auto;overflow:visible}.awb text{fill:var(--m);font-size:12px;font-family:inherit}.awb .g{stroke:var(--l)}.awb .z{stroke:var(--m);stroke-opacity:.5}.awb .a{fill:var(--p);fill-opacity:.1}.awb .ln{fill:none;stroke:var(--p);stroke-width:2.5;stroke-linejoin:round}.awb .d{fill:var(--pa);stroke:var(--p);stroke-width:2}.awb .e{fill:var(--p)}.awb text.v{fill:var(--k);font-weight:600}`;
  const label = `${s.title}: ${rows.map((r) => `${r.label} ${fmtV(r.value)}`).join(", ")}`;
  const table = `<table class="sr"><caption>${esc(s.title)}</caption><tr><th scope="col">Label</th><th scope="col">Value</th></tr>${rows.map((r) => `<tr><td>${esc(r.label)}</td><td>${esc(fmtV(r.value))}</td></tr>`).join("")}</table>`;
  const body = `<h3>${esc(s.title)}</h3><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${area}${grid}<path class="ln" d="M${path}"/>${marks}</svg>${table}${s.note ? `<p class="s">${esc(s.note)}</p>` : ""}`;
  return root("chart", s, 72 + lines(s.title, 26) * 24 + 250 + (s.note ? lines(s.note, 30) * 22 + 12 : 0), body, css);
}

function scaleHtml(s: ScaleSpec) {
  const band = (v: number) => s.bands.find((b) => v <= b.upTo) ?? s.bands[s.bands.length - 1];
  const b0 = band(s.start);
  const span = s.max - s.min;
  const tones = ["#C0331B", "#9A5800", "#0A7A4B", "#0943B0", "#6D28D9"];
  const toneOf = (i: number, n: number) => (n === 3 ? tones[i] : tones[Math.min(tones.length - 1, i)]);
  let prev = s.min - 1;
  const segs = s.bands.map((b, i) => {
    const w = ((b.upTo - prev) / (span + 1)) * 100;
    prev = b.upTo;
    return `<i style="width:${w}%;background:${toneOf(i, s.bands.length)}"></i>`;
  });
  const ticks = Array.from({ length: span + 1 }, (_, i) => (span <= 10 || i % Math.ceil(span / 10) === 0 || i === span ? `<span style="left:${(i / span) * 100}%">${s.min + i}</span>` : "")).join("");
  const css = `.awb p.q{margin:0 0 14px;color:var(--k);font-weight:600}.awb input[type=range]{width:100%;margin:0;accent-color:var(--p);min-height:32px}.awb .b{display:flex;height:6px;border-radius:6px;overflow:hidden;margin:4px 9px 0;opacity:.35}.awb .b i{display:block;height:100%}.awb .tk{position:relative;height:18px;margin:6px 9px 0;font-size:12px;color:var(--m)}.awb .tk span{position:absolute;transform:translateX(-50%)}.awb .o{display:flex;gap:12px;align-items:baseline;flex-wrap:wrap}.awb .o strong{display:inline;font-size:28px}.awb .o b{color:var(--k)}.awb .o p{margin:0;flex:1 1 100%;color:var(--t)}`;
  const body = `<p class="q" id="awb-q">${esc(s.question)}</p><input type="range" id="awb-v" min="${s.min}" max="${s.max}" step="1" value="${s.start}" aria-labelledby="awb-q" aria-valuetext="${s.start}, ${esc(b0?.label ?? "")}"><div class="b" aria-hidden="true">${segs.join("")}</div><div class="tk" aria-hidden="true">${ticks}</div><div class="o" aria-live="polite"><strong id="awb-n">${s.start}</strong><b id="awb-l">${esc(b0?.label ?? "")}</b><p id="awb-t">${esc(b0?.text ?? "")}</p></div><script>(function(){var B=${js(s.bands)},v=document.getElementById("awb-v");v.addEventListener("input",function(){var x=parseInt(v.value,10),b=B.filter(function(q){return x<=q.upTo})[0]||B[B.length-1];document.getElementById("awb-n").textContent=x;document.getElementById("awb-l").textContent=b?b.label:"";document.getElementById("awb-t").textContent=b?b.text:"";v.setAttribute("aria-valuetext",x+", "+(b?b.label:""))})})();</script>`;
  const longest = s.bands.reduce((a, b) => Math.max(a, lines(b.text, 32)), 1);
  return root("scale", s, 72 + lines(s.question, 30) * 24 + 90 + 50 + longest * 24, body, css);
}

function checklistHtml(s: ChecklistSpec) {
  const items = s.items.filter(Boolean);
  const css = `.awb .pg{display:flex;align-items:center;gap:10px;margin:0 0 8px;font-size:13px;color:var(--m)}.awb .pg i{flex:1;height:4px;border-radius:4px;background:var(--l);overflow:hidden;position:relative}.awb .pg i b{position:absolute;inset:0 auto 0 0;width:0;background:var(--p);transition:width .2s}.awb ul{list-style:none;margin:0;padding:0}.awb li label{display:flex;gap:10px;align-items:flex-start;padding:8px 0;font-weight:400;font-size:16px;color:var(--t);cursor:pointer}.awb li input{width:18px;height:18px;margin:3px 0 0;flex:none;accent-color:var(--p)}.awb li input:checked+span{color:var(--m);text-decoration:line-through}`;
  const body = `<h3>${esc(s.title)}</h3><div class="pg"><i><b id="awb-b"></b></i><span id="awb-c" aria-live="polite">0 of ${items.length} done</span></div><ul>${items.map((t, i) => `<li><label><input type="checkbox" id="awb-${i}"><span>${esc(t)}</span></label></li>`).join("")}</ul><script>(function(){var b=[].slice.call(document.querySelectorAll(".awb-checklist input"));function go(){var k=b.filter(function(x){return x.checked}).length;document.getElementById("awb-b").style.width=(b.length?k/b.length*100:0)+"%";document.getElementById("awb-c").textContent=k===b.length?"All done":k+" of "+b.length+" done"}b.forEach(function(x){x.addEventListener("change",go)})})();</script>`;
  return root("checklist", s, 72 + lines(s.title, 26) * 24 + 30 + items.reduce((a, t) => a + 16 + lines(t, 30) * 24, 0), body, css);
}

function calcHtml(s: CalculatorSpec) {
  const inner = calculatorHtml(s, "");
  const tall = Number(inner.match(/data-aw-h="(\d+)"/)?.[1]) || 360;
  // The template reads the --aw-* variables with no fallbacks, so plain ones sit on html; a brand theme on :root wins.
  return `<div data-aw-block="calculator" data-aw-spec="${encodeURIComponent(JSON.stringify(s))}" data-aw-h="${tall}"><style>html{${PLAIN_VARS}}</style>${inner}</div>`;
}

/** The block's HTML, ready to go in the article as an embed. */
export function buildBlock<K extends BlockKind>(kind: K, raw: unknown): string {
  const s = cleanSpec(kind, raw);
  switch (kind) {
    case "calculator":
      return calcHtml(s as CalculatorSpec);
    case "sample":
      return sampleHtml(s as SampleSpec);
    case "faq":
      return faqHtml(s as FaqSpec);
    case "chart":
      return chartHtml(s as ChartSpec);
    case "scale":
      return scaleHtml(s as ScaleSpec);
    default:
      return checklistHtml(s as ChecklistSpec);
  }
}

/** The kind and spec of a block made here, read back from its HTML. Null for any other embed. */
export function readBlock(html: string): { kind: BlockKind; spec: BlockSpec[BlockKind] } | null {
  const m = html.match(/data-aw-block="([a-z]+)" data-aw-spec="([^"]*)"/);
  if (!m || !isBlockKind(m[1])) return null;
  try {
    return { kind: m[1], spec: cleanSpec(m[1], JSON.parse(decodeURIComponent(m[2]))) };
  } catch {
    return null;
  }
}

/** The brand's colors and fonts as the --aw-* variables, for a block's preview and for the saved block. */
export function blockTheme(kit: Pick<BrandKit, "colors" | "radius" | "siteFonts"> | null): string {
  if (!kit) return "";
  const c = kit.colors;
  const font = (f: string) => (f ? `"${f.replace(/["<>]/g, "")}", system-ui, sans-serif` : "system-ui, sans-serif");
  const safe = (v: string) => (/^#[0-9a-f]{3,8}$/i.test(v) ? v : "");
  const vars: [string, string][] = [
    ["--aw-primary", safe(c.primary)],
    ["--aw-ink", safe(c.ink)],
    ["--aw-text", safe(c.text)],
    ["--aw-muted", safe(c.muted)],
    ["--aw-paper", safe(c.paper)],
    ["--aw-surface", safe(c.surface)],
    ["--aw-line", safe(c.line)],
    ["--aw-radius", `${Math.min(12, Math.max(0, Math.round(kit.radius)))}px`],
    ["--aw-font-heading", font(kit.siteFonts?.heading ?? "")],
    ["--aw-font-body", font(kit.siteFonts?.body ?? "")],
  ];
  return `<style>:root{${vars
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}:${v}`)
    .join(";")}}</style>`;
}

/** A block with the brand's look in front, as it's saved in the article. */
export const themedBlock = (kind: BlockKind, spec: unknown, kit: Pick<BrandKit, "colors" | "radius" | "siteFonts"> | null) => {
  const html = buildBlock(kind, spec);
  // The theme goes inside the root, after its opening tag, so readBlock and data-aw-h still find the root first.
  return html.replace(/^(<div [^>]*>)/, `$1${blockTheme(kit)}`);
};

/** The block's text, for search and screen readers in places that strip scripts: one line per answer or item. */
export function blockText(kind: BlockKind, raw: unknown): string {
  const s = cleanSpec(kind, raw);
  if (kind === "faq") return (s as FaqSpec).items.map((i) => `${i.q} ${i.a}`).join(" ");
  if (kind === "checklist") return [(s as ChecklistSpec).title, ...(s as ChecklistSpec).items].join(" ");
  if (kind === "chart") return (s as ChartSpec).title;
  if (kind === "calculator") return `${(s as CalculatorSpec).title}. ${formulaLine(s as CalculatorSpec)}. ${calcResult(s as CalculatorSpec, (s as CalculatorSpec).input.value)}`;
  if (kind === "scale") return (s as ScaleSpec).question;
  return (s as SampleSpec).title;
}
