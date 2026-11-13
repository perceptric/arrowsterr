// The writer persona at onboarding (docs/zippie-skills-plan.md, section 4). Onboarding reads the brand's own site
// and posts, measures how the posts are written in code, and asks Claude once for a persona and a sample paragraph.
// Every proof line must quote the site word for word, or it is dropped. Gaps become questions on the card.
// Pure, shared by the server, the browser and tests.
import { cleanVoice, type BrandVoice } from "./brandVoice.ts";
import { lintText, rulesText } from "./houseRules.ts";
import { checkedNumbers } from "./writerScore.ts";

export type SourceKind = "home" | "about" | "product" | "post" | "added";
/** One page or pasted sample the persona was built from. */
export type PersonaSource = { url: string; kind: SourceKind; title: string; text: string };
/** A post's writing with its shape: paragraphs in order, and how many lists and headings it uses. */
export type PostShape = { title: string; paragraphs: string[]; lists: number; headings: number; words: number };

/** How the brand's own posts are written, measured in code. */
export type VoiceStats = {
  posts: number;
  words: number;
  /** Words a sentence: the average and the middle half. */
  sentenceAvg: number;
  sentenceLow: number;
  sentenceHigh: number;
  /** Sentences a paragraph, on average. */
  paragraphAvg: number;
  /** Uses for every 1,000 words. */
  we: number;
  i: number;
  you: number;
  /** Contractions for every 1,000 words. */
  contractions: number;
  /** Reading grade (Flesch-Kincaid). */
  grade: number;
  listsPerPost: number;
  headingsPerPost: number;
};

export type Proof = { claim: string; quote: string; url: string };
export type WriterPersona = {
  /** Who writes, only from what the site says. */
  writer: string;
  reader: string;
  /** The point of view the brand argues. */
  pov: string;
  tone: string[];
  sentences: string;
  use: string[];
  avoid: string[];
  naming: string;
  proof: Proof[];
  /** Claims the writer must never make. */
  never: string[];
  cta: string;
  /** What the site doesn't say and a person should answer. */
  questions: string[];
  /** A sample paragraph in this voice, for the person to approve. */
  sample: string;
};

export const EMPTY_PERSONA: WriterPersona = { writer: "", reader: "", pov: "", tone: [], sentences: "", use: [], avoid: [], naming: "", proof: [], never: [], cta: "", questions: [], sample: "" };
export const MAX_POSTS = 8;
export const MAX_PRODUCT_PAGES = 5;
/** Below this many posts, the voice leans on the homepage and the house rules. */
export const MIN_POSTS = 2;

// ─────────────── Picking pages ───────────────

const ABOUT = /^\/(about(-us)?|company|our-story|story|who-we-are|team|mission)\/?$/i;
const PRODUCT = /^\/(products?|services?|solutions?|features?|platform|pricing|use-cases?|how-it-works|what-we-do|industries)(\/|$)/i;
const SKIP = /\/(tag|tags|category|categories|author|page|feed|wp-|cart|checkout|account|login|signin|signup|legal|privacy|terms|cookie)s?(\/|$)/i;

/** From a site's pages, the about page, up to 5 product or service pages, and up to 8 posts (the list's last ones first). */
export function pickPages(pages: { url: string; article: boolean }[], feed: string[] = []): { about: string | null; products: string[]; posts: string[] } {
  const path = (u: string) => {
    try {
      return new URL(u).pathname;
    } catch {
      return "";
    }
  };
  const ok = pages.filter((p) => !SKIP.test(path(p.url)));
  const about = ok.find((p) => !p.article && ABOUT.test(path(p.url)))?.url ?? null;
  const products = ok
    .filter((p) => !p.article && PRODUCT.test(path(p.url)))
    .sort((a, b) => path(a.url).split("/").length - path(b.url).split("/").length || path(a.url).length - path(b.url).length)
    .slice(0, MAX_PRODUCT_PAGES)
    .map((p) => p.url);
  // A feed lists the newest posts first. Sitemaps usually list the oldest first, so their last posts come first.
  const fromFeed = feed.filter((u) => !SKIP.test(path(u)));
  const fromMap = ok.filter((p) => p.article).map((p) => p.url).reverse();
  const posts = [...new Set([...fromFeed, ...fromMap])].slice(0, MAX_POSTS);
  return { about, products, posts };
}

// ─────────────── Voice stats ───────────────

const SENT = /(?<=[.!?])["”)\]]?\s+(?=["“(\[]?[A-Z0-9])/;
export const sentencesOf = (t: string) => t.split(SENT).map((s) => s.trim()).filter((s) => /[a-z]/i.test(s));
const wordsOf = (t: string) => t.split(/\s+/).map((w) => w.replace(/^[^\w']+|[^\w']+$/g, "")).filter(Boolean);

/** Syllables in a word, estimated from its vowel groups. Good enough for a reading grade. */
export function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const trimmed = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  return Math.max(1, (trimmed.match(/[aeiouy]{1,2}/g) ?? []).length);
}

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const per1k = (n: number, words: number) => (words ? round((n / words) * 1000) : 0);
const quantile = (sorted: number[], q: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0);

/** Measure how the posts are written: sentence and paragraph length, we, I and you, contractions, grade, lists and headings. */
export function voiceStats(posts: PostShape[]): VoiceStats {
  const paras = posts.flatMap((p) => p.paragraphs);
  const sents = paras.flatMap(sentencesOf);
  const lengths = sents.map((s) => wordsOf(s).length).sort((a, b) => a - b);
  const all = wordsOf(paras.join(" "));
  const words = all.length;
  const low = all.map((w) => w.toLowerCase());
  const count = (re: RegExp) => low.filter((w) => re.test(w)).length;
  const syl = all.reduce((n, w) => n + syllables(w), 0);
  const grade = words && sents.length ? 0.39 * (words / sents.length) + 11.8 * (syl / words) - 15.59 : 0;
  const n = posts.length || 1;
  return {
    posts: posts.length,
    words,
    sentenceAvg: lengths.length ? round(lengths.reduce((a, b) => a + b, 0) / lengths.length) : 0,
    sentenceLow: quantile(lengths, 0.25),
    sentenceHigh: quantile(lengths, 0.75),
    paragraphAvg: paras.length ? round(sents.length / paras.length) : 0,
    we: per1k(count(/^(we|we're|we've|we'll|our|ours|us)$/), words),
    i: per1k(count(/^(i|i'm|i've|i'll|i'd|my|me)$/), words),
    you: per1k(count(/^(you|you're|you've|you'll|you'd|your|yours)$/), words),
    contractions: per1k(count(/^[a-z]+'(s|re|ve|ll|d|t|m)$/), words),
    grade: round(Math.max(0, grade)),
    listsPerPost: round(posts.reduce((a, p) => a + p.lists, 0) / n),
    headingsPerPost: round(posts.reduce((a, p) => a + p.headings, 0) / n),
  };
}

/** The stats in plain lines, for the prompt and the card. */
export function statsLines(s: VoiceStats): string[] {
  if (!s.posts) return [];
  const person = [s.we >= 5 ? `"we" ${s.we}` : "", s.you >= 5 ? `"you" ${s.you}` : "", s.i >= 5 ? `"I" ${s.i}` : ""].filter(Boolean);
  return [
    `Sentences: ${s.sentenceAvg} words on average, most between ${s.sentenceLow} and ${s.sentenceHigh}`,
    `Paragraphs: ${s.paragraphAvg} sentences on average`,
    person.length ? `Speaks as ${person.join(", ")} times per 1,000 words` : "Rarely says we, I or you",
    `Contractions: ${s.contractions} per 1,000 words`,
    `Reading grade: ${s.grade}`,
    `Lists: ${s.listsPerPost} a post. Headings: ${s.headingsPerPost} a post`,
  ];
}

// ─────────────── The prompt ───────────────

const KIND_LABEL: Record<SourceKind, string> = { home: "Homepage", about: "About page", product: "Product or service page", post: "Blog post", added: "Added by the person" };

export const PERSONA_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["writer", "reader", "pov", "tone", "sentences", "use", "avoid", "naming", "proof", "never", "cta", "questions", "sample"],
  properties: {
    writer: { type: "string" },
    reader: { type: "string" },
    pov: { type: "string" },
    tone: { type: "array", items: { type: "string" } },
    sentences: { type: "string" },
    use: { type: "array", items: { type: "string" } },
    avoid: { type: "array", items: { type: "string" } },
    naming: { type: "string" },
    proof: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["claim", "quote", "url"], properties: { claim: { type: "string" }, quote: { type: "string" }, url: { type: "string" } } },
    },
    never: { type: "array", items: { type: "string" } },
    cta: { type: "string" },
    questions: { type: "array", items: { type: "string" } },
    sample: { type: "string" },
  },
};

/** What Claude reads to build the persona: the brand, every source with its address, and the measured stats. */
export function personaPrompt(brand: { name: string; domain: string }, sources: PersonaSource[], stats: VoiceStats): string {
  const posts = sources.filter((s) => s.kind === "post").length;
  const lines = statsLines(stats);
  return `You build the writer persona for ${brand.name} (${brand.domain}): the person who will write every article for this brand, so the articles sound like the brand's own team wrote them.

Sources (only these count as facts):
${sources.map((s, i) => `--- Source ${i + 1}: ${KIND_LABEL[s.kind]}, ${s.url}${s.title ? ` (${s.title})` : ""} ---\n${s.text}`).join("\n\n")}

${lines.length ? `Measured in code from the brand's ${stats.posts} posts:\n${lines.map((l) => `- ${l}`).join("\n")}` : "The brand has no blog posts to measure. Take the tone from the homepage and the other pages, and use the house rules below for sentence length, lists and paragraphs."}

Fill every field:
- writer: who writes, in one or two sentences, using only what the sources say about the team and the company. No invented job titles, years of experience, places or stories.
- reader: one or two sentences on who reads: their role, what they already know and what they want to get done.
- pov: the one point of view the brand argues across its pages, as one plain sentence it would agree with.
- tone: 3 to 5 single words for how the brand sounds, taken from the sources.
- sentences: one line on sentence and paragraph length with number ranges${posts >= MIN_POSTS ? ", matching the measured stats" : ""}.
- use: up to 12 words or short phrases the brand uses on purpose, copied from the sources.
- avoid: up to 12 words or phrases a writer might reach for that this brand steers clear of, like hype or jargon the sources never use.
- naming: how the brand writes its own name and its products' names, with capitals and spelling exactly as the sources show.
- proof: every number, customer result, award or customer name the sources state about the brand itself. claim is a short plain line; quote is the exact words from the source, copied character for character, 5 to 40 words; url is that source's address. Leave out anything you can't quote exactly.
- never: up to 8 claims the writer must never make, like promises, guarantees or comparisons the sources don't support, and any result not in proof.
- cta: the one action the brand asks readers to take, in the brand's own words from the sources.
- questions: up to 5 short questions for the team about what the sources don't say and the writer needs (for example a customer story, who the writer is, a number to use). Ask only what's missing.
- sample: one paragraph of 90 to 140 words in this voice, on a topic from the brand's own pages, written as the brand. It follows the house rules below, uses no number, customer name or story unless it is in proof, and makes no claim the sources don't support.

Rules:
- Base everything on the sources. Never add what brands like this usually say.
- A gap becomes a question. Never fill it with a guess.
- Plain, everyday words.

${rulesText()}`;
}

// ─────────────── Cleaning the reply ───────────────

const str = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");
const list = (v: unknown, each: number, max: number) => {
  const out: string[] = [];
  for (const x of Array.isArray(v) ? v : []) {
    const t = str(x, each);
    if (t && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
    if (out.length >= max) break;
  }
  return out;
};
/** Text compared loosely: curly quotes made straight, dashes made hyphens, spaces squashed, case ignored. */
export const loose = (t: string) =>
  t
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, "-")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
const urlKey = (u: string) => u.replace(/#.*$/, "").replace(/^https?:\/\/(www\.)?/i, "").replace(/\/+$/, "").toLowerCase();

/**
 * The reply, cleaned. A proof line stays only when its quote is found word for word in the source it names, or in
 * any source when the address doesn't match one. Its url becomes that source's address. With sources null (a
 * person's own edits on save), proof is kept as the person wrote it.
 */
export function cleanPersona(x: unknown, sources: Pick<PersonaSource, "url" | "text">[] | null = []): WriterPersona {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const proof: Proof[] = [];
  for (const p of Array.isArray(o.proof) ? o.proof : []) {
    const r = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
    const quote = str(r.quote, 400).replace(/^["“]|["”]$/g, "");
    const claim = str(r.claim, 200);
    if (!claim) continue;
    if (sources === null) {
      if (!proof.some((q) => loose(q.claim) === loose(claim))) proof.push({ claim, quote, url: str(r.url, 500) });
      if (proof.length >= 15) break;
      continue;
    }
    if (!quote || quote.split(" ").length < 3) continue;
    const named = sources.find((s) => urlKey(s.url) === urlKey(str(r.url, 500)));
    const found = (named && loose(named.text).includes(loose(quote)) ? named : null) ?? sources.find((s) => loose(s.text).includes(loose(quote)));
    if (!found || proof.some((q) => loose(q.quote) === loose(quote))) continue;
    proof.push({ claim, quote, url: found.url });
    if (proof.length >= 15) break;
  }
  const v = cleanVoice({ tone: o.tone, sentences: o.sentences, use: o.use, avoid: o.avoid, naming: o.naming, reader: o.reader });
  return {
    writer: str(o.writer, 600),
    reader: str(o.reader, 400),
    pov: str(o.pov, 300),
    tone: v.tone,
    sentences: str(o.sentences, 300),
    use: v.use,
    avoid: v.avoid,
    naming: v.naming,
    proof,
    never: list(o.never, 200, 8),
    cta: str(o.cta, 200),
    questions: list(o.questions, 200, 5),
    sample: typeof o.sample === "string" ? o.sample.replace(/[ \t]+/g, " ").trim().slice(0, 1500) : "",
  };
}

/**
 * What's wrong with the sample paragraph: house rule findings, and numbers that aren't in the sources.
 * Empty means it passes.
 */
export function sampleProblems(sample: string, sources: Pick<PersonaSource, "text">[]): string[] {
  const out: string[] = [];
  if (!sample.trim()) return ["The sample paragraph is empty."];
  for (const s of sentencesOf(sample)) for (const f of lintText(s)) out.push(`${f.why} in "${s.slice(0, 80)}"`);
  const have = new Set(sources.flatMap((s) => checkedNumbers(s.text)));
  for (const n of checkedNumbers(sample)) if (!have.has(n)) out.push(`the number ${n} is not on the site`);
  return [...new Set(out)];
}

/** The prompt that fixes only the sample paragraph, when the first one breaks a rule. */
export function fixSamplePrompt(persona: WriterPersona, problems: string[]): string {
  return `Rewrite this paragraph so it fixes every problem below and keeps the same voice, topic and facts. 90 to 140 words. Reply with the paragraph only.

Problems:
${problems.map((p) => `- ${p}`).join("\n")}

Voice: ${persona.tone.join(", ")}. ${persona.sentences}

${rulesText()}

Paragraph:
${persona.sample}`;
}

/** Stats sent back by the browser, as numbers. */
export function cleanStats(x: unknown): VoiceStats | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const n = (k: string) => (typeof o[k] === "number" && Number.isFinite(o[k]) ? Math.max(0, Math.min(100_000, o[k] as number)) : 0);
  const keys = ["posts", "words", "sentenceAvg", "sentenceLow", "sentenceHigh", "paragraphAvg", "we", "i", "you", "contractions", "grade", "listsPerPost", "headingsPerPost"] as const;
  return Object.fromEntries(keys.map((k) => [k, n(k)])) as VoiceStats;
}

// ─────────────── Using the persona ───────────────

/** The persona's voice fields, for brand_voices.voice: the writer's prompts already read it. */
export const personaVoice = (p: WriterPersona): BrandVoice => cleanVoice({ tone: p.tone, sentences: p.sentences, use: p.use, avoid: p.avoid, naming: p.naming, reader: p.reader });

/** True once the persona says enough to write from. */
export const personaReady = (p: WriterPersona | null | undefined) => Boolean(p && p.tone.length && p.reader && p.sample);

/** The persona as instructions for the writer, next to the voice. */
export function personaText(p: WriterPersona | null | undefined): string {
  if (!p) return "";
  return [
    p.writer ? `Who writes: ${p.writer}` : "",
    p.pov ? `Point of view to argue: ${p.pov}` : "",
    p.proof.length ? `Approved proof (use only these, exactly as written, with the link):\n${p.proof.map((x) => `- ${x.claim} ("${x.quote}", ${x.url})`).join("\n")}` : "Approved proof: none. Use no customer names, results or numbers about the brand.",
    p.never.length ? `Never claim:\n${p.never.map((x) => `- ${x}`).join("\n")}` : "",
    p.cta ? `Call to action: ${p.cta}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** The Knowledge page "Persona: {Brand} writer", which Zippie and the writer both read. */
export function personaMarkdown(brand: { name: string }, p: WriterPersona, stats: VoiceStats | null): string {
  const bullets = (xs: string[]) => xs.map((x) => `- ${x}`).join("\n");
  const parts = [
    `## Who writes\n${p.writer || "Not on the site yet."}`,
    `## Who reads\n${p.reader}`,
    p.pov ? `## Point of view\n${p.pov}` : "",
    `## How it sounds\n${bullets([p.tone.length ? `Tone: ${p.tone.join(", ")}` : "", p.sentences ? `Sentences: ${p.sentences}` : "", p.naming ? `Naming: ${p.naming}` : ""].filter(Boolean))}`,
    stats && stats.posts ? `## Measured from ${stats.posts} posts\n${bullets(statsLines(stats))}` : "",
    p.use.length ? `## Words to use\n${bullets(p.use)}` : "",
    p.avoid.length ? `## Words to avoid\n${bullets(p.avoid)}` : "",
    p.proof.length ? `## Approved proof\n${bullets(p.proof.map((x) => `${x.claim}: "${x.quote}" (${x.url})`))}` : "## Approved proof\nNone yet. The writer uses no customer names, results or numbers about the brand.",
    p.never.length ? `## Never claim\n${bullets(p.never)}` : "",
    p.cta ? `## Call to action\n${p.cta}` : "",
    p.questions.length ? `## Open questions\n${bullets(p.questions)}` : "",
    p.sample ? `## Sample paragraph\n${p.sample}` : "",
  ];
  return parts.filter(Boolean).join("\n\n");
}

export const personaPageName = (brand: { name: string }) => `Persona: ${brand.name} writer`;
