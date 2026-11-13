import "server-only";
import { gunzipSync } from "node:zlib";
import type { SupabaseClient } from "@supabase/supabase-js";
import { entitlement } from "../entitlements";
import { enqueue, finish, retry, type Job } from "../jobs";
import { startMinute } from "../rankTrackServer";
import { parseRobots, robotsAllows, robotsStatus, type ParsedRobots } from "../robotsTest";
import { safeFetch } from "../safeFetch";
import {
  crawlDelay,
  crawlRate,
  indexable,
  isChallenge,
  isInternal,
  MAX_QUERY_VARIANTS,
  normUrl,
  partialReason,
  readPage,
  readSettings,
  RETRY_WAITS,
  retryable,
  siteHost,
  skipReason,
  TIME_CAP_MS,
  urlHash,
  type CrawlSettings,
} from "./crawl";
import { buildGraph, compareCrawls, crawlStats, type GraphPage } from "./graph";

// Audit's link crawler on the server (docs/audit-plan.md, section 4.5). One `audit` job per crawl, run in short
// turns: each turn does at most 85 seconds of work, saves it, and puts the job back to run again a second later.
// A killed turn loses at most the batch it was reading, and the next turn reads those pages again.
//   seed:  robots.txt, sitemaps and the home page go in the queue.
//   fetch: read queued pages in depth order, save their facts and links, queue the new internal addresses.
//   graph: depth, links in, link score, orphans, page value and the numbers, then the crawl is done.

export const BOT_UA = "Mozilla/5.0 (compatible; ArrowsterrBot/3.0; +https://arrowsterr.com/bot)";
const BOT = "ArrowsterrBot";
const TURN_MS = 85_000;
const BATCH = 40;
const QUIET_MS = 20 * 60_000; // a crawl with no heartbeat for this long is resumed
const MAX_RESUMES = 3;
const MAX_SITEMAPS = 50;

type Runtime = { robots?: string; robotsStatus?: number; delay?: number | null; halvings?: number; q?: Record<string, number>; stalled?: boolean };
type Audit = {
  id: string;
  workspace_id: string;
  brand_id: string;
  root: string;
  settings: CrawlSettings;
  status: string;
  stage: "seed" | "fetch" | "graph" | "done";
  runtime: Runtime;
  started_at: string | null;
  resumes: number;
  pages_found: number;
  pages_done: number;
  over_limit: number;
};
type QueueRow = { url_hash: string; url: string; depth: number; found_from: string; state: string; tries: number; in_sitemap: boolean; lastmod: string | null };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const host = (a: Audit) => siteHost(a.settings.start || a.root);

// ─────────────── starting a crawl ───────────────

/** Start a crawl for a brand, or hand back the one already running. */
export async function startAudit(db: SupabaseClient, opts: { workspaceId: string; brandId: string; trigger: "manual" | "weekly"; userId?: string | null }): Promise<{ id: string; running: boolean }> {
  const { data: running } = await db.from("audits").select("id").eq("brand_id", opts.brandId).in("status", ["queued", "running"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (running) return { id: running.id as string, running: true };
  const { data: brand, error: be } = await db.from("brands").select("id, workspace_id, url, domain, audit_settings").eq("id", opts.brandId).eq("workspace_id", opts.workspaceId).maybeSingle();
  if (be || !brand) throw new Error(be?.message ?? "Brand not found.");
  const e = await entitlement(opts.workspaceId);
  const fallback = normUrl(String(brand.url || `https://${brand.domain}/`)) ?? `https://${brand.domain}/`;
  const settings = readSettings(brand.audit_settings as Record<string, unknown>, fallback, e.limits.auditPages);
  const { data: previous } = await db.from("audits").select("id").eq("brand_id", brand.id).eq("status", "done").order("created_at", { ascending: false }).limit(1).maybeSingle();
  const { data: audit, error } = await db
    .from("audits")
    .insert({ workspace_id: opts.workspaceId, brand_id: brand.id, root: settings.start, settings, trigger: opts.trigger, started_by: opts.userId ?? null, previous_id: previous?.id ?? null, heartbeat_at: new Date().toISOString() })
    .select("id")
    .single();
  if (error || !audit) throw new Error(error?.message ?? "Could not start the crawl.");
  await enqueue("audit", { auditId: audit.id }, { workspaceId: opts.workspaceId, key: `audit:${audit.id}` });
  return { id: audit.id as string, running: false };
}

/**
 * Called by the scheduler every 10 minutes: resume crawls that went quiet, and start each brand's scheduled crawl
 * once its plan's days have passed since the last one. Brands start scheduled crawls only after their first crawl.
 */
export async function queueAudits(db: SupabaseClient) {
  const quiet = new Date(Date.now() - QUIET_MS).toISOString();
  const { data: stuck, error } = await db.from("audits").select("id, workspace_id, resumes, runtime").in("status", ["queued", "running"]).lt("heartbeat_at", quiet).limit(50);
  if (error) return; // before the migration
  for (const a of stuck ?? []) {
    const resumes = (a.resumes as number) + 1;
    // After 3 resumes the crawl keeps what it read: it skips to the graph and is marked partial.
    const patch = resumes > MAX_RESUMES ? { resumes, stage: "graph", runtime: { ...(a.runtime as Runtime), stalled: true }, heartbeat_at: new Date().toISOString() } : { resumes, heartbeat_at: new Date().toISOString() };
    await db.from("audits").update(patch).eq("id", a.id);
    await enqueue("audit", { auditId: a.id }, { workspaceId: a.workspace_id as string, key: `audit:${a.id}:resume:${resumes}` });
  }

  const now = new Date();
  const minute = now.getUTCHours() * 60 + now.getUTCMinutes();
  // The latest crawl of every brand crawled in the last 120 days, newest first, in one read.
  const { data: recent } = await db.from("audits").select("brand_id, workspace_id, status, finished_at, created_at").gte("created_at", new Date(Date.now() - 120 * 864e5).toISOString()).order("created_at", { ascending: false }).limit(20_000);
  const latest = new Map<string, NonNullable<typeof recent>[number]>();
  for (const a of recent ?? []) if (!latest.has(a.brand_id as string)) latest.set(a.brand_id as string, a);
  if (!latest.size) return;
  const { data: on } = await db.from("brands").select("id").eq("audit_weekly", true).in("id", [...latest.keys()].slice(0, 1000));
  for (const b of on ?? []) {
    const last = latest.get(b.id as string)!;
    if (minute < startMinute(b.id as string)) continue;
    if (last.status === "queued" || last.status === "running") continue;
    const e = await entitlement(last.workspace_id as string);
    if (e.readOnly || !e.open.seo) continue;
    const since = new Date((last.finished_at ?? last.created_at) as string).getTime();
    if (Date.now() - since < e.limits.auditEveryDays * 864e5 - 3600_000) continue;
    await startAudit(db, { workspaceId: last.workspace_id as string, brandId: b.id as string, trigger: "weekly" }).catch((err) => console.error("Scheduled crawl failed to start:", err instanceof Error ? err.message : err));
  }
}

// ─────────────── the job ───────────────

/** What a turn asks of its job: end it, or run again in this many seconds (a wait, which uses up no attempt). */
export type TurnOutcome = { done: true } | { done: false; wait: number; note: string };

export async function auditJob(db: SupabaseClient, job: Job) {
  const auditId = (job.payload as { auditId?: string }).auditId;
  // A Site Audit job from before Technical SEO was removed has no auditId.
  const out = auditId ? await runTurn(db, auditId, Date.now() + TURN_MS) : ({ done: true } as const);
  if (out.done) return finish(job.id);
  await retry(job.id, out.note, out.wait, { count: false });
}

/** One turn of a crawl, at most until `until`. Holds the crawl's lease, so two jobs never run the same crawl at once. */
export async function runTurn(db: SupabaseClient, auditId: string, until: number): Promise<TurnOutcome> {
  const { data } = await db.from("audits").select("*").eq("id", auditId).maybeSingle();
  const audit = data as Audit | null;
  if (!audit || !["queued", "running"].includes(audit.status)) return { done: true };
  // A second job for the same crawl (a resume racing an old job) leaves it to the first.
  const { data: held } = await db
    .from("audits")
    .update({ lease_until: new Date(until + 30_000).toISOString() })
    .eq("id", audit.id)
    .or(`lease_until.is.null,lease_until.lt.${new Date().toISOString()}`)
    .select("id");
  if (!held?.length) return { done: true };
  try {
    return await turn(db, audit, until);
  } finally {
    await db.from("audits").update({ lease_until: null }).eq("id", audit.id);
  }
}

async function turn(db: SupabaseClient, audit: Audit, until: number): Promise<TurnOutcome> {
  if (audit.status === "queued") {
    audit.status = "running";
    audit.started_at = new Date().toISOString();
    await db.from("audits").update({ status: "running", started_at: audit.started_at, heartbeat_at: audit.started_at }).eq("id", audit.id);
  }
  // A turn that starts at the graph always runs it; one that reaches it after reading pages needs 10 seconds left.
  const startedAtGraph = audit.stage === "graph";
  if (audit.stage === "seed" && (await seed(db, audit))) return { done: true };
  if (audit.stage === "fetch") {
    const next = await fetchTurn(db, audit, until);
    if (next === "stop") return { done: true };
    if (typeof next === "number") return { done: false, wait: next, note: "Waiting to try pages again" };
    if (next === "more") return { done: false, wait: 1, note: "Crawling" };
  }
  if (audit.stage === "graph") {
    if (!startedAtGraph && Date.now() > until - 10_000) return { done: false, wait: 1, note: "Working out the links" };
    await graphStep(db, audit);
  }
  return { done: true };
}

async function save(db: SupabaseClient, audit: Audit, patch: Partial<Audit> & Record<string, unknown>) {
  Object.assign(audit, patch);
  const { error } = await db.from("audits").update({ ...patch, heartbeat_at: new Date().toISOString() }).eq("id", audit.id);
  if (error) throw new Error(error.message);
}

async function failAudit(db: SupabaseClient, audit: Audit, reason: string, error?: string) {
  await save(db, audit, { status: "failed", stage: "done", partial_reason: reason, error: error ?? null, finished_at: new Date().toISOString() });
}

// ─────────────── seed ───────────────

/** robots.txt, the sitemaps and the home page. Returns true when the crawl can't go on. */
async function seed(db: SupabaseClient, audit: Audit): Promise<boolean> {
  const start = audit.settings.start || audit.root;
  const origin = new URL(start).origin;
  const robots = await safeFetch(`${origin}/robots.txt`, { ua: BOT_UA, timeout: 15_000, maxBytes: 600_000, accept: "text/plain,*/*" });
  if (robots.status >= 500 && robotsStatus(robots.status) === "block-all") {
    await save(db, audit, { status: "partial", stage: "done", partial_reason: "robots", finished_at: new Date().toISOString() });
    return true;
  }
  const text = robots.status >= 200 && robots.status < 300 ? robots.body.slice(0, 500 * 1024) : "";
  const runtime: Runtime = { robots: text, robotsStatus: robots.status, delay: crawlDelay(text), halvings: 0, q: {} };

  // Sitemaps named in robots.txt, else the usual addresses. Indexes are followed down to their pages.
  const listed = [...text.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]);
  const guesses = ["/sitemap.xml", "/sitemap_index.xml", "/wp-sitemap.xml", "/sitemap-index.xml"].map((g) => origin + g);
  const entries = await readSitemaps(listed.length ? listed : guesses, audit.settings.limit * 2);

  const h = host(audit);
  const rows: QueueRow[] = [];
  const seen = new Set<string>();
  const add = (url: string, depth: number, from: string, lastmod: string | null, inSitemap: boolean) => {
    const n = normUrl(url);
    if (!n || !isInternal(n, h, audit.settings.subdomains)) return;
    const hash = urlHash(n);
    if (seen.has(hash)) return;
    if (skipReason(n, audit.settings, depth)) return;
    seen.add(hash);
    rows.push({ url_hash: hash, url: n, depth, found_from: from, state: "queued", tries: 0, in_sitemap: inSitemap, lastmod });
  };
  add(start, 0, "home", null, false);
  for (const e of entries) add(e.url, 3, "sitemap", e.lastmod, true);
  // Pages AI answers cite are pages the site has, even with no link to them.
  for (const url of await citedUrls(db, audit.brand_id, h)) add(url, 3, "ai", null, false);
  // A home page that's also in the sitemap keeps both facts.
  const home = rows[0];
  if (home) {
    const inMap = entries.find((e) => normUrl(e.url) === home.url);
    if (inMap) Object.assign(home, { in_sitemap: true, lastmod: inMap.lastmod });
  }
  const capped = rows.slice(0, audit.settings.limit);
  for (let i = 0; i < capped.length; i += 1000) {
    const { error } = await db.from("audit_urls").upsert(capped.slice(i, i + 1000).map((r) => ({ audit_id: audit.id, ...r })), { onConflict: "audit_id,url_hash", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
  await save(db, audit, { stage: "fetch", runtime, pages_found: capped.length, over_limit: rows.length - capped.length });
  return false;
}

type SitemapEntry = { url: string; lastmod: string | null };

/** Every page in these sitemaps, following sitemap indexes two levels down. Gzipped sitemaps are read too. */
async function readSitemaps(urls: string[], max: number): Promise<SitemapEntry[]> {
  const out: SitemapEntry[] = [];
  const todo = [...urls.map((u) => ({ url: u, level: 0 }))];
  let read = 0;
  while (todo.length && read < MAX_SITEMAPS && out.length < max) {
    const { url, level } = todo.shift()!;
    read++;
    const res = await safeFetch(url, { ua: BOT_UA, timeout: 20_000, maxBytes: 30_000_000, raw: true, accept: "application/xml,text/xml,*/*" });
    if (!res.ok || !res.bytes) continue;
    let xml: string;
    try {
      xml = (res.bytes[0] === 0x1f && res.bytes[1] === 0x8b ? gunzipSync(res.bytes) : res.bytes).toString("utf8");
    } catch {
      continue;
    }
    const blocks = [...xml.matchAll(/<(url|sitemap)>([\s\S]*?)<\/\1>/gi)];
    for (const b of blocks) {
      const loc = b[2].match(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?\s*<\/loc>/i)?.[1]?.replace(/&amp;/g, "&");
      if (!loc) continue;
      const mod = b[2].match(/<lastmod>\s*([^<]+?)\s*<\/lastmod>/i)?.[1];
      const lastmod = mod && !Number.isNaN(Date.parse(mod)) ? new Date(mod).toISOString() : null;
      if (b[1].toLowerCase() === "sitemap") {
        if (level < 2) todo.push({ url: loc, level: level + 1 });
      } else out.push({ url: loc, lastmod });
      if (out.length >= max) break;
    }
  }
  return out;
}

/** The site's own pages that the brand's tracked AI answers cited in the last 30 days, with how often. */
async function citations(db: SupabaseClient, brandId: string, siteHostName: string): Promise<Map<string, number>> {
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const { data } = await db.from("runs").select("chats").eq("brand_id", brandId).gte("at", since).limit(2000);
  const count = new Map<string, number>();
  for (const r of data ?? [])
    for (const c of (r.chats as { sources?: { url?: string }[] }[]) ?? [])
      for (const s of c.sources ?? []) {
        const n = s.url ? normUrl(s.url) : null;
        if (n && isInternal(n, siteHostName, true)) count.set(n, (count.get(n) ?? 0) + 1);
      }
  return count;
}
async function citedUrls(db: SupabaseClient, brandId: string, siteHostName: string) {
  return [...(await citations(db, brandId, siteHostName)).keys()].slice(0, 500);
}

// ─────────────── fetch ───────────────

type Fetched = {
  row: QueueRow;
  state: "done" | "error" | "skipped" | "retry";
  skip?: string;
  retryIn?: number;
  pages: Record<string, unknown>[];
  links: Record<string, unknown>[];
  linkedFrom: string[]; // hashes whose links were replaced
  found: QueueRow[];
  challenge?: boolean;
  throttled?: boolean;
};

/**
 * One turn of reading pages. Returns "more" to run again now, a number of seconds to wait for pages due a retry,
 * "stop" when the crawl ended here, or "graph" when every page is read.
 */
async function fetchTurn(db: SupabaseClient, audit: Audit, until: number): Promise<"more" | "graph" | "stop" | number> {
  const runtime = audit.runtime ?? {};
  const robots = parseRobots(runtime.robots ?? "");
  const startedAt = new Date(audit.started_at ?? Date.now()).getTime();
  while (Date.now() < until) {
    if (Date.now() - startedAt > TIME_CAP_MS) {
      await save(db, audit, { stage: "graph" });
      return "graph";
    }
    const now = new Date().toISOString();
    const { data: rows, error } = await db
      .from("audit_urls")
      .select("url_hash, url, depth, found_from, state, tries, in_sitemap, lastmod")
      .eq("audit_id", audit.id)
      .eq("state", "queued")
      .or(`retry_at.is.null,retry_at.lte.${now}`)
      .order("depth")
      .order("id")
      .limit(BATCH);
    if (error) throw new Error(error.message);
    if (!rows?.length) {
      const { data: later } = await db.from("audit_urls").select("retry_at").eq("audit_id", audit.id).eq("state", "queued").order("retry_at").limit(1).maybeSingle();
      if (later?.retry_at) return Math.max(1, Math.ceil((new Date(later.retry_at as string).getTime() - Date.now()) / 1000));
      await save(db, audit, { stage: "graph" });
      return "graph";
    }
    const rps = crawlRate(audit.settings.speed, runtime.delay ?? null, runtime.halvings ?? 0);
    const results = await readBatch(rows as QueueRow[], audit, robots, rps);
    if (results.some((r) => r.challenge)) {
      await failAudit(db, audit, "firewall");
      return "stop";
    }
    if (results.some((r) => r.throttled)) runtime.halvings = (runtime.halvings ?? 0) + 1;
    await saveBatch(db, audit, results, runtime);
  }
  return "more";
}

/** Read a batch at the crawl's speed: a new request starts at most every 1/rps seconds, 4 at a time at most. */
async function readBatch(rows: QueueRow[], audit: Audit, robots: ParsedRobots, rps: number): Promise<Fetched[]> {
  const gap = 1000 / rps;
  let nextStart = Date.now();
  const out: Fetched[] = new Array(rows.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, Math.max(1, Math.ceil(rps))) }, async () => {
      while (i < rows.length) {
        const k = i++;
        const wait = nextStart - Date.now();
        nextStart = Math.max(nextStart, Date.now()) + gap;
        if (wait > 0) await sleep(wait);
        out[k] = await readOne(rows[k], audit, robots);
      }
    }),
  );
  return out;
}

async function readOne(row: QueueRow, audit: Audit, robots: ParsedRobots): Promise<Fetched> {
  const base: Fetched = { row, state: "done", pages: [], links: [], linkedFrom: [], found: [] };
  const u = new URL(row.url);
  if (audit.runtime.robotsStatus && audit.runtime.robotsStatus >= 200 && audit.runtime.robotsStatus < 300 && !robotsAllows(robots, BOT, u.pathname + u.search).allowed) return { ...base, state: "skipped", skip: "robots" };
  const res = await safeFetch(row.url, { ua: BOT_UA, hops: 10, timeout: 20_000, maxBytes: 5_000_000 });
  const firstStatus = res.chain[0]?.status ?? res.status;
  if (row.found_from === "home" && isChallenge(res.status, res.body, res.status ? res.headers : null)) return { ...base, challenge: true };
  if (retryable(res.status) && row.tries < RETRY_WAITS.length) return { ...base, state: "retry", retryIn: RETRY_WAITS[row.tries], throttled: res.status === 429 };

  const page = (url: string, hash: string, status: number, extra: Record<string, unknown>) => ({
    audit_id: audit.id,
    workspace_id: audit.workspace_id,
    url_hash: hash,
    url,
    status,
    found_from: row.found_from,
    in_sitemap: row.in_sitemap,
    sitemap_lastmod: row.lastmod,
    ms: res.ms,
    fetched_at: new Date().toISOString(),
    ...extra,
  });
  const h = host(audit);
  const finalUrl = normUrl(res.url) ?? res.url;

  // A redirect that never lands (a loop, or more than 10 hops): saved with its hops and no landing page.
  if (res.status >= 300 && res.status < 400) {
    const seen = new Set(res.chain.map((c) => c.url));
    const loop = seen.size < res.chain.length || seen.has(res.url);
    base.pages.push(page(row.url, row.url_hash, firstStatus, { final_url: null, redirect_chain: [...res.chain, { url: res.url, status: res.status }], content_type: null, error: loop ? "Redirect loop" : "Too many redirects" }));
    return base;
  }
  // A redirect: the address keeps its hops, and the page it lands on is saved under its own address.
  if (res.chain.length) {
    base.pages.push(page(row.url, row.url_hash, firstStatus, { final_url: finalUrl, redirect_chain: [...res.chain, { url: res.url, status: res.status }], content_type: null, error: res.error ?? null }));
    if (!isInternal(finalUrl, h, audit.settings.subdomains) || res.status === 0) return base;
    const finalRow: QueueRow = { url_hash: urlHash(finalUrl), url: finalUrl, depth: row.depth, found_from: "redirect", state: "done", tries: 0, in_sitemap: false, lastmod: null };
    base.found.push(finalRow);
    return withBody(base, finalRow, res, audit, (extra) => ({ ...page(finalUrl, finalRow.url_hash, res.status, extra), found_from: "redirect", in_sitemap: false, sitemap_lastmod: null }));
  }
  return withBody(base, row, res, audit, (extra) => page(row.url, row.url_hash, res.status, extra));
}

/** Save the page that answered, and when it's a web page, its facts and links. */
function withBody(base: Fetched, row: QueueRow, res: Awaited<ReturnType<typeof safeFetch>>, audit: Audit, page: (extra: Record<string, unknown>) => Record<string, unknown>): Fetched {
  const type = res.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? null;
  const isHtml = res.status > 0 && (!type || type.includes("html"));
  if (!isHtml || res.status < 200 || res.status >= 300) {
    base.pages.push(page({ content_type: type, error: res.error ?? null }));
    if (res.status === 0) base.state = "error";
    return base;
  }
  const h = host(audit);
  const read = readPage(res.body, row.url, h, audit.settings.subdomains);
  const targets = new Map<string, string>(); // hash → url, once per target
  const body = new Set<string>();
  for (const l of read.links) {
    const hash = urlHash(l.url);
    targets.set(hash, l.url);
    if (l.place === "body") body.add(hash);
    base.links.push({ audit_id: audit.id, from_hash: row.url_hash, to_hash: hash, to_url: l.url, anchor: l.anchor, rel: l.rel, place: l.place });
  }
  base.linkedFrom.push(row.url_hash);
  for (const [hash, url] of targets) base.found.push({ url_hash: hash, url, depth: row.depth + 1, found_from: "link", state: "queued", tries: 0, in_sitemap: false, lastmod: null });
  base.pages.push(
    page({
      content_type: type,
      title: read.title,
      h1: read.h1,
      h2: read.h2,
      canonical: read.canonical,
      meta_robots: read.metaRobots,
      indexable: indexable(res.status, read, row.url, res.headers.get("x-robots-tag")),
      words: read.words,
      published_at: read.published ? `${read.published}T00:00:00Z` : null,
      modified_at: read.modified ? `${read.modified}T00:00:00Z` : null,
      links_to: [...targets.keys()],
      body_links_to: [...body],
      links_out: targets.size,
      ext_links: read.extLinks,
    }),
  );
  return base;
}

/** Write one batch: pages, their links, new addresses for the queue, and each address's new state. */
async function saveBatch(db: SupabaseClient, audit: Audit, results: Fetched[], runtime: Runtime) {
  const pages = results.flatMap((r) => r.pages);
  if (pages.length) {
    // Rows in one upsert need the same columns: fill what a short row (a redirect, a PDF) leaves out.
    const cols = [...new Set(pages.flatMap((p) => Object.keys(p)))];
    const DEFAULTS: Record<string, unknown> = { h1: [], h2: [], links_to: [], body_links_to: [], links_out: 0, ext_links: 0, words: 0, indexable: false };
    const full = pages.map((p) => Object.fromEntries(cols.map((c) => [c, c in p ? p[c] : (DEFAULTS[c] ?? null)])));
    const { error } = await db.from("audit_pages").upsert(full, { onConflict: "audit_id,url_hash" });
    if (error) throw new Error(error.message);
  }
  const from = results.flatMap((r) => r.linkedFrom);
  if (from.length) {
    const { error } = await db.from("audit_links").delete().eq("audit_id", audit.id).in("from_hash", from);
    if (error) throw new Error(error.message);
  }
  const links = results.flatMap((r) => r.links);
  for (let i = 0; i < links.length; i += 1000) {
    const { error } = await db.from("audit_links").insert(links.slice(i, i + 1000));
    if (error) throw new Error(error.message);
  }

  // New internal addresses, inside the rules and the page limit. Endless query strings are capped per path.
  const h = host(audit);
  const q = runtime.q ?? {};
  const fresh = new Map<string, QueueRow>();
  const finals: QueueRow[] = [];
  for (const r of results)
    for (const f of r.found) {
      if (f.state === "done") {
        finals.push(f);
        continue;
      }
      if (!isInternal(f.url, h, audit.settings.subdomains) || skipReason(f.url, audit.settings, f.depth) || fresh.has(f.url_hash)) continue;
      const u = new URL(f.url);
      if (u.search) {
        const key = u.pathname.slice(0, 200);
        if ((q[key] ?? 0) >= MAX_QUERY_VARIANTS) continue;
        if (Object.keys(q).length < 500 || key in q) q[key] = (q[key] ?? 0) + 1;
      }
      fresh.set(f.url_hash, f);
    }
  runtime.q = q;
  const room = Math.max(0, audit.settings.limit - audit.pages_found);
  const queueRows = [...fresh.values()].slice(0, room);
  let overLimit = audit.over_limit + Math.max(0, fresh.size - room);
  for (let i = 0; i < queueRows.length; i += 1000) {
    const { error } = await db.from("audit_urls").upsert(queueRows.slice(i, i + 1000).map((r) => ({ audit_id: audit.id, ...r })), { onConflict: "audit_id,url_hash", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
  // A redirect's landing page was read already: it goes in the queue as done, or is marked done if it was queued.
  if (finals.length) {
    const { error } = await db.from("audit_urls").upsert(finals.map((r) => ({ audit_id: audit.id, ...r })), { onConflict: "audit_id,url_hash", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    await db.from("audit_urls").update({ state: "done" }).eq("audit_id", audit.id).in("url_hash", finals.map((r) => r.url_hash));
  }

  // Each address in the batch: done, error, skipped, or waiting for another try.
  const now = Date.now();
  const updates = results.map((r) => ({
    audit_id: audit.id,
    url_hash: r.row.url_hash,
    url: r.row.url,
    depth: r.row.depth,
    found_from: r.row.found_from,
    in_sitemap: r.row.in_sitemap,
    lastmod: r.row.lastmod,
    state: r.state === "retry" ? "queued" : r.state,
    tries: r.state === "retry" ? r.row.tries + 1 : r.row.tries,
    retry_at: r.state === "retry" ? new Date(now + (r.retryIn ?? 5) * 1000).toISOString() : null,
    skip_reason: r.skip ?? null,
  }));
  const { error: ue } = await db.from("audit_urls").upsert(updates, { onConflict: "audit_id,url_hash" });
  if (ue) throw new Error(ue.message);

  const [{ count: found }, { count: done }] = await Promise.all([
    db.from("audit_urls").select("url_hash", { count: "exact", head: true }).eq("audit_id", audit.id),
    db.from("audit_urls").select("url_hash", { count: "exact", head: true }).eq("audit_id", audit.id).neq("state", "queued"),
  ]);
  if ((found ?? 0) >= audit.settings.limit) overLimit = Math.max(overLimit, audit.over_limit);
  await save(db, audit, { runtime, pages_found: found ?? audit.pages_found, pages_done: done ?? audit.pages_done, over_limit: overLimit });
}

// ─────────────── graph ───────────────

type PageRow = { url_hash: string; url: string; status: number; content_type: string | null; final_url: string | null; links_to: string[]; body_links_to: string[]; found_from: string; indexable: boolean };

async function allPages<T>(db: SupabaseClient, auditId: string, cols: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("audit_pages").select(cols).eq("audit_id", auditId).order("url_hash").range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return out;
  }
}

/** Work out the graph, save each page's place in it, and finish the crawl. */
async function graphStep(db: SupabaseClient, audit: Audit) {
  const rows = await allPages<PageRow>(db, audit.id, "url_hash, url, status, content_type, final_url, links_to, body_links_to, found_from, indexable");
  const cited = await citations(db, audit.brand_id, host(audit));
  const rootUrl = normUrl(audit.settings.start || audit.root) ?? audit.root;
  const rootHash = urlHash(rootUrl);
  const graphPages: (GraphPage & { indexable: boolean })[] = rows.map((r) => ({
    hash: r.url_hash,
    status: r.status,
    html: r.status >= 200 && r.status < 300 && (!r.content_type || r.content_type.includes("html")),
    finalHash: r.final_url ? urlHash(normUrl(r.final_url) ?? r.final_url) : null,
    linksTo: r.links_to ?? [],
    bodyLinksTo: r.body_links_to ?? [],
    foundFrom: r.found_from,
    aiCitations: cited.get(r.url) ?? 0,
    indexable: r.indexable,
  }));
  const graph = buildGraph(graphPages, rootHash);
  const stats = crawlStats(graphPages, graph, rootHash);

  for (let i = 0; i < rows.length; i += 1000) {
    const chunk = rows.slice(i, i + 1000).map((r) => {
      const g = graph.get(r.url_hash)!;
      return {
        audit_id: audit.id,
        workspace_id: audit.workspace_id,
        url_hash: r.url_hash,
        url: r.url,
        depth: g.depth,
        links_in: g.linksIn,
        body_links_in: g.bodyLinksIn,
        link_score: g.linkScore,
        orphan: g.orphan,
        bad_links_out: g.badLinksOut,
        ai_citations: cited.get(r.url) ?? 0,
        value: g.value,
      };
    });
    const { error } = await db.from("audit_pages").upsert(chunk, { onConflict: "audit_id,url_hash" });
    if (error) throw new Error(error.message);
  }

  // Since the last full crawl.
  const { data: prevAudit } = await db.from("audits").select("id").eq("brand_id", audit.brand_id).eq("status", "done").neq("id", audit.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const before = prevAudit ? await allPages<{ url_hash: string; url: string }>(db, prevAudit.id as string, "url_hash, url") : null;
  const compare = before ? compareCrawls(rows.map((r) => ({ hash: r.url_hash, url: r.url })), before.map((p) => ({ hash: p.url_hash, url: p.url }))) : null;

  const home = rows.find((r) => r.found_from === "home") ?? rows.find((r) => r.url_hash === rootHash);
  const reason = audit.runtime.stalled
    ? "stalled"
    : partialReason({ home: home ? { status: home.status } : null, done: rows.length, noAnswer: rows.filter((r) => r.status === 0).length, found: audit.pages_found, startedAt: new Date(audit.started_at ?? Date.now()).getTime(), now: Date.now() });
  await save(db, audit, {
    status: reason ? "partial" : "done",
    stage: "done",
    partial_reason: reason,
    finished_at: new Date().toISOString(),
    previous_id: (prevAudit?.id as string | undefined) ?? null,
    pages_done: rows.length,
    stats: { ...stats, compare },
    runtime: { ...audit.runtime, robots: undefined, q: undefined },
  });

  // Keep page and link rows for this crawl and the last full one; older crawls keep their numbers only.
  await db.from("audit_urls").delete().eq("audit_id", audit.id);
  const keep = [audit.id, prevAudit?.id].filter(Boolean) as string[];
  const { data: old } = await db.from("audits").select("id").eq("brand_id", audit.brand_id).not("id", "in", `(${keep.join(",")})`).in("status", ["done", "partial", "failed"]);
  for (const o of old ?? []) {
    await db.from("audit_links").delete().eq("audit_id", o.id);
    await db.from("audit_pages").delete().eq("audit_id", o.id);
    await db.from("audit_urls").delete().eq("audit_id", o.id);
  }
}
