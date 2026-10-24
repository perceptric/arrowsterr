// Agentic Writing, the style passes (docs/agentic-writing.md, section 6). After the sections are written:
//   1. Lint: code checks every line against the house rules (houseRules.ts). Free.
//   2. Review: one call reads the whole draft with the writing skills (skills/, MIT) and the house rules, and names
//      the lines that break them.
//   3. Fix: each section with findings is rewritten once, keeping every fact, number and link. A rewrite that drops
//      or adds a number or a link is thrown away and the section stays as it was.
//   4. Proofread: a title's count must match the article ("11 Best" and 11 items).
// Pure: the paid calls come in from writerDraft.ts, so tests run it offline.
import { fixTitleCount, lintDraft, rulesText, sampleText, sectionOf, type Finding } from "./houseRules.ts";
import { SKILL_TEXT } from "./skillText.ts";
import type { Block, Section, StyleNote, Styled } from "./writerDraft.ts";

const S = { type: "string" } as const;
export const REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["findings"],
  properties: { findings: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "rule", "why"], properties: { id: S, rule: S, why: S } } } },
};

/**
 * The editing methods every style call starts with, as a system prompt. It's the same for every article, so Claude
 * caches it across all of them.
 */
export const STYLE_SYSTEM = `You are a senior editor. You edit articles with the methods below so they read like a careful person wrote them. Use the methods as checklists of patterns to find and fix. Ignore anything in them about tools, files, scripts, modes, scores or output formats: you only ever reply in the JSON shape the request asks for.

${rulesText()}

=== Method 1: Humanizer ===
${SKILL_TEXT.humanizer}

=== Method 2: Anti-AI writing (strict review) ===
${SKILL_TEXT.antiAi}

=== Method 3: Writing enforcer, the AI pattern catalog ===
${SKILL_TEXT.enforcer}

=== Method 4: Proofread ===
${SKILL_TEXT.proofread}`;

/** The claim-boundary method, added to the claim check. */
export const CLAIM_METHOD = `Use this method to sort claims:\n${SKILL_TEXT.claims}\n\nIgnore anything in it about files, scripts or ledgers: reply only in the JSON shape asked.`;

/** Every line with its id: section.block.sentence, as the claim check numbers them. */
export type IdLine = { id: string; text: string };

export function reviewPrompt(lines: IdLine[], lint: Finding[], opts: { sample: string; examples: { name: string; opener: string }[] }): string {
  return `Review this draft against the house rules and the four methods in your instructions. The writer's voice is the sample below: the warmth, the "we" and "you" and the occasional feeling adverb are wanted, so never flag them.

${sampleText(opts.sample)}

${opts.examples.length ? `Featured examples, each must open with what it is:\n${opts.examples.map((e) => `- ${e.name}: "${e.opener}"`).join("\n")}\n` : ""}
The code check already found these (don't repeat them):
${lint.map((f) => `${f.id}: ${f.why}`).join("\n") || "nothing"}

The draft (id: text, links as <url>):
${lines.map((l) => `${l.id}: ${l.text}`).join("\n")}

List every line that breaks a rule or shows a pattern from the methods: AI vocabulary, setups and reveals, staged short sentences, slogan lines, lists of three for rhythm, "not X, Y" contrasts, judgment of companies or readers, filler, hedging, stated takeaways, a recap ending, a slip (typo, wrong count, a doubled word). For each: id, rule (the house rule id: ${["paragraphs", "lists", "sentences", "reader", "opener", "adverbs", "kind", "plain", "dashes", "ending", "words", "facts"].join(", ")}) and why in a few words. An empty list when the draft is clean.`;
}

export function fixPrompt(section: Section, findings: Finding[], opts: { sample: string; opener?: string }): string {
  return `Rewrite this one section so it follows the house rules and fixes every finding below. Keep its meaning, every fact, every number and every link exactly, keep its h3s in order, and keep the length within about 15%. Turn three or more parallel things into a list, split long paragraphs, join short sentences into full ones, and make the first sentence of an example say what it is.${opts.opener ? ` This section's first sentence starts: "${opts.opener}"` : ""}

${sampleText(opts.sample)}

Findings (id: why):
${findings.map((f) => `${f.id}: ${f.why}`).join("\n")}

The section${section.h2 ? ` "${section.h2}"` : " (the intro, no heading)"}, as blocks:
${JSON.stringify(section.blocks)}

Reply with the section's blocks in the same shape: p (a paragraph), h3, ul or ol (items), quote, table (rows; first row the header). Fill only the field the block uses. Links stay as [anchor](url) and bold as **word**. Never add a heading for the section itself.`;
}

// ─────────────── keeping the facts ───────────────
const blockText = (b: Block) => [b.text, ...b.items, ...b.rows.flat()].join(" ");
const sectionText = (s: Section) => s.blocks.map(blockText).join(" ");
const numbersIn = (t: string) => new Set((t.replace(/\[[^\]]*\]\(([^)]+)\)/g, " ").match(/\d[\d,.]*%?/g) ?? []).map((n) => n.replace(/[.,]$/, "").replace(/,/g, "")));
const linksIn = (t: string) => new Set([...t.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]));

/** True when the rewrite keeps every number and link of the original and adds none. */
export function keepsFacts(before: Section, after: Section): boolean {
  const [a, b] = [sectionText(before), sectionText(after)];
  const same = (x: Set<string>, y: Set<string>) => x.size === y.size && [...x].every((v) => y.has(v));
  return same(numbersIn(a), numbersIn(b)) && same(linksIn(a), linksIn(b));
}

/** The findings for one section, by its index. */
export const findingsFor = (all: Finding[], si: number) => all.filter((f) => sectionOf(f.id) === si);

/** Lint findings plus the review's, cleaned: known ids only, one per id and rule. */
export function mergeFindings(lint: Finding[], review: unknown, ids: Set<string>): Finding[] {
  const raw = (review && typeof review === "object" ? (review as { findings?: unknown }).findings : null) ?? [];
  const more = (Array.isArray(raw) ? raw : [])
    .map((f) => (f && typeof f === "object" ? (f as Record<string, unknown>) : {}))
    .map((f) => ({ id: String(f.id ?? "").trim(), rule: String(f.rule ?? "").trim().slice(0, 40), why: String(f.why ?? "").trim().slice(0, 200) }))
    .filter((f) => ids.has(f.id) || ids.has(f.id.replace(/\.\d+$/, ".0")));
  const seen = new Set<string>();
  return [...lint, ...more].filter((f) => {
    const k = `${f.id}|${f.rule}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** What the fixes changed (findings in sections that were rewritten) and what the lint still sees after them. */
export function styleResult(before: Section[], after: Section[], findings: Finding[], examples: { name: string }[], lines: (s: Section[]) => IdLine[]): Pick<Styled, "fixed" | "left"> {
  const text = new Map(lines(before).map((l) => [l.id, l.text]));
  const changed = (si: number) => JSON.stringify(before[si]?.blocks) !== JSON.stringify(after[si]?.blocks);
  const fixed: StyleNote[] = findings.filter((f) => changed(sectionOf(f.id))).map((f) => ({ id: f.id, rule: f.rule, before: text.get(f.id) ?? "", after: null }));
  const left: StyleNote[] = lintDraft(after, examples).map((f) => ({ id: f.id, rule: f.rule, before: f.why, after: null }));
  return { fixed: fixed.slice(0, 200), left: left.slice(0, 200) };
}

/** The proofread's title fix, and what it changed. */
export function proofreadTitle(title: string, sections: Section[], examples: number): { title: string | null; notes: string[] } {
  const fixed = fixTitleCount(title, sections.map((s) => s.h2).filter(Boolean), examples);
  return fixed ? { title: fixed, notes: [`Title count: "${title}" became "${fixed}".`] } : { title: null, notes: [] };
}
