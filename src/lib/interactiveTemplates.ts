// Draft and Write, Phase 3 (docs/draft-and-write-build.md): the picker and the calculator, built by code from a small
// spec. Claude only fills the spec (which pick each answer points to, which note's numbers the formula uses); code
// checks it and renders one self-contained HTML block in the Brand Kit's colors and fonts (the --aw-* variables
// wrapModule sets). Each block passes validateModule and publishes through the data-aw-module contract like any
// module, and each carries a plain version (the formula, the answer table) inside the block and as article text.
// Pure, shared by the server and tests.
import type { FactNote } from "./articleNotes.ts";

export const TEMPLATE_KINDS = ["calculator", "picker"] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];
export const isTemplate = (type: string): type is TemplateKind => (TEMPLATE_KINDS as readonly string[]).includes(type);

/** The size budget for one template's HTML, so it fits the smallest CMS embed (Webflow's, check) with room to spare. */
export const TEMPLATE_BUDGET = 9_000;

export type CalcFormula = "multiply" | "divide" | "percent";
export type CalculatorSpec = {
  title: string;
  formula: CalcFormula;
  /** The reader's own number. */
  input: { label: string; value: number; min: number; max: number; step: number; prefix: string; suffix: string };
  /** The number from the note: low and high, the same number twice when it isn't a range. */
  factor: { low: number; high: number; label: string };
  result: { label: string; prefix: string; suffix: string };
  note: string;
};
export type PickerSpec = {
  title: string;
  questions: { text: string; answers: { label: string; pick: string }[] }[];
  picks: { name: string; why: string }[];
};
/** A block of article text, the shape writerDraft's blockNodes reads. */
export type TextBlock = { type: "p" | "ul"; text: string; items: string[]; rows: string[][] };
export type Built = { ok: true; html: string; text: TextBlock[] } | { ok: false; error: string };

// ─────────────── schemas and the prompt ───────────────
const S = { type: "string" } as const;
const N = { type: "number" } as const;
const obj = (properties: Record<string, unknown>) => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
export const CALCULATOR_SCHEMA = obj({
  title: S,
  formula: { type: "string", enum: ["multiply", "divide", "percent"] },
  input: obj({ label: S, value: N, min: N, max: N, step: N, prefix: S, suffix: S }),
  factor: obj({ low: N, high: N, label: S }),
  result: obj({ label: S, prefix: S, suffix: S }),
  note: S,
});
export const PICKER_SCHEMA = obj({
  title: S,
  questions: { type: "array", items: obj({ text: S, answers: { type: "array", items: obj({ label: S, pick: S }) } }) },
  picks: { type: "array", items: obj({ name: S, why: S }) },
});
export const specSchema = (kind: TemplateKind) => (kind === "calculator" ? CALCULATOR_SCHEMA : PICKER_SCHEMA);

/** The instructions for one template's spec, after the cached brand and research. */
export function specPrompt(
  kind: TemplateKind,
  m: { title: string; purpose: string; placement: string; inputs: string[]; outputs: string[]; data: string; why: string },
  ctx: { keyword: string; brand: string; section: string; notes: FactNote[]; picks: string[] },
  lastError?: string | null,
): string {
  const head = `Fill the spec for one ${kind} in ${ctx.brand}'s article on "${ctx.keyword}". It goes right after the section "${m.placement}". Code builds the ${kind} from the spec.

Planned: ${m.title}. ${m.purpose}
Inputs: ${m.inputs.join("; ") || "none"}. Outputs: ${m.outputs.join("; ") || "none"}.${m.data ? ` Data: ${m.data}` : ""}

The section it follows:
${ctx.section.slice(0, 3000)}
${lastError ? `\nThe last spec was refused: ${lastError} Fix that.\n` : ""}`;
  if (kind === "calculator") {
    const withNumbers = ctx.notes.filter((n) => n.numbers.length);
    return `${head}
Fact notes with numbers (the formula's number must come from one of these):
${withNumbers.map((n) => `${n.id}: ${n.fact} Quote: "${n.quote}"`).join("\n") || "none"}

Rules:
- formula: multiply (result = input × factor), divide (result = factor ÷ input) or percent (result = input × factor ÷ 100). Nothing else.
- factor: low and high are the number or range from one note's quote, written the same way (the same number twice when it isn't a range). label names it in a few words with its unit, like "$14 per seat a month".
- note: that note's id.
- input: the reader's own number (seats, km a week, monthly spend), never a fact. A sensible default value, min, max and step; prefix and suffix like "$" or " km" (empty when none).
- result: what comes out, with its prefix and suffix.
- title: a short name for the calculator. Labels are plain words, under 60 characters.`;
  }
  return `${head}
The article's picks: ${ctx.picks.join("; ") || "none"}

Rules:
- picks: 2 to 5 of the article's picks, named exactly as above, each with why: one sentence on who it fits, from the article.
- questions: 1 to 3 questions about the reader's situation, each with 2 to 4 short answers. Each answer's pick is the pick it points to, named exactly as in picks.
- Every pick is reachable from at least one answer.
- title: a short name for the picker. Plain words.`;
}

// ─────────────── checks ───────────────
const txt = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number.NaN);
/** A unit before or after a number, spaced the way it reads: "$70", "70 km", "70%", "USD 70". */
const pre = (v: unknown) => {
  const t = txt(v, 6);
  return /[A-Za-z]$/.test(t) ? `${t} ` : t;
};
const suf = (v: unknown) => {
  const t = txt(v, 12);
  return /^[A-Za-z0-9]/.test(t) ? ` ${t}` : t;
};
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** A number as a note writes it: "1,200" and "1200" match, "14.0" is "14". */
const same = (a: number, b: string) => Math.abs(a - Number(b)) < 1e-9;
const numbersIn = (t: string) => [...t.replace(/(\d),(?=\d{3}\b)/g, "$1").matchAll(/\d+(?:\.\d+)?/g)].map((m) => m[0]);

/** The calculator spec, checked: a formula from the fixed set, and its numbers from one note's quote. */
export function checkCalculator(x: unknown, notes: FactNote[]): { ok: true; spec: CalculatorSpec; note: FactNote } | { ok: false; error: string } {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, Record<string, unknown> | unknown>;
  const i = (o.input && typeof o.input === "object" ? o.input : {}) as Record<string, unknown>;
  const f = (o.factor && typeof o.factor === "object" ? o.factor : {}) as Record<string, unknown>;
  const r = (o.result && typeof o.result === "object" ? o.result : {}) as Record<string, unknown>;
  const formula = o.formula;
  if (formula !== "multiply" && formula !== "divide" && formula !== "percent") return { ok: false, error: "The formula must be multiply, divide or percent." };
  const note = notes.find((n) => n.id === txt(o.note, 10));
  if (!note) return { ok: false, error: "note must be the id of one fact note." };
  const low = num(f.low);
  const high = num(f.high);
  if (!(low > 0) || !(high >= low)) return { ok: false, error: "factor low and high must be numbers above 0, with high at least low." };
  const quoted = numbersIn(note.quote);
  for (const v of [low, high]) if (!quoted.some((q) => same(v, q))) return { ok: false, error: `The factor ${v} isn't in ${note.id}'s quote.` };
  const spec: CalculatorSpec = {
    title: txt(o.title, 80),
    formula,
    input: { label: txt(i.label, 60), value: num(i.value), min: num(i.min), max: num(i.max), step: num(i.step), prefix: pre(i.prefix), suffix: suf(i.suffix) },
    factor: { low, high, label: txt(f.label, 60) },
    result: { label: txt(r.label, 60), prefix: pre(r.prefix), suffix: suf(r.suffix) },
    note: note.id,
  };
  const { input } = spec;
  if (!spec.title || !input.label || !spec.result.label || !spec.factor.label) return { ok: false, error: "The title and every label need words." };
  if (![input.value, input.min, input.max, input.step].every(Number.isFinite)) return { ok: false, error: "The input's value, min, max and step must be numbers." };
  if (!(input.max > input.min) || !(input.step > 0) || input.value < input.min || input.value > input.max) return { ok: false, error: "The input needs min below max, a step above 0 and a default between them." };
  if ((input.max - input.min) / input.step > 10_000) return { ok: false, error: "The input's step is too small for its range." };
  if (formula === "divide" && input.min <= 0) return { ok: false, error: "A divide formula needs an input that can't be 0 (min above 0)." };
  return { ok: true, spec, note };
}

/** The picker spec, checked: every pick is one of the article's picks, and every answer points to one of them. */
export function checkPicker(x: unknown, articlePicks: string[]): { ok: true; spec: PickerSpec } | { ok: false; error: string } {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const known = new Map(articlePicks.map((p) => [norm(p), p]));
  if (known.size < 2) return { ok: false, error: "The article has fewer than 2 picks to choose between." };
  const picks: PickerSpec["picks"] = [];
  for (const p of Array.isArray(o.picks) ? o.picks : []) {
    const q = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
    const name = known.get(norm(txt(q.name, 120)));
    if (!name) return { ok: false, error: `"${txt(q.name, 120)}" isn't one of the article's picks.` };
    if (!picks.some((x) => x.name === name)) picks.push({ name, why: txt(q.why, 200) });
  }
  if (picks.length < 2 || picks.length > 5) return { ok: false, error: "The picker needs 2 to 5 picks." };
  const named = new Map(picks.map((p) => [norm(p.name), p.name]));
  const questions: PickerSpec["questions"] = [];
  for (const q of Array.isArray(o.questions) ? o.questions : []) {
    const qq = (q && typeof q === "object" ? q : {}) as Record<string, unknown>;
    const answers: PickerSpec["questions"][number]["answers"] = [];
    for (const a of Array.isArray(qq.answers) ? qq.answers : []) {
      const aa = (a && typeof a === "object" ? a : {}) as Record<string, unknown>;
      const pick = named.get(norm(txt(aa.pick, 120)));
      if (!pick) return { ok: false, error: `The answer "${txt(aa.label, 80)}" points to "${txt(aa.pick, 120)}", which isn't one of the picks.` };
      const label = txt(aa.label, 80);
      if (label) answers.push({ label, pick });
    }
    const text = txt(qq.text, 140);
    if (!text || answers.length < 2 || answers.length > 4) return { ok: false, error: "Each question needs words and 2 to 4 answers." };
    questions.push({ text, answers });
  }
  if (questions.length < 1 || questions.length > 3) return { ok: false, error: "The picker needs 1 to 3 questions." };
  const reached = new Set(questions.flatMap((q) => q.answers.map((a) => a.pick)));
  const lost = picks.find((p) => !reached.has(p.name));
  if (lost) return { ok: false, error: `No answer points to ${lost.name}.` };
  const title = txt(o.title, 80);
  if (!title || picks.some((p) => !p.why)) return { ok: false, error: "The title and each pick's why need words." };
  return { ok: true, spec: { title, questions, picks } };
}

// ─────────────── the math, shared by the markup and the script ───────────────
export function calc(formula: CalcFormula, x: number, f: number): number {
  if (formula === "multiply") return x * f;
  if (formula === "percent") return (x * f) / 100;
  return x === 0 ? 0 : f / x;
}
/** A result as people read it: whole numbers from 100 up, one decimal under it, thousands with commas. */
export function fmt(n: number): string {
  const r = Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 10) / 10;
  return r.toLocaleString("en-US", { maximumFractionDigits: 1 });
}
const show = (lo: number, hi: number, pre: string, suf: string) => (fmt(lo) === fmt(hi) ? `${pre}${fmt(lo)}${suf}` : `${pre}${fmt(lo)}${suf} to ${pre}${fmt(hi)}${suf}`);
export function calcResult(s: CalculatorSpec, x: number): string {
  const a = calc(s.formula, x, s.factor.low);
  const b = calc(s.formula, x, s.factor.high);
  return show(Math.min(a, b), Math.max(a, b), s.result.prefix, s.result.suffix);
}
export function formulaLine(s: CalculatorSpec): string {
  if (s.formula === "divide") return `${s.result.label} = ${s.factor.label} ÷ ${s.input.label}`;
  return `${s.result.label} = ${s.input.label} × ${s.factor.label}`;
}

// ─────────────── markup ───────────────
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** JSON for an inline script: nothing in it can close the script tag. */
const js = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");

const BASE = `.awm-root{font-family:var(--aw-font-body);color:var(--aw-text);background:var(--aw-surface);border:1px solid var(--aw-line);border-radius:var(--aw-radius);padding:20px;margin:0}
.awm-root h3{font-family:var(--aw-font-heading);color:var(--aw-ink);font-size:18px;line-height:1.3;margin:0 0 16px}
.awm-out{margin:20px 0 0;padding:16px;background:var(--aw-paper);border-radius:var(--aw-radius)}
.awm-out span{display:block;color:var(--aw-muted);font-size:14px}
.awm-out strong{display:block;color:var(--aw-primary);font-family:var(--aw-font-heading);font-size:28px;line-height:1.25;margin-top:4px;overflow-wrap:anywhere}
.awm-small{margin:12px 0 0;font-size:14px;color:var(--aw-muted)}
.awm-root :focus-visible{outline:2px solid var(--aw-primary);outline-offset:2px}`;

// ─────────────── height ───────────────
// Webflow, Shopify, HubSpot and Framer show a module in a frame of fixed height (wpModules.ts framedModules), so each
// template says how tall it gets on a 320px phone, where it's tallest: data-aw-h on its root, which docHtml reads.
const lines = (t: string, perLine: number) => Math.max(1, Math.ceil(t.length / perLine));
const TEXT = 30; // characters a line of 16px text holds in a 320px phone's frame
const BIG = 13; // the same for the 28px result
export function templateHeight(kind: TemplateKind, spec: CalculatorSpec | PickerSpec): number {
  let h = 40 + 32; // the card's padding and the page around it
  if (kind === "calculator") {
    const s = spec as CalculatorSpec;
    h += lines(s.title, 26) * 24 + 16 + lines(s.input.label, TEXT) * 22 + 8 + 52 + 52; // title, label, slider, number field
    h += 20 + 32 + 20 + lines(calcResult(s, s.input.max), BIG) * 35; // the result box at its longest
    h += 12 + lines(`${formulaLine(s)}. Source: xxxxxxxxxxxxxxxxxxxx`, 34) * 20;
  } else {
    const s = spec as PickerSpec;
    h += lines(s.title, 26) * 24 + 16;
    for (const q of s.questions) h += lines(q.text, TEXT) * 22 + 8 + q.answers.reduce((n, a) => n + 6 + Math.max(40, lines(a.label, 24) * 22 + 12), 0) + 16;
    const longest = s.picks.reduce((a, p) => Math.max(a, lines(p.name, BIG) * 35 + lines(p.why, TEXT) * 22), 0);
    h += 20 + 32 + 20 + 8 + longest + 16 + 32; // the result box at its longest, then All picks closed
  }
  return Math.min(1400, Math.ceil(h / 10) * 10 + 20);
}

/** The calculator as one block. The result for the default input is in the markup, so it reads without scripts. */
export function calculatorHtml(s: CalculatorSpec, source: string): string {
  const { input: i } = s;
  const css = `${BASE}
.awm-root label{display:block;font-weight:600;color:var(--aw-ink);margin-bottom:8px}
.awm-row{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.awm-row input[type=range]{flex:1 1 180px;min-height:40px;accent-color:var(--aw-primary);margin:0}
.awm-num{display:flex;align-items:center;gap:6px;color:var(--aw-muted)}
.awm-num input{width:120px;min-height:40px;box-sizing:border-box;padding:0 10px;font:inherit;color:var(--aw-ink);background:var(--aw-paper);border:1px solid var(--aw-line);border-radius:var(--aw-radius)}`;
  const attrs = `min="${i.min}" max="${i.max}" step="${i.step}" value="${i.value}"`;
  const script = `(function(){var S=${js({ f: s.formula, lo: s.factor.low, hi: s.factor.high, p: s.result.prefix, s: s.result.suffix })};
function c(x,f){return S.f==="multiply"?x*f:S.f==="percent"?x*f/100:(x===0?0:f/x)}
function m(n){var r=Math.abs(n)>=100?Math.round(n):Math.round(n*10)/10;return r.toLocaleString("en-US",{maximumFractionDigits:1})}
var r=document.getElementById("awm-r"),n=document.getElementById("awm-n"),v=document.getElementById("awm-v");
function go(x){if(!isFinite(x))return;var a=c(x,S.lo),b=c(x,S.hi),lo=Math.min(a,b),hi=Math.max(a,b);v.textContent=m(lo)===m(hi)?S.p+m(lo)+S.s:S.p+m(lo)+S.s+" to "+S.p+m(hi)+S.s}
r.addEventListener("input",function(){n.value=r.value;go(parseFloat(r.value))});
n.addEventListener("input",function(){var x=parseFloat(n.value);if(isFinite(x)){r.value=x;go(x)}});
})();`;
  return `<div class="awm-root awm-calc" data-aw-h="${templateHeight("calculator", s)}"><style>${css}</style><h3>${esc(s.title)}</h3><label for="awm-n">${esc(i.label)}</label><div class="awm-row"><input type="range" id="awm-r" aria-label="${esc(i.label)}" ${attrs}><span class="awm-num">${esc(i.prefix)}<input type="number" id="awm-n" inputmode="decimal" ${attrs}>${esc(i.suffix)}</span></div><div class="awm-out" aria-live="polite"><span>${esc(s.result.label)}</span><strong id="awm-v">${esc(calcResult(s, i.value))}</strong></div><p class="awm-small">${esc(formulaLine(s))}${source ? `. Source: ${esc(source)}` : ""}</p><script>${script}</script></div>`;
}

/** The picker as one block, with every pick and the answers that lead to it in a table that reads without scripts. */
export function pickerHtml(s: PickerSpec): string {
  const css = `${BASE}
.awm-q{border:0;padding:0;margin:0 0 16px}
.awm-q legend{font-weight:600;color:var(--aw-ink);margin-bottom:8px;padding:0}
.awm-a{display:flex;align-items:center;gap:10px;min-height:40px;padding:0 12px;margin-top:6px;background:var(--aw-paper);border:1px solid var(--aw-line);border-radius:var(--aw-radius);cursor:pointer}
.awm-a input{accent-color:var(--aw-primary);margin:0}
.awm-a:has(input:checked){border-color:var(--aw-primary)}
.awm-out p{margin:8px 0 0}
.awm-root details{margin-top:16px;font-size:14px}
.awm-root summary{cursor:pointer;color:var(--aw-primary);min-height:32px}
.awm-root table{width:100%;border-collapse:collapse;margin-top:8px}
.awm-root th,.awm-root td{text-align:left;vertical-align:top;padding:8px;border-top:1px solid var(--aw-line)}
.awm-root th{color:var(--aw-ink)}`;
  const qs = s.questions
    .map((q, qi) => `<fieldset class="awm-q"><legend>${esc(q.text)}</legend>${q.answers.map((a, ai) => `<label class="awm-a"><input type="radio" name="awm-q${qi}" value="${ai}">${esc(a.label)}</label>`).join("")}</fieldset>`)
    .join("");
  const rows = s.picks.map((p) => `<tr><th scope="row">${esc(p.name)}</th><td>${esc(p.why)}</td><td>${esc(fitsIf(s, p.name))}</td></tr>`).join("");
  const data = { q: s.questions.map((q) => q.answers.map((a) => s.picks.findIndex((p) => p.name === a.pick))), p: s.picks };
  const script = `(function(){var D=${js(data)};var root=document.currentScript.parentNode,v=root.querySelector("#awm-v"),w=root.querySelector("#awm-w");
function go(){var n=D.p.map(function(){return 0}),any=false;D.q.forEach(function(q,i){var c=root.querySelector('input[name="awm-q'+i+'"]:checked');if(c){any=true;n[q[+c.value]]++}});
if(!any)return;var best=0;n.forEach(function(x,i){if(x>n[best])best=i});v.textContent=D.p[best].name;w.textContent=D.p[best].why}
root.addEventListener("change",go)})();`;
  return `<div class="awm-root awm-pick" data-aw-h="${templateHeight("picker", s)}"><style>${css}</style><h3>${esc(s.title)}</h3>${qs}<div class="awm-out" aria-live="polite"><span>Best fit</span><strong id="awm-v">Pick an answer</strong><p id="awm-w"></p></div><details><summary>All picks</summary><table><thead><tr><th scope="col">Pick</th><th scope="col">Best for</th><th scope="col">Fits if</th></tr></thead><tbody>${rows}</tbody></table></details><script>${script}</script></div>`;
}

const fitsIf = (s: PickerSpec, name: string) =>
  s.questions
    .flatMap((q) => q.answers.filter((a) => a.pick === name).map((a) => a.label))
    .join("; ");

/** The plain version that goes in the article right after the block, for readers and crawlers without scripts. */
export function templateText(kind: TemplateKind, spec: CalculatorSpec | PickerSpec, source: string): TextBlock[] {
  const block = (type: "p" | "ul", text: string, items: string[] = []): TextBlock => ({ type, text, items, rows: [] });
  if (kind === "calculator") {
    const s = spec as CalculatorSpec;
    return [block("p", `${formulaLine(s)}. For ${s.input.prefix}${fmt(s.input.value)}${s.input.suffix}, that's ${calcResult(s, s.input.value)}.${source ? ` Source: ${source}.` : ""}`)];
  }
  const s = spec as PickerSpec;
  return [block("ul", "", s.picks.map((p) => `${p.name}: ${p.why}${fitsIf(s, p.name) ? ` Fits if: ${fitsIf(s, p.name)}.` : ""}`))];
}

/** One template from its spec: checked, rendered and kept under the size budget, or the reason it can't be built. */
export function buildTemplate(kind: TemplateKind, raw: unknown, ctx: { notes: FactNote[]; picks: string[]; sources: { n: number; domain: string }[] }): Built {
  let html: string;
  let text: TextBlock[];
  if (kind === "calculator") {
    const c = checkCalculator(raw, ctx.notes);
    if (!c.ok) return c;
    const source = ctx.sources.find((s) => s.n === c.note.source)?.domain ?? "";
    html = calculatorHtml(c.spec, source);
    text = templateText(kind, c.spec, source);
  } else {
    const c = checkPicker(raw, ctx.picks);
    if (!c.ok) return c;
    html = pickerHtml(c.spec);
    text = templateText(kind, c.spec, "");
  }
  if (html.length > TEMPLATE_BUDGET) return { ok: false, error: `It came out over ${TEMPLATE_BUDGET / 1000} KB; use shorter labels.` };
  return { ok: true, html, text };
}
