// AI crawlers on the brand's own site: which bots read which pages, how often, and which pages they skip.
// No server-only code here, so tests can load it. The WordPress connector plugin keeps the same list
// (arrowsterr_crawler_bots in wp-plugin/arrowsterr-connector), and a test checks the two match.

export type BotKind = "training" | "search" | "user";
export type Bot = { id: string; token: string; name: string; owner: string; kind: BotKind };

/**
 * Each bot is found by a word in its user agent, checked in this order, without case.
 * Google-Extended and Applebot-Extended are robots.txt words only (they never visit), so they are left out:
 * Googlebot and Applebot do the reading for Google's AI Overviews and Apple Intelligence.
 */
export const BOTS: Bot[] = [
  { id: "oai-searchbot", token: "OAI-SearchBot", name: "OAI-SearchBot", owner: "OpenAI", kind: "search" },
  { id: "chatgpt-user", token: "ChatGPT-User", name: "ChatGPT-User", owner: "OpenAI", kind: "user" },
  { id: "gptbot", token: "GPTBot", name: "GPTBot", owner: "OpenAI", kind: "training" },
  { id: "claude-searchbot", token: "Claude-SearchBot", name: "Claude-SearchBot", owner: "Anthropic", kind: "search" },
  { id: "claude-user", token: "Claude-User", name: "Claude-User", owner: "Anthropic", kind: "user" },
  { id: "claudebot", token: "ClaudeBot", name: "ClaudeBot", owner: "Anthropic", kind: "training" },
  { id: "perplexity-user", token: "Perplexity-User", name: "Perplexity-User", owner: "Perplexity", kind: "user" },
  { id: "perplexitybot", token: "PerplexityBot", name: "PerplexityBot", owner: "Perplexity", kind: "search" },
  { id: "googlebot", token: "Googlebot", name: "Googlebot", owner: "Google", kind: "search" },
  { id: "bingbot", token: "bingbot", name: "Bingbot", owner: "Microsoft", kind: "search" },
  { id: "applebot", token: "Applebot", name: "Applebot", owner: "Apple", kind: "search" },
  { id: "meta-externalagent", token: "meta-externalagent", name: "Meta-ExternalAgent", owner: "Meta", kind: "training" },
  { id: "bytespider", token: "Bytespider", name: "Bytespider", owner: "ByteDance", kind: "training" },
  { id: "ccbot", token: "CCBot", name: "CCBot", owner: "Common Crawl", kind: "training" },
  { id: "amazonbot", token: "Amazonbot", name: "Amazonbot", owner: "Amazon", kind: "search" },
  { id: "duckassistbot", token: "DuckAssistBot", name: "DuckAssistBot", owner: "DuckDuckGo", kind: "user" },
];
const BY_ID = new Map(BOTS.map((b) => [b.id, b]));
export const botOf = (id: string) => BY_ID.get(id) ?? null;

/** The bot a user agent belongs to, or null for people and other bots. */
export function matchBot(ua: string | null | undefined): Bot | null {
  const s = String(ua ?? "").toLowerCase();
  if (!s) return null;
  return BOTS.find((b) => s.includes(b.token.toLowerCase())) ?? null;
}

/** A page path as both sources should count it: no query, no hash, no trailing slash, at most 300 characters. */
export function normPath(raw: string | null | undefined): string {
  let p = String(raw ?? "").trim();
  try {
    if (/^https?:\/\//i.test(p)) p = new URL(p).pathname;
  } catch {
    // Not a full address; read it as a path.
  }
  p = p.replace(/[?#].*$/, "");
  try {
    p = decodeURI(p);
  } catch {
    // Keep it as sent.
  }
  if (!p.startsWith("/")) p = `/${p}`;
  p = p.replace(/\/{2,}/g, "/");
  if (p.length > 1) p = p.replace(/\/+$/, "");
  return p.slice(0, 300) || "/";
}

/** One count: a bot read a path this many times on a day (YYYY-MM-DD). */
export type CrawlRow = { day: string; bot: string; path: string; hits: number };

// Files and machine paths that are not pages. robots.txt and llms.txt stay in: they show which bots check the rules.
const NOT_PAGE = /\.(jpe?g|png|gif|svg|webp|avif|ico|css|js|mjs|map|woff2?|ttf|eot|mp4|webm|mp3|zip|gz)$|^\/(wp-json|wp-admin|wp-includes|wp-content|cdn-cgi|_next)(\/|$)/i;
export const isPage = (path: string) => !NOT_PAGE.test(path);

/** Add up rows that share a day, bot and path. Rows for bots not on the list are dropped. */
export function mergeRows(rows: CrawlRow[]): CrawlRow[] {
  const out = new Map<string, CrawlRow>();
  for (const r of rows) {
    if (!BY_ID.has(r.bot) || !(r.hits > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(r.day)) continue;
    const path = normPath(r.path);
    const key = `${r.day}|${r.bot}|${path}`;
    const had = out.get(key);
    if (had) had.hits += r.hits;
    else out.set(key, { day: r.day, bot: r.bot, path, hits: r.hits });
  }
  return [...out.values()];
}

export type BotLine = Bot & { hits: number; pages: number; last: string | null; days: { day: string; hits: number }[] };
export type PageLine = { path: string; hits: number; bots: { id: string; hits: number }[]; last: string };
export type CrawlerReport = {
  total: number;
  bots: BotLine[];
  pages: PageLine[];
  /** Important pages no AI bot read in the period, homepage first. */
  skipped: string[];
  skippedCount: number;
  checkedPages: number;
};

/** Days from `from` to `to` (inclusive), as YYYY-MM-DD. */
export function dayList(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`) && out.length < 400; t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/**
 * The report for a period. important is the site's key pages (paths, most important first); a page counts as
 * read when any listed bot other than Googlebot and Bingbot read it, since those two read everything for search.
 */
export function buildReport(raw: CrawlRow[], important: string[], from: string, to: string, maxPages = 50, maxSkipped = 25): CrawlerReport {
  const rows = mergeRows(raw).filter((r) => r.day >= from && r.day <= to && isPage(r.path));
  const days = dayList(from, to);
  const bots: BotLine[] = BOTS.map((b) => {
    const mine = rows.filter((r) => r.bot === b.id);
    const perDay = new Map<string, number>();
    for (const r of mine) perDay.set(r.day, (perDay.get(r.day) ?? 0) + r.hits);
    const seen = [...perDay.keys()].sort();
    return { ...b, hits: mine.reduce((n, r) => n + r.hits, 0), pages: new Set(mine.map((r) => r.path)).size, last: seen.at(-1) ?? null, days: days.map((day) => ({ day, hits: perDay.get(day) ?? 0 })) };
  })
    .filter((b) => b.hits > 0)
    .sort((a, b) => b.hits - a.hits);

  const byPath = new Map<string, { hits: number; bots: Map<string, number>; last: string }>();
  for (const r of rows) {
    const p = byPath.get(r.path) ?? { hits: 0, bots: new Map(), last: r.day };
    p.hits += r.hits;
    p.bots.set(r.bot, (p.bots.get(r.bot) ?? 0) + r.hits);
    if (r.day > p.last) p.last = r.day;
    byPath.set(r.path, p);
  }
  const pages: PageLine[] = [...byPath.entries()]
    .map(([path, p]) => ({ path, hits: p.hits, last: p.last, bots: [...p.bots.entries()].map(([id, hits]) => ({ id, hits })).sort((a, b) => b.hits - a.hits) }))
    .sort((a, b) => b.hits - a.hits || a.path.localeCompare(b.path))
    .slice(0, maxPages);

  const readByAi = new Set(rows.filter((r) => r.bot !== "googlebot" && r.bot !== "bingbot").map((r) => r.path));
  const want = [...new Set(important.map(normPath))].filter(isPage);
  const missed = want.filter((p) => !readByAi.has(p));
  return { total: rows.reduce((n, r) => n + r.hits, 0), bots, pages, skipped: missed.slice(0, maxSkipped), skippedCount: missed.length, checkedPages: want.length };
}

// ─────────────── Cloudflare (GraphQL Analytics, httpRequestsAdaptiveGroups) ───────────────

/** Split a period into pieces at most `width` days long, so each fits the zone's widest query. */
export function chunks(days: string[], width: number): { from: string; to: string }[] {
  const w = Math.max(1, Math.floor(width));
  const out: { from: string; to: string }[] = [];
  for (let i = 0; i < days.length; i += w) out.push({ from: days[i], to: days[Math.min(days.length, i + w) - 1] });
  return out;
}
export const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** One Cloudflare query: AI crawler requests by day, user agent and path, one alias per piece of the period. */
export function cloudflareQuery(parts: { from: string; to: string }[], limit: number): string {
  const ua = BOTS.map((b) => `{ userAgent_like: "%${b.token}%" }`).join(", ");
  const body = parts.map(
    (c, i) =>
      `p${i}: httpRequestsAdaptiveGroups(limit: ${limit}, orderBy: [count_DESC], filter: { datetime_geq: "${c.from}T00:00:00Z", datetime_lt: "${nextDay(c.to)}T00:00:00Z", requestSource: "eyeball", OR: [${ua}] }) { count dimensions { date userAgent clientRequestPath } }`,
  );
  return `query Crawlers($zone: string) { viewer { zones(filter: { zoneTag: $zone }) { ${body.join(" ")} } } }`;
}

/** The query that reads how far back and how wide this zone can ask. */
export const CLOUDFLARE_SETTINGS = "query Limits($zone: string) { viewer { zones(filter: { zoneTag: $zone }) { settings { httpRequestsAdaptiveGroups { enabled maxDuration notOlderThan maxPageSize } } } } }";

/** The rows in Cloudflare's answer to cloudflareQuery. Requests from user agents not on the list are dropped. */
export function fromCloudflare(answer: unknown, parts: { from: string; to: string }[]): CrawlRow[] {
  const zone = (answer as { viewer?: { zones?: Record<string, unknown>[] } } | null)?.viewer?.zones?.[0] ?? {};
  const out: CrawlRow[] = [];
  parts.forEach((c, i) => {
    const groups = (zone[`p${i}`] ?? []) as { count?: number; dimensions?: { date?: string; userAgent?: string; clientRequestPath?: string } }[];
    for (const g of Array.isArray(groups) ? groups : []) {
      const bot = matchBot(g.dimensions?.userAgent);
      if (bot && Number(g.count) > 0) out.push({ day: String(g.dimensions?.date ?? c.from).slice(0, 10), bot: bot.id, path: normPath(g.dimensions?.clientRequestPath), hits: Number(g.count) });
    }
  });
  return mergeRows(out);
}

/** How far back and how wide a Cloudflare zone can query, from its settings, in whole days. */
export function cloudflareWindow(settings: unknown): { back: number; width: number; pageSize: number; enabled: boolean } {
  const s = (settings as { viewer?: { zones?: { settings?: { httpRequestsAdaptiveGroups?: { enabled?: boolean; notOlderThan?: number; maxDuration?: number; maxPageSize?: number } } }[] } } | null)?.viewer?.zones?.[0]?.settings?.httpRequestsAdaptiveGroups;
  if (!s) return { back: 7, width: 1, pageSize: 1000, enabled: true };
  return {
    enabled: s.enabled !== false,
    back: Math.max(1, Math.floor(Number(s.notOlderThan ?? 604_800) / 86_400)),
    width: Math.max(1, Math.floor(Number(s.maxDuration ?? 86_400) / 86_400)),
    pageSize: Math.max(100, Math.min(10_000, Number(s.maxPageSize ?? 1000))),
  };
}

// ─────────────── WordPress (Arrowsterr Connector, GET /arrowsterr/v1/crawlers) ───────────────

/** The rows in the connector plugin's answer: { rows: [[day, bot, path, hits], ...] }. */
export function fromConnector(answer: unknown): CrawlRow[] {
  const list = (answer as { rows?: unknown } | null)?.rows;
  if (!Array.isArray(list)) return [];
  const out: CrawlRow[] = [];
  for (const r of list) {
    if (!Array.isArray(r) || r.length < 4) continue;
    out.push({ day: String(r[0]), bot: String(r[1]), path: String(r[2]), hits: Math.max(0, Math.floor(Number(r[3]) || 0)) });
  }
  return mergeRows(out);
}
