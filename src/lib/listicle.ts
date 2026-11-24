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

/** Keywords that ask for a ranked list of options, whatever their stage: "best crm", "freshdesk alternatives", "x vs y". */
const LIST_WORDS = /\b(best|top|alternatives?|vs\.?|versus|competitors|tools|software|apps|platforms)\b/i;
/** True when the article should be a listicle: a bottom-of-funnel piece, or a keyword that asks for options. */
export const isListicle = (keyword: string, stage: string | null | undefined) => isBofu(stage) || LIST_WORDS.test(keyword);

/** The listicle's fixed H2s (and each option's "N. Name"), which the search-led heading check leaves alone. */
export const skeletonHeading = (h2: string) => /^\s*\d{1,2}[.)]\s/.test(h2) || /quick overview|compared|comparison|how to choose|frequently asked/i.test(h2);

/** The slug the Content Plan suggests: a listicle for bottom-of-funnel keywords, the keyword itself otherwise. */
export const planSlug = (keyword: string, stage: string | null | undefined) => (isBofu(stage) ? listicleSlug(keyword) : slugify(keyword));

const title = (k: string) => k.replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * What the brief's prompt adds for a listicle, in the shape the best "best X" and "X alternatives" pages use (for
 * example folk.app's "7 Best Salesforce Agentforce Alternatives for Sales"): an intro from the reader's job, a quick
 * overview of who each option is best for, a comparison table, one section per option in the same order of parts
 * (overview, pros, cons, pricing), how to choose, then the FAQ.
 */
export function listicleRules(keyword: string, year: number, brand = "the brand"): string {
  const k = title(keyword);
  return `- This keyword asks for a ranked list of options, so the article is a listicle for "${keyword}". It follows this shape exactly; the search-led heading rules apply only to H2s outside it.
  - h1 and titles: "N Best ${k}${/\bfor\b/i.test(keyword) ? "" : " for [who it's for]"}" with the number of options, or "N Best ${k} in ${year}". Keep the keyword whole.
  - intro card: open on the job the reader wants done ("If the task you want to hand off is...", "If you need..."), in second person, never with a definition. Show in one or two sentences why the right pick depends on that job, then say what each option is judged on (where it fits, what it takes to set up, what to check before you pay).
  - outline, in this order:
    1. "Best ${k}: Quick Overview": one point per option, each "[Name] is best for [a specific job or team]", in list order. No H3s.
    2. "[N] Best ${k} Compared" (or "${k} Compared"): one point saying the table compares them; the comparison table module goes here.
    3. One H2 per option, numbered: "1. [Name]: Best for [use case]", "2. ...". Each has exactly these H3s in this order: "Overview", "Pros", "Cons", "Pricing". Points: the overview opens with a short scene from the reader's day where this option helps, then who it fits and who should skip it; 3 pros and 2 cons, each one concrete; pricing as each plan with its price and billing terms, only from the sources (a plan the sources don't price goes in gaps, never guessed). A rating only when a source gives one, with where it's from.
    4. "How to Choose the Right ${k}": a test to run in every demo, then 3 or 4 questions to check, each an H3 written as the question, with how to check it.
  - ${brand} goes in the list as option 1 when it competes in this category, with the same parts, honest cons and its own pricing, plus one point with a prompt or first step to try it; otherwise it gets no section of its own and appears only in the CTA.
  - faqs: 4 to 6 questions from People Also Ask and the question searches (for example "Can [brand] replace [keyword subject]?", "Can I use [it] without switching [tool]?"), each answer a direct 2 to 4 sentence reply that names options. The FAQ is written after the last H2; don't add it to the outline.
  - examples: one per option, in list order, each H2 containing its name exactly.
  - modules: exactly one comparison table under the "Compared" H2, with the columns Option, Best for, Standout feature, Starting price, one row per option, every value from the sources ("See pricing page" where the sources have no price). Add a picker only with 6 or more options.
  - slug: "${listicleSlug(keyword)}".`;
}
