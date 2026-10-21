// The interactive modules an article can carry (docs/content-grid.md, "Interactive modules"): what each kind is,
// when it helps the reader, how to build it, and a small picture for the picker. The brief picks from this list,
// the draft builds what the brief picked, and the grid's side panel suggests kinds for a section from its text.
// Pure, shared by the server, the browser and the tests.

export type ModuleKind = {
  id: string;
  label: string;
  /** When it helps, for the brief's prompt and the picker's tooltip. One line. */
  when: string;
  /** How to build it: layout, interaction and look. Added to the build prompt. */
  build: string;
  /** Words in a section that call for it. */
  match: RegExp;
  /** A small picture for the picker, as SVG markup on a 120 by 72 box. Fixed text, never user input. */
  preview: string;
};

const A = "#3E63DD"; // the picture's accent
const L = "#D2DEFF"; // its light accent
const G = "#EBEBEB"; // grey line
const T = "#999999"; // grey text
const svg = (body: string) => `<svg viewBox="0 0 120 72" xmlns="http://www.w3.org/2000/svg" fill="none">${body}</svg>`;
const bar = (x: number, y: number, w: number, h: number, c: string, r = 1) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${c}"/>`;

export const MODULE_KINDS: ModuleKind[] = [
  {
    id: "table",
    label: "Data table",
    when: "Metrics, features, prices or specs that read best side by side.",
    build:
      "A styled data table. The header row is filled with --aw-primary and carries small uppercase white labels; body rows alternate --aw-paper and --aw-surface with hairline --aw-line borders; the first column is medium weight. Click a header to sort by it (an arrow shows the order), and the row under the pointer is tinted. On phones each row stacks into a small card with the header as its label.",
    match: /\b(metrics?|kpis?|specs?|features?|data|benchmarks?|numbers|at a glance|overview|breakdown|list of)\b/i,
    preview: svg(`${bar(6, 8, 108, 12, A)}${bar(6, 22, 108, 10, "#F6F7F9")}${bar(6, 34, 108, 10, "#FFFFFF")}${bar(6, 46, 108, 10, "#F6F7F9")}${bar(6, 58, 108, 8, "#FFFFFF")}<path d="M44 8v58" stroke="${G}"/>${bar(10, 13, 20, 2, "#FFFFFF")}${bar(50, 13, 30, 2, "#FFFFFF")}`),
  },
  {
    id: "timeline",
    label: "Step flow",
    when: "A process, a playbook or steps in order, with a clear finish.",
    build:
      "A vertical step flow. Numbered round dots in --aw-primary sit on a thin faint line; each step is a card with a title and one or two sentences. The last step is the outcome: a check mark in a green dot and a lightly green card. Click a step (or press Next) to mark the steps up to it as done, with a small progress count at the top.",
    match: /\b(steps?|process|how to|playbook|workflow|stages?|phases?|roadmap|timeline|checklist for|flow|sequence|first|then)\b/i,
    preview: svg(`<path d="M16 10v52" stroke="${L}" stroke-width="2"/><circle cx="16" cy="12" r="6" fill="${A}"/><circle cx="16" cy="36" r="6" fill="${A}"/><circle cx="16" cy="60" r="6" fill="#30A46C"/>${bar(30, 6, 82, 13, "#FFFFFF", 3)}<rect x="30" y="6" width="82" height="13" rx="3" stroke="${G}"/>${bar(30, 30, 82, 13, "#FFFFFF", 3)}<rect x="30" y="30" width="82" height="13" rx="3" stroke="${G}"/>${bar(30, 54, 82, 13, "#E6F6EB", 3)}`),
  },
  {
    id: "pyramid",
    label: "Layered pyramid",
    when: "Layers, levels or a hierarchy where each level means something.",
    build:
      "A 3D pyramid drawn in inline SVG: 3 to 5 stacked layers, each with a front face and a darker side face in shades of --aw-primary (lightest at the top), a small layer number, a title and a short line in white. Hover or tap a layer to show a card beside the pyramid with the layer's name, a short summary and 2 or 3 actions as bullets; an empty dashed card says what to do before anything is picked. The SVG scales with its box; on phones the card sits under the pyramid.",
    match: /\b(layers?|levels?|hierarchy|pyramid|tiers?|foundation|maslow|maturity|stack)\b/i,
    preview: svg(`<path d="M40 8 52 24H28z" fill="#A9BCF5"/><path d="M28 26h24l10 16H18z" fill="#6E8CEB"/><path d="M18 44h44l10 18H8z" fill="${A}"/><path d="M52 24l8-4 12 22-10 0z" fill="#8FA6F0" opacity=".5"/>${bar(80, 18, 34, 36, "#FFFFFF", 3)}<rect x="80" y="18" width="34" height="36" rx="3" stroke="${G}"/>${bar(85, 24, 18, 3, A)}${bar(85, 31, 24, 2, T)}${bar(85, 36, 20, 2, T)}`),
  },
  {
    id: "calculator",
    label: "Calculator",
    when: "Costs, savings, ROI or any number the reader can work out for themselves.",
    build:
      "A calculator: 2 to 5 inputs (sliders with a number field beside each, or plain number fields) on one side, and the result on the other in a large number with a one-line breakdown under it. The formula and the default values come from the sources and are named in a small line. Changing any input updates the result at once.",
    match: /\b(cost|costs|price|pricing|budget|roi|return|save|savings|estimate|how much|calculate|worth|salary|rate)\b/i,
    preview: svg(`${bar(6, 10, 50, 3, G)}${bar(6, 10, 30, 3, A)}<circle cx="36" cy="11.5" r="4" fill="${A}"/>${bar(6, 28, 50, 3, G)}${bar(6, 28, 18, 3, A)}<circle cx="24" cy="29.5" r="4" fill="${A}"/>${bar(6, 46, 50, 3, G)}${bar(6, 46, 40, 3, A)}<circle cx="46" cy="47.5" r="4" fill="${A}"/>${bar(66, 10, 48, 52, "#EDF2FE", 4)}${bar(72, 24, 34, 9, A)}${bar(72, 40, 26, 3, T)}`),
  },
  {
    id: "comparison",
    label: "Comparison with filters",
    when: "Tools, plans or options compared, where readers care about different things.",
    build:
      "A comparison table with filters: toggle chips above it (for example price range, team size or a must-have feature) narrow the rows; the best match for the current filters gets a small tag. Ticks and crosses are drawn shapes with text for screen readers. A count says how many options match.",
    match: /\b(vs\.?|versus|compare|comparison|alternatives?|best|top \d+|tools|options|plans|which one)\b/i,
    preview: svg(`${bar(6, 6, 22, 9, A, 4)}${bar(31, 6, 22, 9, "#EDF2FE", 4)}${bar(56, 6, 22, 9, "#EDF2FE", 4)}${bar(6, 20, 108, 10, "#F6F7F9")}${bar(6, 33, 108, 10, "#EDF2FE")}${bar(6, 46, 108, 10, "#FFFFFF")}${bar(6, 59, 108, 8, "#F6F7F9")}<path d="m80 38 3 3 5-6" stroke="#30A46C" stroke-width="2"/><path d="m80 51 6 4m0-4-6 4" stroke="#E5484D" stroke-width="2"/>`),
  },
  {
    id: "checklist",
    label: "Checklist",
    when: "Tips, requirements or a to-do list the reader can work through.",
    build:
      "A checklist in 2 to 4 groups. Each item is a real checkbox with a label and an optional one-line detail that opens under it. A progress bar and a count (\"6 of 14 done\") sit at the top and fill as items are checked; a short message appears when all are done. A Reset button clears it.",
    match: /\b(checklist|tips|requirements|to-do|todo|must-haves?|best practices|mistakes|dos and don.?ts|audit)\b/i,
    preview: svg(`${bar(6, 6, 108, 5, G, 2)}${bar(6, 6, 64, 5, A, 2)}${[18, 32, 46, 60].map((y, i) => `${bar(6, y, 9, 9, i < 2 ? A : "#FFFFFF", 2)}<rect x="6" y="${y}" width="9" height="9" rx="2" stroke="${i < 2 ? A : G}"/>${bar(20, y + 3, 60 - i * 6, 3, T)}`).join("")}`),
  },
  {
    id: "quiz",
    label: "Quiz",
    when: "Helping the reader pick the right option, or testing what they know.",
    build:
      "A short quiz: 3 to 6 questions shown one at a time with large answer buttons and a step count; Back goes to the last question. The end shows a result card that names the best fit (or the score) with two or three reasons and a Start over button.",
    match: /\b(which|choose|choosing|right for you|pick|should you|quiz|test your|is it worth|fit)\b/i,
    preview: svg(`${bar(6, 6, 60, 4, T)}${bar(6, 16, 108, 12, "#FFFFFF", 4)}<rect x="6" y="16" width="108" height="12" rx="4" stroke="${G}"/>${bar(6, 32, 108, 12, "#EDF2FE", 4)}<rect x="6" y="32" width="108" height="12" rx="4" stroke="${A}"/>${bar(6, 48, 108, 12, "#FFFFFF", 4)}<rect x="6" y="48" width="108" height="12" rx="4" stroke="${G}"/>${bar(6, 64, 30, 3, A)}`),
  },
  {
    id: "tabs",
    label: "Tabbed explainer",
    when: "One topic seen from several sides: by role, by industry or by plan.",
    build:
      "A tabbed explainer: 3 to 6 tabs in a row (a scrollable row on phones) with role=tablist; each panel holds a short heading, a few lines and a key fact. Arrow keys move between tabs. The picked tab has an --aw-primary underline.",
    match: /\b(for (teams|agencies|startups|enterprise)|by (role|industry|plan|size)|types of|kinds of|use cases|examples)\b/i,
    preview: svg(`${bar(6, 6, 26, 8, A, 2)}${bar(36, 6, 26, 8, "#F1F1F1", 2)}${bar(66, 6, 26, 8, "#F1F1F1", 2)}<path d="M6 16h108" stroke="${G}"/>${bar(6, 15, 26, 2, A)}${bar(6, 24, 50, 5, "#333333")}${bar(6, 34, 100, 3, T)}${bar(6, 41, 92, 3, T)}${bar(6, 48, 96, 3, T)}${bar(6, 58, 40, 8, "#EDF2FE", 2)}`),
  },
  {
    id: "beforeafter",
    label: "Before and after",
    when: "Showing a change: without and with, old way and new way, a bad and a good example.",
    build:
      "A before and after slider: two panels of HTML (lists, mock screens or text examples, never images from the web) laid over each other, with a draggable divider driven by a range input (and arrow keys) that reveals one or the other. Labels \"Before\" and \"After\" sit in the top corners.",
    match: /\b(before|after|without|with \w+|old way|new way|transformation|rewrite|good vs bad|example of)\b/i,
    preview: svg(`${bar(6, 6, 54, 60, "#F1F1F1", 3)}${bar(60, 6, 54, 60, "#EDF2FE", 3)}<path d="M60 4v64" stroke="${A}" stroke-width="2"/><circle cx="60" cy="36" r="6" fill="#FFFFFF" stroke="${A}" stroke-width="2"/>${bar(12, 12, 20, 3, T)}${bar(66, 12, 20, 3, A)}`),
  },
  {
    id: "stats",
    label: "Stat cards",
    when: "A few big numbers that make the point, each with its source.",
    build:
      "A row of 3 or 4 stat cards (a 2 by 2 grid on phones). Each number counts up once when the card scrolls into view (IntersectionObserver), with a short label and its source in small text. Click a card to flip it to one line of context. Respect prefers-reduced-motion by showing the final number at once.",
    match: /\b(statistics|stats|percent|%|survey|study|report|data shows|research|numbers)\b/i,
    preview: svg(`${[6, 46, 86].map((x) => `${bar(x, 14, 30, 44, "#FFFFFF", 3)}<rect x="${x}" y="14" width="30" height="44" rx="3" stroke="${G}"/>${bar(x + 5, 22, 18, 9, A)}${bar(x + 5, 38, 20, 3, T)}${bar(x + 5, 46, 14, 2, G)}`).join("")}`),
  },
  {
    id: "funnel",
    label: "Interactive funnel",
    when: "Stages people drop out of: visitors to leads to customers, or any pipeline.",
    build:
      "An interactive funnel: 3 to 6 stages drawn as bars that narrow from top to bottom, each with its name, count and rate. Inputs for the top number and each stage's conversion rate (from the sources as defaults) recompute every stage at once; the biggest drop gets a small tag.",
    match: /\b(funnel|pipeline|conversion|convert|leads?|drop.?off|stages|traffic to|visitors)\b/i,
    preview: svg(`${bar(10, 8, 100, 11, A, 2)}${bar(22, 23, 76, 11, "#6E8CEB", 2)}${bar(34, 38, 52, 11, "#A9BCF5", 2)}${bar(44, 53, 32, 11, L, 2)}`),
  },
  {
    id: "matrix",
    label: "2 by 2 matrix",
    when: "Placing options on two axes: effort and impact, cost and value, risk and reward.",
    build:
      "A 2 by 2 matrix: two labeled axes and four named quadrants, with 4 to 10 items placed as dots. Hover, tap or Tab to a dot to show a small card with its name and why it sits there. A row of buttons can filter the dots by group.",
    match: /\b(matrix|quadrant|prioriti[sz]e|effort|impact|trade.?offs?|risk|axis|map)\b/i,
    preview: svg(`<path d="M60 6v60M10 36h104" stroke="${G}"/>${bar(12, 8, 46, 26, "#F6F7F9")}${bar(62, 8, 50, 26, "#EDF2FE")}${bar(12, 38, 46, 26, "#F6F7F9")}${bar(62, 38, 50, 26, "#F6F7F9")}<circle cx="84" cy="18" r="4" fill="${A}"/><circle cx="96" cy="26" r="4" fill="${A}"/><circle cx="30" cy="50" r="4" fill="${T}"/><circle cx="78" cy="52" r="4" fill="${T}"/>`),
  },
  {
    id: "scorecard",
    label: "Self-assessment",
    when: "Letting the reader grade where they stand and see what to fix first.",
    build:
      "A self-assessment: 5 to 10 statements, each answered on a 1 to 5 scale with radio buttons. A gauge and a grade update as answers come in; under it, the two weakest areas each get one concrete next step. A Reset button clears it.",
    match: /\b(score|grade|assess|assessment|how (good|ready|mature)|benchmark yourself|maturity|readiness|health check)\b/i,
    preview: svg(`<path d="M22 50a24 24 0 0 1 48 0" stroke="${G}" stroke-width="8"/><path d="M22 50a24 24 0 0 1 38-19" stroke="${A}" stroke-width="8"/>${bar(36, 44, 20, 8, "#333333")}${[14, 28, 42, 56].map((y) => `${bar(80, y, 34, 3, T)}`).join("")}`),
  },
];

/** Kinds older briefs may name, still built as before. */
const LEGACY: Record<string, string> = { roi: "ROI estimator", diagram: "Interactive diagram or tabs" };

export const MODULE_IDS = [...MODULE_KINDS.map((k) => k.id), ...Object.keys(LEGACY)];
export const kindOf = (id: string): ModuleKind | null => MODULE_KINDS.find((k) => k.id === id) ?? null;
export const kindLabel = (id: string) => kindOf(id)?.label ?? LEGACY[id] ?? id;

/** The list for the brief's prompt: each kind's id, name and when it helps. */
export const kindsForPrompt = () => MODULE_KINDS.map((k) => `${k.id} (${k.label}): ${k.when}`).join("\n");

/**
 * The kinds that fit a section best, most fitting first: words in its H2 count three times, words in its text once.
 * When fewer than max match, the kinds that suit most articles fill the rest.
 */
export function suggestKinds(h2: string, text: string, max = 3): string[] {
  const hits = (s: string, re: RegExp) => (s.match(new RegExp(re.source, "gi")) ?? []).length;
  const scored = MODULE_KINDS.map((k, i) => ({ id: k.id, i, score: hits(h2, k.match) * 3 + Math.min(4, hits(text, k.match)) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((x) => x.id);
  return [...new Set([...scored, "table", "timeline", "checklist"])].slice(0, max);
}
