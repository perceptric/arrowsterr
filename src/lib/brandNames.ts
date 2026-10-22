// Which names pulled from an AI answer are brands. Answers often number their questions, steps and tips the same
// way they number brands ("1. **Can you show revenue impact?**"), and those must never count as a brand.
// Pure, so tests cover every rule. A wrong brand costs more than a missed one.
import { isTracked, parseRanking } from "./parse.ts";

/** Raise when the rules or Claude's check change, so every brand's saved answers are cleaned again. */
export const BRAND_CHECK_VERSION = 1;

const QUESTION_START = /^(how|what|why|who|whom|whose|when|where|which|can|could|do|does|did|is|are|was|were|should|shall|will|would|has|have|had|may|might|must)\b/i;
/** Words that follow a question word in a question. */
const ASKED = /^(you|your|yours|they|their|we|our|i|it|its|this|that|these|those|the|a|an|he|she|is|are|do|does|did|will|would|can|could|should|to|much|many|long|often|well)$/i;
const IMPERATIVE_START = /^(ask|check|look|consider|choose|compare|use|avoid|make|start|focus|define|set|find|read|evaluate|review|request|get|try|test|track|measure|plan|identify|understand|know|ensure|confirm|verify|see|watch|prioritize|prioritise|build|create|write|keep|add|run|hire|budget|research|audit|optimize|optimise|improve|publish|share|aim|go|do|don't|never|always)\b/i;

/** Headings and labels answers use around their lists. Compared lowercased, without punctuation. */
const GENERIC = new Set([
  "pricing", "price", "cost", "costs", "pros", "cons", "pros and cons", "features", "key features", "main features", "overview", "summary",
  "conclusion", "recommendations", "recommendation", "verdict", "best for", "bottom line", "final thoughts", "considerations", "tips",
  "faq", "faqs", "notes", "note", "example", "examples", "why it stands out", "why we like it", "who it's for", "who its for",
  "strengths", "weaknesses", "limitations", "drawbacks", "benefits", "use cases", "use case", "integrations", "support", "ease of use",
  "free plan", "free trial", "paid plans", "alternatives", "other options", "honorable mentions", "honourable mentions", "next steps",
  "how to choose", "what to look for", "red flags", "questions to ask", "key takeaways", "takeaways", "results", "experience",
  "expertise", "reputation", "reviews", "case studies", "portfolio", "communication", "transparency", "reporting", "strategy",
  "content", "technical seo", "link building", "on-page seo", "off-page seo", "local seo", "budget", "timeline", "contract", "contracts",
  "location", "team size", "industry focus", "specialization", "specialisation", "services", "approach", "process", "methodology",
  "agencies", "tools", "software", "platforms", "companies", "brands", "vendors", "providers", "options", "other",
]);
const NUMBERED_LABEL = /^(step|option|tier|phase|stage|part|tip|method|way|reason|rule|level|round|week|month|day)\s*#?\d+\b/i;

/** Why a name isn't a brand, or null when it can be one. */
export function notBrand(raw: string): string | null {
  const name = raw.replace(/\s+/g, " ").trim();
  if (!name) return "Empty";
  if (name.length > 60) return "Too long for a name";
  if (!/\p{L}/u.test(name)) return "No letters";
  const words = name.split(" ");
  if (/\?\s*$/.test(name)) return "A question";
  // "Do you create...", "How do you measure..." are questions; "What If Media" is a brand.
  if (QUESTION_START.test(name) && words.length >= 3 && (words.length >= 5 || ASKED.test(words[1]))) return "A question";
  if (words.length > 6) return "A sentence";
  const plain = name.toLowerCase().replace(/[^\p{L}\p{N}' &+-]/gu, "").replace(/\s+/g, " ").trim();
  if (GENERIC.has(plain)) return "A heading";
  if (NUMBERED_LABEL.test(name)) return "A numbered step";
  if (IMPERATIVE_START.test(name) && words.length >= 3) return "An instruction";
  // Brands are written with a capital, a digit or a domain. Several plain lowercase words are a phrase.
  if (words.length >= 2 && name === name.toLowerCase() && !/\.[a-z]{2,}\b/.test(name) && !/\d/.test(name)) return "A phrase";
  if (/[.!]\s+\p{Lu}/u.test(name)) return "A sentence";
  return null;
}

/**
 * Mentions without the ones that aren't brands, numbered again in their order. The tracked brand always stays,
 * whatever its name looks like, and so do names in keep (checked brands, like a workspace's competitors).
 */
export function cleanMentions<T extends { name: string; position: number }>(list: T[], keep: string[] = []): T[] {
  const kept = new Set(keep.map((k) => k.toLowerCase()));
  const out = [...list].sort((a, b) => a.position - b.position).filter((m) => kept.has(m.name.toLowerCase()) || !notBrand(m.name));
  // Nothing removed: the positions stay as the answer gave them.
  if (out.length === list.length) return list;
  return out.map((m, i) => ({ ...m, position: i + 1 }));
}

/**
 * The names in an answer's ranked list, when it uses the shared layout (a "Recommendations" list), with the tracked
 * brand under its own name. Empty when there's no such list: then a numbered list is as likely questions or steps,
 * so Claude reads the whole answer instead.
 */
export function rankedNames(text: string, brand: string, terms: string[]): string[] {
  if (!/^#+\s*recommendations\b/im.test(text)) return [];
  const seen = new Set<string>();
  return parseRanking(text)
    .map((n) => (isTracked(n, terms) ? brand : n))
    .filter((n) => {
      const k = n.toLowerCase();
      if (seen.has(k) || (n !== brand && notBrand(n))) return false;
      seen.add(k);
      return true;
    });
}

/** Names Claude confirmed. One it marked as not a brand goes; one it didn't answer for stays, since the rules passed it. */
export function confirmedNames(names: string[], checks: Map<string, { brand?: unknown }>, brand: string): string[] {
  return names.filter((n) => n === brand || checks.get(n.toLowerCase())?.brand !== false);
}
