import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DAY, readCache, writeCache } from "./cache";
import { marketOf } from "./research";
import { call, dfsReady } from "./dataforseo";
import {
  bareHost,
  descriptionOf,
  factIds,
  gbpKeyword,
  labelOf,
  lastEditOf,
  normName,
  parseGbp,
  parseTrustpilot,
  pickArticle,
  pickWikidata,
  siteVariants,
  sumViews,
  wikiFacts,
  wikiLanguages,
  ymd,
  type BrandPresence,
  type GbpPresence,
  type Status,
  type TrustpilotPresence,
  type WdEntity,
  type Who,
  type WikiPresence,
} from "./presence";

// Brand presence lookups. Wikipedia and Wikidata are free public APIs. Trustpilot and Google Business
// Profile are DataForSEO tasks on the standard queue (the cheapest), so a check is posted once and read
// back later for free. Everything is kept for a week in the shared cache.

const WEEK = 7 * DAY;
const PENDING_FOR = 2 * 3600e3; // a queued task older than this is given up on
// Wikimedia asks every client to name itself.
const UA = "Arrowsterr/1.0 (https://arrowsterr.com)";
const WD = "https://www.wikidata.org/w/api.php";
// Market languages whose Wikipedia goes by another code.
const WIKI_LANG: Record<string, string> = { nb: "no", "zh-cn": "zh", "zh-tw": "zh", "pt-br": "pt" };

export type Market = { location: number; language: string };

/** The brand's market: the country on its Content Plan site, then on the brand, then the United States. */
export async function marketFor(db: SupabaseClient, ws: string, brand: { id: string; profile?: { country?: string } | null }): Promise<Market> {
  const { data } = await db.from("sites").select("profile").eq("brand_id", brand.id).eq("workspace_id", ws).maybeSingle();
  return marketOf((data?.profile as { country?: string } | null)?.country ?? brand.profile?.country);
}

const api = (base: string, params: Record<string, string>) => `${base}?${new URLSearchParams({ format: "json", formatversion: "2", ...params })}`;

// One Wikimedia request at a time from this server, so a page of brands doesn't burst past their rate limit.
let line: Promise<unknown> = Promise.resolve();

/** GET JSON from Wikimedia. Null on 404. One short wait on a rate limit, then it gives up. */
function wm<T>(url: string): Promise<T | null> {
  const go = async (retry: boolean): Promise<T | null> => {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(12_000) });
    if (res.status === 404) return null;
    if (res.status === 429 && retry) {
      await new Promise((r) => setTimeout(r, Math.min(3, Number(res.headers.get("retry-after")) || 1) * 1000));
      return go(false);
    }
    if (!res.ok) throw new Error(`Wikimedia returned ${res.status}`);
    return (await res.json()) as T;
  };
  const next = line.then(() => go(true));
  line = next.catch(() => null);
  return next;
}

type Entities = { entities?: Record<string, WdEntity> };
const qids = (list: (string | undefined)[]) => list.filter((x): x is string => Boolean(x && /^Q\d+$/.test(x)));

async function lookupWiki(brand: Who, lang: string): Promise<WikiPresence> {
  const host = bareHost(brand.domain);
  const langs = [...new Set([lang, "en"])].join("|");
  const entities = async (ids: string[]) =>
    ids.length ? Object.values((await wm<Entities>(api(WD, { action: "wbgetentities", ids: ids.join("|"), props: "labels|descriptions|aliases|claims|sitelinks", languages: langs })))?.entities ?? {}) : [];
  // Candidates by name first. When none has the brand's website, look for items that list the site itself.
  const byName = await wm<{ search?: { id?: string }[] }>(api(WD, { action: "wbsearchentities", search: brand.name.slice(0, 100), language: lang, uselang: lang, type: "item", limit: "7" }));
  const named = qids((byName?.search ?? []).map((s) => s.id));
  let candidates = await entities(named);
  let picked = pickWikidata(candidates, brand, lang);
  if (host && picked?.match !== "website") {
    const bySite = await wm<{ query?: { search?: { title?: string }[] } }>(api(WD, { action: "query", list: "search", srsearch: `haswbstatement:${siteVariants(host).map((v) => `P856=${v}`).join("|")}`, srlimit: "5", srprop: "" }));
    const more = qids((bySite?.query?.search ?? []).map((s) => s.title)).filter((id) => !named.includes(id));
    if (more.length) {
      candidates = [...(await entities(more)), ...candidates];
      picked = pickWikidata(candidates, brand, lang);
    }
  }
  if (!picked) return { status: "missing" };
  const e = picked.entity;

  const linked = factIds(e);
  const linkedItems = linked.length ? await wm<Entities>(api(WD, { action: "wbgetentities", ids: linked.join("|"), props: "labels", languages: langs })) : null;
  const labels: Record<string, string> = {};
  for (const [id, x] of Object.entries(linkedItems?.entities ?? {})) {
    const l = labelOf(x, lang);
    if (l) labels[id] = l;
  }

  const pick = pickArticle(e.sitelinks, lang);
  let article: WikiPresence["article"] = null;
  if (pick) {
    const site = `https://${pick.lang}.wikipedia.org`;
    const path = encodeURIComponent(pick.title.replace(/ /g, "_"));
    const end = new Date(Date.now() - DAY);
    const start = new Date(end.getTime() - 29 * DAY);
    const [rev, views] = await Promise.all([
      wm(api(`${site}/w/api.php`, { action: "query", prop: "revisions", rvprop: "timestamp", titles: pick.title, redirects: "1" })).catch(() => null),
      wm(`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/${pick.lang}.wikipedia/all-access/user/${path}/daily/${ymd(start)}/${ymd(end)}`).catch(() => undefined),
    ]);
    // No pageviews data (404) for a real article means nobody read it in that time.
    article = { title: pick.title, url: `${site}/wiki/${path}`, lang: pick.lang, lastEdit: lastEditOf(rev), views30: views === undefined ? null : (sumViews(views) ?? 0) };
  }
  return {
    status: "found",
    match: picked.match,
    wikidata: { id: e.id, url: `https://www.wikidata.org/wiki/${e.id}`, label: labelOf(e, lang) ?? brand.name, description: descriptionOf(e, lang) },
    article,
    languages: wikiLanguages(e.sitelinks),
    facts: wikiFacts(e, labels),
  };
}

/** Wikipedia and Wikidata for one brand. Free; kept a week. An error is not kept, so the next visit tries again. */
export async function wikiPresence(brand: Who, language = "en"): Promise<WikiPresence> {
  const lang = WIKI_LANG[language.toLowerCase()] ?? language.toLowerCase().split("-")[0];
  const key = `presence:wiki:v1:${lang}:${bareHost(brand.domain)}:${normName(brand.name)}`;
  const hit = await readCache<WikiPresence>(key, WEEK);
  if (hit) return hit;
  try {
    const found = await lookupWiki(brand, lang);
    await writeCache(key, found);
    return found;
  } catch (e) {
    console.error("Wikipedia lookup failed:", e instanceof Error ? e.message : e);
    return { status: "error", note: "Wikipedia didn't answer. Try again in a few minutes." };
  }
}

// ─── Paid checks (DataForSEO) ───

type Pending = { id: string; at: number } | null;
type Paid = { status: Status; checkedAt?: string; note?: string };
const TP = "business_data/trustpilot/reviews";
const GBP = "business_data/google/my_business_info";
const tpKey = (host: string) => `presence:tp:v1:${host}`;
const gbpKey = (host: string, m: Market) => `presence:gbp:v1:${m.location}:${m.language}:${host}`;
const taskKey = (key: string) => `${key}:task`;

/** A saved result, or a queued task read back (free), or unchecked. */
async function readPaid<T extends Paid>(key: string, path: string, parse: (result: unknown) => T): Promise<T> {
  const done = await readCache<T>(key, WEEK);
  if (done) return done;
  const task = await readCache<Pending>(taskKey(key), PENDING_FOR);
  if (!task?.id || !dfsReady()) return { status: "unchecked" } as T;
  try {
    const [t] = await call(`${path}/task_get/${task.id}`);
    const code = Number(t?.status_code);
    if (code >= 40600 && code < 40700) return { status: "checking" } as T; // still in the queue
    if (code === 20000 || code === 40102) {
      const out = { ...(code === 20000 ? parse(t.result?.[0]) : { status: "missing" }), checkedAt: new Date().toISOString() } as T;
      await writeCache(key, out);
      return out;
    }
    await writeCache(taskKey(key), null); // failed: the next check posts a new one
    return { status: "error", note: `DataForSEO: ${t?.status_message ?? `status ${code}`}` } as T;
  } catch (e) {
    return { status: "error", note: e instanceof Error ? e.message : String(e) } as T;
  }
}

const trustpilotOf = (host: string) => readPaid<TrustpilotPresence>(tpKey(host), TP, (r) => parseTrustpilot(r));
const gbpOf = (host: string, domain: string, m: Market) => readPaid<GbpPresence>(gbpKey(host, m), GBP, (r) => parseGbp(r, domain));

/** True when this brand has a site and a paid source with nothing saved or queued. */
async function needsCheck(b: Who, m: Market): Promise<boolean> {
  const host = bareHost(b.domain);
  if (!host) return false;
  for (const key of [tpKey(host), gbpKey(host, m)]) {
    if (await readCache(key, WEEK)) continue;
    const task = await readCache<Pending>(taskKey(key), PENDING_FOR);
    if (!task?.id) return true;
  }
  return false;
}

/** The brands a check would pay for. Each costs TASK_COST.presence. */
export async function toCheck(list: Who[], m: Market): Promise<Who[]> {
  const flags = await Promise.all(list.map((b) => needsCheck(b, m)));
  return list.filter((_, i) => flags[i]);
}

/**
 * Queue Trustpilot and Google Business Profile tasks for these brands, skipping any that are saved or queued.
 * hq is the head office city from Wikidata, which helps Google find the right profile. Returns tasks queued.
 */
export async function postChecks(list: (Who & { hq?: string | null })[], m: Market): Promise<number> {
  const tp: { key: string; body: Record<string, unknown> }[] = [];
  const gbp: { key: string; body: Record<string, unknown> }[] = [];
  for (const b of list) {
    const host = bareHost(b.domain);
    if (!host) continue;
    const free = async (key: string) => !(await readCache(key, WEEK)) && !(await readCache<Pending>(taskKey(key), PENDING_FOR))?.id;
    // depth 20 is one billing unit: the rating, the count and the newest reviews.
    if (await free(tpKey(host))) tp.push({ key: tpKey(host), body: { domain: host, depth: 20, sort_by: "recency", priority: 1 } });
    if (await free(gbpKey(host, m))) gbp.push({ key: gbpKey(host, m), body: { keyword: gbpKeyword(b.name, b.hq), location_code: m.location, language_code: m.language, priority: 1 } });
  }
  let queued = 0;
  for (const [path, jobs] of [[TP, tp], [GBP, gbp]] as const) {
    if (!jobs.length) continue;
    const tasks = await call(`${path}/task_post`, jobs.map((j) => j.body));
    for (let i = 0; i < jobs.length; i++) {
      if (tasks[i]?.status_code !== 20100 || !tasks[i]?.id) continue;
      await writeCache(taskKey(jobs[i].key), { id: tasks[i].id, at: Date.now() });
      queued++;
    }
  }
  return queued;
}

/** Every source for each brand: Wikipedia live or saved, and the paid sources as saved or queued. */
export async function brandPresence(list: Who[], m: Market): Promise<BrandPresence[]> {
  return Promise.all(
    list.map(async (b) => {
      const host = bareHost(b.domain);
      const [wiki, trustpilot, gbp] = await Promise.all([
        wikiPresence(b, m.language),
        host ? trustpilotOf(host) : Promise.resolve<TrustpilotPresence>({ status: "unchecked", note: "No website known for this brand." }),
        host ? gbpOf(host, b.domain!, m) : Promise.resolve<GbpPresence>({ status: "unchecked", note: "No website known for this brand." }),
      ]);
      return { name: b.name, domain: host || null, ...(b.you ? { you: true } : {}), wiki, trustpilot, gbp };
    }),
  );
}
