import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DAY, readCache, writeCache } from "../cache";
import type { Chat, Run } from "../chats";
import { addCalendarItems, flatPrompts, latestAnswers, listRuns, topicsOf, type Brand, type Topic } from "../db";
import { dfsReady } from "../dataforseo";
import { entitlement, requireTrack, take } from "../entitlements";
import { research, Spend } from "../keywords";
import { broaderSeed } from "../kwReport";
import { answered, brandStats, competitorDomains, domainRows, promptDetail, promptRows, rankOf, splitPeriods, topicGrid, topicRows, trend, typeShares, urlRows, type BrandStat, type Filter } from "../metrics";
import { MAX_TOPICS } from "../onboarding";
import { enough, headlineGap, isBase, scoresFromSummary, seenAs, unknownInSummary, verdict, type PerceptionRead, type PerceptionSetup, type SummaryRow } from "../perception";
import { TASK_COST } from "../plans";
import { marketOf, type Keyword } from "../research";
import type { AuditResult } from "../audit";
import { bareDomain, gapRivals, parseGap, type Overview } from "../backlinks";
import { aiCited, keys as blKeys, saved as savedBacklinks } from "../backlinksServer";
import { mapStats, type ContentMap } from "../contentMap";
import type { Profile } from "../db";
import { scheduleOf, type Location, type ScanResult } from "../local";
import type { OnpageResult } from "../onpage";
import { previousFull, type AuditRow } from "../siteAudit";
import { ToolError, textResult, type Schema, type ToolResult } from "./protocol";

/** Who is calling: the workspace the API key belongs to. */
export type Ctx = { db: SupabaseClient; ws: string };
type Annotations = { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean };
export type Tool = { name: string; title: string; description: string; inputSchema: Schema; annotations: Annotations; run: (ctx: Ctx, args: Record<string, unknown>) => Promise<ToolResult> };

const BRAND_COLS = "id, workspace_id, url, domain, name, logo, category, prompts, daily, profile, topics";
const round = (n: number | null | undefined, d = 1) => (n === null || n === undefined || !Number.isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d);
const str = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const daysOf = (v: unknown) => Math.min(365, Math.max(1, Math.round(Number(v) || 30)));
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// Inputs most tools share.
const brandArg = { type: "string", description: "The brand's name, domain or id. Optional when the workspace has one brand. Call list_brands to see them." };
const daysArg = { type: "number", description: "How many days back to look. Default 30, max 365. Changes are against the same number of days before.", minimum: 1, maximum: 365 };
const topicArg = { type: "string", description: "Only this topic (a group of prompts). Leave out for all topics." };
const engineArg = { type: "string", description: "Only this AI model, like ChatGPT, Perplexity, Gemini, Claude or AI Overview. Leave out for all." };

async function brands(ctx: Ctx): Promise<Brand[]> {
  const { data, error } = await ctx.db.from("brands").select(BRAND_COLS).eq("workspace_id", ctx.ws).order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as Brand[];
}

/** The brand the caller means, by id, name or domain. */
async function pickBrand(ctx: Ctx, arg: unknown): Promise<Brand> {
  const all = await brands(ctx);
  if (!all.length) throw new ToolError("This workspace has no brands yet. Add one in the Arrowsterr app first.");
  const want = str(arg, 200).toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, "");
  if (!want) {
    if (all.length === 1) return all[0];
    throw new ToolError(`This workspace has ${all.length} brands. Say which one: ${all.map((b) => `${b.name} (${b.domain})`).join(", ")}.`);
  }
  const hit = all.find((b) => b.id === want) ?? all.find((b) => b.name.toLowerCase() === want || b.domain.toLowerCase() === want) ?? all.find((b) => b.name.toLowerCase().includes(want) || b.domain.toLowerCase().includes(want));
  if (!hit) throw new ToolError(`No brand matches "${want}". This workspace has: ${all.map((b) => `${b.name} (${b.domain})`).join(", ")}.`);
  return hit;
}

/** The runs for a period and the one before it, with the caller's filters. */
async function period(ctx: Ctx, brand: Brand, args: Record<string, unknown>) {
  const days = daysOf(args.days);
  const runs = (await listRuns(ctx.db, brand.id, Math.min(730, days * 2))) as Run[];
  const { current, previous } = splitPeriods(runs, days);
  const all = topicsOf(brand);
  const topicName = str(args.topic, 120);
  const topic = topicName ? (all.find((t) => same(t.name, topicName)) ?? all.find((t) => t.name.toLowerCase().includes(topicName.toLowerCase()))) : null;
  if (topicName && !topic) throw new ToolError(`No topic called "${topicName}". Topics: ${all.map((t) => t.name).join(", ") || "none yet"}.`);
  const engineName = str(args.engine, 60);
  const engines = [...new Set(runs.flatMap((r) => r.chats.map((c) => c.engine)))];
  const engine = engineName ? engines.find((e) => same(e, engineName)) ?? engines.find((e) => e.toLowerCase().includes(engineName.toLowerCase())) : null;
  if (engineName && !engine) throw new ToolError(`No answers from "${engineName}". Models with answers: ${engines.join(", ") || "none yet"}.`);
  const prompts = topic ? new Set(topic.prompts) : null;
  const filter: Filter = (c: Chat) => (!engine || c.engine === engine) && (!prompts || prompts.has(c.prompt));
  const topics: Topic[] = topic ? [topic] : all;
  const you = { name: brand.name, domain: brand.domain };
  return { days, current, previous, filter, topics, engines: engine ? [engine] : engines, you, topic: topic?.name ?? null, engine: engine ?? null };
}

const scope = (p: { days: number; topic: string | null; engine: string | null }, brand: Brand) => ({ brand: { name: brand.name, domain: brand.domain }, days: p.days, topic: p.topic ?? "all", model: p.engine ?? "all" });
const noData = (brand: Brand, days: number) => new ToolError(`No AI answers for ${brand.name} in the last ${days} days yet. Daily checks fill this in, or run a check in the app.`);
const statRow = (s: BrandStat) => ({ name: s.name, domain: s.domain, visibility: round(s.visibility), position: round(s.position), sentiment: round(s.sentiment, 0), mentions: s.mentions, ...(s.isYou ? { you: true } : {}) });

/** Where a brand sits on the quadrant: up is named more, right is named higher in the list. */
function quadrantOf(s: BrandStat, mid: number) {
  if (s.position === null) return null;
  const high = s.visibility >= 50;
  const top = s.position <= mid;
  return high ? (top ? "Leader" : "Challenger") : top ? "Niche King" : "Rising Star";
}

export const TOOLS: Tool[] = [
  {
    name: "list_brands",
    title: "List brands",
    description: "Every brand this workspace tracks, with its topics and how many prompts each has. Start here to find brand names.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async run(ctx) {
      const all = await brands(ctx);
      return textResult({
        brands: all.map((b) => ({ id: b.id, name: b.name, domain: b.domain, checkedDaily: b.daily, prompts: b.prompts.length, topics: topicsOf(b).map((t) => ({ name: t.name, prompts: t.prompts.length })) })),
      });
    },
  },
  {
    name: "get_ai_visibility",
    title: "AI visibility",
    description:
      "How often AI answers (ChatGPT, Perplexity, Gemini, Claude, Google AI Overview) name the brand. Returns visibility (% of answers that name it), sentiment (0 to 100), average position in the list, rank among brands, the change from the period before, and the split by model and by topic.",
    inputSchema: { type: "object", properties: { brand: brandArg, days: daysArg, topic: topicArg, engine: engineArg } },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async run(ctx, args) {
      const brand = await pickBrand(ctx, args.brand);
      const p = await period(ctx, brand, args);
      const chats = answered(p.current, p.filter);
      if (!chats.length) throw noData(brand, p.days);
      const before = answered(p.previous, p.filter);
      const stats = brandStats(chats, p.you);
      const me = stats.find((s) => s.isYou)!;
      const was = before.length ? brandStats(before, p.you).find((s) => s.isYou) : null;
      const rank = rankOf(stats, "visibility");
      const byModel = p.engines.map((e) => {
        const now = chats.filter((c) => c.engine === e);
        const old = before.filter((c) => c.engine === e);
        return { model: e, visibility: now.length ? round(brandStats(now, p.you).find((s) => s.isYou)?.visibility) : null, before: old.length ? round(brandStats(old, p.you).find((s) => s.isYou)?.visibility) : null, answers: now.length };
      });
      return textResult({
        ...scope(p, brand),
        answers: chats.length,
        visibility: round(me.visibility),
        visibilityBefore: was ? round(was.visibility) : null,
        sentiment: round(me.sentiment, 0),
        sentimentBefore: was ? round(was.sentiment, 0) : null,
        position: round(me.position),
        positionBefore: was ? round(was.position) : null,
        rank: rank ? `${rank.rank} of ${rank.of}` : null,
        byModel,
        byTopic: topicRows(chats, p.topics, [], brand.name).map((t) => ({ topic: t.topic, prompts: t.prompts, visibility: round(t.visibility) })),
        topCompetitors: [...stats].filter((s) => !s.isYou).sort((a, b) => b.visibility - a.visibility).slice(0, 8).map(statRow),
      });
    },
  },
  {
    name: "get_visibility_trend",
    title: "Visibility over time",
    description: "Visibility by day for the brand and its top competitors, to see what moved and when.",
    inputSchema: {
      type: "object",
      properties: { brand: brandArg, days: daysArg, topic: topicArg, engine: engineArg, competitors: { type: "array", items: { type: "string" }, description: "Brands to compare. Default: the 4 most named." } },
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async run(ctx, args) {
      const brand = await pickBrand(ctx, args.brand);
      const p = await period(ctx, brand, args);
      const chats = answered(p.current, p.filter);
      if (!chats.length) throw noData(brand, p.days);
      const asked = Array.isArray(args.competitors) ? args.competitors.map((x) => str(x, 80)).filter(Boolean).slice(0, 8) : [];
      const stats = brandStats(chats, p.you);
      const others = asked.length
        ? asked.map((n) => stats.find((s) => same(s.name, n))?.name ?? n)
        : stats.filter((s) => !s.isYou).sort((a, b) => b.visibility - a.visibility).slice(0, 4).map((s) => s.name);
      const names = [brand.name, ...others];
      const points = trend(p.current, names, "visibility", p.filter);
      return textResult({ ...scope(p, brand), brands: names, series: points.map((pt) => ({ day: pt.at, ...Object.fromEntries(names.map((n) => [n, round(pt.values[n] ?? null)])) })) });
    },
  },
  {
    name: "get_prompts",
    title: "Prompt results",
    description: "Every tracked prompt with the brand's visibility, position and sentiment, where each AI model ranked it in its latest answer, and the brands named most often for that prompt.",
    inputSchema: { type: "object", properties: { brand: brandArg, days: daysArg, topic: topicArg, engine: engineArg } },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async run(ctx, args) {
      const brand = await pickBrand(ctx, args.brand);
      const p = await period(ctx, brand, args);
      const rows = promptRows(p.current, p.topics, p.engines, brand.name, p.filter, brand.domain);
      if (!rows.some((r) => r.answers)) throw noData(brand, p.days);
      return textResult({
        ...scope(p, brand),
        prompts: rows.map((r) => ({
          prompt: r.prompt,
          topic: r.topic,
          answers: r.answers,
          visibility: round(r.visibility),
          position: round(r.position),
          sentiment: round(r.sentiment, 0),
          latest: Object.fromEntries(r.latest.map((c) => [c.engine, c.status === "named" ? `#${c.position}` : c.status === "missed" ? "not named" : c.status])),
          mostNamed: r.topBrands.slice(0, 5).map((b) => b.name),
        })),
      });
    },
  },
  {
    name: "get_prompt_answers",
    title: "Full AI answers for a prompt",
    description: "The latest answer from each AI model for one prompt: the full text, the brands it named in order, the sites it cited, and where the brand ranked. Use it to see why a competitor wins a prompt.",
    inputSchema: { type: "object", properties: { brand: brandArg, prompt: { type: "string", description: "The prompt, or a few words from it." } }, required: ["prompt"] },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async run(ctx, args) {
      const brand = await pickBrand(ctx, args.brand);
      const want = str(args.prompt, 400).toLowerCase();
      if (!want) throw new ToolError("Say which prompt.");
      const all = flatPrompts(topicsOf(brand));
      const prompt = all.find((x) => x.toLowerCase() === want) ?? all.find((x) => x.toLowerCase().includes(want)) ?? all.find((x) => want.split(/\s+/).every((w) => x.toLowerCase().includes(w)));
      if (!prompt) throw new ToolError(`No tracked prompt matches "${want}". Call get_prompts to see them.`);
      const runs = (await listRuns(ctx.db, brand.id, 60)) as Run[];
      const engines = [...new Set(runs.flatMap((r) => r.chats.filter((c) => c.prompt === prompt).map((c) => c.engine)))];
      const detail = promptDetail(runs, prompt, engines, { name: brand.name, domain: brand.domain }, () => true);
      const texts = await latestAnswers(ctx.db, brand.id, prompt);
      return textResult({
        brand: { name: brand.name, domain: brand.domain },
        prompt,
        answers: detail.engines
          .filter((e) => e.answered)
          .map((e) => ({
            model: e.engine,
            at: e.at,
            brandRank: e.rank,
            sentiment: e.sentiment,
            brandsNamed: e.brands.slice(0, 15).map((b) => `${b.position}. ${b.name}${b.isYou ? " (you)" : ""}`),
            sitesCited: e.sources.slice(0, 10).map((s) => s.url),
            text: (texts.find((t) => t.engine === e.engine)?.text ?? "").slice(0, 6000) || null,
          })),
      });
    },
  },
  {
    name: "get_competitors",
    title: "Competitors and quadrant",
    description:
      "Every brand AI names next to this one, with visibility, average position, sentiment and its quadrant: Leader (named often and high), Challenger (named often, lower), Niche King (named less, but high), Rising Star (named less and lower). Pass a topic to see who wins that niche. Also returns the most favorably described brand and the leader of each topic.",
    inputSchema: { type: "object", properties: { brand: brandArg, days: daysArg, topic: topicArg, engine: engineArg, limit: { type: "number", description: "How many brands. Default 15, max 50." } } },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async run(ctx, args) {
      const brand = await pickBrand(ctx, args.brand);
      const p = await period(ctx, brand, args);
      const chats = answered(p.current, p.filter);
      if (!chats.length) throw noData(brand, p.days);
      const limit = Math.min(50, Math.max(1, Math.round(Number(args.limit) || 15)));
      const stats = [...brandStats(chats, p.you)].sort((a, b) => b.visibility - a.visibility);
      const shown = stats.filter((s, i) => s.isYou || i < limit);
      const worst = Math.max(4, Math.ceil(Math.max(1, ...shown.map((s) => s.position ?? 0))));
      const mid = (worst + 1) / 2;
      const warmest = stats.filter((s) => s.sentiment !== null && s.mentions >= 2).sort((a, b) => b.sentiment! - a.sentiment! || b.visibility - a.visibility)[0] ?? null;
      const leaders = topicGrid(chats, p.topics, stats.slice(0, 20).map((s) => s.name));
      return textResult({
        ...scope(p, brand),
        answers: chats.length,
        brands: shown.map((s) => ({ ...statRow(s), quadrant: quadrantOf(s, mid) })),
        mostFavorable: warmest ? { name: warmest.name, sentiment: round(warmest.sentiment, 0) } : null,
        topicLeaders: leaders.map((t) => ({ topic: t.topic, leader: t.leader, youVisibility: round(t.values[brand.name] ?? null) })),
      });
    },
  },
  {
    name: "get_brand_perception",
    title: "Words AI uses for the brand",
    description:
      "How AI describes the brand on its perception words (7 good, 3 bad, the same list for every brand in the market): the share of answers that support each word, for the brand and the brands AI names most next to it, with quotes as proof. source buyer reads the answers to tracked prompts; direct reads the weekly questions asked about the brand itself.",
    inputSchema: {
      type: "object",
      properties: {
        brand: brandArg,
        days: daysArg,
        engine: engineArg,
        source: { type: "string", enum: ["buyer", "direct"], description: "buyer (default): answers to tracked prompts. direct: the weekly questions about the brand." },
        rivals: { type: "number", description: "How many other brands to compare. Default 3, max 8." },
      },
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async run(ctx, args) {
      const brand = await pickBrand(ctx, args.brand);
      const { data: b } = await ctx.db.from("brands").select("perception").eq("id", brand.id).maybeSingle();
      const words = (b?.perception as PerceptionSetup | null)?.words;
      if (!words?.length) throw new ToolError(`${brand.name} has no perception words yet. Open the Perception page in Arrowsterr once to make them.`);
      const days = daysOf(args.days);
      const source = args.source === "direct" ? "direct" : "buyer";
      const engine = str(args.engine, 40);
      const since = new Date(Date.now() - days * 864e5).toISOString();
      const { data, error } = await ctx.db.rpc("perception_summary", { p_brand: brand.id, p_since: since });
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as SummaryRow[];
      const keep = (r: SummaryRow) => r.source === source && (!engine || same(r.engine, engine));
      const you = scoresFromSummary(rows, brand.name, words, keep);
      if (!you.n && !rows.length) throw noData(brand, days);
      const reach = new Map<string, number>();
      for (const r of rows) if (keep(r) && isBase(r) && r.named !== brand.name) reach.set(r.named, (reach.get(r.named) ?? 0) + r.n);
      const take = Math.min(8, Math.max(0, Math.round(Number(args.rivals) || 3)));
      const rivals = [...reach.entries()].sort((x, y) => y[1] - x[1]).slice(0, take).map(([name]) => ({ brand: name, scores: scoresFromSummary(rows, name, words, keep) }));
      const { data: recent } = await ctx.db.from("perception_reads").select("engine, words, source").eq("brand_id", brand.id).eq("named", brand.name).eq("source", source).gte("at", since).order("at", { ascending: false }).limit(300);
      const quotes = (word: string) => ((recent ?? []) as Pick<PerceptionRead, "engine" | "words">[]).filter((r) => !engine || same(r.engine, engine)).flatMap((r) => r.words.filter((w) => w.word === word).map((w) => ({ model: r.engine, quote: w.quote }))).slice(0, 3);
      const share = (s: typeof you, w: string) => (enough(s) ? round(s.share[w] * 100, 0) : null);
      const [first, second] = verdict(brand.name, you, rivals, words, unknownInSummary(rows, brand.name));
      const gap = headlineGap(you, rivals, words);
      return textResult({
        brand: { name: brand.name, domain: brand.domain },
        days,
        source,
        model: engine || "all",
        answers: you.n,
        verdict: [first, second].filter(Boolean).join(" "),
        notKnownWhenAsked: unknownInSummary(rows, brand.name),
        seenAs: (() => {
          const seen = seenAs(rows, brand.name, (r) => keep(r) && (r.source === "buyer" || r.kind === "describe"));
          return seen.n ? { answers: seen.n, top: seen.shares[0].category, expected: (b?.perception as PerceptionSetup | null)?.expected ?? null, shares: seen.shares.slice(0, 5).map((x) => ({ category: x.category, share: round(x.share * 100, 0) })) } : null;
        })(),
        biggestGap: gap ? { word: gap.word, leader: gap.brand, leaderShare: round(gap.them * 100, 0), yourShare: round(gap.you * 100, 0) } : null,
        words: words.map((w) => ({
          word: w.word,
          good: w.good,
          share: share(you, w.word),
          rivals: Object.fromEntries(rivals.map((r) => [r.brand, share(r.scores, w.word)])),
          quotes: quotes(w.word),
        })),
        note: "share is the percent of answers naming the brand that support the word. null means fewer than 3 answers.",
      });
    },
  },
  {
    name: "get_cited_sources",
    title: "Sites and pages AI cites",
    description: "The websites and pages AI answers link to for this brand's prompts, with how often and what kind of site each is (You, Competitor, UGC like Reddit, Reviews, Editorial, Reference, Corporate). Use it to find where to get mentioned.",
    inputSchema: { type: "object", properties: { brand: brandArg, days: daysArg, topic: topicArg, engine: engineArg } },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async run(ctx, args) {
      const brand = await pickBrand(ctx, args.brand);
      const p = await period(ctx, brand, args);
      const chats = answered(p.current, p.filter);
      if (!chats.length) throw noData(brand, p.days);
      const comp = competitorDomains(brandStats(chats, p.you));
      const domains = domainRows(chats, brand.domain, comp);
      const pages = urlRows(chats, brand.domain, comp);
      return textResult({
        ...scope(p, brand),
        answers: chats.length,
        byType: typeShares(domains).map((t) => ({ type: t.type, share: round(t.share) })),
        sites: domains.slice(0, 25).map((d) => ({ domain: d.domain, type: d.type, citedIn: `${round(d.used)}% of answers` })),
        pages: pages.slice(0, 25).map((u) => ({ url: u.url, title: u.title, type: u.type, citedIn: `${round(u.used)}% of answers`, prompts: u.prompts.length })),
      });
    },
  },
  {
    name: "get_content_plan",
    title: "Content Plan",
    description: "The brand's Content Plan: each planned piece with its keyword, funnel stage, search volume, difficulty, status, due date and live URL.",
    inputSchema: {
      type: "object",
      properties: { brand: brandArg, status: { type: "string", enum: ["planned", "brief", "writing", "review", "published"], description: "Only pieces with this status." } },
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async run(ctx, args) {
      const brand = await pickBrand(ctx, args.brand);
      const site = await siteOf(ctx, brand);
      let q = ctx.db.from("calendar_items").select("id, keyword, stage, theme, volume, difficulty, intent, status, due_date, url, action, current_url, notes").eq("site_id", site.id);
      const status = str(args.status, 20);
      if (status) q = q.eq("status", status);
      const { data, error } = await q.order("due_date", { nullsFirst: false }).limit(500);
      if (error) throw new Error(error.message);
      return textResult({ brand: { name: brand.name, domain: brand.domain }, items: data ?? [] });
    },
  },
  {
    name: "get_topic_bank",
    title: "Topic Bank",
    description: "Keyword ideas saved for the brand but not planned yet, with volume, difficulty, intent and funnel stage.",
    inputSchema: { type: "object", properties: { brand: brandArg } },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async run(ctx, args) {
      const brand = await pickBrand(ctx, args.brand);
      const site = await siteOf(ctx, brand);
      const bank = (site.profile?.bank ?? []).map((b) => ({ keyword: b.keyword, volume: b.volume, difficulty: b.kd, intent: b.intent, stage: b.stage, theme: b.theme ?? null, job: b.action ?? "new", page: b.url ?? null }));
      return textResult({ brand: { name: brand.name, domain: brand.domain }, keywords: bank });
    },
  },
  {
    name: "keyword_research",
    title: "Keyword research",
    description: `Google keyword data from DataForSEO for the brand's market: search volume, difficulty (0 to 100), cost per click, intent and the 12-month trend. Uses ${TASK_COST.keyword} tasks from the plan, unless the same search ran in the last 30 days.`,
    inputSchema: {
      type: "object",
      properties: {
        brand: brandArg,
        keyword: { type: "string", description: "A seed keyword, like 'crm for agencies'." },
        mode: { type: "string", enum: ["ideas", "phrase", "related"], description: "ideas: broad ideas around the seed (default). phrase: keywords that contain it. related: what people also search." },
        limit: { type: "number", description: "How many keywords to return. Default 50, max 200." },
      },
      required: ["keyword"],
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
    async run(ctx, args) {
      const brand = await pickBrand(ctx, args.brand);
      const query = str(args.keyword, 200).toLowerCase().replace(/["“”?!.]/g, "").replace(/\s+/g, " ").trim();
      if (!query) throw new ToolError("Give a keyword.");
      const mode = (["ideas", "phrase", "related"] as const).find((m) => m === args.mode) ?? "ideas";
      const limit = Math.min(200, Math.max(1, Math.round(Number(args.limit) || 50)));
      const site = await siteOf(ctx, brand).catch(() => null);
      const market = marketOf(site?.profile?.country);
      const key = `kr2:${mode}:${market.location}:${market.language}:${query}`;
      let rows = await readCache<Keyword[]>(key, 30 * DAY);
      if (!rows) {
        const locked = await requireTrack(ctx.ws, "seo");
        if (locked) throw new ToolError(((await locked.json()) as { error: string }).error);
        if (!dfsReady()) throw new Error("Keyword data is not set up on the server.");
        const took = await take(ctx.ws, "tasks", TASK_COST.keyword);
        if (!took.ok) throw new ToolError(((await took.response.json()) as { error: string }).error);
        try {
          const spend = new Spend();
          rows = await research(mode, query, market, spend);
          if (!rows.length) {
            const wider = broaderSeed(query);
            if (wider) rows = await research(mode, wider, market, spend);
          }
          if (rows.length) await writeCache(key, rows);
        } catch (e) {
          await took.giveBack();
          throw e;
        }
      }
      return textResult({
        keyword: query,
        mode,
        market: site?.profile?.country ?? "United States",
        keywords: rows.slice(0, limit).map((k) => ({ keyword: k.keyword, volume: k.volume, difficulty: k.kd, cpc: k.cpc, intent: k.intent, trend: k.trend })),
      });
    },
  },
  {
    name: "add_to_content_plan",
    title: "Add to Content Plan",
    description: "Add keywords to the brand's Content Plan as planned pieces. Keywords already on the plan are skipped.",
    inputSchema: {
      type: "object",
      properties: {
        brand: brandArg,
        items: {
          type: "array",
          description: "Up to 50 pieces.",
          items: {
            type: "object",
            properties: {
              keyword: { type: "string" },
              stage: { type: "string", enum: ["bofu", "mofu", "tofu"], description: "Funnel stage: bofu ready to buy, mofu comparing, tofu learning." },
              volume: { type: "number" },
              difficulty: { type: "number" },
              notes: { type: "string", description: "Angle or instructions for the writer." },
              due_date: { type: "string", description: "YYYY-MM-DD" },
              update_url: { type: "string", description: "Set to improve an existing page instead of writing a new one." },
            },
            required: ["keyword"],
          },
        },
      },
      required: ["items"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async run(ctx, args) {
      const brand = await pickBrand(ctx, args.brand);
      const site = await siteOf(ctx, brand);
      const raw = Array.isArray(args.items) ? args.items.slice(0, 50) : [];
      const items = raw
        .map((x) => (x && typeof x === "object" ? (x as Record<string, unknown>) : {}))
        .map((x) => {
          const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);
          const stage = (["bofu", "mofu", "tofu"] as const).find((s) => s === x.stage) ?? null;
          const due = /^\d{4}-\d{2}-\d{2}$/.test(str(x.due_date, 10)) ? str(x.due_date, 10) : null;
          const update = /^https?:\/\//.test(str(x.update_url, 500)) ? str(x.update_url, 500) : null;
          return {
            site_id: site.id,
            keyword: str(x.keyword, 200).toLowerCase(),
            secondary: [],
            stage,
            theme: null,
            volume: num(x.volume),
            difficulty: num(x.difficulty),
            intent: null,
            cpc: null,
            source: "mcp",
            notes: str(x.notes, 2000) || null,
            due_date: due,
            action: update ? ("update" as const) : ("new" as const),
            current_url: update,
          };
        })
        .filter((x) => x.keyword);
      if (!items.length) throw new ToolError("Send at least one item with a keyword.");
      const added = await addCalendarItems(ctx.db, ctx.ws, items);
      return textResult({ brand: { name: brand.name, domain: brand.domain }, added, skipped: items.length - added }, `Added ${added} of ${items.length} to the Content Plan.`);
    },
  },
  {
    name: "update_content_plan",
    title: "Update Content Plan",
    description: "Change pieces already on the brand's Content Plan: status, due date, funnel stage, notes for the writer, the keyword, or the live URL. Find each piece by its id or keyword from get_content_plan. Only the fields you send change.",
    inputSchema: {
      type: "object",
      properties: {
        brand: brandArg,
        items: {
          type: "array",
          description: "Up to 50 changes.",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "The piece's id from get_content_plan." },
              keyword: { type: "string", description: "The piece's keyword, when there is no id." },
              new_keyword: { type: "string" },
              status: { type: "string", enum: ["planned", "brief", "writing", "review", "published"] },
              stage: { type: "string", enum: ["bofu", "mofu", "tofu"], description: "Funnel stage: bofu ready to buy, mofu comparing, tofu learning." },
              due_date: { type: "string", description: "YYYY-MM-DD, or an empty string to clear it." },
              notes: { type: "string", description: "Angle or instructions for the writer. Replaces the old notes." },
              url: { type: "string", description: "The live URL once it's published." },
            },
          },
        },
      },
      required: ["items"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async run(ctx, args) {
      const brand = await pickBrand(ctx, args.brand);
      const site = await siteOf(ctx, brand);
      const { data: rows, error } = await ctx.db.from("calendar_items").select("id, keyword").eq("site_id", site.id);
      if (error) throw new Error(error.message);
      const plan = (rows ?? []) as { id: string; keyword: string }[];
      const raw = Array.isArray(args.items) ? args.items.slice(0, 50) : [];
      const done: string[] = [];
      const missed: string[] = [];
      for (const x of raw.map((v) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {}))) {
        const id = str(x.id, 60);
        const kw = str(x.keyword, 200).toLowerCase();
        const row = plan.find((r) => r.id === id) ?? (kw ? plan.find((r) => r.keyword.toLowerCase() === kw) : undefined);
        if (!row) {
          missed.push(id || kw || "(no id or keyword)");
          continue;
        }
        const patch: Record<string, unknown> = {};
        const status = (["planned", "brief", "writing", "review", "published"] as const).find((v) => v === x.status);
        if (status) patch.status = status;
        const stage = (["bofu", "mofu", "tofu"] as const).find((v) => v === x.stage);
        if (stage) patch.stage = stage;
        if (typeof x.due_date === "string") {
          const due = str(x.due_date, 10);
          if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) throw new ToolError(`Use YYYY-MM-DD for the due date of "${row.keyword}".`);
          patch.due_date = due || null;
        }
        if (typeof x.notes === "string") patch.notes = str(x.notes, 2000) || null;
        if (typeof x.url === "string") {
          const url = str(x.url, 500);
          if (url && !/^https?:\/\//.test(url)) throw new ToolError(`The URL for "${row.keyword}" must start with http:// or https://.`);
          patch.url = url || null;
        }
        const nk = str(x.new_keyword, 200).toLowerCase();
        if (nk && nk !== row.keyword.toLowerCase()) {
          if (plan.some((r) => r.keyword.toLowerCase() === nk)) throw new ToolError(`"${nk}" is already on the plan.`);
          patch.keyword = nk;
        }
        if (!Object.keys(patch).length) {
          missed.push(`${row.keyword} (nothing to change)`);
          continue;
        }
        const { error: upError } = await ctx.db.from("calendar_items").update(patch).eq("id", row.id).eq("site_id", site.id);
        if (upError) throw new Error(upError.message);
        if (typeof patch.keyword === "string") row.keyword = patch.keyword;
        done.push(row.keyword);
      }
      if (!done.length && !missed.length) throw new ToolError("Send at least one change.");
      return textResult({ brand: { name: brand.name, domain: brand.domain }, updated: done, not_found: missed }, `Updated ${done.length} piece${done.length === 1 ? "" : "s"} on the Content Plan.`);
    },
  },
  {
    name: "remove_from_content_plan",
    title: "Remove from Content Plan",
    description: "Delete pieces from the brand's Content Plan, by id or keyword from get_content_plan. Their briefs go with them; drafts in the writer stay. Confirm with the person first.",
    inputSchema: {
      type: "object",
      properties: {
        brand: brandArg,
        ids: { type: "array", items: { type: "string" }, description: "Piece ids from get_content_plan." },
        keywords: { type: "array", items: { type: "string" }, description: "Keywords of pieces to delete, when there are no ids." },
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    async run(ctx, args) {
      const brand = await pickBrand(ctx, args.brand);
      const site = await siteOf(ctx, brand);
      const ids = new Set((Array.isArray(args.ids) ? args.ids : []).slice(0, 100).map((v) => str(v, 60)).filter(Boolean));
      const kws = new Set((Array.isArray(args.keywords) ? args.keywords : []).slice(0, 100).map((v) => str(v, 200).toLowerCase()).filter(Boolean));
      if (!ids.size && !kws.size) throw new ToolError("Say which pieces to delete, by id or keyword.");
      const { data: rows, error } = await ctx.db.from("calendar_items").select("id, keyword").eq("site_id", site.id);
      if (error) throw new Error(error.message);
      const hit = ((rows ?? []) as { id: string; keyword: string }[]).filter((r) => ids.has(r.id) || kws.has(r.keyword.toLowerCase()));
      if (!hit.length) throw new ToolError("None of those are on the plan. Call get_content_plan to see the ids and keywords.");
      const { error: delError } = await ctx.db.from("calendar_items").delete().in("id", hit.map((r) => r.id)).eq("site_id", site.id);
      if (delError) throw new Error(delError.message);
      return textResult({ brand: { name: brand.name, domain: brand.domain }, removed: hit.map((r) => r.keyword) }, `Removed ${hit.length} piece${hit.length === 1 ? "" : "s"} from the Content Plan.`);
    },
  },
  {
    name: "add_prompts",
    title: "Track new prompts",
    description: "Start tracking new prompts for the brand under a topic. Daily checks ask every AI model these prompts. Respects the plan's prompt limit.",
    inputSchema: {
      type: "object",
      properties: {
        brand: brandArg,
        topic: { type: "string", description: "The topic to add them to. A new topic is made if none has this name." },
        prompts: { type: "array", items: { type: "string" }, description: "Questions a buyer would ask an AI, like 'best crm for small agencies'. Up to 20." },
      },
      required: ["topic", "prompts"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async run(ctx, args) {
      const brand = await pickBrand(ctx, args.brand);
      const topicName = str(args.topic, 80);
      if (!topicName) throw new ToolError("Say which topic.");
      const have = new Set(brand.prompts.map((x) => x.toLowerCase()));
      const fresh = [...new Set((Array.isArray(args.prompts) ? args.prompts : []).map((x) => str(x, 300)).filter(Boolean))].filter((x) => !have.has(x.toLowerCase())).slice(0, 20);
      if (!fresh.length) throw new ToolError("Nothing new to add. Those prompts are already tracked.");
      const e = await entitlement(ctx.ws);
      if (e.readOnly) throw new ToolError("This workspace is read-only.");
      const all = await brands(ctx);
      const used = all.reduce((n, b) => n + (b.prompts?.length ?? 0), 0);
      const room = Math.max(0, e.limits.prompts - used);
      if (!room) throw new ToolError(`The plan tracks ${e.limits.prompts} prompts and all are in use. Remove some or upgrade.`);
      const adding = fresh.slice(0, room);
      const topics = (brand.topics ?? []).filter((t) => t?.name).map((t) => ({ ...t, prompts: [...t.prompts] }));
      const t = topics.find((x) => same(x.name, topicName));
      if (t) t.prompts.push(...adding);
      else if (topics.length >= MAX_TOPICS) throw new ToolError(`A brand can have ${MAX_TOPICS} topics. Add these to one of: ${topics.map((x) => x.name).join(", ")}.`);
      else topics.push({ name: topicName, prompts: adding });
      const { error } = await ctx.db.from("brands").update({ topics, prompts: [...brand.prompts, ...adding] }).eq("id", brand.id).eq("workspace_id", ctx.ws);
      if (error) throw new Error(error.message);
      const left = fresh.length - adding.length;
      return textResult(
        { brand: { name: brand.name, domain: brand.domain }, topic: t?.name ?? topicName, added: adding, notAdded: fresh.slice(adding.length) },
        `Now tracking ${adding.length} more prompt${adding.length === 1 ? "" : "s"}. They are checked in the next daily run.${left ? ` ${left} did not fit in the plan's limit.` : ""}`,
      );
    },
  },
  // ─────────────── SEO tools (docs/site-audit.md, onpage-audit.md, backlinks.md, content-map.md, local-research.md) ───────────────
  // Read-only: saved results only, so asking never spends tasks.
  {
    name: "get_site_health",
    title: "Site health",
    description: "The brand's latest full site crawl: health score out of 100, the score of the full crawl before, pages read, AI crawlers blocked, broken links, and every issue (most serious first) with how many pages it hits and sample pages. Partial crawls have no score.",
    inputSchema: { type: "object", properties: { brand: brandArg } },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async run(ctx, args) {
      const brand = await pickBrand(ctx, args.brand);
      const { data, error } = await ctx.db.from("site_audits").select("id, status, score, pages, created_at, result").eq("brand_id", brand.id).eq("status", "done").order("created_at", { ascending: false }).limit(12);
      if (error) throw new Error(/brand_id/.test(error.message) ? "Site Audit isn't set up in this workspace yet." : error.message);
      const rows = (data ?? []) as (AuditRow & { pages: number; result: AuditResult })[];
      if (!rows.length) return textResult({ brand: { name: brand.name, domain: brand.domain }, crawl: null }, "No site crawl yet. Run one on Technical SEO, Site Audit.");
      const now = rows[0];
      const before = previousFull(rows, now);
      return textResult({
        brand: { name: brand.name, domain: brand.domain },
        crawled: now.created_at,
        score: now.result?.partial ? null : now.score,
        partial: now.result?.partial ?? null,
        score_before: before?.score ?? null,
        pages_read: now.pages,
        ai_crawlers_blocked: now.result?.blockedBots ?? [],
        broken_links: now.result?.brokenLinks?.length ?? 0,
        issues: (now.result?.issues ?? []).map((i) => ({ issue: i.title, severity: i.severity, pages: i.count, examples: i.pages.slice(0, 5), fixable_with: i.play ?? null })),
      });
    },
  },
  {
    name: "get_onpage_audits",
    title: "On-page audits",
    description: "Every page audited against Google's top 10 for its keyword: the latest score, the top 10 average, where it ranks, and for the lowest-scoring pages the checks that failed or need work, missing terms and the suggested title and description.",
    inputSchema: { type: "object", properties: { brand: brandArg } },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async run(ctx, args) {
      const brand = await pickBrand(ctx, args.brand);
      const { data, error } = await ctx.db.from("onpage_audits").select("url, keyword, score, top_score, created_at, result").eq("brand_id", brand.id).eq("status", "done").order("created_at", { ascending: false }).limit(100);
      if (error) throw new Error(/onpage_audits/.test(error.message) ? "On-page Audit isn't set up in this workspace yet." : error.message);
      const seen = new Set<string>();
      const latest = ((data ?? []) as { url: string; keyword: string; score: number; top_score: number | null; created_at: string; result: OnpageResult }[]).filter((r) => (seen.has(`${r.url}|${r.keyword}`) ? false : (seen.add(`${r.url}|${r.keyword}`), true))).sort((a, b) => a.score - b.score);
      return textResult({
        brand: { name: brand.name, domain: brand.domain },
        pages: latest.map((r, i) => ({
          url: r.url,
          keyword: r.keyword,
          score: r.score,
          top_10_average: r.top_score,
          rank: r.result?.rank ?? null,
          audited: r.created_at,
          ...(i < 5 ? { to_fix: r.result.checks.filter((c) => c.status === "fail" || c.status === "warn").map((c) => ({ check: c.label, detail: c.detail, fix_play: c.fix })), missing_terms: r.result.terms.filter((t) => !t.page).map((t) => t.term), suggested: r.result.suggest } : {}),
        })),
      });
    },
  },
  {
    name: "get_backlinks",
    title: "Backlinks",
    description: "Who links to the brand's site, from the last saved load (refreshed by an editor on Links, Backlinks): linking sites, backlinks, authority 0 to 100, spam score, new and lost linking sites by week, top anchors, most linked pages, and the link gap against its competitors with the sites its AI answers cite flagged.",
    inputSchema: { type: "object", properties: { brand: brandArg } },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async run(ctx, args) {
      const brand = await pickBrand(ctx, args.brand);
      const target = bareDomain(brand.domain);
      const overview = await savedBacklinks<Overview & { at: string }>(blKeys.overview(target));
      const rivals = gapRivals(((brand.profile as Profile | null)?.competitors ?? []).map((c) => c.domain), target);
      const raw = rivals.length ? await savedBacklinks<{ perRival: { rival: string; items: unknown[] }[]; at: string }>(blKeys.gap(target, rivals)) : undefined;
      const gap = raw?.perRival ? parseGap(raw.perRival, target, await aiCited(ctx.db, brand.id)).slice(0, 50) : null;
      if (!overview && !gap) return textResult({ brand: { name: brand.name, domain: brand.domain }, backlinks: null }, "Backlinks haven't been loaded for this brand in the last 7 days. An editor loads them on Technical SEO, Backlinks.");
      return textResult({ brand: { name: brand.name, domain: brand.domain }, updated: overview?.at ?? null, summary: overview?.summary ?? null, weeks: overview?.weeks ?? [], anchors: overview?.anchors.slice(0, 10) ?? [], most_linked_pages: overview?.pages.slice(0, 5) ?? [], rivals, link_gap: gap });
    },
  },
  {
    name: "get_content_map",
    title: "Content Map",
    description: "The brand's latest Content Map: topics grouped into pillars, each covered (a page ranks top 20), missing (competitors rank top 10 and the brand doesn't, or planned and not started), in progress, or two pages competing; with searches, visits, competitors, whether it's planned, whether AI names the brand for it, and whether the pillar's main page links to it.",
    inputSchema: { type: "object", properties: { brand: brandArg } },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async run(ctx, args) {
      const brand = await pickBrand(ctx, args.brand);
      const { data } = await ctx.db.from("content_maps").select("result, created_at").eq("brand_id", brand.id).eq("status", "done").order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!data?.result) return textResult({ brand: { name: brand.name, domain: brand.domain }, map: null }, "No content map yet. An editor builds it on Content, Content Map.");
      const m = data.result as ContentMap;
      return textResult({
        brand: { name: brand.name, domain: brand.domain },
        built: data.created_at,
        stats: mapStats(m.topics),
        rivals: m.rivals,
        pillars: m.pillars.map((p) => ({ name: p.name, main_page: p.hub, topics: m.topics.filter((t) => t.pillar === p.name).map((t) => ({ topic: t.name, status: t.status, searches: t.volume, visits: t.traffic, pages: t.urls, rivals: t.rivals, planned: t.planned, ai_names_brand: t.ai, linked_from_main_page: t.linked })) })),
      });
    },
  },
  {
    name: "get_local_research",
    title: "Local Research",
    description: "The brand's Google Maps rankings for each of its locations: the business, and for each tracked keyword the latest grid scan (its size and spacing): average rank (not found counts as 21), points in the top 3 and top 20, rating and reviews, the local competitors holding the top 3, and the listing check (name, phone, address, LocalBusiness schema, category against competitors).",
    inputSchema: { type: "object", properties: { brand: brandArg } },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async run(ctx, args) {
      const brand = await pickBrand(ctx, args.brand);
      const { data: rows } = await ctx.db.from("local_locations").select("id, data").eq("brand_id", brand.id).order("position");
      const locs = ((rows ?? []) as { id: string; data: Location }[]).map((r) => ({ ...r.data, id: r.id }));
      const legacy = (brand.profile as Profile | null)?.location;
      if (!locs.length && legacy) locs.push({ ...legacy, id: "" });
      if (!locs.length) return textResult({ brand: { name: brand.name, domain: brand.domain }, locations: [] }, "No business location yet. An editor adds it on Organic Research, Local Research.");
      const { data } = await ctx.db.from("local_scans").select("location_id, keyword, created_at, result").eq("brand_id", brand.id).eq("status", "done").order("created_at", { ascending: false }).limit(200);
      const latest = new Map<string, { created_at: string; result: ScanResult & { listing?: unknown } }>();
      for (const r of (data ?? []) as { location_id: string | null; keyword: string; created_at: string; result: ScanResult & { listing?: unknown } }[]) {
        const k = `${r.location_id ?? ""}|${r.keyword}`;
        if (!latest.has(k)) latest.set(k, r);
      }
      return textResult({
        brand: { name: brand.name, domain: brand.domain },
        locations: locs.map((loc) => ({
          name: loc.name ?? loc.city ?? loc.title,
          business: { name: loc.title, address: loc.address, category: loc.category, phone: loc.phone },
          keywords: loc.keywords,
          schedule: scheduleOf(loc),
          grid: { size: loc.size ?? 7, shape: loc.shape ?? "square", spacing_miles: loc.spacing, moved_center: Boolean(loc.center) },
          scans: loc.keywords
            .map((k) => [k, latest.get(`${loc.id}|${k}`) ?? (locs.length === 1 ? latest.get(`|${k}`) : undefined)] as const)
            .filter((x): x is readonly [string, { created_at: string; result: ScanResult & { listing?: unknown } }] => Boolean(x[1]))
            .map(([k, r]) => ({ keyword: k, scanned: r.created_at, grid: `${r.result.size} x ${r.result.size}`, average_rank: r.result.avg, top3_points: r.result.top3, top20_points: r.result.found, points_read: r.result.read, you: r.result.you, rivals: r.result.rivals.slice(0, 5), listing: r.result.listing ?? null })),
        })),
      });
    },
  },
];

async function siteOf(ctx: Ctx, brand: Brand) {
  const { data } = await ctx.db.from("sites").select("id, domain, profile").eq("brand_id", brand.id).eq("workspace_id", ctx.ws).maybeSingle();
  if (!data) throw new ToolError(`${brand.name} has no Content Plan or Topic Bank yet. Open Content Plan in the app once to set it up.`);
  return data as { id: string; domain: string; profile: Brand["profile"] | null };
}

/** Ready-made asks people can pick in their AI app. */
export const PROMPTS = [
  {
    name: "weekly_ai_visibility_report",
    title: "Weekly AI visibility report",
    description: "A short client-ready summary of how AI answers talked about the brand this week.",
    arguments: [{ name: "brand", description: "Brand name or domain", required: false }],
    text: (a: Record<string, string>) =>
      `Write a weekly AI visibility report for ${a.brand || "my brand"}. Use get_ai_visibility with days 7, then get_competitors and get_prompts for the same week. Lead with the one number that matters, then what went up, what went down and why, the competitor to watch, and 3 actions for next week. Plain language, short paragraphs.`,
  },
  {
    name: "find_content_gaps",
    title: "Find content gaps",
    description: "Prompts where competitors get named and the brand does not, turned into pieces for the Content Plan.",
    arguments: [{ name: "brand", description: "Brand name or domain", required: false }],
    text: (a: Record<string, string>) =>
      `Find content gaps for ${a.brand || "my brand"}. Use get_prompts to find prompts where the brand is not named, get_prompt_answers on the worst ones to see who wins and which sites get cited, and get_cited_sources for the sites to target. Suggest pages to write. Ask me before you call add_to_content_plan.`,
  },
  {
    name: "competitor_deep_dive",
    title: "Competitor deep dive",
    description: "Why one competitor wins in AI answers, and how to beat it.",
    arguments: [
      { name: "competitor", description: "The competitor's name", required: true },
      { name: "brand", description: "Your brand name or domain", required: false },
    ],
    text: (a: Record<string, string>) =>
      `Do a deep dive on ${a.competitor} against ${a.brand || "my brand"} in AI answers. Use get_competitors (overall and per topic), get_prompts, and get_prompt_answers on prompts where ${a.competitor} beats us. Explain what AI says about them, which sites it cites for them, and a plan to win those prompts.`,
  },
];
