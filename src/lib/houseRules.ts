// House rules and the default voice for Agentic Writing (docs/agentic-writing.md, section 3).
// Every article is written with these rules, and the style lint checks the ones code can check. A brand without
// its own voice gets the default: the voice of the Perceptric blog, with the brand's own name. Pure, shared by the
// server, the browser and tests.
import type { BrandVoice } from "./brandVoice.ts";

export type HouseRule = { id: string; label: string; prompt: string };

export const HOUSE_RULES: HouseRule[] = [
  { id: "paragraphs", label: "Short paragraphs", prompt: "Paragraphs are 1 to 3 sentences and about 60 words at most. No chunks of text." },
  { id: "lists", label: "Lists often", prompt: "Use a bulleted or numbered list at least every 150 to 250 words: steps, options, checklists, do and don't. List items are plain sentences with no bold lead-in label." },
  { id: "sentences", label: "Calm, complete sentences", prompt: "Most sentences are 12 to 25 words. Never use short sentences for drama or rhythm; join them into the sentence before or after." },
  { id: "reader", label: "Talk to the reader", prompt: 'Talk to one reader as "you", with contractions. Write as "we" for the brand. Ask the reader a real question now and then where it helps them decide, never to open a section.' },
  { id: "opener", label: "Introduce every example", prompt: 'When you introduce a tool, company or page, the first sentence says what it is: "{Name} is a {kind of} company (or software) that {what it does}."' },
  { id: "adverbs", label: "A feeling adverb now and then", prompt: 'Use a feeling adverb now and then ("Thankfully,", "Luckily,", "Honestly,", "Surprisingly,"), about one every 300 to 400 words, never the same one twice. Never "quietly".' },
  { id: "kind", label: "Kind and professional", prompt: 'Be kind and professional about every company, reader and team. No verdict words ("the catch", "falls short", "lazy", "boring", "nobody reads", "gets it wrong"). Say what works and what to do.' },
  { id: "plain", label: "No setups or slogans", prompt: 'No setups and reveals ("Here\'s the thing:", "The result?", "The secret?", "That\'s it."), no slogan lines and no staged one-line paragraphs. Explain plainly.' },
  { id: "dashes", label: "No dashes or contrast tricks", prompt: 'No em or en dashes. No "not X, Y" or "X, not Y" contrasts. No lists of three used for rhythm. No emoji and no exclamation marks.' },
  { id: "ending", label: "End on a next step", prompt: 'No "In conclusion" and no recap ending. End on a next step the reader can take.' },
  { id: "words", label: "9th grade words", prompt: "Use everyday words a 9th grader knows. No buzzwords." },
  { id: "facts", label: "Facts from sources", prompt: "Every fact, number and quote comes from the numbered sources. A stat names its source. Never invent numbers, customers, quotes or results." },
];

/** The rules as one block for the prompts. */
export const rulesText = (rules: HouseRule[] = HOUSE_RULES) => `House rules (follow every one):\n${rules.map((r) => `- ${r.prompt}`).join("\n")}`;

/** Words and phrases the writer never uses. The lint flags them. */
export const BANNED = [
  "delve",
  "unlock",
  "leverage",
  "robust",
  "harness",
  "showcase",
  "vibrant",
  "game-changer",
  "game changer",
  "seamless",
  "seamlessly",
  "cutting-edge",
  "in today's",
  "fast-paced",
  "it is worth noting",
  "it's worth noting",
  "in conclusion",
  "furthermore",
  "moreover",
  "quietly",
  "elevate",
  "tapestry",
  "testament",
  "realm",
  "pivotal",
  "embark",
  "supercharge",
  "navigate the",
];
const JUDGED = /\b(the catch|falls? (short|flat)|lazy|boring|nobody reads|gets? it wrong|bad content|most (blogs|teams|companies|marketers) (fail|get))/i;
const REVEAL = /^(here'?s the (thing|kicker|catch|deal)|the (result|secret|answer|catch|bottom line|twist)\?|that'?s it\.|simple\.|it works\.|the takeaway)/i;
const NOT_XY = [/\bnot (just|only|merely) [^.;:!?]{1,60}\bbut\b/i, /\b(isn'?t|aren'?t|wasn'?t) (just |only )?about\b/i, /, not [a-z][^,.;:!?]{0,40}[.!?]?$/i, /\bit'?s not [^,.;:!?]{1,40}, it'?s\b/i];
export const FEELING = ["thankfully", "luckily", "honestly", "happily", "surprisingly", "fortunately", "frankly", "understandably", "pleasantly", "interestingly", "personally", "admittedly"];

/** The default voice: the Perceptric blog's. naming and reader are filled in for each brand. */
export const DEFAULT_VOICE: BrandVoice = {
  tone: ["friendly", "plain", "helpful", "professional"],
  sentences: "Most 12 to 25 words, one idea each; paragraphs of 1 to 3 sentences; a list every 150 to 250 words",
  use: ["you", "we", "for example", "as you can see", "why it works", "what you can borrow", "here's how"],
  avoid: ["delve", "unlock", "leverage", "robust", "game-changer", "seamless", "cutting-edge", "in today's fast-paced world", "the catch", "falls short", "quietly"],
  naming: "",
  reader: "Marketing and business leaders who want practical steps they can use this week",
};

/**
 * The default voice sample, from the Perceptric blog. The writer copies how it sounds and never its facts or names.
 */
export const DEFAULT_SAMPLE = `If you run marketing at a B2B company and a blog is on your list, you want proof that it can bring in real business. Personally, the best way we know to plan one is to study companies that already do it well.

So in this guide, we're sharing business blog examples from real companies, mostly B2B and SaaS. For each one, we'll show you what the blog covers, why it works and what you can borrow for your own.

## What is a business blog?

A business blog is a section of a company's website where it publishes articles that help its future customers. The goal is to earn attention from the right people and move some of them toward a sale, so a good one ties every topic back to a problem the company's product or service solves.

A business blog that works well can help your company in a few ways:

- It brings in search traffic from people looking for answers your product gives them.
- It grows an email list you own, so you can reach readers without paying for ads.
- It builds trust with buyers long before they talk to anyone on your team.

## 1. HubSpot Blog

HubSpot is a CRM software company that sells tools for marketing, sales and customer service teams. Its blog publishes practical guides, templates and research for people in those roles.

The blog is split by team, so a sales manager and a content marketer each land in a section built for them.

Why it works:

- Each section speaks to one type of buyer, which keeps topics focused and makes the product mention feel natural.
- Free templates sit inside the posts, and many ask for an email address before the download.

What you can borrow:

- Split your blog by the job titles you sell to, even if you start with only two sections.
- Turn your most useful post into a downloadable template and offer it inside the article.

## 2. Zapier Blog

Zapier is an automation software company that connects business apps so teams can move data between them without code. Its blog covers productivity, app reviews and automation ideas.

Interestingly, one of its biggest formats is the "best apps" roundup, where writers compare tools in a category. Software roundups attract people who are choosing tools, which is the moment they also need a way to connect them.`;

/** The voice sample block for the prompts. */
export const sampleText = (sample: string) =>
  sample.trim() ? `Voice sample. Write the way this sounds: the warmth, the "we" and "you", the sentence length, the lists. Never reuse its facts, names or numbers.\n"""\n${sample.trim().slice(0, 6000)}\n"""` : "";

// ─────────────── the lint ───────────────
export type Line = { id: string; text: string };
export type LintBlock = { type: string; text: string; items: string[]; rows: string[][] };
export type LintSection = { key: string; h2: string; blocks: LintBlock[] };
export type Finding = { id: string; rule: string; why: string };

const SENT = /(?<=[.!?…])["”)\]]?\s+(?=["“(\[]?[A-Z0-9])/;
const split = (t: string) => t.split(SENT).map((s) => s.trim()).filter(Boolean);
const plain = (t: string) => t.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\*\*?([^*]+)\*\*?/g, "$1");
const words = (t: string) => plain(t).split(/\s+/).filter(Boolean).length;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Problems in one sentence or list item that code can see. */
export function lintText(text: string, opts: { inList?: boolean } = {}): { rule: string; why: string }[] {
  const t = plain(text);
  const out: { rule: string; why: string }[] = [];
  if (/[—–]/.test(t) || /\w \- \w/.test(t)) out.push({ rule: "dashes", why: "a dash" });
  for (const re of NOT_XY) if (re.test(t)) out.push({ rule: "dashes", why: 'a "not X, Y" contrast' });
  if (/!/.test(t)) out.push({ rule: "dashes", why: "an exclamation mark" });
  const low = t.toLowerCase();
  for (const w of BANNED) if (new RegExp(`(^|[^a-z])${esc(w)}([^a-z]|$)`, "i").test(low)) out.push({ rule: w === "quietly" ? "adverbs" : "words", why: `"${w}"` });
  if (JUDGED.test(t)) out.push({ rule: "kind", why: "a judgment" });
  if (REVEAL.test(t.trim())) out.push({ rule: "plain", why: "a setup or reveal" });
  if (!opts.inList && !/:$/.test(t.trim()) && words(t) <= 6) out.push({ rule: "sentences", why: "a short sentence" });
  if (/^\*\*[^*]+\*\*:?\s/.test(text.trim()) && opts.inList) out.push({ rule: "lists", why: "a bold lead-in" });
  return out;
}

/**
 * The style lint over a whole draft: every sentence and list item (ids as claimLines in writerDraft.ts gives them),
 * long paragraphs, long runs without a list, a feeling adverb used twice, a section that opens with a question,
 * and examples that don't open with "{Name} is a ...".
 */
export function lintDraft(sections: LintSection[], examples: { name: string }[] = []): Finding[] {
  const out: Finding[] = [];
  const add = (id: string, f: { rule: string; why: string }) => out.push({ id, ...f });
  const seenAdverb = new Set<string>();
  sections.forEach((s, si) => {
    let since = 0;
    s.blocks.forEach((b, bi) => {
      if (b.type === "p" || b.type === "quote") {
        const list = split(b.text);
        list.forEach((t, k) => {
          for (const f of lintText(t)) add(`${si}.${bi}.${k}`, f);
          const first = plain(t).match(/^([A-Za-z]+),/)?.[1]?.toLowerCase();
          if (first && FEELING.includes(first)) {
            if (seenAdverb.has(first)) add(`${si}.${bi}.${k}`, { rule: "adverbs", why: `"${first}" used twice` });
            seenAdverb.add(first);
          }
        });
        if (list.length > 3 || words(b.text) > 75) add(`${si}.${bi}.0`, { rule: "paragraphs", why: "a long paragraph" });
        if (bi === 0 && s.key !== "faq" && /\?$/.test(list[0] ?? "")) add(`${si}.${bi}.0`, { rule: "reader", why: "a section that opens with a question" });
        since += words(b.text);
      } else if (b.type === "ul" || b.type === "ol") {
        b.items.forEach((t, k) => lintText(t, { inList: true }).forEach((f) => add(`${si}.${bi}.i${k}`, f)));
        since = 0;
      } else if (b.type === "table") since = 0;
      if (since > 320 && s.key !== "faq") {
        add(`${si}.${bi}.0`, { rule: "lists", why: "more than 300 words without a list" });
        since = 0;
      }
    });
  });
  // Every example opens with "{Name} is a ...", in the section named for it.
  for (const e of examples) {
    const name = e.name.trim();
    if (!name) continue;
    const si = sections.findIndex((s) => s.h2 && s.h2.toLowerCase().includes(name.toLowerCase()));
    if (si < 0) continue;
    const bi = sections[si].blocks.findIndex((b) => b.type === "p");
    if (bi < 0) continue;
    // "HubSpot is a ..." opens the "HubSpot Blog" section well too: the subject must be the name or the start of it.
    const first = plain(split(sections[si].blocks[bi].text)[0] ?? "");
    const subject = first.match(/^(.{1,80}?)('s)?\s+(is|are)\s+(a|an|the)\b/i)?.[1]?.toLowerCase() ?? "";
    const lower = name.toLowerCase();
    if (!subject || !(lower.startsWith(subject) || subject.startsWith(lower))) add(`${si}.${bi}.0`, { rule: "opener", why: `doesn't open with "${name} is a ..."` });
  }
  return out;
}

/** The section index a finding id points to. */
export const sectionOf = (id: string) => Number(id.split(".")[0]);

// ─────────────── the proofread ───────────────
const COUNTED = /\b(\d{1,2})\s+(best|top|great|examples?|ways|tips|tools|ideas|types|steps|questions|mistakes|reasons|strategies|templates|alternatives|agencies|companies|apps|platforms|software)\b/i;

/**
 * A title's number against the article: "11 Best ..." needs 11 numbered H2s ("1. Name") or, with no numbered
 * H2s, as many featured examples. Returns the fixed title, or null when it already matches or has no number.
 */
export function fixTitleCount(title: string, h2s: string[], examples: number): string | null {
  const m = title.match(COUNTED);
  if (!m) return null;
  const numbered = h2s.filter((h) => /^\s*\d{1,2}[.)]\s/.test(h)).length;
  const count = numbered || examples;
  if (!count || count === Number(m[1])) return null;
  return title.replace(m[0], m[0].replace(m[1], String(count)));
}
