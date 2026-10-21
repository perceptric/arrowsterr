// The Keyword Rank Checker's checks (docs/free-tools.md). Pure, so tests cover the cases where a wrong spot would
// cost a sign-up: www and subdomains, tracking codes on cited pages, and brand names inside other words.

/** A host without www, lowercased. */
export const bareHost = (host: string) => host.trim().toLowerCase().replace(/^www\./, "").replace(/\.$/, "");

/** Does a result's host belong to the domain someone entered? Subdomains count; look-alike domains don't. */
export function sameSite(host: string, domain: string): boolean {
  const h = bareHost(host);
  const d = bareHost(domain);
  return Boolean(d) && (h === d || h.endsWith(`.${d}`));
}

/** The host of a full address, or "" when it isn't one. */
export function hostOf(url: string): string {
  try {
    return bareHost(new URL(url).hostname);
  } catch {
    return "";
  }
}

const SECOND_LEVEL = new Set(["co", "com", "net", "org", "gov", "edu", "ac", "or", "ne", "go"]);

/** The brand word in a domain: acme from acme.com, bbc from bbc.co.uk, shop from shop.acme.io is acme. */
export function brandWord(domain: string): string {
  const parts = bareHost(domain).split(".");
  if (parts.length < 2) return parts[0] ?? "";
  const tld = parts.length >= 3 && SECOND_LEVEL.has(parts[parts.length - 2]) && parts[parts.length - 1].length === 2 ? 2 : 1;
  return parts[parts.length - 1 - tld] ?? "";
}

/** Does an answer's text name the site, by its domain or its brand word as a whole word? Short brand words need the domain. */
export function namesSite(text: string, domain: string): boolean {
  const d = bareHost(domain);
  const lower = text.toLowerCase();
  if (lower.includes(d)) return true;
  const word = brandWord(d);
  if (word.length < 4) return false;
  const esc = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/-/g, "[- ]?");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${esc}([^\\p{L}\\p{N}]|$)`, "iu").test(text);
}

export type OrganicRow = { rank: number; url: string; domain: string; title: string };

/** Every spot the domain holds in the results, best first. */
export function spotsOf(rows: OrganicRow[], domain: string): OrganicRow[] {
  return rows.filter((r) => sameSite(r.domain || hostOf(r.url), domain)).sort((a, b) => a.rank - b.rank);
}

/** The domains an AI answer cites, once each, in the order they appear. */
export function citedDomains(sources: { url: string; domain?: string }[]): string[] {
  const out: string[] = [];
  for (const s of sources) {
    const d = bareHost(s.domain || hostOf(s.url));
    if (d && !out.includes(d)) out.push(d);
  }
  return out;
}

export type AiVerdict = { cited: boolean; spot: number | null; named: boolean; pages: string[]; others: string[] };

/** Whether an AI answer cites the site, where among the cited sites, whether its text names it, and who else it cites. */
export function aiVerdict(answer: { text: string; sources: { url: string; domain?: string }[] }, domain: string): AiVerdict {
  const domains = citedDomains(answer.sources);
  const index = domains.findIndex((d) => sameSite(d, domain));
  return {
    cited: index >= 0,
    spot: index >= 0 ? index + 1 : null,
    named: namesSite(answer.text, domain),
    pages: [...new Set(answer.sources.filter((s) => sameSite(s.domain || hostOf(s.url), domain)).map((s) => s.url))].slice(0, 5),
    others: domains.filter((d) => !sameSite(d, domain)).slice(0, 10),
  };
}
