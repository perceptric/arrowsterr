// Bottom-of-funnel keywords win as listicles ("best SEO agencies"), so their slugs and briefs take that shape:
// the Content Plan's suggested slug, the brief's slug and its format. Pure, shared by the browser, server and tests.

const slugify = (s: string) => s.toLowerCase().replace(/^\/+/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Words that read wrong with an s: subjects and services named as a whole ("best seo for dentists").
const MASS = new Set(["seo", "geo", "aeo", "ppc", "sem", "smm", "crm", "erp", "marketing", "software", "advertising", "branding", "design", "development", "optimization", "content", "research", "management", "outreach", "pr", "copywriting", "hosting", "analytics", "automation", "support", "training", "consulting", "media", "data", "lead", "generation"]);
const SPLIT = /^(for|in|near|with|to|on|from|by|without|under|vs)$/;
const LEAD = /^(best|top|cheapest|leading)$/;

/** One noun made plural: agency to agencies, service to services, coach to coaches. Plural or mass words stay. */
export function plural(word: string): string {
  const w = word.toLowerCase();
  if (!w || MASS.has(w) || /\d/.test(w)) return word;
  if (/(ss|us|is)$/.test(w)) return /ss$/.test(w) ? `${word}es` : word;
  if (/s$/.test(w)) return word;
  if (/[^aeiou]y$/.test(w)) return `${word.slice(0, -1)}ies`;
  if (/(x|z|ch|sh)$/.test(w)) return `${word}es`;
  return `${word}s`;
}

/**
 * A listicle slug for a keyword: "seo agency" to "best-seo-agencies", "seo consultant for small business" to
 * "best-seo-consultants-for-small-business". The noun before "for", "in", "near" and the like (or the last word)
 * goes plural. A keyword that already leads with best or top, or compares ("vs", "alternatives"), keeps its words.
 */
export function listicleSlug(keyword: string): string {
  const words = keyword.toLowerCase().replace(/[^a-z0-9\s-]+/g, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  if (LEAD.test(words[0]) || words.includes("vs") || words.some((w) => /^alternatives?$/.test(w))) return slugify(words.join(" "));
  const cut = words.findIndex((w, i) => i > 0 && SPLIT.test(w));
  const head = cut > 0 ? cut - 1 : words.length - 1;
  const out = words.map((w, i) => (i === head ? plural(w) : w));
  return slugify(`best ${out.join(" ")}`);
}

export const isBofu = (stage: string | null | undefined) => stage === "bofu";

/** The slug the Content Plan suggests: a listicle for bottom-of-funnel keywords, the keyword itself otherwise. */
export const planSlug = (keyword: string, stage: string | null | undefined) => (isBofu(stage) ? listicleSlug(keyword) : slugify(keyword));

/** What the brief's prompt adds for a bottom-of-funnel keyword: write it as a listicle. */
export function listicleRules(keyword: string, year: number): string {
  return `- This is a bottom-of-funnel keyword, so the article is a listicle that ranks the best options for "${keyword}".
  - h1 and titles: the "N Best ... in ${year}" shape, for example "9 Best ${keyword.replace(/\b\w/g, (c) => c.toUpperCase())} in ${year}" made plural where it reads better.
  - outline: a short H2 on how the options were picked, then one H2 per option ("Name: who it's best for"), each with points on what it does well, its pricing from the sources, its pros and cons and who should skip it; then an H2 on how to choose. Put the brand itself in the list where it honestly fits, with the same rules as the rest.
  - modules: include a comparison table or a quiz that helps the reader pick.
  - slug: "${listicleSlug(keyword)}".`;
}
