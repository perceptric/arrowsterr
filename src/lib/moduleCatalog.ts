// The interactive modules an article can carry (docs/content-grid.md, "Interactive modules"): what each kind is,
// when it helps the reader and how to build it. The brief picks from this list and the draft builds what it picked.
// Pure, shared by the server, the browser and the tests.

export type ModuleKind = {
  id: string;
  label: string;
  /** When it helps, for the brief's prompt. One line. */
  when: string;
  /** How to build it: layout, interaction and look. Added to the build prompt. */
  build: string;
};

export const MODULE_KINDS: ModuleKind[] = [
  {
    id: "table",
    label: "Data table",
    when: "Metrics, features, prices or specs that read best side by side.",
    build:
      "A styled data table. The header row is filled with --aw-primary and carries small uppercase white labels; body rows alternate --aw-paper and --aw-surface with hairline --aw-line borders; the first column is medium weight. Click a header to sort by it (an arrow shows the order), and the row under the pointer is tinted. On phones each row stacks into a small card with the header as its label.",
  },
  {
    id: "timeline",
    label: "Step flow",
    when: "A process, a playbook or steps in order, with a clear finish.",
    build:
      "A vertical step flow. Numbered round dots in --aw-primary sit on a thin faint line; each step is a card with a title and one or two sentences. The last step is the outcome: a check mark in a green dot and a lightly green card. Click a step (or press Next) to mark the steps up to it as done, with a small progress count at the top.",
  },
  {
    id: "pyramid",
    label: "Layered pyramid",
    when: "Layers, levels or a hierarchy where each level means something.",
    build:
      "A 3D pyramid drawn in inline SVG: 3 to 5 stacked layers, each with a front face and a darker side face in shades of --aw-primary (lightest at the top), a small layer number, a title and a short line in white. Hover or tap a layer to show a card beside the pyramid with the layer's name, a short summary and 2 or 3 actions as bullets; an empty dashed card says what to do before anything is picked. The SVG scales with its box; on phones the card sits under the pyramid.",
  },
  {
    id: "calculator",
    label: "Calculator",
    when: "Costs, savings, ROI or any number the reader can work out for themselves.",
    build:
      "A calculator: 2 to 5 inputs (sliders with a number field beside each, or plain number fields) on one side, and the result on the other in a large number with a one-line breakdown under it. The formula and the default values come from the sources and are named in a small line. Changing any input updates the result at once.",
  },
  {
    id: "comparison",
    label: "Comparison with filters",
    when: "Tools, plans or options compared, where readers care about different things.",
    build:
      "A comparison table with filters: toggle chips above it (for example price range, team size or a must-have feature) narrow the rows; the best match for the current filters gets a small tag. Ticks and crosses are drawn shapes with text for screen readers. A count says how many options match.",
  },
  {
    id: "checklist",
    label: "Checklist",
    when: "Tips, requirements or a to-do list the reader can work through.",
    build:
      "A checklist in 2 to 4 groups. Each item is a real checkbox with a label and an optional one-line detail that opens under it. A progress bar and a count (\"6 of 14 done\") sit at the top and fill as items are checked; a short message appears when all are done. A Reset button clears it.",
  },
  {
    id: "quiz",
    label: "Quiz",
    when: "Helping the reader pick the right option, or testing what they know.",
    build:
      "A short quiz: 3 to 6 questions shown one at a time with large answer buttons and a step count; Back goes to the last question. The end shows a result card that names the best fit (or the score) with two or three reasons and a Start over button.",
  },
  {
    id: "tabs",
    label: "Tabbed explainer",
    when: "One topic seen from several sides: by role, by industry or by plan.",
    build:
      "A tabbed explainer: 3 to 6 tabs in a row (a scrollable row on phones) with role=tablist; each panel holds a short heading, a few lines and a key fact. Arrow keys move between tabs. The picked tab has an --aw-primary underline.",
  },
  {
    id: "beforeafter",
    label: "Before and after",
    when: "Showing a change: without and with, old way and new way, a bad and a good example.",
    build:
      "A before and after slider: two panels of HTML (lists, mock screens or text examples, never images from the web) laid over each other, with a draggable divider driven by a range input (and arrow keys) that reveals one or the other. Labels \"Before\" and \"After\" sit in the top corners.",
  },
  {
    id: "stats",
    label: "Stat cards",
    when: "A few big numbers that make the point, each with its source.",
    build:
      "A row of 3 or 4 stat cards (a 2 by 2 grid on phones). Each number counts up once when the card scrolls into view (IntersectionObserver), with a short label and its source in small text. Click a card to flip it to one line of context. Respect prefers-reduced-motion by showing the final number at once.",
  },
  {
    id: "funnel",
    label: "Interactive funnel",
    when: "Stages people drop out of: visitors to leads to customers, or any pipeline.",
    build:
      "An interactive funnel: 3 to 6 stages drawn as bars that narrow from top to bottom, each with its name, count and rate. Inputs for the top number and each stage's conversion rate (from the sources as defaults) recompute every stage at once; the biggest drop gets a small tag.",
  },
  {
    id: "matrix",
    label: "2 by 2 matrix",
    when: "Placing options on two axes: effort and impact, cost and value, risk and reward.",
    build:
      "A 2 by 2 matrix: two labeled axes and four named quadrants, with 4 to 10 items placed as dots. Hover, tap or Tab to a dot to show a small card with its name and why it sits there. A row of buttons can filter the dots by group.",
  },
  {
    id: "scorecard",
    label: "Self-assessment",
    when: "Letting the reader grade where they stand and see what to fix first.",
    build:
      "A self-assessment: 5 to 10 statements, each answered on a 1 to 5 scale with radio buttons. A gauge and a grade update as answers come in; under it, the two weakest areas each get one concrete next step. A Reset button clears it.",
  },
];

/** Kinds older briefs may name, still built as before. */
const LEGACY: Record<string, string> = { roi: "ROI estimator", diagram: "Interactive diagram or tabs" };

export const MODULE_IDS = [...MODULE_KINDS.map((k) => k.id), ...Object.keys(LEGACY)];
export const kindOf = (id: string): ModuleKind | null => MODULE_KINDS.find((k) => k.id === id) ?? null;
export const kindLabel = (id: string) => kindOf(id)?.label ?? LEGACY[id] ?? id;

/** The list for the brief's prompt: each kind's id, name and when it helps. */
export const kindsForPrompt = () => MODULE_KINDS.map((k) => `${k.id} (${k.label}): ${k.when}`).join("\n");
