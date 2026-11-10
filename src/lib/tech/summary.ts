import { AREAS, areaScores, depths, indexReason, issuesByPage, runChecks, score, type Area, type CheckPage, type Issue, type SiteFacts } from "./checks.ts";
import { templateName, templates } from "./url.ts";

// Turning a finished crawl into the Site Audit's summary: links counted between pages, depth, issues, scores by area,
// templates and the charts' numbers. Pure, so the crawler and the tests agree.

export type Stats = {
  statuses: { ok: number; redirect: number; client: number; server: number; none: number };
  depth: number[];
  indexability: { indexable: number; noindex: number; canonical: number; redirect: number; error: number };
  templates: { pattern: string; name: string; pages: number; issues: number }[];
};

/** Links counted as pages stream in: links in per page, links to errors and to redirects, with a sample of each. */
export class LinkTally {
  private id = new Map<string, number>();
  private urls: string[] = [];
  private status: number[] = [];
  private out: number[][] = [];
  linksIn: number[] = [];
  broken: { from: string; to: string; status: number }[] = [];
  brokenCount = 0;
  toRedirect: { from: string; to: string }[] = [];
  toRedirectCount = 0;

  /** Every crawled page first, with its status, so links can be judged in one pass. */
  page(url: string, status: number) {
    if (this.id.has(url)) return;
    this.id.set(url, this.urls.length);
    this.urls.push(url);
    this.status.push(status);
    this.out.push([]);
    this.linksIn.push(0);
  }

  /** One page's internal links. Links to pages the crawl never fetched are left alone: unknown is never broken. */
  links(from: string, to: string[]) {
    const f = this.id.get(from);
    if (f === undefined) return;
    const seen = new Set<number>();
    for (const t of to) {
      const i = this.id.get(t);
      if (i === undefined || i === f || seen.has(i)) continue;
      seen.add(i);
      this.out[f].push(i);
      this.linksIn[i]++;
      const s = this.status[i];
      if (s === 0 || s >= 400) {
        this.brokenCount++;
        if (this.broken.length < 300) this.broken.push({ from, to: t, status: s });
      } else if (s >= 300) {
        this.toRedirectCount++;
        if (this.toRedirect.length < 300) this.toRedirect.push({ from, to: t });
      }
    }
  }

  inOf = (url: string) => this.linksIn[this.id.get(url) ?? -1] ?? 0;

  /** Click depth of every page from the start pages, following the links counted so far. */
  depth(starts: string[]): Map<string, number> {
    const adj = new Map<string, string[]>();
    this.out.forEach((list, i) => adj.set(this.urls[i], list.map((j) => this.urls[j])));
    return depths(starts.filter((s) => this.id.has(s)), adj);
  }
}

export function stats(pages: CheckPage[], issuesOf: Map<string, string[]>, tpl: Map<string, string>): Stats {
  const statuses = { ok: 0, redirect: 0, client: 0, server: 0, none: 0 };
  const depth = Array<number>(7).fill(0);
  const indexability = { indexable: 0, noindex: 0, canonical: 0, redirect: 0, error: 0 };
  const byTpl = new Map<string, { pages: number; issues: number }>();
  for (const p of pages) {
    if (p.status === 0) statuses.none++;
    else if (p.status < 300) statuses.ok++;
    else if (p.status < 400) statuses.redirect++;
    else if (p.status < 500) statuses.client++;
    else statuses.server++;
    if (p.depth !== null && p.status >= 200 && p.status < 300) depth[Math.min(6, p.depth)]++;
    const r = indexReason(p);
    if (!r) indexability.indexable++;
    else if (r === "noindex") indexability.noindex++;
    else if (r === "Canonical elsewhere") indexability.canonical++;
    else if (r === "Redirect") indexability.redirect++;
    else indexability.error++;
    const t = tpl.get(p.url) ?? "/";
    const cur = byTpl.get(t) ?? { pages: 0, issues: 0 };
    cur.pages++;
    cur.issues += issuesOf.get(p.url)?.length ?? 0;
    byTpl.set(t, cur);
  }
  return {
    statuses,
    depth,
    indexability,
    templates: [...byTpl.entries()].map(([pattern, v]) => ({ pattern, name: templateName(pattern), ...v })).sort((a, b) => b.pages - a.pages).slice(0, 40),
  };
}

export type Summary = { issues: Issue[]; score: number; areas: Record<Area, number>; stats: Stats; perPage: Map<string, string[]>; template: Map<string, string> };

export function summarize(pages: CheckPage[], site: SiteFacts): Summary {
  const issues = runChecks(pages, site);
  const perPage = issuesByPage(issues);
  const template = templates(pages.map((p) => p.url));
  return { issues, score: score(issues, pages.length), areas: areaScores(issues, pages.length), stats: stats(pages, perPage, template), perPage, template };
}

export { AREAS };
