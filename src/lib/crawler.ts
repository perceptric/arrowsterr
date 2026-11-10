import "server-only";
import { gunzipSync } from "node:zlib";
import type { SupabaseClient } from "@supabase/supabase-js";
import { entitlement } from "./entitlements";
import { parseRobots, robotsAllows, type ParsedRobots } from "./robotsTest";
import { partialReason, scoreToSave } from "./siteAudit";
import type { CheckPage, Issue, SiteFacts } from "./tech/checks";
import { cleanSettings, passesRules, type CrawlSettings } from "./tech/limits";
import { readPage, refreshTarget, type Link, type PageFacts } from "./tech/parse";
import { parseSitemap, robotsSitemaps } from "./tech/sitemaps";
import { LinkTally, summarize, type Stats } from "./tech/summary";
import { NOT_A_PAGE, isInternal, normUrl, pathOnly } from "./tech/url";

// Crawler v2 (docs/technical-seo-plan.md, section 6). A crawl runs as a chain of "audit" jobs: each one fetches pages
// for about 3 minutes from the queue in crawl_queue, saves them to crawl_pages, and hands over to the next job. The
// last one counts links, runs the checks and saves the summary on site_audits. A restart loses nothing: the queue and
// the pages already read are in the database.

const UA = "Mozilla/5.0 (compatible; ArrowsterrBot/2.0; +https://arrowsterr.com/bot)";
const BOT = "ArrowsterrBot";
const TIMEOUT = 20_000;
const MAX_BODY = 5_000_000;
const BUDGET_MS = 190_000;
const MAX_RUN_MS = 3 * 3600_000;
const MAX_SITEMAPS = 50;
const MAX_VARIANTS = 50;
const EXTERNAL_CHECKS = 300;

/** AI crawlers that fetch pages for answers, and those that only collect training data. */
export const AI_SEARCH_BOTS = ["OAI-SearchBot", "ChatGPT-User", "Claude-SearchBot", "Claude-User", "PerplexityBot", "Perplexity-User"];
export const AI_TRAINING_BOTS = ["GPTBot", "ClaudeBot", "Google-Extended", "CCBot", "Applebot-Extended"];

type Hop = { url: string; status: number };
type Fetched = { url: string; final: string; status: number; chain: Hop[]; loop: boolean; headers: Record<string, string>; body: string; ms: number; type: string; compressed: boolean; bytes: number };

/** What a crawl remembers between its jobs, on site_audits.crawl. */
type State = {
  phase: "seed" | "fetch" | "final";
  root: string;
  settings: CrawlSettings;
  started: number;
  runs: number;
  queued: number;
  done: number;
  robotsText: string;
  site: Omit<SiteFacts, "links" | "statusOf" | "infinite">;
  variants: Record<string, number>;
  infinite: string[];
  stopped?: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A challenge page from a firewall or CDN instead of the site. */
export const isChallenge = (status: number, body: string) => (status === 403 || status === 503 || status === 429) && /just a moment|attention required|cf-chl|captcha|are you a robot|access denied|checking your browser/i.test(body.slice(0, 20_000));

/** One URL, following redirects ourselves (up to 10) so every hop is recorded. Retries hiccups twice. */
async function fetchUrl(url: string, method: "GET" | "HEAD" = "GET", ua = UA): Promise<Fetched> {
  let t0 = Date.now();
  const chain: Hop[] = [];
  let at = url;
  for (let attempt = 0; attempt < 3; attempt++) {
    // Response time is the last try's, so a retry's wait never makes a page look slow.
    t0 = Date.now();
    chain.length = 0;
    at = url;
    try {
      for (let hop = 0; hop <= 10; hop++) {
        const res = await fetch(at, { method, redirect: "manual", headers: { "User-Agent": ua, Accept: "text/html,application/xhtml+xml,*/*;q=0.8", "Accept-Encoding": "gzip, deflate, br" }, signal: AbortSignal.timeout(TIMEOUT) });
        const headers: Record<string, string> = {};
        res.headers.forEach((v, k) => (headers[k] = v));
        const loc = headers.location;
        if (res.status >= 300 && res.status < 400 && loc) {
          chain.push({ url: at, status: res.status });
          await res.body?.cancel().catch(() => undefined);
          const next = normUrl(loc, at);
          if (!next) break;
          if (chain.some((h) => h.url === next)) return { url, final: next, status: chain[0].status, chain, loop: true, headers, body: "", ms: Date.now() - t0, type: "", compressed: false, bytes: 0 };
          at = next;
          continue;
        }
        // 429 and 5xx are worth one more try after a wait.
        if ((res.status === 429 || res.status >= 500) && attempt < 2) {
          await res.body?.cancel().catch(() => undefined);
          throw new Error(`retry ${res.status}`);
        }
        const type = headers["content-type"] ?? "";
        let body = "";
        let bytes = Number(headers["content-length"]) || 0;
        if (method === "GET" && /html|xml|text\/plain/i.test(type)) {
          const buf = Buffer.from(await res.arrayBuffer());
          bytes = buf.length;
          body = buf.subarray(0, MAX_BODY).toString("utf8");
        } else await res.body?.cancel().catch(() => undefined);
        chain.push({ url: at, status: res.status });
        const first = chain[0].status;
        return { url, final: at, status: first, chain, loop: false, headers, body, ms: Date.now() - t0, type, compressed: Boolean(headers["content-encoding"]), bytes };
      }
    } catch {
      if (attempt === 2) break;
      await sleep(attempt === 0 ? 3000 : 10_000);
    }
  }
  return { url, final: at, status: 0, chain: [{ url, status: 0 }], loop: false, headers: {}, body: "", ms: Date.now() - t0, type: "", compressed: false, bytes: 0 };
}

/** Text from a URL, unzipping gzipped sitemaps. */
async function getText(url: string): Promise<{ status: number; body: string }> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(TIMEOUT) });
    const buf = Buffer.from(await res.arrayBuffer());
    const raw = buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf) : buf;
    return { status: res.status, body: raw.toString("utf8").slice(0, 60_000_000) };
  } catch {
    return { status: 0, body: "" };
  }
}

const pathQuery = (u: string) => {
  const x = new URL(u);
  return x.pathname + x.search;
};

/** Run limited work at a steady pace: at most `speed` requests started per second. */
async function paced<T>(items: T[], speed: number, fn: (x: T) => Promise<void>) {
  let next = 0;
  let last = 0;
  const gap = 1000 / speed;
  const workers = Array.from({ length: Math.min(items.length, Math.max(1, speed)) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      const wait = last + gap - Date.now();
      last = Math.max(Date.now(), last + gap);
      if (wait > 0) await sleep(wait);
      await fn(item);
    }
  });
  await Promise.all(workers);
}

async function setState(db: SupabaseClient, auditId: string, state: State, extra: Record<string, unknown> = {}) {
  await db.from("site_audits").update({ crawl: state, heartbeat_at: new Date().toISOString(), ...extra }).eq("id", auditId);
}

/** Add URLs to the queue (each once), up to the crawl's page limit. */
async function addToQueue(db: SupabaseClient, auditId: string, state: State, rows: { url: string; depth: number; source: string }[]) {
  const room = state.settings.limit - state.queued;
  if (room <= 0 || !rows.length) return;
  const uniq = [...new Map(rows.map((r) => [r.url, r])).values()].slice(0, room);
  for (let i = 0; i < uniq.length; i += 500) {
    const chunk = uniq.slice(i, i + 500).map((r) => ({ audit_id: auditId, ...r }));
    const { data } = await db.from("crawl_queue").upsert(chunk, { onConflict: "audit_id,url", ignoreDuplicates: true }).select("url");
    state.queued += data?.length ?? 0;
  }
}

/** First job: robots.txt, sitemaps, the home page and its host variants, then the queue's first URLs. */
async function seed(db: SupabaseClient, auditId: string, domain: string, state: State): Promise<string | null> {
  await setState(db, auditId, state, { step: "Reading robots.txt and sitemaps" });
  let home = await fetchUrl(`https://${domain}/`);
  if (home.status === 0) {
    // A site without https still gets crawled; http_and_https then has nothing to compare.
    home = await fetchUrl(`http://${domain}/`);
    if (home.status === 0) return "The home page didn't answer.";
  }
  if (isChallenge(home.chain[home.chain.length - 1].status, home.body)) return "Your firewall blocked our crawler. Allow ArrowsterrBot in your CDN or firewall settings and crawl again.";
  const root = normUrl(new URL(home.final).origin + "/")!;
  state.root = root;
  const host = new URL(root).hostname;
  const other = host.startsWith("www.") ? host.slice(4) : `www.${host}`;
  const [robots, llms, httpV, otherV] = await Promise.all([getText(`${new URL(root).origin}/robots.txt`), getText(`${new URL(root).origin}/llms.txt`), fetchUrl(`http://${host}/`, "HEAD"), fetchUrl(`https://${other}/`, "HEAD")]);
  state.robotsText = robots.status === 200 ? robots.body.slice(0, 200_000) : "";
  const parsed = parseRobots(state.robotsText);
  const blocked = (bot: string) => robots.status === 200 && !robotsAllows(parsed, bot, "/").allowed;

  // Sitemaps: the ones robots.txt lists, else the usual addresses; indexes are opened up to 50 child sitemaps.
  const listed = robots.status === 200 ? robotsSitemaps(robots.body) : [];
  const candidates = listed.length ? listed : [`${new URL(root).origin}/sitemap.xml`, `${new URL(root).origin}/sitemap_index.xml`];
  const sitemapUrls: string[] = [];
  const bad: string[] = [];
  const tooBig: string[] = [];
  let found = 0;
  const seen = new Set<string>();
  const want = state.settings.limit * 2;
  const todo = [...candidates];
  while (todo.length && seen.size < MAX_SITEMAPS && sitemapUrls.length < want) {
    const sm = todo.shift()!;
    if (seen.has(sm)) continue;
    seen.add(sm);
    const r = await getText(sm);
    if (r.status !== 200) {
      if (listed.includes(sm)) bad.push(sm);
      continue;
    }
    const read = parseSitemap(r.body);
    if (read.kind === "bad") {
      bad.push(sm);
      continue;
    }
    found++;
    if (read.locs.length > 50_000 || r.body.length > 50_000_000) tooBig.push(sm);
    if (read.kind === "index") todo.push(...read.locs);
    else sitemapUrls.push(...read.locs.filter((u) => isInternal(u, root, state.settings.subdomains)));
  }
  await setState(db, auditId, state, { step: `Found ${sitemapUrls.length} pages in ${found} sitemaps` });

  state.site = {
    home: root,
    robots: {
      status: robots.status,
      sitemaps: listed.length,
      blockedSearch: AI_SEARCH_BOTS.filter(blocked),
      blockedTraining: AI_TRAINING_BOTS.filter(blocked),
      disallowedSitemapUrls: robots.status === 200 ? sitemapUrls.filter((u) => !robotsAllows(parsed, "Googlebot", pathQuery(u)).allowed).slice(0, 200) : [],
    },
    sitemaps: { found, urls: sitemapUrls.length, bad, tooBig },
    hosts: {
      httpLive: httpV.status >= 200 && httpV.status < 300 && new URL(httpV.final).protocol === "http:",
      otherHostLive: otherV.status >= 200 && otherV.status < 300 && new URL(otherV.final).hostname === other,
      hsts: Boolean(home.headers["strict-transport-security"]),
    },
    llmsTxt: llms.status === 200 && llms.body.trim().length > 20 && !/<html/i.test(llms.body.slice(0, 500)),
  };
  // Sitemap pages are remembered as such; the home page goes first.
  await addToQueue(db, auditId, state, [{ url: root, depth: 0, source: "start" }]);
  const allowed = sitemapUrls.filter((u) => allowedUrl(u, state, parsed));
  await addToQueue(db, auditId, state, allowed.map((url) => ({ url, depth: 50, source: "sitemap" })));
  if (sitemapUrls.length) {
    // Pages listed in a sitemap but over the limit still mark in_sitemap when they turn up through links.
    await db.from("crawl_queue").upsert(sitemapUrls.slice(0, 20_000).filter((u) => !allowed.includes(u)).map((url) => ({ audit_id: auditId, url, depth: 99, source: "sitemap", state: "skipped" })), { onConflict: "audit_id,url", ignoreDuplicates: true });
  }
  state.phase = "fetch";
  return null;
}

function allowedUrl(url: string, state: State, robots: ParsedRobots): boolean {
  if (!isInternal(url, state.root, state.settings.subdomains)) return false;
  if (NOT_A_PAGE.test(new URL(url).pathname)) return false;
  if (!passesRules(url, state.settings)) return false;
  return robotsAllows(robots, BOT, pathQuery(url)).allowed;
}

/** Fetch queued pages until the job's time is up. Returns true when the queue is empty. */
async function fetchLoop(db: SupabaseClient, auditId: string, workspaceId: string, state: State, until: number): Promise<boolean> {
  const robots = parseRobots(state.robotsText);
  while (Date.now() < until) {
    const { data: batch } = await db.from("crawl_queue").select("url, depth, source").eq("audit_id", auditId).eq("state", "queued").order("depth").order("url").limit(state.settings.speed * 6);
    if (!batch?.length) return true;
    await db.from("crawl_queue").update({ state: "done" }).eq("audit_id", auditId).in("url", batch.map((b) => b.url));
    const rows: Record<string, unknown>[] = [];
    const found: { url: string; depth: number; source: string }[] = [];
    await paced(batch, state.settings.speed, async (q) => {
      const r = await fetchUrl(q.url);
      const end = r.chain[r.chain.length - 1];
      const isHtml = /html/i.test(r.type) && end.status >= 200 && end.status < 300;
      // A redirect inside the site is followed as its own page, so the target is crawled and checked too.
      if (r.chain.length > 1 && !r.loop && isInternal(r.final, state.root, state.settings.subdomains) && allowedUrl(r.final, state, robots)) found.push({ url: r.final, depth: q.depth, source: "redirect" });
      let facts: PageFacts | null = null;
      if (isHtml && r.chain.length === 1) {
        facts = readPage(r.final, r.body, r.headers, { root: state.root, subdomains: state.settings.subdomains, dropQuery: state.settings.dropQuery });
        const refresh = refreshTarget(facts.metaRefresh, r.final);
        if (refresh && isInternal(refresh, state.root)) found.push({ url: refresh, depth: q.depth + 1, source: "link" });
        if (!facts.nofollowPage) {
          for (const l of facts.internal) {
            if (!allowedUrl(l.url, state, robots)) continue;
            if (l.url.includes("?")) {
              // Endless parameter combinations on one path stop being followed after 50.
              const p = pathOnly(l.url);
              const n = (state.variants[p] = (state.variants[p] ?? 0) + 1);
              if (n > MAX_VARIANTS) {
                if (!state.infinite.includes(p) && state.infinite.length < 100) state.infinite.push(p);
                continue;
              }
            }
            // Depth 50 and over means "found in a sitemap, depth not known yet": its links are followed too.
            // Known chains stop at 30 clicks, so endless /a/b/c paths can't run away.
            if (q.depth >= 50) found.push({ url: l.url, depth: 50, source: "link" });
            else if (q.depth < 30) found.push({ url: l.url, depth: q.depth + 1, source: "link" });
          }
        }
      }
      const { internal, external, ...light } = facts ?? ({} as PageFacts);
      rows.push({
        audit_id: auditId,
        workspace_id: workspaceId,
        url: q.url,
        status: r.status,
        words: facts?.words ?? 0,
        ms: Math.min(r.ms, 600_000),
        in_sitemap: q.source === "sitemap",
        title: facts?.title?.slice(0, 300) ?? null,
        facts: {
          final: r.final,
          chain: r.chain,
          loop: r.loop,
          bytes: r.bytes,
          compressed: r.compressed,
          type: r.type.slice(0, 80),
          ...(facts ? { page: light, links: (internal as Link[]).slice(0, 250).map((l) => ({ u: l.url, a: l.anchor, n: l.nofollow ? 1 : 0 })), ext: (external as Link[]).slice(0, 60).map((l) => l.url) } : {}),
        },
      });
    });
    if (rows.length) {
      const { error } = await db.from("crawl_pages").upsert(rows, { onConflict: "audit_id,url" });
      if (error) throw new Error(`Saving pages: ${error.message}`);
    }
    // Links found to pages that are also in a sitemap keep their sitemap mark, via the unique queue row.
    await addToQueue(db, auditId, state, found);
    state.done += rows.length;
    await setState(db, auditId, state, { step: `Reading pages: ${state.done} of ${Math.max(state.done, state.queued)}`, pages: state.done });
    if (Date.now() - state.started > MAX_RUN_MS) {
      state.stopped = `The crawl stopped at the 3-hour limit after ${state.done} pages.`;
      return true;
    }
  }
  return false;
}

type Row = { url: string; status: number; depth: number | null; ms: number; in_sitemap: boolean; facts: { final?: string; chain?: Hop[]; loop?: boolean; bytes?: number; compressed?: boolean; page?: Omit<PageFacts, "internal" | "external">; links?: { u: string }[]; ext?: string[] } };

/** Every saved page of a crawl, 1,000 at a time. */
async function* pagesOf(db: SupabaseClient, auditId: string, columns: string) {
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("crawl_pages").select(columns).eq("audit_id", auditId).order("url").range(from, from + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) return;
    yield data as unknown as Row[];
    if (data.length < 1000) return;
  }
}

/** Last job: count links, check outbound links, run the checks, write each page's issues and save the summary. */
async function finish(db: SupabaseClient, auditId: string, workspaceId: string, state: State) {
  await setState(db, auditId, state, { step: "Counting links and running checks" });
  const tally = new LinkTally();
  const pages: CheckPage[] = [];
  const statusOf: Record<string, number> = {};
  const sitemapMarks = new Set<string>();
  const { data: marked } = await db.from("crawl_queue").select("url").eq("audit_id", auditId).eq("source", "sitemap").limit(50_000);
  for (const m of marked ?? []) sitemapMarks.add(m.url);
  const ext = new Map<string, string>();

  for await (const chunk of pagesOf(db, auditId, "url, status, ms, in_sitemap, facts->final, facts->chain, facts->loop, facts->bytes, facts->compressed, facts->page")) {
    for (const r of chunk as unknown as (Row & Row["facts"])[]) {
      const chain = r.chain ?? [{ url: r.url, status: r.status }];
      const end = chain[chain.length - 1]?.status ?? r.status;
      statusOf[r.url] = r.status;
      if (r.final && r.final !== r.url) statusOf[r.final] ??= end;
      tally.page(r.url, r.status);
      pages.push({ url: r.url, final: r.final ?? r.url, status: r.status, hops: Math.max(0, chain.length - 1), loop: Boolean(r.loop), chainEnd: end, ms: r.ms, bytes: r.bytes ?? 0, compressed: Boolean(r.compressed), depth: null, inSitemap: r.in_sitemap || sitemapMarks.has(r.url), linksIn: 0, facts: r.page ?? null });
    }
  }
  for await (const chunk of pagesOf(db, auditId, "url, facts->links, facts->ext")) {
    for (const r of chunk as unknown as { url: string; links?: { u: string }[]; ext?: string[] }[]) {
      tally.links(r.url, (r.links ?? []).map((l) => l.u));
      for (const e of r.ext ?? []) if (!ext.has(e) && ext.size < 3000) ext.set(e, r.url);
    }
  }
  const depth = tally.depth([state.root]);
  for (const p of pages) {
    p.linksIn = tally.inOf(p.url);
    p.depth = depth.get(p.url) ?? null;
  }

  // Outbound links: a sample, checked with HEAD (GET when HEAD isn't allowed), each tried three times.
  await setState(db, auditId, state, { step: "Checking links to other sites" });
  const external: { from: string; to: string; status: number }[] = [];
  await paced([...ext.keys()].slice(0, EXTERNAL_CHECKS), 10, async (u) => {
    let r = await fetchUrl(u, "HEAD");
    if (r.status === 405 || r.status === 403 || r.status === 0) r = await fetchUrl(u, "GET");
    const end = r.chain[r.chain.length - 1]?.status ?? r.status;
    // 401, 403 and 429 mean the other site refuses bots, which isn't a broken link.
    if (end === 404 || end === 410 || end >= 500) external.push({ from: ext.get(u)!, to: u, status: end });
  });

  const site: SiteFacts = { ...state.site, infinite: state.infinite, statusOf, links: { broken: tally.broken, brokenCount: tally.brokenCount, external, externalCount: external.length, toRedirect: tally.toRedirect, toRedirectCount: tally.toRedirectCount } };
  const s = summarize(pages, site);

  // Each page's links in, depth, template, indexability and issues, for the Pages table.
  await setState(db, auditId, state, { step: "Saving results" });
  const updates = pages.map((p) => {
    const reason = !(p.status >= 200 && p.status < 300) ? (p.status === 0 ? "No answer" : p.status < 400 ? "Redirect" : `Error ${p.status}`) : !p.facts ? "Not HTML" : p.facts.noindex ? "noindex" : p.facts.canonical && p.facts.canonical !== p.final && p.facts.canonical !== p.url ? "Canonical elsewhere" : null;
    return { audit_id: auditId, workspace_id: workspaceId, url: p.url, links_in: p.linksIn, depth: p.depth, template: s.template.get(p.url) ?? "/", indexable: !reason, reason, in_sitemap: p.inSitemap, issues: s.perPage.get(p.url) ?? [] };
  });
  for (let i = 0; i < updates.length; i += 500) {
    const { error } = await db.from("crawl_pages").upsert(updates.slice(i, i + 500), { onConflict: "audit_id,url" });
    if (error) throw new Error(`Saving pages: ${error.message}`);
  }

  const partial = state.stopped ?? partialReason(pages.map((p) => ({ url: p.url, status: p.status })), state.root) ?? (state.site.robots.status >= 500 ? "robots.txt returned a server error, so search engines would stop crawling." : null);
  const issues: Issue[] = s.issues.map(({ all, ...i }) => (void all, i));
  const result: CrawlResult = {
    version: 2,
    pages: [],
    issues,
    found: state.queued,
    sitemap: state.site.sitemaps.found ? `${state.site.sitemaps.found} sitemaps, ${state.site.sitemaps.urls} URLs` : null,
    blockedBots: state.site.robots.blockedSearch,
    llmsTxt: state.site.llmsTxt,
    brokenLinks: tally.broken.slice(0, 200).map((b) => ({ url: b.to, status: b.status, from: b.from })),
    areas: s.areas,
    stats: s.stats,
    settings: state.settings,
    root: state.root,
    ...(partial ? { partial } : {}),
  };
  const { error } = await db
    .from("site_audits")
    .update({ status: "done", step: "Done", pages: pages.length, score: scoreToSave(s.score, partial), result, error: null, finished_at: new Date().toISOString(), heartbeat_at: new Date().toISOString(), crawl: { ...state, phase: "final", robotsText: "", variants: {} } })
    .eq("id", auditId);
  if (error) throw new Error(error.message);
  await db.from("crawl_queue").delete().eq("audit_id", auditId);
}

/** What a finished v2 crawl saves on site_audits.result. */
export type CrawlResult = {
  version: 2;
  pages: never[];
  issues: Issue[];
  found: number;
  sitemap: string | null;
  blockedBots: string[];
  llmsTxt: boolean;
  brokenLinks: { url: string; status: number; from: string }[];
  areas: Record<string, number>;
  stats: Stats;
  settings: CrawlSettings;
  root: string;
  partial?: string;
};

/**
 * One job's share of a crawl. Returns "done" when the crawl finished (or failed), "more" when another job should
 * carry on. Errors are saved on the audit; pages already read are kept and scored as a partial crawl.
 */
export async function crawlStep(db: SupabaseClient, auditId: string, budgetMs = BUDGET_MS): Promise<"done" | "more"> {
  const until = Date.now() + budgetMs;
  const { data: audit } = await db.from("site_audits").select("id, workspace_id, domain, status, crawl, settings").eq("id", auditId).maybeSingle();
  if (!audit || audit.status !== "running") return "done";
  let state = audit.crawl as State | null;
  try {
    if (!state?.phase) {
      const plan = (await entitlement(audit.workspace_id)).plan;
      state = { phase: "seed", root: `https://${audit.domain}/`, settings: cleanSettings(audit.settings, String(plan)), started: Date.now(), runs: 0, queued: 0, done: 0, robotsText: "", site: null as unknown as State["site"], variants: {}, infinite: [] };
    }
    state.runs++;
    if (state.phase === "seed") {
      const stop = await seed(db, auditId, audit.domain, state);
      if (stop) {
        await db.from("site_audits").update({ status: "failed", error: stop, step: "Stopped", finished_at: new Date().toISOString() }).eq("id", auditId);
        return "done";
      }
      await setState(db, auditId, state);
    }
    if (state.phase === "fetch") {
      const empty = await fetchLoop(db, auditId, audit.workspace_id, state, until);
      if (!empty) {
        await setState(db, auditId, state);
        return "more";
      }
      state.phase = "final";
      await setState(db, auditId, state);
      // Counting and checking need time of their own: start them in a fresh job when this one is nearly out.
      if (Date.now() > until - Math.min(60_000, budgetMs / 3)) return "more";
    }
    await finish(db, auditId, audit.workspace_id, state);
    return "done";
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`Crawl ${auditId} failed:`, msg);
    const { count } = await db.from("crawl_pages").select("url", { count: "exact", head: true }).eq("audit_id", auditId);
    if (count && state && state.phase !== "final") {
      // Keep what was read: count it as a partial crawl.
      state.stopped = `The crawl stopped after ${count} pages: ${msg}`;
      state.phase = "final";
      await setState(db, auditId, state);
      return "more";
    }
    await db.from("site_audits").update({ status: "failed", error: msg, finished_at: new Date().toISOString() }).eq("id", auditId);
    return "done";
  }
}

/** Keep the pages of a brand's two newest finished crawls; older crawls keep only their summary. */
export async function pruneCrawlPages(db: SupabaseClient, brandId: string) {
  const { data } = await db.from("site_audits").select("id").eq("brand_id", brandId).eq("status", "done").order("created_at", { ascending: false }).range(2, 40);
  const old = (data ?? []).map((r) => r.id as string);
  if (old.length) await db.from("crawl_pages").delete().in("audit_id", old);
}
