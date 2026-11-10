import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditResult } from "./audit";
import { DAY, readCache, writeCache } from "./cache";
import { wpIndexNow, wpLlms, wpPlugin } from "./cmsEdit";
import { listRuns } from "./db";
import { answered, brandStats, competitorDomains, urlRows } from "./metrics";
import { safeFetch } from "./safeFetch";
import { buildLlms, compareBuilds, type Build } from "./tech/ai";
import { byUrl } from "./tech/checks";
import { readPage } from "./tech/parse";
import { rawShare } from "./tech/render";
import { templateName } from "./tech/url";

// The AI access screen's data (docs/ai-access.md): the latest crawl's AI answers, JavaScript dependence by template,
// the brand's pages AI cites, structured data by template, llms.txt and IndexNow through the WordPress plugin, and how
// competitor pages AI cites are built.

type Brand = { id: string; name: string; domain: string };
type Crawl = { id: string; created_at: string; pages: number; result: AuditResult | null };

export async function latestCrawl(db: SupabaseClient, brandId: string): Promise<Crawl | null> {
  const { data } = await db.from("site_audits").select("id, created_at, pages, result").eq("brand_id", brandId).eq("status", "done").order("created_at", { ascending: false }).limit(1).maybeSingle();
  return (data as Crawl | null) ?? null;
}

type Row = { url: string; status: number; template: string | null; indexable: boolean; title: string | null; words: number; rendered_words: number | null; render_shot: boolean | null; internal_rank: number | null; schema?: string[] | null; headings?: number | null; rh?: number | null; description?: string | null };

async function rowsOf(db: SupabaseClient, auditId: string): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; from < 50_000; from += 1000) {
    const { data, error } = await db
      .from("crawl_pages")
      .select("url, status, template, indexable, title, words, rendered_words, render_shot, internal_rank, schema:facts->page->schema, headings:facts->page->headings, rh:rendered->headings, description:facts->page->description")
      .eq("audit_id", auditId)
      .order("url")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as unknown as Row[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** The brand's own pages AI answers cited in the last 30 days, with the share of answers that cite each. */
async function citedOwn(db: SupabaseClient, brand: Brand) {
  const runs = await listRuns(db, brand.id, 30);
  const chats = answered(runs, () => true);
  const host = brand.domain.replace(/^www\./, "").toLowerCase();
  const by = new Map<string, { url: string; title: string; chats: number }>();
  for (const c of chats) {
    const seen = new Set<string>();
    for (const s of c.sources) {
      let u: URL;
      try {
        u = new URL(s.url);
      } catch {
        continue;
      }
      if (u.hostname.replace(/^www\./, "").toLowerCase() !== host) continue;
      const key = `${u.origin}${u.pathname}`.replace(/\/+$/, "") || u.origin;
      if (seen.has(key)) continue;
      seen.add(key);
      const row = by.get(key) ?? { url: s.url.split("#")[0], title: s.title ?? "", chats: 0 };
      row.chats++;
      by.set(key, row);
    }
  }
  return { total: chats.length, pages: [...by.values()].sort((a, b) => b.chats - a.chats).slice(0, 100), chats, runs };
}

/** The WordPress connection, and what the plugin says about IndexNow and llms.txt. */
async function wordpress(db: SupabaseClient, brandId: string) {
  const { data } = await db.from("cms_connections").select("id, name, config").eq("brand_id", brandId).eq("kind", "wordpress").order("created_at").limit(1);
  const c = data?.[0];
  if (!c) return null;
  const st = (await wpPlugin((c.config ?? {}) as Record<string, string>).catch(() => null)) as { version?: string; indexnow?: boolean; indexnow_by?: string; llms?: boolean; admin?: boolean } | null;
  const [maj, min] = (st?.version ?? "0.0").split(".").map(Number);
  return { name: c.name as string, plugin: st?.version ?? null, ready: maj > 1 || (maj === 1 && min >= 2), indexnow: st?.indexnow ?? null, by: st?.indexnow_by ?? null, llms: st?.llms ?? null, admin: st?.admin ?? null };
}

export async function aiAccess(db: SupabaseClient, brand: Brand) {
  const a = await latestCrawl(db, brand.id);
  const [wp, cited] = await Promise.all([wordpress(db, brand.id).catch(() => null), citedOwn(db, brand).catch(() => ({ total: 0, pages: [] as { url: string; title: string; chats: number }[] }))]);
  if (!a || a.result?.version !== 2) return { crawl: null, wordpress: wp };
  const rows = await rowsOf(db, a.id);
  const at: Record<string, Row> = Object.fromEntries(rows.map((r) => [r.url, r]));
  const ok = rows.filter((r) => r.status >= 200 && r.status < 300);

  // Raw HTML vs rendered, by template.
  const tpl = new Map<string, { pages: number; rendered: number; raw: number; after: number; hRaw: number; hAfter: number; dependent: number; shot: string | null }>();
  let readable = 0;
  let dependent = 0;
  let rendered = 0;
  let shareSum = 0;
  for (const r of ok) {
    const t = r.template ?? "/";
    const cur = tpl.get(t) ?? { pages: 0, rendered: 0, raw: 0, after: 0, hRaw: 0, hAfter: 0, dependent: 0, shot: null };
    cur.pages++;
    const share = r.rendered_words === null ? null : rawShare(r.words, { words: r.rendered_words });
    if (share !== null) {
      cur.rendered++;
      cur.raw += r.words;
      cur.after += r.rendered_words!;
      cur.hRaw += r.headings ?? 0;
      cur.hAfter += r.rh ?? 0;
      rendered++;
      shareSum += share;
      if (share >= 70) readable++;
      if (share < 50) {
        dependent++;
        cur.dependent++;
      }
      if (r.render_shot && !cur.shot) cur.shot = r.url;
    }
    tpl.set(t, cur);
  }
  const templates = [...tpl.entries()]
    .map(([pattern, v]) => ({ pattern, name: templateName(pattern), pages: v.pages, rendered: v.rendered, raw: v.rendered ? Math.round(v.raw / v.rendered) : null, after: v.rendered ? Math.round(v.after / v.rendered) : null, share: v.after ? Math.min(100, Math.round((v.raw / v.after) * 100)) : null, headingsRaw: v.rendered ? Math.round((v.hRaw / v.rendered) * 10) / 10 : null, headingsAfter: v.rendered ? Math.round((v.hAfter / v.rendered) * 10) / 10 : null, dependent: v.dependent, shot: v.shot }))
    .sort((x, y) => (x.share ?? 101) - (y.share ?? 101) || y.pages - x.pages)
    .slice(0, 40);

  // Structured data for answers, by template.
  const ANSWER = /^(Organization|Corporation|LocalBusiness|Product|Offer|FAQPage|QAPage|HowTo|Article|BlogPosting|NewsArticle|Review|AggregateRating|BreadcrumbList|SoftwareApplication|Service|Person|WebSite)$/;
  const schemaBy = new Map<string, { pages: number; types: Record<string, number> }>();
  for (const r of ok.filter((x) => x.indexable)) {
    const t = r.template ?? "/";
    const cur = schemaBy.get(t) ?? { pages: 0, types: {} };
    cur.pages++;
    for (const s of new Set((r.schema ?? []).filter((x) => ANSWER.test(x)))) cur.types[s] = (cur.types[s] ?? 0) + 1;
    schemaBy.set(t, cur);
  }
  const schema = [...schemaBy.entries()].map(([pattern, v]) => ({ pattern, name: templateName(pattern), pages: v.pages, types: Object.entries(v.types).sort((x, y) => y[1] - x[1]).map(([type, pages]) => ({ type, pages })) })).sort((x, y) => y.pages - x.pages).slice(0, 30);

  const broken = new Map((a.result.ai?.citedBroken ?? []).map((b) => [b.url.replace(/\/+$/, ""), b.why]));
  return {
    crawl: { id: a.id, at: a.created_at, pages: a.pages, root: a.result.root ?? null, phase4: Boolean(a.result.ai) },
    ai: a.result.ai ?? null,
    readable: { rendered, readable, dependent, share: rendered ? Math.round(shareSum / rendered) : null },
    templates,
    schema,
    cited: {
      answers: cited.total,
      pages: cited.pages.map((p) => {
        const r = byUrl(at, p.url);
        return { url: p.url, title: r?.title || p.title, used: cited.total ? Math.round((p.chats / cited.total) * 1000) / 10 : 0, status: r?.status ?? null, indexable: r?.indexable ?? null, share: r && r.rendered_words !== null ? rawShare(r.words, { words: r.rendered_words }) : null, why: broken.get(p.url.split("#")[0].replace(/\/+$/, "")) ?? null };
      }),
    },
    wordpress: wp,
  };
}

/** The screenshot Chromium took of one page in the latest crawl. */
export async function shotOf(db: SupabaseClient, brandId: string, url: string): Promise<string | null> {
  const a = await latestCrawl(db, brandId);
  if (!a) return null;
  const { data } = await db.from("crawl_pages").select("shot").eq("audit_id", a.id).eq("url", url).maybeSingle();
  return (data?.shot as string | null) ?? null;
}

/** An llms.txt from the latest crawl: pages AI cites, pages with search clicks and the strongest pages, by template. */
export async function llmsDraft(db: SupabaseClient, brand: Brand): Promise<string> {
  const a = await latestCrawl(db, brand.id);
  if (!a) throw new Error("Run a Site Audit first.");
  const rows = (await rowsOf(db, a.id)).filter((r) => r.indexable && r.status >= 200 && r.status < 300);
  const [{ data: g }, cited] = await Promise.all([db.from("gsc_pages").select("page, clicks").eq("brand_id", brand.id).gt("clicks", 0).limit(50_000), citedOwn(db, brand).catch(() => ({ pages: [] as { url: string; chats: number }[] }))]);
  const clicks: Record<string, number> = Object.fromEntries((g ?? []).map((x) => [x.page as string, Number(x.clicks) || 0]));
  const citedBy: Record<string, number> = Object.fromEntries(cited.pages.map((p) => [p.url, p.chats]));
  const root = a.result?.root ?? `https://${brand.domain}/`;
  const home = rows.find((r) => r.url === root);
  const scored = rows
    .filter((r) => r.url !== root)
    .map((r) => ({ r, score: (byUrl(citedBy, r.url) ?? 0) * 50 + Math.log10(1 + (byUrl(clicks, r.url) ?? 0)) * 10 + (r.internal_rank ?? 0) }))
    .sort((x, y) => y.score - x.score)
    .slice(0, 60);
  const pages = scored.map(({ r }) => ({ url: r.url, title: (r.title ?? "").replace(/\s+[-|–—]\s+[^-|–—]{1,40}$/, ""), description: r.description ?? "", group: r.template === "/" || !r.template ? "Main pages" : templateName(r.template) }));
  return buildLlms({ name: brand.name, summary: home?.description ?? "" }, pages);
}

async function wpConfig(db: SupabaseClient, brandId: string): Promise<Record<string, string>> {
  const { data } = await db.from("cms_connections").select("config").eq("brand_id", brandId).eq("kind", "wordpress").order("created_at").limit(1);
  if (!data?.[0]) throw new Error("Connect the brand's WordPress site first.");
  return (data[0].config ?? {}) as Record<string, string>;
}

const adminOnly = (e: unknown) => {
  const m = e instanceof Error ? e.message : String(e);
  return /^40[13]/.test(m) ? new Error("The WordPress user needs to be an administrator to change this.") : /^404/.test(m) ? new Error("Update the Arrowsterr Connector plugin to 1.2.0 or later.") : e;
};

export async function setIndexNow(db: SupabaseClient, brandId: string, on: boolean) {
  return wpIndexNow(await wpConfig(db, brandId), on).catch((e) => {
    throw adminOnly(e);
  });
}

export async function publishLlms(db: SupabaseClient, brandId: string, text: string) {
  return wpLlms(await wpConfig(db, brandId), text).catch((e) => {
    throw adminOnly(e);
  });
}

// ─────────────── Competitor pages AI cites ───────────────

const RIVALS_KEY = (brandId: string) => `ai:rivals:${brandId}`;
type RivalPage = Build & { domain: string; title: string; used: number; status: number };
export type Rivals = { at: string; theirs: RivalPage[]; yours: number; rows: ReturnType<typeof compareBuilds> };

/** How the competitor pages AI cites most are built, next to the brand's own cited (or strongest) pages. Cached a day. */
export async function rivals(db: SupabaseClient, brand: Brand, fresh = false): Promise<Rivals> {
  if (!fresh) {
    const hit = await readCache<Rivals>(RIVALS_KEY(brand.id), DAY);
    if (hit) return hit;
  }
  const { chats, total, pages: own } = await citedOwn(db, brand);
  if (!total) throw new Error("No AI answers in the last 30 days yet.");
  const comp = competitorDomains(brandStats(chats, { name: brand.name, domain: brand.domain }));
  const theirUrls = urlRows(chats, brand.domain, comp).filter((u) => u.type === "Competitor").slice(0, 8);
  const theirs: RivalPage[] = [];
  await Promise.all(
    theirUrls.map(async (u) => {
      const r = await safeFetch(u.url, { timeout: 15_000, maxBytes: 3_000_000 });
      if (!r.ok || !/<html|<body/i.test(r.body.slice(0, 5000))) return;
      const f = readPage(r.url, r.body, {}, { root: r.url });
      theirs.push({ url: u.url, domain: u.domain, title: f.title || (u.title ?? ""), used: Math.round(u.used * 10) / 10, status: r.status, words: f.words, schema: f.schema, questions: f.questions ?? 0, firstWords: f.firstWords ?? 0, headings: f.headings });
    }),
  );
  if (!theirs.length) throw new Error("Couldn't read the competitor pages AI cites.");
  theirs.sort((x, y) => y.used - x.used);

  // Yours: the brand's cited pages from the crawl; without citations, its strongest pages.
  const a = await latestCrawl(db, brand.id);
  let yours: Build[] = [];
  if (a) {
    type R = { url: string; words: number; schema?: string[]; questions?: number; firstWords?: number; headings?: number };
    const sel = "url, words, schema:facts->page->schema, questions:facts->page->questions, firstWords:facts->page->firstWords, headings:facts->page->headings";
    const urls = own.map((p) => p.url);
    const { data: hit } = urls.length ? await db.from("crawl_pages").select(sel).eq("audit_id", a.id).in("url", urls.slice(0, 100)) : { data: [] };
    let list = (hit ?? []) as unknown as R[];
    if (list.length < 3) {
      const { data: top } = await db.from("crawl_pages").select(sel).eq("audit_id", a.id).eq("indexable", true).order("internal_rank", { ascending: false, nullsFirst: false }).limit(20);
      list = [...new Map([...list, ...((top ?? []) as unknown as R[])].map((r) => [r.url, r])).values()];
    }
    // Crawls before phase 4 didn't read questions or the first paragraph, so their pages can't be compared.
    yours = list.filter((r) => r.questions !== undefined && r.questions !== null).map((r) => ({ url: r.url, words: r.words, schema: r.schema ?? [], questions: r.questions ?? 0, firstWords: r.firstWords ?? 0, headings: r.headings ?? 0 }));
  }
  const out: Rivals = { at: new Date().toISOString(), theirs, yours: yours.length, rows: compareBuilds(theirs, yours) };
  await writeCache(RIVALS_KEY(brand.id), out);
  return out;
}
