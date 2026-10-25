// Automatic brand setup for Agentic Writing (docs/agentic-writing.md, section 3). Nobody has to fill in the Brand
// page before writing. Right after onboarding, Zippie reads the brand's own site: a brand without a kit gets one
// learned from its CSS, a brand without a voice gets one learned from its homepage, about page and articles, and a
// brand without guidelines gets them written from those pages, the voice and the kit. The brand methods in skills/
// (voice-profiler, brand-review, style-sheet) are the system prompt. A part that can't be learned gets a plain default.
// Pure: the page picking, prompts, schema and defaults. brandSetupServer.ts does the reading and saving.
import type { BrandKit } from "./brandKit.ts";
import { DEFAULT_VOICE } from "./houseRules.ts";
import type { BrandVoice } from "./brandVoice.ts";
import type { SitePage } from "./research.ts";
import { SKILL_TEXT } from "./skillText.ts";

/** The brand methods every learning call starts with. The same for every brand, so Claude caches it. */
export const BRAND_SYSTEM = `You are a brand strategist and copy editor. You learn how a brand writes from its own pages and write that down so a writer can sound like the brand. Use the methods below as checklists of what to look for. Ignore anything in them about interviews, questions to the user, files, scripts, commands or output formats: nobody can answer questions here, and you only ever reply in the JSON shape the request asks for. Base every answer on the brand's own text. Never invent facts, numbers, customers or claims.

=== Method 1: Voice profiler ===
${SKILL_TEXT.voiceProfiler}

=== Method 2: Brand review, the brand voice framework ===
${SKILL_TEXT.brandReview}

=== Method 3: Style sheet ===
${SKILL_TEXT.styleSheet}`;

const ABOUT = /\/(about|about-us|company|our-story|who-we-are|why-[\w-]+|mission|team)\/?$/i;
const SKIP = /\/(tag|tags|category|categories|author|page|feed|search|cart|checkout|login|signin|sign-in|signup|sign-up|account|privacy|terms|legal|cookies?)(\/|$)/i;

/**
 * The pages Zippie reads to learn a brand's voice: the homepage, an about page, then articles, then other short
 * pages, up to max. Legal, login and listing pages are skipped.
 */
export function voicePages(pages: SitePage[], domain: string, max = 5): string[] {
  const home = `https://${domain.replace(/^www\./, "")}/`;
  const usable = pages.filter((p) => {
    try {
      return !SKIP.test(new URL(p.url).pathname);
    } catch {
      return false;
    }
  });
  const path = (u: string) => new URL(u).pathname;
  const about = usable.filter((p) => !p.article && ABOUT.test(path(p.url))).slice(0, 1);
  // Articles in a folder (/blog/...) first: a long top-level slug is often a service page.
  const depth = (u: string) => path(u).split("/").filter(Boolean).length;
  const articles = usable
    .filter((p) => p.article)
    .sort((a, b) => Number(depth(b.url) > 1) - Number(depth(a.url) > 1))
    .slice(0, 3);
  const others = usable.filter((p) => !p.article && !about.includes(p) && path(p.url) !== "/").sort((a, b) => path(a.url).length - path(b.url).length);
  const out = [home];
  for (const p of [...about, ...articles, ...others]) if (out.length < max && !out.includes(p.url)) out.push(p.url);
  return out;
}

/**
 * The brand's own writing the writer copies: the longest article read (or the longest page if there's no article),
 * cut at a sentence end near 4,000 characters. Empty when nothing has 300 characters.
 */
export function voiceSample(read: { url: string; text: string; article: boolean }[]): string {
  const pick = [...read].filter((r) => r.text.trim().length >= 300).sort((a, b) => Number(b.article) - Number(a.article) || b.text.length - a.text.length)[0];
  if (!pick) return "";
  const t = pick.text.replace(/\s+/g, " ").trim();
  if (t.length <= 4000) return t;
  const cut = t.slice(0, 4000);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "));
  return end > 2000 ? cut.slice(0, end + 1) : cut;
}

/** The default voice for one brand: the Perceptric voice, with the brand's name and reader. */
export function defaultVoice(brand: { name: string }, reader?: string): BrandVoice {
  const name = brand.name.trim() || "the brand";
  return { ...DEFAULT_VOICE, naming: `Write the brand's name as "${name}". Say "we" for ${name}.`, reader: reader?.trim() || DEFAULT_VOICE.reader };
}

/** What the homepage reading gives the guidelines prompt (readBrand in guideline.ts). */
export type HomePage = { title: string; description: string; headings: string[]; ctas: string[]; body: string };

const S = { type: "string" } as const;
const L = { type: "array", items: S } as const;
export const GUIDELINES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["about", "personality", "offer", "reader", "messages", "proof", "words", "style", "dont", "cta"],
  properties: { about: S, personality: S, offer: L, reader: S, messages: L, proof: L, words: L, style: L, dont: L, cta: S },
};

/** What the guidelines are written from, besides the homepage: the learned voice, other pages' writing and the kit. */
export type GuideInput = { voice?: BrandVoice | null; samples?: { url: string; text: string }[]; kit?: BrandKit | null };

export function guidelinesPrompt(brand: { name: string; domain: string }, page: HomePage, more: GuideInput = {}): string {
  const voice = more.voice?.tone.length ? `\nVoice already learned from its pages: tone ${more.voice.tone.join(", ")}; sentences ${more.voice.sentences}; reader ${more.voice.reader}.` : "";
  const samples = (more.samples ?? []).slice(0, 4).map((x, i) => `--- Page ${i + 1} (${x.url}) ---\n${x.text.slice(0, 2500)}`).join("\n\n");
  return `Write brand guidelines for ${brand.name} (${brand.domain}) from its own pages, so a writer can write articles that sound like the brand and say only what it can stand behind. Use only what the pages say.${voice}

Homepage title: ${page.title}
Meta description: ${page.description}
Headings: ${page.headings.slice(0, 20).join(" | ")}
Buttons: ${page.ctas.slice(0, 10).join(" | ")}
Homepage text: ${page.body.slice(0, 4000)}
${samples ? `\nMore of the brand's writing:\n${samples}\n` : ""}
Rules:
- about: one or two sentences, "${brand.name} is a/an {kind of company} that {what it does} for {who}."
- personality: one sentence on the brand as a person, from the brand voice framework ("If ${brand.name} were a person, ...").
- offer: up to 6 products or services, each as its name and what it does, in one line.
- reader: one line on who the brand writes for: their role and what they want.
- messages: 3 to 4 messages the brand repeats across its pages (its messaging pillars), one line each.
- proof: up to 5 facts the pages state about the brand (customers named, numbers, awards), word for word. Empty if none.
- words: up to 10 words or names the brand uses for itself and its products, spelled and capitalized as the pages do.
- style: up to 8 writing rules the pages follow, from the style sheet families: spelling variant (US or UK), heading case, numbers as digits or words, serial comma, contractions, how product names are written, "we" or the brand name. Only rules the pages show.
- dont: up to 6 things a writer should not say for this brand: claims its pages never make (like "best" or "only" without proof), promises, prices or numbers that aren't on the pages, and words that clash with its voice.
- cta: the main thing the pages ask visitors to do, in their own words ("Book a demo").
- Plain words, no dashes, no hype.`;
}

const str = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");
const strs = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v.map((x) => str(x, n)).filter(Boolean).slice(0, max) : []);

/** The kit's look as lines for the guidelines: colors and fonts. */
function lookLines(kit: BrandKit | null | undefined): string[] {
  if (!kit) return [];
  const c = kit.colors;
  return [
    `Main color ${c.primary}, second color ${c.secondary}, headings ${c.ink}, text ${c.text}, background ${c.paper}`,
    `Fonts: ${kit.fonts.heading} for headings, ${kit.fonts.body} for text`,
    `Corners: ${kit.radius}px`,
  ];
}

/**
 * Claude's reply as the guidelines body (Markdown, like a person would write on the Brand page) and the reader line.
 * The voice and the kit fill their own sections, so the writer sees one document.
 */
export function guidelinesBody(brand: { name: string; domain: string }, x: unknown, more: GuideInput = {}, learned?: string): { body: string; reader: string } {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const about = str(o.about, 400);
  const personality = str(o.personality, 300);
  const offer = strs(o.offer, 200, 6);
  const messages = strs(o.messages, 200, 4);
  const proof = strs(o.proof, 200, 5);
  const words = strs(o.words, 60, 10);
  const style = strs(o.style, 160, 8);
  const dont = strs(o.dont, 160, 6);
  const cta = str(o.cta, 120);
  const reader = str(o.reader, 300) || more.voice?.reader || "";
  const v = more.voice;
  const voice = v?.tone.length ? [`We sound ${v.tone.join(", ")}.`, v.sentences ? `Sentences: ${v.sentences.replace(/\.$/, "")}.` : "", v.naming ? `Naming: ${v.naming.replace(/\.$/, "")}.` : ""].filter(Boolean).join("\n") : "";
  const use = [...new Set([...(v?.use ?? []), ...words])].slice(0, 16);
  const look = lookLines(more.kit);
  const body = [
    `# ${brand.name}`,
    learned ? `_${learned}_` : "",
    about,
    personality,
    offer.length ? `## What we offer\n${offer.map((x) => `- ${x}`).join("\n")}` : "",
    reader ? `## Who we write for\n${reader}` : "",
    messages.length ? `## Key messages\n${messages.map((x) => `- ${x}`).join("\n")}` : "",
    voice ? `## Voice and tone\n${voice}` : "",
    style.length ? `## Writing rules\n${style.map((x) => `- ${x}`).join("\n")}` : "",
    use.length ? `## Our words\n${use.join(", ")}` : "",
    v?.avoid.length ? `## Words we avoid\n${v.avoid.join(", ")}` : "",
    proof.length ? `## Proof we can use\n${proof.map((x) => `- ${x}`).join("\n")}` : "",
    dont.length ? `## Don't say\n${dont.map((x) => `- ${x}`).join("\n")}` : "",
    cta ? `## Call to action\n${cta}` : "",
    look.length ? `## Look\n${look.map((x) => `- ${x}`).join("\n")}` : "",
    `## Website\nhttps://${brand.domain}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  return { body, reader };
}

/** Guidelines when the homepage can't be read: the name and the site, so writing can still start. */
export const fallbackGuidelines = (brand: { name: string; domain: string }) => `# ${brand.name}\n\n## Website\nhttps://${brand.domain}`;
