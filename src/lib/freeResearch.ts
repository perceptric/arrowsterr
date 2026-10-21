import "server-only";
import { cached, DAY } from "./cache";
import { askLive, call } from "./dataforseo";
import { intersect, rows } from "./gapServer";
import { bulkDomains, domainOverview, rankedFor, relevantPages, Spend, type Market } from "./keywords";
import { meterTotal, metered } from "./meter";
import { aiVerdict, bareHost, hostOf, spotsOf, type OrganicRow } from "./rankChecks";
import { MARKETS } from "./research";

// The paid research tools on arrowsterr.com (docs/free-tools.md): Domain Overview, Website Traffic Checker,
// Backlink Checker, Keyword Rank Checker and Keyword Gap Tool. Each piece is saved in the shared cache, so the same
// domain or keyword costs nothing the second time, for the free tools and the app alike.

const bad = (message: string) => Object.assign(new Error(message), { visitor: true });

/** Run paid work and say what it really cost: every DataForSEO and Claude call adds itself to the meter. */
export const measured = <T,>(fn: () => Promise<T>) => metered(null, "free tool", async () => ({ result: await fn(), cost: meterTotal() }));

const marketOf = (country: string): Market => MARKETS[country] ?? MARKETS["United States"];
const domainKey = (part: string, m: Market, domain: string) => `dom:domain:${part}:${m.location}:${m.language}:${domain}`;

async function task(path: string, body: Record<string, unknown>) {
  const [t] = await call(path, [body]);
  if (t?.status_code !== 20000) throw new Error(`DataForSEO: ${t?.status_message ?? "no result"}`);
  return t.result?.[0] ?? {};
}

// ─────────────── Shared pieces ───────────────

/** Size on Google. Same cache key as Website Research in the app. */
const overviewOf = (domain: string, m: Market) => cached(domainKey("ov", m, domain), 30 * DAY, () => domainOverview(domain, m, new Spend())).then((r) => r.data);

/** The 5 pages with the most Google visits. */
const topPages = (domain: string, m: Market) =>
  cached(`free:pages5:${m.location}:${m.language}:${domain}`, 30 * DAY, () => relevantPages(domain, m, new Spend(), 5)).then((r) => r.data.map((p) => ({ url: p.url, traffic: p.traffic, keywords: p.keywords })));

/** Google visits and keywords for each of the last 12 months, oldest first. */
const trendOf = (domain: string, m: Market) =>
  cached(`free:hist:${m.location}:${m.language}:${domain}`, 30 * DAY, async () => {
    const r = await task("dataforseo_labs/google/historical_rank_overview/live", { target: domain, location_code: m.location, language_code: m.language });
    type Month = { year?: number; month?: number; metrics?: { organic?: { etv?: number; count?: number } } };
    return ((r.items ?? []) as Month[])
      .filter((x) => x.year && x.month)
      .map((x) => ({ month: `${x.year}-${String(x.month).padStart(2, "0")}`, traffic: Math.round(x.metrics?.organic?.etv ?? 0), keywords: x.metrics?.organic?.count ?? 0 }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12);
  })
    .then((r) => r.data)
    // A missing trend shouldn't sink the whole result.
    .catch(() => []);

const noData = (domain: string, country: string) => bad(`Google shows no rankings for ${domain} in ${country} yet. Try another country, or check the spelling.`);

// ─────────────── Domain Overview ───────────────

export function snapshot(domain: string, country: string) {
  return measured(async () => {
    const m = marketOf(country);
    const [overview, ranked, pages, trend] = await Promise.all([
      overviewOf(domain, m),
      // The same 100 keywords Website Research shows first.
      cached(domainKey("kw", m, domain), 30 * DAY, () => rankedFor({ scope: "domain", host: domain, path: "" }, m, new Spend(), 100)).then((r) => r.data),
      topPages(domain, m),
      trendOf(domain, m),
    ]);
    if (!overview || !overview.keywords) throw noData(domain, country);
    const keywords = [...ranked.keywords]
      .sort((a, b) => (b.etv ?? 0) - (a.etv ?? 0) || (b.volume ?? 0) - (a.volume ?? 0))
      .slice(0, 10)
      .map((k) => ({ keyword: k.keyword, rank: k.rank, volume: k.volume, kd: k.kd, intent: k.intent, url: k.url, traffic: Math.round(k.etv ?? 0) }));
    return { domain, country, overview, trend, keywords, pages };
  });
}

// ─────────────── Website Traffic Checker ───────────────

export function traffic(domain: string, country: string) {
  return measured(async () => {
    const m = marketOf(country);
    const [overview, pages, trend, bulk] = await Promise.all([
      overviewOf(domain, m),
      topPages(domain, m),
      trendOf(domain, m),
      bulkDomains([{ target: domain, kind: "domain" }], m, new Spend()).catch(() => []),
    ]);
    if (!overview || !overview.keywords) throw noData(domain, country);
    return { domain, country, traffic: overview.traffic, value: bulk[0]?.value ?? null, keywords: overview.keywords, top10: overview.top10, trend, pages };
  });
}

// ─────────────── Backlink Checker ───────────────

type Backlink = {
  url_from?: string;
  domain_from?: string;
  url_to?: string;
  anchor?: string | null;
  dofollow?: boolean;
  first_seen?: string | null;
  domain_from_rank?: number;
  item_type?: string;
  backlink_spam_score?: number;
};

/** DataForSEO ranks run 0 to 1000. People know 0 to 100. */
const rank100 = (n: unknown) => (typeof n === "number" ? Math.round(n / 10) : null);
/** The largest counts in a breakdown, as rows. */
const top = (o: unknown, n = 6) =>
  Object.entries((o ?? {}) as Record<string, number>)
    .filter(([, v]) => typeof v === "number" && v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, count]) => ({ name, count }));

/** target is a bare domain (the whole site) or a full page address (that page). */
export function backlinks(target: string) {
  return measured(async () => {
    const page = /^https?:\/\//.test(target);
    const base = { target, backlinks_status_type: "live", ...(page ? {} : { include_subdomains: true }) };
    const [summary, list] = await Promise.all([
      task("backlinks/summary/live", { ...base, internal_list_limit: 10 }),
      task("backlinks/backlinks/live", { ...base, mode: "one_per_domain", limit: 20, order_by: ["domain_from_rank,desc"], filters: ["backlink_spam_score", "<", 60] }),
    ]);
    const total = Number(summary.backlinks ?? 0);
    if (!total) throw bad(`No backlinks found for ${page ? "that page" : target} yet. New sites and pages can take a few weeks to show up.`);
    const nofollow = Number((summary.referring_links_attributes as Record<string, number> | undefined)?.nofollow ?? 0);
    return {
      target,
      scope: page ? "page" : "domain",
      rank: rank100(summary.rank),
      backlinks: total,
      domains: Number(summary.referring_domains ?? 0),
      mainDomains: Number(summary.referring_main_domains ?? 0),
      ips: Number(summary.referring_ips ?? 0),
      followed: Math.max(0, total - nofollow),
      nofollow,
      broken: Number(summary.broken_backlinks ?? 0),
      types: top(summary.referring_links_types),
      tlds: top(summary.referring_links_tld, 8),
      countries: top(summary.referring_links_countries, 8),
      links: ((list.items ?? []) as Backlink[])
        .filter((b) => b.url_from)
        .map((b) => ({
          from: b.url_from!,
          domain: bareHost(b.domain_from ?? hostOf(b.url_from!)),
          to: b.url_to ?? null,
          anchor: (b.anchor ?? "").replace(/\s+/g, " ").trim().slice(0, 200),
          follow: b.dofollow !== false,
          type: b.item_type ?? "anchor",
          firstSeen: b.first_seen ? b.first_seen.slice(0, 10) : null,
          rank: rank100(b.domain_from_rank),
        })),
    };
  });
}

// ─────────────── Keyword Rank Checker ───────────────

type SerpItem = { type?: string; rank_group?: number; url?: string; domain?: string; title?: string; items?: SerpItem[]; references?: { url?: string; domain?: string }[] };

/** Google's top 100 for a keyword, saved a day per keyword and country so every domain checking it shares one call. */
const google100 = (keyword: string, m: Market) =>
  cached(`free:serp100:${m.location}:${m.language}:${keyword}`, DAY, async () => {
    const r = await task("serp/google/organic/live/advanced", { keyword, location_code: m.location, language_code: m.language, device: "desktop", depth: 100, load_async_ai_overview: true });
    const items: SerpItem[] = r.items ?? [];
    const aio = items.find((i) => i.type === "ai_overview");
    const refs = [...(aio?.references ?? []), ...(aio?.items ?? []).flatMap((i) => i.references ?? [])].filter((x) => x.url).map((x) => ({ url: x.url!, domain: x.domain ?? "" }));
    const organic: OrganicRow[] = items
      .filter((i) => i.type === "organic" && i.url)
      .map((i) => ({ rank: i.rank_group ?? 0, url: i.url!, domain: bareHost(i.domain ?? hostOf(i.url!)), title: (i.title ?? "").slice(0, 200) }));
    return {
      organic,
      features: [...new Set(((r.item_types as string[]) ?? items.map((i) => i.type ?? "")).filter((t) => t && t !== "organic"))],
      ads: items.filter((i) => i.type === "paid").length,
      aio: { shown: Boolean(aio), sources: refs },
    };
  }).then((r) => r.data);

/** Google AI Mode's answer for the keyword, saved a day per keyword and country. */
const aiMode = (keyword: string, m: Market) =>
  cached(`free:aimode:${m.location}:${m.language}:${keyword}`, DAY, async () => {
    const a = await askLive("AI Mode", keyword, { location_code: m.location, language_code: m.language });
    return { text: a.text.slice(0, 20_000), sources: a.sources.map((s) => ({ url: s.url, domain: s.domain })) };
  }).then((r) => r.data);

export function rank(domain: string, keyword: string, country: string) {
  return measured(async () => {
    const m = marketOf(country);
    const [g, ai] = await Promise.all([google100(keyword, m), aiMode(keyword, m).catch(() => null)]);
    const spots = spotsOf(g.organic, domain);
    const overview = aiVerdict({ text: "", sources: g.aio.sources }, domain);
    const mode = ai ? aiVerdict(ai, domain) : null;
    return {
      domain,
      keyword,
      country,
      google: {
        rank: spots[0]?.rank ?? null,
        url: spots[0]?.url ?? null,
        spots: spots.map((s) => ({ rank: s.rank, url: s.url })),
        top10: g.organic.slice(0, 10).map((r) => ({ ...r, mine: spots.some((s) => s.url === r.url) })),
        features: g.features,
        ads: g.ads,
        aiOverview: { shown: g.aio.shown, cited: overview.cited, spot: overview.spot },
      },
      aiMode: mode && { ...mode, excerpt: ai!.text.replace(/\s+/g, " ").slice(0, 600) },
    };
  });
}

// ─────────────── Keyword Gap Tool ───────────────

/** The top 20 keywords the rival ranks for in Google's top 20 where you aren't in the top 100. */
export function gap(you: string, rival: string, country: string) {
  return measured(async () => {
    const m = marketOf(country);
    const { data } = await cached(`free:gap:${m.location}:${m.language}:${rival}:${you}`, 7 * DAY, () =>
      intersect(rival, you, false, m, new Spend(), { limit: 20, filters: ["first_domain_serp_element.rank_group", "<=", 20] }),
    );
    return { you, rival, country, total: data.total, keywords: rows(data.items, false) };
  });
}
