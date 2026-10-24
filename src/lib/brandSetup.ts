// Automatic brand setup for Agentic Writing (docs/agentic-writing.md, section 3). Nobody has to fill in the Brand
// page before writing: a brand without a voice gets the default voice (houseRules.ts) with its own name, a brand
// without guidelines gets them written from its homepage, and a brand without a kit gets one learned from its site.
// Pure: the prompt, the schema and the defaults. brandSetupServer.ts does the reading and saving.
import { DEFAULT_VOICE } from "./houseRules.ts";
import type { BrandVoice } from "./brandVoice.ts";

/** The default voice for one brand: the Perceptric voice, with the brand's name and reader. */
export function defaultVoice(brand: { name: string }, reader?: string): BrandVoice {
  const name = brand.name.trim() || "the brand";
  return { ...DEFAULT_VOICE, naming: `Write the brand's name as "${name}". Say "we" for ${name}.`, reader: reader?.trim() || DEFAULT_VOICE.reader };
}

/** What the homepage reading gives the guidelines prompt (readBrand in guideline.ts). */
export type HomePage = { title: string; description: string; headings: string[]; ctas: string[]; body: string };

const S = { type: "string" } as const;
export const GUIDELINES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["about", "offer", "reader", "proof", "words", "cta"],
  properties: { about: S, offer: { type: "array", items: S }, reader: S, proof: { type: "array", items: S }, words: { type: "array", items: S }, cta: S },
};

export function guidelinesPrompt(brand: { name: string; domain: string }, page: HomePage): string {
  return `Write short brand guidelines for ${brand.name} (${brand.domain}) from its homepage, so a writer can write articles for it. Use only what the page says.

Page title: ${page.title}
Meta description: ${page.description}
Headings: ${page.headings.slice(0, 20).join(" | ")}
Buttons: ${page.ctas.slice(0, 10).join(" | ")}
Page text: ${page.body.slice(0, 4000)}

Rules:
- about: one or two sentences, "${brand.name} is a/an {kind of company} that {what it does} for {who}."
- offer: up to 6 products or services, each as its name and what it does, in one line.
- reader: one line on who the brand writes for: their role and what they want.
- proof: up to 5 facts the page states about itself (customers named, numbers, awards), word for word. Empty if none.
- words: up to 10 words or names the brand uses for itself and its products, spelled as the page spells them.
- cta: the main thing the page asks visitors to do, in its own words ("Book a demo").
- Plain words, no dashes, no hype.`;
}

const str = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");
const strs = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v.map((x) => str(x, n)).filter(Boolean).slice(0, max) : []);

/** Claude's reply as the guidelines body (Markdown, like a person would write on the Brand page) and the reader line. */
export function guidelinesBody(brand: { name: string; domain: string }, x: unknown): { body: string; reader: string } {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const about = str(o.about, 400);
  const offer = strs(o.offer, 200, 6);
  const proof = strs(o.proof, 200, 5);
  const words = strs(o.words, 60, 10);
  const cta = str(o.cta, 120);
  const reader = str(o.reader, 300);
  const body = [
    `# ${brand.name}`,
    about,
    offer.length ? `## What we offer\n${offer.map((x) => `- ${x}`).join("\n")}` : "",
    reader ? `## Who we write for\n${reader}` : "",
    proof.length ? `## Proof we can use\n${proof.map((x) => `- ${x}`).join("\n")}` : "",
    words.length ? `## Our words\n${words.join(", ")}` : "",
    cta ? `## Call to action\n${cta}` : "",
    `## Website\nhttps://${brand.domain}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  return { body, reader };
}

/** Guidelines when the homepage can't be read: the name and the site, so writing can still start. */
export const fallbackGuidelines = (brand: { name: string; domain: string }) => `# ${brand.name}\n\n## Website\nhttps://${brand.domain}`;
