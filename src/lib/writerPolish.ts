// The polish pass and the proof (docs/zippie-skills-plan.md, section 2; docs/draft-and-write-build.md, Phase 5).
//   Polish: one call reads the styled draft with the writer persona and five more writing skills (proseshape,
//     brand-review, plain-language, orwells-rules, redline-edit at the medium level) and returns line edits: lines
//     that could sit on any other blog, hard or dead words, wordiness, slips and default shapes (a stated moral, a
//     recap close). Code applies an edit only when the fact audit passes and the house lint finds no more than before.
//   Proof: code checks the finished draft for what a proofreader would hold it for: leftover markers, a paragraph
//     printed twice, a doubled word, a list that doesn't match the count its lead-in gives, and a weekday that doesn't
//     match its date. Ship or Hold, with the reasons.
// Pure: the paid call comes in from writerDraft.ts, so tests run it offline.
import { factAudit, type Audit } from "./factAudit.ts";
import { lintDraft, lintText, rulesText, sampleText } from "./houseRules.ts";
import { SKILL_TEXT } from "./skillText.ts";
import type { Block, Section, StyleNote } from "./writerDraft.ts";

const S = { type: "string" } as const;
export const POLISH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["edits"],
  properties: {
    edits: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["id", "kind", "text", "why"], properties: { id: S, kind: { type: "string", enum: ["voice", "plain", "copyedit", "shape"] }, text: S, why: S } },
    },
  },
};

/** The polish methods, as a system prompt cached across every article. */
export const POLISH_SYSTEM = `You are a senior editor doing the last pass on an article before it goes to the client. You use the methods below as checklists of what to find and fix. Ignore anything in them about tools, files, scripts, modes, scores, ledgers or output formats: you only ever reply in the JSON shape the request asks for.

${rulesText()}

=== Method 1: ProseShape (default shapes and stated morals) ===
${SKILL_TEXT.proseshape}

=== Method 2: Brand review (voice against the writer persona) ===
${SKILL_TEXT.brandReview}

=== Method 3: Plain language ===
${SKILL_TEXT.plain}

=== Method 4: Orwell's rules ===
${SKILL_TEXT.orwell}

=== Method 5: Redline edit, medium level ===
${SKILL_TEXT.redline}`;

export type IdLine = { id: string; text: string };
export type Edit = { id: string; kind: "voice" | "plain" | "copyedit" | "shape"; text: string; why: string };
export const MAX_EDITS = 40;

export function polishPrompt(lines: IdLine[], opts: { persona: string; sample: string }): string {
  return `Polish this draft. Return line edits only for lines that need one:
- voice: a line that could sit unchanged on any other company's blog. Make it specific with a fact, name or example already in this draft or the brief. Never invent one.
- plain: a hard or abstract word where an everyday one works, a dead phrase, jargon, a needless passive.
- copyedit: a slip (typo, agreement, a doubled word, a wrong count), an inconsistent term or spelling, wordiness ("in order to", "due to the fact that").
- shape: a stated moral or takeaway, a recap or upbeat close, a setup and reveal, a staged short sentence. Say it plainly instead.

Rules for every edit:
- text is the whole new line. Keep every number, date, name, quote, link and hedge ("likely", "about", "may", "many") exactly as it is. Links stay as [anchor](url).
- Keep each line a full sentence of 12 to 25 words where you can; never make a line under 7 words.
- Follow the house rules. Never add a dash, a "not X, Y" contrast, an exclamation mark or a word from the banned lists.
- At most ${MAX_EDITS} edits, the most useful first. Leave good lines alone; an empty list is a fine answer.

${opts.persona ? `The writer persona:\n${opts.persona}\n` : ""}
${sampleText(opts.sample)}

The draft (id: text, links as [anchor](url)):
${lines.map((l) => `${l.id}: ${l.text}`).join("\n")}`;
}

// ─────────────── applying edits ───────────────

const SENTENCE = /(?<=[.!?…]["”)\]]?)\s+(?=["“(\[]?[A-Z0-9])/;
const sentences = (text: string) => text.split(SENTENCE).map((s) => s.trim()).filter(Boolean);

/** The draft's lines with ids, as the polish call sees them: sentences and list items (tables and headings stay out). */
export function polishLines(sections: Section[]): IdLine[] {
  const out: IdLine[] = [];
  sections.forEach((s, si) =>
    s.blocks.forEach((b, bi) => {
      if (b.type === "p" || b.type === "quote") sentences(b.text).forEach((t, k) => out.push({ id: `${si}.${bi}.${k}`, text: t }));
      else if (b.type === "ul" || b.type === "ol") b.items.forEach((t, k) => out.push({ id: `${si}.${bi}.i${k}`, text: t }));
    }),
  );
  return out;
}

/** The edits from the reply, cleaned: known ids only, one per id. */
export function cleanEdits(x: unknown, ids: Set<string>): Edit[] {
  const raw = x && typeof x === "object" ? (x as { edits?: unknown }).edits : null;
  const seen = new Set<string>();
  const out: Edit[] = [];
  for (const e of Array.isArray(raw) ? raw : []) {
    const r = (e && typeof e === "object" ? e : {}) as Record<string, unknown>;
    const id = String(r.id ?? "").trim();
    const text = String(r.text ?? "").replace(/\s+/g, " ").trim();
    const kind = ["voice", "plain", "copyedit", "shape"].includes(String(r.kind)) ? (r.kind as Edit["kind"]) : "copyedit";
    if (!ids.has(id) || !text || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, kind, text: text.slice(0, 1200), why: String(r.why ?? "").trim().slice(0, 200) });
    if (out.length >= MAX_EDITS) break;
  }
  return out;
}

/**
 * Apply the edits a line at a time. An edit is kept only when the fact audit doesn't block it and the house lint
 * finds no more in the new line than in the old one. names: the brand and example names the audit protects.
 */
export function applyEdits(sections: Section[], edits: Edit[], opts: { names?: string[]; allow?: string[] } = {}): { sections: Section[]; applied: StyleNote[]; refused: { id: string; why: string }[] } {
  const applied: StyleNote[] = [];
  const refused: { id: string; why: string }[] = [];
  const out: Section[] = sections.map((s) => ({ ...s, blocks: s.blocks.map((b) => ({ ...b, items: [...b.items], rows: b.rows.map((r) => [...r]) })) }));
  const byBlock = new Map<string, Edit[]>();
  for (const e of edits) {
    const [si, bi] = e.id.split(".");
    const k = `${si}.${bi}`;
    byBlock.set(k, [...(byBlock.get(k) ?? []), e]);
  }
  for (const [k, list] of byBlock) {
    const [si, bi] = k.split(".").map(Number);
    const b: Block | undefined = out[si]?.blocks[bi];
    if (!b) continue;
    const inList = b.type === "ul" || b.type === "ol";
    const parts = inList ? b.items : sentences(b.text);
    const next = [...parts];
    for (const e of list) {
      const idx = Number(e.id.split(".")[2]?.replace(/^i/, ""));
      const old = parts[idx];
      if (old === undefined || (inList !== e.id.split(".")[2]?.startsWith("i"))) continue;
      const audit: Audit = factAudit(old, e.text, { names: opts.names });
      if (audit.status === "BLOCK") {
        refused.push({ id: e.id, why: audit.reasons.join("; ") });
        continue;
      }
      const before = lintText(old, { inList, allow: opts.allow }).length;
      const after = lintText(e.text, { inList, allow: opts.allow }).length;
      if (after > before) {
        refused.push({ id: e.id, why: `the house lint finds more (${before} to ${after})` });
        continue;
      }
      next[idx] = e.text;
      applied.push({ id: e.id, rule: e.kind, before: old, after: e.text });
    }
    if (inList) b.items = next;
    else b.text = next.join(" ");
  }
  return { sections: out, applied, refused };
}

/** The fact audit on a whole section: its blocks' text, links included. */
export const sectionMd = (s: Section) => s.blocks.map((b) => [b.text, ...b.items, ...b.rows.flat()].filter(Boolean).join("\n")).join("\n");
export const auditSection = (before: Section, after: Section, names: string[] = []) => factAudit(sectionMd(before), sectionMd(after), { names });

// ─────────────── the proof ───────────────

export type Proof = { verdict: "Ship" | "Hold"; reasons: string[]; lint: number };

const MARKER = /\[(?:detail needed|update needed|insert|todo|tbd|placeholder|source needed)[^\]]*\]|\{\{[^}]{1,60}\}\}|lorem ipsum/i;
const NUMBER_WORDS: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const COUNTED = new RegExp(`\\b(\\d{1,2}|${Object.keys(NUMBER_WORDS).join("|")})\\s+(?:\\w+\\s+)?(steps?|ways?|tips?|things|reasons?|questions?|mistakes?|signs?|types?|rules?|options?|tools?|checks?|parts?|stages?|habits?|ideas?|examples?)\\b[^.!?]*:\\s*$`, "i");
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const DATED = new RegExp(`\\b(${WEEKDAYS.join("|")}),?\\s+(${MONTHS.join("|")})\\s+(\\d{1,2}),?\\s+(\\d{4})\\b`, "gi");
const DOUBLED = /\b([a-z]+)\s+\1\b/gi;
const plainText = (t: string) => t.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\*\*?([^*]+)\*\*?/g, "$1");

/** The proof: Ship, or Hold with every reason. lint is what the house lint still finds, for the record. */
export function proofDraft(sections: Section[], opts: { examples?: { name: string }[]; allow?: string[] } = {}): Proof {
  const reasons: string[] = [];
  const where = (s: Section) => (s.h2 ? `"${s.h2}"` : "the intro");
  const seenParas = new Map<string, string>();
  for (const s of sections) {
    s.blocks.forEach((b, bi) => {
      const text = plainText([b.text, ...b.items, ...b.rows.flat()].join(" "));
      if (MARKER.test(text)) reasons.push(`A marker is left in ${where(s)}: ${text.match(MARKER)![0]}`);
      for (const m of text.matchAll(DOUBLED)) if (!/^(that|had|is)$/i.test(m[1])) reasons.push(`"${m[0]}" in ${where(s)}`);
      for (const m of text.matchAll(DATED)) {
        const d = new Date(Date.UTC(Number(m[4]), MONTHS.indexOf(m[2].toLowerCase()), Number(m[3])));
        if (WEEKDAYS[d.getUTCDay()] !== m[1].toLowerCase()) reasons.push(`${m[0]} is a ${WEEKDAYS[d.getUTCDay()][0].toUpperCase()}${WEEKDAYS[d.getUTCDay()].slice(1)}, in ${where(s)}`);
      }
      if (b.type === "p") {
        const key = plainText(b.text).toLowerCase().replace(/\s+/g, " ").trim();
        if (key.split(" ").length >= 8) {
          if (seenParas.has(key)) reasons.push(`A paragraph appears twice: in ${seenParas.get(key)} and ${where(s)}`);
          else seenParas.set(key, where(s));
        }
        // "Here are 5 steps:" followed by a list of another length.
        const last = sentences(b.text).pop() ?? "";
        const m = plainText(last).match(COUNTED);
        const list = s.blocks[bi + 1];
        if (m && list && (list.type === "ul" || list.type === "ol")) {
          const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NUMBER_WORDS[m[1].toLowerCase()];
          if (n && n !== list.items.length) reasons.push(`${where(s)} says ${m[1]} ${m[2]} and lists ${list.items.length}`);
        }
      }
    });
  }
  const lint = lintDraft(sections, opts.examples ?? [], opts.allow ?? []).length;
  return { verdict: reasons.length ? "Hold" : "Ship", reasons: [...new Set(reasons)].slice(0, 30), lint };
}
