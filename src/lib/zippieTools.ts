import "server-only";
// Zippie's tools for technical SEO, linking, rankings, drafts and saving from chat (docs/zippie-skills-plan.md,
// section 3.2). Crawls run on demand and save nothing: every answer is about the site as it is now.
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { docToMarkdown } from "./articles";
import { ToolError } from "./mcp/protocol";
import { safeFetch } from "./safeFetch";
import { findPages } from "./sitemap";
import { filesProblems, MAIN } from "./skills/format";
import { pageFacts, robotsReport, siteIssues, speedReport, urlKey, type CrawledPage, type PageFacts } from "./zippieCrawl";

/** What a tool needs from the chat it runs in. Same shape as AskCtx in ask.ts. */
export type ToolCtx = { db: SupabaseClient; ws: string; userId: string; canEdit: boolean; threadId: string; where?: { brand: string | null; page: string; id?: string | null } | null };
export type ToolEmit = (e: { type: "proposal"; proposal: Proposal }) => void;
export type Proposal = { kind: "skill"; scope: "personal" | "workspace"; files: Record<string, string> } | { kind: "knowledge"; scope: "personal" | "workspace"; title: string; body: string; replaces: string | null };
export type ZippieTool = { name: string; label: string; description: string; input_schema: Anthropic.Tool.InputSchema; run: (ctx: ToolCtx, args: Record<string, unknown>, emit: ToolEmit) => Promise<unknown> };

const str = (v: unknown, n = 300) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const SITE_MAX = 150;
const SITE_BUDGET_MS = 110_000; // the ask route has 300 seconds for a whole answer
const CONCURRENCY = 8;

/** The brand a tool is about: the one named, else the one picked in the app, else the only one. */
async function brandOf(ctx: ToolCtx, arg: unknown): Promise<{ id: string; name: string; domain: string }> {
  const { data } = await ctx.db.from("brands").select("id, name, domain").eq("workspace_id", ctx.ws).order("created_at");
  const all = (data ?? []) as { id: string; name: string; domain: string }[];
  if (!all.length) throw new ToolError("This workspace has no brands yet.");
  const want = (str(arg, 200) || ctx.where?.brand || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  const hit = want ? all.find((b) => b.name.toLowerCase() === want || b.domain.toLowerCase() === want || b.domain.toLowerCase().includes(want)) : null;
  if (hit) return hit;
  if (all.length === 1 || !want) return all[0];
  throw new ToolError(`Say which brand: ${all.map((b) => `${b.name} (${b.domain})`).join(", ")}.`);
}

/** A domain or URL as given, else the brand's domain. */
async function domainOf(ctx: ToolCtx, arg: unknown): Promise<string> {
  const raw = str(arg, 300).replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
  if (raw.includes(".")) return raw.toLowerCase();
  return (await brandOf(ctx, arg)).domain.replace(/^www\./, "");
}

async function crawlOne(url: string, inSitemap = false): Promise<CrawledPage & { ms: number; bytes: number }> {
  const r = await safeFetch(url, { hops: 5, timeout: 15_000, maxBytes: 2_500_000 });
  const html = r.ok && /html/i.test(r.headers.get("content-type") ?? "html") ? r.body : "";
  return { url, status: r.status, hops: r.chain.length, finalUrl: r.url, inSitemap, facts: html ? pageFacts(html, r.url) : null, error: r.error, ms: r.ms, bytes: r.body.length };
}

/** Up to n URLs at a time. Stops starting new ones after the deadline. */
async function pool<T, R>(items: T[], n: number, deadline: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length && Date.now() < deadline) out.push(await f(items[i++]));
    }),
  );
  return out;
}

const compactFacts = (f: PageFacts) => ({
  title: f.title,
  title_length: f.title.length,
  meta_description: f.description,
  description_length: f.description.length,
  canonical: f.canonical,
  robots: f.robots || null,
  noindex: f.noindex,
  lang: f.lang,
  h1: f.h1,
  h2_count: f.h2,
  words: f.words,
  structured_data: f.schema,
  hreflang: f.hreflang.slice(0, 20),
  images: f.images.length,
  images_without_alt: f.images.filter((i) => i.alt === null).slice(0, 20).map((i) => i.src),
  internal_links: f.links.filter((l) => l.internal).slice(0, 80).map((l) => ({ url: l.url, anchor: l.anchor })),
  outside_links: f.links.filter((l) => !l.internal).slice(0, 40).map((l) => ({ url: l.url, anchor: l.anchor, nofollow: l.nofollow })),
});

export const ZIPPIE_TOOLS: ZippieTool[] = [
  {
    name: "crawl_page",
    label: "Reading the page",
    description: "Read one web page now: status, redirects, title, meta description, canonical, robots, H1 and headings, word count, structured data, hreflang, images without alt text and its internal and outside links.",
    input_schema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
    async run(_ctx, args) {
      let url = str(args.url, 2000);
      if (!url) throw new ToolError("Give a URL.");
      if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
      const p = await crawlOne(url);
      if (!p.facts) throw new ToolError(p.error || `The page answered ${p.status || "nothing"}.`);
      return { url, final_url: p.finalUrl, status: p.status, redirects: p.hops, load_ms: p.ms, html_kb: Math.round(p.bytes / 1024), ...compactFacts(p.facts) };
    },
  },
  {
    name: "crawl_site",
    label: "Crawling the site",
    description: `Crawl a site now, up to ${SITE_MAX} pages from its sitemap (or its links when there's no sitemap), and report the problems across it, most harmful first: error pages, noindex pages in the sitemap, redirect chains, canonicals to other pages, missing or duplicate titles and descriptions, H1 problems, thin pages, orphan pages, images without alt text and pages with no structured data. Also returns every page's status, title, words and internal links in, for link plans.`,
    input_schema: { type: "object", properties: { domain: { type: "string", description: "Domain or brand. Leave out for the brand picked in the app." }, limit: { type: "number", description: `Pages to read, up to ${SITE_MAX}.` }, path: { type: "string", description: "Only pages under this path, like /blog." } } },
    async run(ctx, args) {
      const domain = await domainOf(ctx, args.domain);
      const limit = Math.min(SITE_MAX, Math.max(5, Number(args.limit) || SITE_MAX));
      const path = str(args.path, 200);
      const found = await findPages(domain).catch(() => ({ source: null, pages: [] as { url: string }[] }));
      let urls = found.pages.map((p) => p.url).filter((u) => !path || new URL(u).pathname.startsWith(path));
      const inSitemap = new Set(urls.map(urlKey));
      if (!urls.length) {
        // No sitemap: start from the homepage and follow its internal links one level down.
        const home = await crawlOne(`https://${domain}/`);
        urls = [home.finalUrl, ...(home.facts?.links.filter((l) => l.internal).map((l) => l.url) ?? [])];
      }
      urls = [...new Map(urls.map((u) => [urlKey(u), u])).values()].slice(0, limit);
      const pages = await pool(urls, CONCURRENCY, Date.now() + SITE_BUDGET_MS, (u) => crawlOne(u, inSitemap.has(urlKey(u))));
      const issues = siteIssues(pages);
      const inbound = new Map<string, number>();
      for (const p of pages) for (const l of p.facts?.links ?? []) if (l.internal) inbound.set(urlKey(l.url), (inbound.get(urlKey(l.url)) ?? 0) + 1);
      return {
        domain,
        sitemap: found.source,
        pages_found: found.pages.length,
        pages_checked: pages.length,
        stopped_early: pages.length < urls.length,
        issues: issues.map((i) => ({ problem: i.label, severity: i.severity, count: i.pages.length, examples: i.pages.slice(0, 10) })),
        pages: pages.slice(0, SITE_MAX).map((p) => ({ url: p.finalUrl, status: p.status, redirects: p.hops, title: p.facts?.title ?? null, words: p.facts?.words ?? 0, links_in: inbound.get(urlKey(p.finalUrl)) ?? 0, links_out: p.facts?.links.filter((l) => l.internal).length ?? 0 })),
      };
    },
  },
  {
    name: "check_urls",
    label: "Checking links",
    description: "Check up to 60 URLs now: the status of each, where it ends up and how many redirects it takes.",
    input_schema: { type: "object", properties: { urls: { type: "array", items: { type: "string" } } }, required: ["urls"] },
    async run(_ctx, args) {
      const urls = (Array.isArray(args.urls) ? args.urls : []).map((u) => str(u, 2000)).filter(Boolean).slice(0, 60);
      if (!urls.length) throw new ToolError("Give at least one URL.");
      const out = await pool(urls, CONCURRENCY, Date.now() + 60_000, async (u) => {
        let r = await safeFetch(u, { method: "HEAD", hops: 6, timeout: 10_000 });
        if (r.status === 405 || r.status === 403 || r.status === 0) r = await safeFetch(u, { hops: 6, timeout: 10_000, maxBytes: 50_000 });
        return { url: u, status: r.status, final_url: r.url, redirects: r.chain.length, ok: r.status >= 200 && r.status < 400, error: r.error ?? null };
      });
      return { checked: out.length, broken: out.filter((x) => !x.ok).length, urls: out };
    },
  },
  {
    name: "read_robots",
    label: "Reading robots.txt",
    description: "Read a site's robots.txt now: its sitemaps, whether it blocks everything, and which search and AI bots (Googlebot, GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, Google-Extended and others) may read the site.",
    input_schema: { type: "object", properties: { domain: { type: "string" } } },
    async run(ctx, args) {
      const domain = await domainOf(ctx, args.domain);
      const r = await safeFetch(`https://${domain}/robots.txt`, { hops: 4, timeout: 10_000, maxBytes: 500_000 });
      if (r.status === 404) return { domain, robots_txt: null, note: "No robots.txt: every bot may read every page." };
      if (!r.ok) throw new ToolError(`robots.txt answered ${r.status || r.error || "nothing"}.`);
      return { domain, ...robotsReport(r.body), robots_txt: r.body.slice(0, 6000) };
    },
  },
  {
    name: "page_speed",
    label: "Testing page speed",
    description: "Test one URL with Google PageSpeed Insights now: the performance score, lab metrics (LCP, CLS, TBT), field data from real Chrome users when Google has it (LCP, CLS, INP), and the biggest savings.",
    input_schema: { type: "object", properties: { url: { type: "string" }, strategy: { type: "string", enum: ["mobile", "desktop"] } }, required: ["url"] },
    async run(_ctx, args) {
      let url = str(args.url, 2000);
      if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
      const strategy = args.strategy === "desktop" ? "desktop" : "mobile";
      const key = process.env.PAGESPEED_API_KEY ? `&key=${encodeURIComponent(process.env.PAGESPEED_API_KEY)}` : "";
      const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${strategy}&category=performance${key}`, { signal: AbortSignal.timeout(90_000) }).catch(() => null);
      if (!res || !res.ok) throw new ToolError(res?.status === 429 ? "PageSpeed Insights is busy. Try again in a minute." : `PageSpeed Insights answered ${res?.status ?? "nothing"}.`);
      return { url, strategy, ...speedReport(await res.json()) };
    },
  },
  {
    name: "get_rankings",
    label: "Reading rankings",
    description: "The Traffic rank tracker's keywords for a brand: each keyword's latest Google position, the page that ranks, the change over 7 and 30 days, and every URL that ranked in the last 30 days (two URLs means two pages compete).",
    input_schema: { type: "object", properties: { brand: { type: "string" }, keyword: { type: "string", description: "Only keywords containing this." } } },
    async run(ctx, args) {
      const brand = await brandOf(ctx, args.brand);
      const { data: projects } = await ctx.db.from("rank_projects").select("id, name, target").eq("workspace_id", ctx.ws).or(`brand_id.eq.${brand.id},target.ilike.*${brand.domain.replace(/[%,*()]/g, "")}*`);
      if (!projects?.length) return { brand: brand.name, keywords: [], note: "No rank tracking for this brand yet. It starts on the Traffic page." };
      let kq = ctx.db.from("rank_keywords").select("id, keyword, volume, project_id").in("project_id", projects.map((p) => p.id)).limit(500);
      const want = str(args.keyword, 100);
      if (want) kq = kq.ilike("keyword", `%${want.replace(/[%,]/g, "")}%`);
      const { data: kws } = await kq;
      if (!kws?.length) return { brand: brand.name, keywords: [] };
      const since = new Date(Date.now() - 31 * 864e5).toISOString().slice(0, 10);
      const { data: checks } = await ctx.db.from("rank_checks").select("keyword_id, day, position, url").in("keyword_id", kws.map((k) => k.id)).gte("day", since).not("checked_at", "is", null).order("day", { ascending: false }).limit(20_000);
      const by = new Map<string, { day: string; position: number | null; url: string | null }[]>();
      for (const c of checks ?? []) by.set(c.keyword_id, [...(by.get(c.keyword_id) ?? []), c]);
      const at = (rows: { day: string; position: number | null }[], daysAgo: number) => {
        const day = new Date(Date.now() - daysAgo * 864e5).toISOString().slice(0, 10);
        return rows.find((r) => r.day <= day)?.position ?? null;
      };
      const out = kws.map((k) => {
        const rows = by.get(k.id) ?? [];
        const now = rows[0]?.position ?? null;
        const w = at(rows, 7);
        const m = at(rows, 30);
        return { keyword: k.keyword, volume: k.volume, position: now, url: rows[0]?.url ?? null, change_7d: now && w ? w - now : null, change_30d: now && m ? m - now : null, urls_seen: [...new Set(rows.map((r) => r.url).filter(Boolean))] };
      });
      return { brand: brand.name, keywords: out.sort((a, b) => (a.position ?? 999) - (b.position ?? 999)).slice(0, 200) };
    },
  },
  {
    name: "get_clusters",
    label: "Reading clusters",
    description: "The Opportunities clusters for a brand: each cluster's name, score and pillar, and its pages with keyword, role (pillar or page), status, volume and live URL.",
    input_schema: { type: "object", properties: { brand: { type: "string" }, cluster: { type: "string", description: "Only clusters whose name contains this." } } },
    async run(ctx, args) {
      const brand = await brandOf(ctx, args.brand);
      const { data: sites } = await ctx.db.from("sites").select("id").eq("workspace_id", ctx.ws).or(`brand_id.eq.${brand.id},domain.eq."${brand.domain.replace(/"/g, "")}"`);
      const ids = (sites ?? []).map((s) => s.id);
      if (!ids.length) return { brand: brand.name, clusters: [] };
      let q = ctx.db.from("content_clusters").select("id, name, score, pillar").in("site_id", ids).is("archived_at", null).order("position");
      const want = str(args.cluster, 100);
      if (want) q = q.ilike("name", `%${want.replace(/[%,]/g, "")}%`);
      const { data: clusters, error } = await q;
      if (error) return { brand: brand.name, clusters: [], note: "Clusters come with Opportunities." };
      const { data: items } = await ctx.db.from("calendar_items").select("keyword, cluster_id, cluster_role, status, volume, url, current_url").in("cluster_id", (clusters ?? []).map((c) => c.id));
      return {
        brand: brand.name,
        clusters: (clusters ?? []).map((c) => ({
          name: c.name,
          score: Math.round(Number(c.score) || 0),
          pillar: c.pillar,
          pages: (items ?? []).filter((i) => i.cluster_id === c.id).map((i) => ({ keyword: i.keyword, role: i.cluster_role, status: i.status, volume: i.volume, url: i.url ?? i.current_url ?? null })),
        })),
      };
    },
  },
  {
    name: "read_draft",
    label: "Reading the draft",
    description: "Read a draft from Drafts as Markdown. With no id, reads the draft open on screen, or lists the latest drafts to pick from.",
    input_schema: { type: "object", properties: { id: { type: "string" }, title: { type: "string", description: "Find a draft by title." } } },
    async run(ctx, args) {
      const id = str(args.id, 60) || (ctx.where?.id ?? "");
      const title = str(args.title, 200);
      if (id || title) {
        let q = ctx.db.from("docs").select("id, title, content, words, updated_at").eq("workspace_id", ctx.ws);
        q = id ? q.eq("id", id) : q.ilike("title", `%${title.replace(/[%,]/g, "")}%`);
        const { data } = await q.order("updated_at", { ascending: false }).limit(1).maybeSingle();
        if (!data) throw new ToolError("No draft found with that id or title.");
        const md = docToMarkdown(data.content as Record<string, unknown>);
        return { id: data.id, title: data.title, words: data.words, updated_at: data.updated_at, markdown: md.slice(0, 60_000), cut: md.length > 60_000 };
      }
      const { data } = await ctx.db.from("docs").select("id, title, words, updated_at").eq("workspace_id", ctx.ws).order("updated_at", { ascending: false }).limit(20);
      return { drafts: data ?? [], note: "Ask which draft, or read one by id." };
    },
  },
  {
    name: "propose_skill",
    label: "Writing a skill",
    description: "Show a new skill on a card for the person to save. Send the whole SKILL.md (and extra files if needed). Nothing saves until they press Save. Returns problems to fix if the skill can't be saved.",
    input_schema: {
      type: "object",
      properties: { skill_md: { type: "string" }, files: { type: "object", additionalProperties: { type: "string" }, description: "Extra files by name, like checklist.md." }, scope: { type: "string", enum: ["personal", "workspace"] } },
      required: ["skill_md"],
    },
    async run(_ctx, args, emit) {
      const extra = args.files && typeof args.files === "object" ? Object.fromEntries(Object.entries(args.files as Record<string, unknown>).filter(([, v]) => typeof v === "string")) : {};
      const files = { ...(extra as Record<string, string>), [MAIN]: String(args.skill_md ?? "") };
      const problems = filesProblems(files);
      if (problems.length) throw new ToolError(`Fix these and call propose_skill again: ${problems.join(" ")}`);
      const proposal: Proposal = { kind: "skill", scope: args.scope === "workspace" ? "workspace" : "personal", files };
      emit({ type: "proposal", proposal });
      return { proposal, note: "A card with Save is now in the chat. Say what the skill does in one line." };
    },
  },
  {
    name: "propose_knowledge",
    label: "Writing a Knowledge page",
    description: 'Show a Knowledge page on a card for the person to save. Titles start with their kind, like "Competitor: Acme", "Proof: customer results" or "Persona: Tavola writer". To update a page, send the whole new page and set replaces to the old title. Nothing saves until they press Save.',
    input_schema: { type: "object", properties: { title: { type: "string" }, body: { type: "string", description: "Markdown, under 6,000 characters." }, replaces: { type: "string" }, scope: { type: "string", enum: ["workspace", "personal"] } }, required: ["title", "body"] },
    async run(_ctx, args, emit) {
      const title = str(args.title, 120);
      const body = String(args.body ?? "").trim().slice(0, 12_000);
      if (!title || !body) throw new ToolError("Give the page a title and a body.");
      const proposal: Proposal = { kind: "knowledge", scope: args.scope === "personal" ? "personal" : "workspace", title, body, replaces: str(args.replaces, 120) || null };
      emit({ type: "proposal", proposal });
      return { proposal, note: "A card with Save is now in the chat. Say what the page holds in one line." };
    },
  },
];
