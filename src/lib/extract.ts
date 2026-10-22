import "server-only";
import { askClaude, parseJson } from "./claude";
import { confirmedNames, notBrand, rankedNames } from "./brandNames";
import { brandTerms, isTracked } from "./parse";

export type BrandMention = { name: string; position: number; sentiment: number; domain?: string };

/** What counts as a brand, the same words in both prompts. */
const WHAT_IS_A_BRAND = `A brand is the name of a company, product, app, service, agency or organization. Questions, steps, tips, features, criteria, categories, generic phrases, headings and job titles are never brands, even when the answer numbers them or puts them in bold.`;

const SENTIMENT = (names: string[], answer: string) => `Here is an answer from an AI assistant, and names taken from its list.

Answer:
"""
${answer}
"""

Names: ${JSON.stringify(names)}

${WHAT_IS_A_BRAND}

For each name, return:
- name: exactly as given.
- brand: true when it is a brand, false when it isn't.
- sentiment: how positively the answer talks about it. 100 strongly recommended, 50 neutral, 0 warned against.
- domain: the brand's main website domain, like "hubspot.com". Use "" if you are not sure or it isn't a brand.`;

const FULL = (brand: string, answer: string) => `Read this answer from an AI assistant. List every brand it names as an option for the reader.

Answer:
"""
${answer}
"""

${WHAT_IS_A_BRAND} If the answer names no brands, return an empty list.

- Order brands by where they first appear. Use each brand's common name.
- If "${brand}" appears under any name, use exactly "${brand}".
- sentiment: 100 strongly recommended, 50 neutral, 0 warned against.
- domain: the brand's main website domain. Use "" if you are not sure.`;

const ITEMS = (withBrand: boolean) => ({
  type: "object",
  properties: {
    brands: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, ...(withBrand ? { brand: { type: "boolean" } } : {}), sentiment: { type: "number" }, domain: { type: "string" } },
        required: ["name", ...(withBrand ? ["brand"] : []), "sentiment", "domain"],
        additionalProperties: false,
      },
    },
  },
  required: ["brands"],
  additionalProperties: false,
});
type Item = { name?: unknown; brand?: unknown; sentiment?: unknown; domain?: unknown };

// Haiku 5.5 at low effort: about 10x cheaper than Haiku 4.5 for this simple read.
const haiku = () => process.env.EXTRACT_MODEL || "claude-haiku-5-5";

function cleanDomain(d: unknown) {
  const v = typeof d === "string" ? d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] : "";
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(v) ? v : undefined;
}

function clamp(n: unknown) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : 50;
}

/**
 * Brands named in an answer, with position and sentiment. Never a question, step or heading (brandNames.ts).
 * When the answer uses the shared layout (a "Recommendations" list), names come from that list and Claude Haiku confirms
 * each is a brand while it scores sentiment. Otherwise (the ChatGPT app, AI Overviews and AI Mode answer in their own
 * words) Haiku reads the whole answer. The tracked brand always counts and shows under its own name.
 */
export async function extractBrands(brand: string, domain: string, answer: string): Promise<BrandMention[]> {
  if (!answer.trim()) return [];
  const terms = brandTerms(brand, domain);
  const text = answer.slice(0, 15000);
  const ok = (n: string) => isTracked(n, terms) || !notBrand(n);
  const names = rankedNames(text, brand, terms);

  if (!names.length) {
    const { text: reply } = await askClaude(FULL(brand, text), { model: haiku(), maxTokens: 4000, effort: "low", schema: ITEMS(false) });
    const list = (parseJson(reply).brands ?? []) as Item[];
    const info = new Map<string, Item>();
    for (const b of Array.isArray(list) ? list : []) {
      const n = String(b?.name ?? "").trim();
      if (n && !info.has(n.toLowerCase())) info.set(n.toLowerCase(), b);
    }
    // The tracked brand's other spellings ("acme.com", "Acme Inc") count once, under its own name.
    const raw = [...info.values()].map((b) => String(b.name).trim());
    const ownInfo = info.get(raw.find((n) => isTracked(n, terms))?.toLowerCase() ?? "");
    return dedupe(raw.filter(ok).map((n) => (isTracked(n, terms) ? brand : n))).map((n, i) => {
      const b = n === brand ? ownInfo : info.get(n.toLowerCase());
      return { name: n, position: i + 1, sentiment: clamp(b?.sentiment), domain: n === brand ? domain : cleanDomain(b?.domain) };
    });
  }

  const scores = new Map<string, Item>();
  try {
    const { text: reply } = await askClaude(SENTIMENT(names, text), { model: haiku(), maxTokens: 3000, effort: "low", schema: ITEMS(true) });
    for (const b of ((parseJson(reply).brands ?? []) as Item[])) if (b && typeof b.name === "string") scores.set(b.name.trim().toLowerCase(), b);
  } catch (e) {
    // Without Haiku's check, the rules in brandNames.ts still keep questions and steps out.
    console.error("Brand check and sentiment failed, using 50:", e instanceof Error ? e.message : e);
  }
  return confirmedNames(names, scores, brand).map((name, i) => {
    const info = scores.get(name.toLowerCase());
    return { name, position: i + 1, sentiment: clamp(info?.sentiment), domain: name === brand ? domain : cleanDomain(info?.domain) };
  });
}

function dedupe(names: string[]) {
  const seen = new Set<string>();
  return names.filter((n) => {
    const k = n.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
