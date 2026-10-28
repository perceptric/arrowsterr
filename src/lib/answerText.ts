// Cleans an AI answer pulled from ChatGPT, Perplexity, Gemini, Claude or Google
// so it reads like the answer the person saw. Pure, so the browser, the server
// and tests can all use it, and safe to run twice on the same text.

const DOMAIN = /^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i;

/** Tracking tags the engines add to every link they cite. */
const TRACKING = /^(?:utm_[a-z]+|ref|ref_src|srsltid|gclid|fbclid)$/i;

/** A link without utm_source=chatgpt.com and the like. Leaves anything that isn't a URL alone. */
export function cleanUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
    return u.toString().replace(/\?$/, "");
  } catch {
    return url;
  }
}

/** A cited site as a short label: "www.eve.legal" and "https://eve.legal/x" both become "eve.legal". */
export function siteLabel(textOrUrl: string): string {
  const t = textOrUrl.trim();
  let host = t;
  try {
    if (/^https?:\/\//i.test(t)) host = new URL(t).hostname;
  } catch {
    /* keep the text */
  }
  return host.replace(/^www\./i, "").toLowerCase();
}

/** True when a link's text is just a site name, which is how engines mark a citation. */
export const isCitation = (text: string) => !text.trim() || DOMAIN.test(text.trim()) || /^\[?\d+\]?$/.test(text.trim());

/** Engines that wrap highlighted phrases in `backticks` instead of code. */
const HIGHLIGHTS = /ai overview|ai mode|gemini/i;

/**
 * The cleaned answer, still markdown:
 * - pictures (`![alt](url)`) are dropped, since only their alt text would show
 * - "[Visit EvenUp](url)" button lines are dropped
 * - escaped punctuation (`1\.`, `Best for\:`) is unescaped
 * - Google's [[1]](url) and empty [](url) citations become site citations
 * - a run of cited sites is kept once per site, with tracking tags removed
 * - Google's `highlighted phrases` lose their code marks
 * - stray spaces before punctuation and extra blank lines go
 */
export function cleanAnswer(text: string, engine = ""): string {
  if (!text) return "";
  let s = text.replace(/\r/g, "");

  // Pictures, on their own line or inline.
  s = s.replace(/^[ \t]*!\[[^\]]*\]\([^)]*\)[ \t]*$/gm, "").replace(/!\[[^\]]*\]\([^)]*\)/g, "");
  // Button-style links on their own line: "[Visit EvenUp](https://...)".
  s = s.replace(/^[ \t]*\[(?:Visit|Go to|Open|Learn more|Read more|See more|Try)\b[^\]]*\]\([^)]*\)[ \t]*$/gim, "");
  // Escaped punctuation. "\|", "\*", "\_" and brackets stay escaped, since unescaping them could make a table cell, bold text or a link.
  s = s.replace(/\\([:.!\-()#>~+=])/g, "$1");
  // Google's numbered citations, and citations whose number was stripped.
  s = s.replace(/\[\[(\d+)\]\]\((https?:\/\/[^)\s]+)\)/g, (_, _n, u: string) => `[${siteLabel(u)}](${u})`);
  s = s.replace(/\[\]\((https?:\/\/[^)\s]+)\)/g, (_, u: string) => `[${siteLabel(u)}](${u})`);
  // Every link: drop tracking tags.
  s = s.replace(/\]\((https?:\/\/[^)\s]+)\)/g, (_, u: string) => `](${cleanUrl(u)})`);
  // Runs of cited sites: one per site, short labels, one space before the run.
  s = s.replace(/[ \t]*((?:\[[^\]]*\]\(https?:\/\/[^)\s]+\)[ \t]*){1,})/g, (run: string, links: string) => {
    const parts = [...links.matchAll(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g)];
    if (!parts.every((p) => isCitation(p[1]))) return run;
    const seen = new Set<string>();
    const kept = parts.filter((p) => {
      const site = siteLabel(p[1] && DOMAIN.test(p[1].trim()) ? p[1] : p[2]);
      if (seen.has(site)) return false;
      seen.add(site);
      return true;
    });
    const out = kept.map((p) => `[${siteLabel(DOMAIN.test(p[1].trim()) ? p[1] : p[2])}](${p[2]})`).join("");
    return ` ${out}`;
  });
  // Google highlights phrases with backticks; they are not code.
  if (HIGHLIGHTS.test(engine)) s = s.replace(/`([^`\n]+)`/g, "$1");
  // Spacing: "Harvey :" and "( Demands )".
  s = s
    .replace(/[ \t]+([:;,.!?)])/g, "$1")
    .replace(/\([ \t]+/g, "(")
    .replace(/[ \t]+$/gm, "")
    .replace(/^[ \t]+(?=\[)/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    // Rules: none at the start or end, and never two in a row.
    .replace(/^(?:-{3,}\s*\n+)+/, "")
    .replace(/(?:\n+\s*-{3,})+\s*$/, "")
    .replace(/(\n-{3,}\n)(?:\s*-{3,}\n)+/g, "$1");
  return s;
}
