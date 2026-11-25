// A rough sketch of each visual the outline plans (an image or an interactive module), drawn from what the brief
// already says about it, so a person can see what it will be before the draft makes it. No AI: steps from the
// image's description or the section's subheadings, bars from a chart's numbers, a grid from a table's rows, input
// fields from a module's inputs. Pure, so tests cover the mapping and the browser draws it (VisualSketch.tsx).

export type Sketch =
  | { kind: "steps"; steps: string[] }
  | { kind: "bars"; bars: { label: string; value: number }[] }
  | { kind: "grid"; cols: string[]; rows: string[] }
  | { kind: "checks"; items: string[] }
  | { kind: "parts"; parts: string[] }
  | { kind: "browser"; url: string }
  | { kind: "form"; inputs: string[]; output: string };

const MAX = 5;
/** A label short enough for a sketch: the first few words, without "Step 1:" or list marks. */
export const shortLabel = (s: string, words = 3) =>
  s
    .replace(/^\s*(step\s*\d+\s*[:.\-–—]\s*|\d+[.)]\s*|[-•*]\s*)/i, "")
    .replace(/[.:;]+$/, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, words)
    .join(" ");

const FILLER = /^(a|an|and|for|from|in|into|of|on|or|the|their|them|to|with|your)$/i;
/** A step's name in a box: its first two words, without a trailing "into", "your" or the like, capitalized. */
export const stepLabel = (s: string) => {
  const words = shortLabel(s, 2).split(" ");
  while (words.length > 1 && FILLER.test(words[words.length - 1])) words.pop();
  const t = words.join(" ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** The pieces of a description like "collect, sort, then subtract" or "Collect → Sort → Subtract". */
function piecesOf(text: string): string[] {
  const parts = text
    .split(/\s*(?:→|->|>|;|,|\bthen\b|\band then\b|\n)\s*/i)
    .map((p) => p.replace(/^(and|or)\s+/i, "").trim())
    .filter((p) => p.length > 1);
  return parts.length >= 2 ? parts : [];
}

/** Lines and cells of a module's free-form data: rows on new lines (or ";"), cells split by "|", tabs or ",". */
function tableOf(data: string): string[][] {
  return data
    .split(/\n|;/)
    .map((l) => l.trim().replace(/^\||\|$/g, ""))
    .filter((l) => l && !/^[-|:\s]+$/.test(l))
    .map((l) =>
      l
        .split(/\s*\|\s*|\t|\s*,\s*/)
        .map((c) => c.trim())
        .filter(Boolean),
    );
}

/** "Promoters: 60; Passives: 25" or "Promoters 60, Passives 25" as labeled values. */
export function numbersIn(text: string): { label: string; value: number }[] {
  const out: { label: string; value: number }[] = [];
  for (const m of text.matchAll(/([A-Za-z][A-Za-z0-9 &/'()-]{0,40}?)\s*[:=]?\s*\$?(-?\d[\d,]*(?:\.\d+)?)\s*%?/g)) {
    const value = Number(m[2].replace(/,/g, ""));
    if (Number.isFinite(value)) out.push({ label: shortLabel(m[1], 2), value });
  }
  return out.slice(0, MAX);
}

/** The sketch for a planned image. `subheadings` are the section's H3s, for steps the description doesn't list. */
export function imageSketch(img: { kind?: string; shows: string; url?: string; numbers?: string }, subheadings: string[] = []): Sketch {
  const fromText = piecesOf(img.shows).map((p) => shortLabel(p));
  const fromH3 = subheadings.map((h) => shortLabel(h));
  const pick = (fallback: string[]) => (fromText.length >= 2 ? fromText : fromH3.length >= 2 ? fromH3 : fallback).slice(0, MAX);
  switch (img.kind) {
    case "steps": {
      const text = piecesOf(img.shows).map(stepLabel);
      const h3 = subheadings.map(stepLabel);
      return { kind: "steps", steps: (text.length >= 2 ? text : h3.length >= 2 ? h3 : ["Step 1", "Step 2", "Step 3"]).slice(0, MAX) };
    }
    case "chart": {
      const bars = numbersIn(img.numbers ?? "");
      return {
        kind: "bars",
        bars: bars.length
          ? bars
          : [
              { label: "A", value: 3 },
              { label: "B", value: 5 },
              { label: "C", value: 4 },
            ],
      };
    }
    case "comparison": {
      const cols = pick(["Option A", "Option B"]).slice(0, 3);
      return { kind: "grid", cols, rows: ["Best for", "Price", "Setup"] };
    }
    case "checklist":
      return {
        kind: "checks",
        items: pick(["Check one", "Check two", "Check three"]),
      };
    case "anatomy":
      return {
        kind: "parts",
        parts: pick(["Part one", "Part two", "Part three"]),
      };
    case "screenshot":
      return {
        kind: "browser",
        url: (img.url ?? "").replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") || "the page",
      };
    default:
      return {
        kind: "parts",
        parts: pick([shortLabel(img.shows, 4) || "Image"]),
      };
  }
}

/** The sketch for a planned interactive module, from its kind, inputs, outputs and data. */
export function moduleSketch(
  m: {
    type?: string;
    title: string;
    inputs?: string[];
    outputs?: string[];
    data?: string;
  },
  subheadings: string[] = [],
): Sketch {
  const rows = tableOf(m.data ?? "");
  switch (m.type) {
    case "table":
    case "comparison":
    case "matrix":
    case "scorecard": {
      const head = rows[0] ?? [];
      const cols = (head.length >= 2 ? head.slice(1) : ["Option A", "Option B"]).map((c) => shortLabel(c, 2)).slice(0, 3);
      const labels = (head.length >= 2 ? rows.slice(1).map((r) => r[0]) : rows.map((r) => r[0])).filter(Boolean).map((c) => shortLabel(c, 2));
      return {
        kind: "grid",
        cols,
        rows: (labels.length ? labels : ["Best for", "Price", "Setup"]).slice(0, 4),
      };
    }
    case "timeline":
    case "funnel": {
      const fromRows = rows.map((r) => stepLabel(r[0]));
      const fromH3 = subheadings.map(stepLabel);
      return { kind: "steps", steps: (fromRows.length >= 2 ? fromRows : fromH3.length >= 2 ? fromH3 : ["Stage 1", "Stage 2", "Stage 3"]).slice(0, MAX) };
    }
    case "pyramid":
    case "tabs": {
      const parts = rows.map((r) => shortLabel(r[0])).filter(Boolean);
      return {
        kind: "parts",
        parts: (parts.length ? parts : subheadings.map((h) => shortLabel(h))).slice(0, MAX),
      };
    }
    case "checklist":
      return {
        kind: "checks",
        items: (rows.length ? rows.map((r) => shortLabel(r[0], 4)) : (m.inputs ?? []).map((i) => shortLabel(i, 4))).slice(0, MAX),
      };
    case "stats": {
      const bars = numbersIn(m.data ?? "");
      return bars.length
        ? { kind: "bars", bars }
        : {
            kind: "parts",
            parts: rows.map((r) => shortLabel(r[0])).slice(0, MAX),
          };
    }
    default: {
      const inputs = (m.inputs ?? [])
        .map((i) => shortLabel(i, 3))
        .filter(Boolean)
        .slice(0, 4);
      const output = shortLabel((m.outputs ?? [])[0] ?? "", 4) || "Result";
      return {
        kind: "form",
        inputs: inputs.length ? inputs : ["Your number"],
        output,
      };
    }
  }
}
