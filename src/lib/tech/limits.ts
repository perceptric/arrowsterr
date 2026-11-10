// How much the crawler may do per plan (docs/technical-seo-plan.md, section 10). Pure.

export type CrawlSettings = { limit: number; speed: number; include: string[]; exclude: string[]; dropQuery: boolean; subdomains: boolean };

/** Pages per crawl. */
export const PAGE_LIMIT: Record<string, number> = { free: 100, trial: 500, foundation: 2000, scale: 10_000, thrive: 10_000, agency: 20_000, enterprise: 50_000, legacy: 10_000 };
export const pageLimit = (plan: string) => PAGE_LIMIT[plan] ?? 2000;

export const DEFAULT_SETTINGS: CrawlSettings = { limit: 0, speed: 4, include: [], exclude: [], dropQuery: false, subdomains: false };

/** Saved settings made safe: limit inside the plan's, speed 1 to 10 requests a second, short rule lists. */
export function cleanSettings(raw: unknown, plan: string): CrawlSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<CrawlSettings>;
  const max = pageLimit(plan);
  const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, 20).map((x) => x.slice(0, 200)) : []);
  const want = Number(r.limit) || 0;
  return {
    limit: want > 0 ? Math.min(max, Math.round(want)) : max,
    speed: Math.max(1, Math.min(10, Math.round(Number(r.speed) || DEFAULT_SETTINGS.speed))),
    include: list(r.include),
    exclude: list(r.exclude),
    dropQuery: Boolean(r.dropQuery),
    subdomains: Boolean(r.subdomains),
  };
}

/** Whether a URL passes the include and exclude rules. A rule is plain text the URL must contain, or /a regex/. */
export function passesRules(url: string, s: Pick<CrawlSettings, "include" | "exclude">): boolean {
  const hit = (rule: string) => {
    const m = /^\/(.+)\/([a-z]*)$/.exec(rule);
    if (m) {
      try {
        return new RegExp(m[1], m[2]).test(url);
      } catch {
        return false;
      }
    }
    return url.includes(rule);
  };
  if (s.exclude.some(hit)) return false;
  return !s.include.length || s.include.some(hit);
}

/** Pages rendered with JavaScript per crawl: 0 means samples only (3 per template plus thin pages). */
export const RENDER_LIMIT: Record<string, number> = { free: -1, trial: 0, foundation: 0, scale: 2000, thrive: 2000, agency: 20_000, enterprise: 50_000, legacy: 2000 };
/** -1: no rendering. 0: samples only. Above 0: every page up to that many. */
export const renderLimit = (plan: string) => RENDER_LIMIT[plan] ?? 0;

/**
 * Which pages to render: on sample plans, 3 per template and every page with under 100 words of raw text (at most 100);
 * on larger plans, every page up to the limit. The first page of each template also gets a screenshot (at most 40).
 */
export function pickRenders(pages: { url: string; template: string; words: number }[], limit: number): { url: string; shot: boolean }[] {
  if (limit < 0) return [];
  const byTpl = new Map<string, string[]>();
  for (const p of pages) byTpl.set(p.template, [...(byTpl.get(p.template) ?? []), p.url]);
  const shots = new Set([...byTpl.values()].map((list) => list[0]).slice(0, 40));
  let chosen: string[];
  if (limit > 0) chosen = pages.slice(0, limit).map((p) => p.url);
  else {
    const sample = [...byTpl.values()].flatMap((list) => list.slice(0, 3));
    const thin = pages.filter((p) => p.words < 100).map((p) => p.url).slice(0, 100);
    chosen = [...new Set([...sample, ...thin])];
  }
  return chosen.map((url) => ({ url, shot: shots.has(url) }));
}
