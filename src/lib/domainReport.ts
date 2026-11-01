import "server-only";
import { cached, DAY } from "./cache";
import { competitors, domainHistory, domainOverview, rankedFor, targetLabel, type Spend, type Target } from "./keywords";
import { MARKETS, pagesOf, type DomainReport } from "./research";

/**
 * One site, subdomain, folder or page on Google: its size, its last 12 months, top keywords and pages, and its competitors.
 * Every piece is cached for 30 days and shared, so Domain Research and its PDF read the same saved results.
 * more asks for 500 keywords instead of 100, cached separately.
 */
export async function domainReport(target: Target, country: string, more: boolean, spend: Spend): Promise<DomainReport> {
  const domain = targetLabel(target);
  const m = MARKETS[country] ?? MARKETS["United States"];
  const key = (part: string) => `dom:${target.scope}:${part}:${m.location}:${m.language}:${domain}`;
  const whole = target.scope === "domain";
  const [ranked, overview, rivals, history] = await Promise.all([
    cached(key(more ? "kw500" : "kw"), 30 * DAY, () => rankedFor(target, m, spend, more ? 500 : 100)).then((r) => r.data),
    // A subdomain, folder or page gets its size from the ranked keywords call.
    whole ? cached(key("ov"), 30 * DAY, () => domainOverview(target.host, m, spend)).then((r) => r.data).catch(() => null) : null,
    cached(`dom:comp:${m.location}:${m.language}:${target.host}`, 30 * DAY, () => competitors(target.host, m, spend, 10)).then((r) => r.data).catch(() => []),
    // A missing history shouldn't sink the whole report.
    whole ? cached(key("hist"), 30 * DAY, () => domainHistory(target.host, m, spend)).then((r) => r.data).catch(() => []) : [],
  ]);
  const keywords = ranked.keywords;
  return {
    domain,
    scope: target.scope,
    country,
    overview: overview ?? ranked.overview,
    keywords,
    more,
    pages: pagesOf(keywords).slice(0, 100),
    competitors: rivals,
    history,
    cost: Math.round(spend.total * 10000) / 10000,
    cached: spend.total === 0,
  };
}
