import "server-only";
import * as cheerio from "cheerio";
import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { askJson } from "./claude";
import { aiNamed, buildTopics, hubOf, linkedFrom, pillarsFrom, type ContentMap, type PlanItem } from "./contentMap";
import type { Profile } from "./db";
import { enqueue, queueReady } from "./jobs";
import { research, Spend } from "./keywords";
import { bare } from "./linkBuilding";
import { marketOf } from "./research";
import { safeFetch } from "./safeFetch";

// Content Map builds (docs/content-map.md), on the worker (job kind "content_map"). Reads what the brand ranks for and
// what up to 2 rivals rank for (DataForSEO Labs), the Content Plan, and the brand's AI answers; groups topics into
// pillars with one Claude call; and checks each pillar's main page for links to its topics. A failed build hands its
// tasks back.

const BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
type Charge = { period: string; plan: number; pack: number };

export async function startMap(db: SupabaseClient, ws: string, userId: string, brandId: string, charge: Charge | null) {
  const { data, error } = await db.from("content_maps").insert({ workspace_id: ws, brand_id: brandId, created_by: userId, charge }).select("id").single();
  if (error || !data) throw new Error(/content_maps/.test(error?.message ?? "") ? "Run supabase/065_content_map.sql with psql on the VPS database." : (error?.message ?? "Could not start."));
  if (await queueReady()) await enqueue("content_map", { mapId: data.id }, { workspaceId: ws, key: `content_map:${data.id}`, maxAttempts: 1 });
  else after(() => runMap(db, data.id));
  return data.id as string;
}

const PILLARS = {
  type: "object",
  properties: { pillars: { type: "array", items: { type: "object", properties: { name: { type: "string" }, topics: { type: "array", items: { type: "string" } } }, required: ["name", "topics"], additionalProperties: false } } },
  required: ["pillars"],
  additionalProperties: false,
};

/** Every absolute link on a page. */
function hrefsOf(html: string, base: string): string[] {
  const $ = cheerio.load(html.slice(0, 3_000_000));
  const out: string[] = [];
  $("a[href]").each((_, a) => {
    try {
      out.push(new URL(($(a).attr("href") ?? "").trim(), base).toString());
    } catch {
      // not a link
    }
  });
  return out;
}

export async function runMap(db: SupabaseClient, mapId: string) {
  const { data: row } = await db.from("content_maps").select("id, workspace_id, brand_id, status, charge").eq("id", mapId).maybeSingle();
  if (!row || row.status !== "running") return;
  const step = (s: string) => db.from("content_maps").update({ step: s }).eq("id", mapId);
  try {
    const { data: b } = await db.from("brands").select("id, name, domain, profile").eq("id", row.brand_id).maybeSingle();
    if (!b) throw new Error("Brand not found.");
    const profile = (b.profile ?? {}) as Profile;
    const m = marketOf(profile.country);
    const domain = bare(String(b.domain));
    const rivals = (profile.competitors ?? []).map((c) => bare(c.domain)).filter((d) => d && d !== domain).slice(0, 2);

    await step("Reading what you and your competitors rank for");
    const spend = new Spend();
    const [mine, ...theirs] = await Promise.all([research("ranked", domain, m, spend, 300), ...rivals.map((r) => research("ranked", r, m, spend, 200).catch(() => []))]);

    const { data: site } = await db.from("sites").select("id").eq("brand_id", b.id).maybeSingle();
    const { data: items } = site ? await db.from("calendar_items").select("keyword, status, url, volume").eq("site_id", site.id).limit(500) : { data: [] };
    const topics = buildTopics(mine, rivals.map((r, i) => ({ rival: r, kws: theirs[i] ?? [] })), (items ?? []) as PlanItem[]);
    if (!topics.length) throw new Error(`Google shows no rankings for ${domain} or its competitors yet, and the Content Plan is empty.`);

    await step("Grouping topics");
    let claude: { pillars?: { name?: unknown; topics?: unknown }[] } | null = null;
    if (process.env.ANTHROPIC_API_KEY) {
      claude = await askJson<{ pillars: { name: string; topics: string[] }[] }>(
        `Group these website topics for ${b.name} (${domain}) into 3 to 8 pillars: broad subjects a reader would browse. Every topic id goes in exactly one pillar. Pillar names are 1 to 3 plain words.

${topics.map((t) => `${t.id}: ${t.name}`).join("\n")}

Return JSON: {"pillars": [{"name": "...", "topics": ["t1", "t2"]}]}`,
        PILLARS,
        { maxTokens: 1500, effort: "low" },
      ).catch(() => null);
    }
    const pillarOf = pillarsFrom(topics, claude);
    for (const t of topics) t.pillar = pillarOf.get(t.id) ?? "Other";

    // AI: prompts of the last 30 days, and whether each answer named the brand.
    const since = new Date(Date.now() - 30 * 864e5).toISOString();
    const { data: runs } = await db.from("runs").select("chats").eq("brand_id", b.id).gte("at", since).limit(300);
    const prompts = ((runs ?? []) as { chats: { prompt: string; brands?: { name: string }[] }[] }[]).flatMap((r) => (r.chats ?? []).map((c) => ({ prompt: c.prompt, named: (c.brands ?? []).some((x) => x.name.toLowerCase() === String(b.name).toLowerCase()) })));
    for (const t of topics) t.ai = aiNamed(t, prompts);

    await step("Checking links from each pillar's main page");
    const names = [...new Set(topics.map((t) => t.pillar))];
    const pillars: ContentMap["pillars"] = [];
    for (const name of names) {
      const hub = hubOf(topics, name);
      pillars.push({ name, hub: hub?.urls[0] ?? null });
      if (!hub) continue;
      const page = await safeFetch(hub.urls[0], { ua: BROWSER, timeout: 12_000, maxBytes: 3_000_000, accept: "text/html" });
      if (!page.ok) continue; // unchecked stays null: a page that didn't load says nothing about its links
      const others = topics.filter((t) => t.pillar === name && t.id !== hub.id && t.urls.length);
      const linked = linkedFrom(hrefsOf(page.body, page.url), others.flatMap((t) => t.urls));
      for (const t of others) t.linked = t.urls.some((u) => linked.has(u));
    }

    const result: ContentMap = { pillars: pillars.sort((a, x) => topics.filter((t) => t.pillar === x.name).length - topics.filter((t) => t.pillar === a.name).length), topics, rivals, at: new Date().toISOString() };
    const { error } = await db.from("content_maps").update({ status: "done", step: "Done", result, error: null, finished_at: new Date().toISOString() }).eq("id", mapId);
    if (error) throw new Error(error.message);
  } catch (e) {
    await db.from("content_maps").update({ status: "failed", error: e instanceof Error ? e.message : String(e), charge: null, finished_at: new Date().toISOString() }).eq("id", mapId);
    const c = row.charge as Charge | null;
    if (c) await db.rpc("give_back_tasks", { p_ws: row.workspace_id, p_period: c.period, p_plan_n: c.plan, p_pack_n: c.pack }).then(({ error }) => error && console.error("Content map refund failed:", error.message));
  }
}
