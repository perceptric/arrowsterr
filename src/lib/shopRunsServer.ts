import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { gzipSync } from "node:zlib";
import { askJson } from "./claude";
import { getRaw, postRaw, type DfsEngine } from "./dataforseo";
import { entitlement } from "./entitlements";
import { dispatch, slackSend } from "./integrations";
import { alertTarget } from "./integrationTypes";
import { enqueue, enqueueMany, finish, rateOk, type Job } from "./jobs";
import { answerSources, readCards, type ShopEngine } from "./shopParse";
import { changed, priceFlags, reasonOk, rollup, storeName, total, type RunInput } from "./shopNumbers";

// AI Shopping, phase 4 on the server (docs/ai-shopping-plan.md, sections 4, 6, 7, 8): shopping prompts run twice a
// day on ChatGPT and AI Mode through DataForSEO's standard queue; their cards are matched (shopMatchServer.ts),
// checked for prices, rolled up into shop_daily, and alerts go out.

const say = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);
const DAY_MS = 86_400_000;
const today = () => new Date().toISOString().slice(0, 10);
const ENGINES: ShopEngine[] = ["gpt", "aim"];
const DFS: Record<ShopEngine, DfsEngine> = { gpt: "ChatGPT", aim: "AI Mode" };
export const MAX_PROMPTS = 40;
export const SAMPLES_A_DAY = 2;
export const DEEP_RUNS = 20;
const GIVE_UP_MS = 3 * 60 * 60_000;

const seed = (id: string) => [...id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 100003, 7);
/** The minutes of the day (UTC) a brand's two daily runs start: 12 hours apart, spread over the day by brand. */
export const sampleMinutes = (brandId: string) => {
  const first = seed(`shop:${brandId}`) % 720;
  return [first, first + 720];
};

// ─────────────── Scheduling ───────────────

/** Every tick: start the daily samples that are due, and collect finished runs. */
export async function queueShopRuns(db: SupabaseClient) {
  const { data: brands, error } = await db.from("brands").select("id, workspace_id, shop_mode, shop_on").or("shop_mode.eq.on,and(shop_mode.eq.auto,shop_on.eq.true)");
  if (error) return; // before the migration
  const now = new Date();
  const minute = now.getUTCHours() * 60 + now.getUTCMinutes();
  const day = today();
  const rows: Parameters<typeof enqueueMany>[0] = [];
  for (const b of brands ?? []) {
    sampleMinutes(b.id as string).forEach((m, i) => {
      if (minute >= m) rows.push({ kind: "shop_runs_post", workspace_id: b.workspace_id as string, key: `shop_runs_post:${b.id}:${day}:${i + 1}`, payload: { brandId: b.id, day, sample: i + 1 } });
    });
  }
  const slot = now.toISOString().slice(0, 15);
  rows.push({ kind: "shop_runs_collect", key: `shop_runs_collect:${slot}`, payload: {} });
  await enqueueMany(rows);
}

// ─────────────── shop_runs_post ───────────────

/** Post the brand's runs: today's sample for every active prompt and engine, plus any run not yet posted. */
export async function shopRunsPostJob(db: SupabaseClient, job: Job) {
  const p = job.payload as { brandId: string; day?: string; sample?: number };
  const { data: brand } = await db.from("brands").select("id, workspace_id").eq("id", p.brandId).maybeSingle();
  if (!brand) return finish(job.id);
  const e = await entitlement(brand.workspace_id as string);
  if (e.readOnly) return finish(job.id);
  if (p.day && p.sample) {
    const { data: prompts } = await db.from("shop_prompts").select("id").eq("brand_id", p.brandId).eq("active", true).order("created_at").limit(MAX_PROMPTS);
    const rows = (prompts ?? []).flatMap((q) => ENGINES.map((engine) => ({ workspace_id: brand.workspace_id, brand_id: p.brandId, prompt_id: q.id, engine, day: p.day, kind: "daily", sample: p.sample })));
    if (rows.length) {
      const { error } = await db.from("shop_runs").upsert(rows, { onConflict: "prompt_id,engine,day,kind,sample", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    }
  }
  await postNew(db, p.brandId);
  await finish(job.id);
}

/** Post every run of the brand still waiting to be posted, up to 400 at a time. */
export async function postNew(db: SupabaseClient, brandId: string) {
  const { data: runs } = await db.from("shop_runs").select("id, engine, prompt_id").eq("brand_id", brandId).eq("status", "new").limit(400);
  if (!runs?.length) return;
  const ids = [...new Set(runs.map((r) => r.prompt_id as string))];
  const { data: prompts } = await db.from("shop_prompts").select("id, prompt").in("id", ids);
  const text = new Map((prompts ?? []).map((q) => [q.id as string, q.prompt as string]));
  for (const r of runs) {
    const q = text.get(r.prompt_id as string);
    if (!q) continue;
    if (!(await rateOk("dataforseo"))) break;
    try {
      const id = await postRaw(DFS[r.engine as ShopEngine], q);
      await db.from("shop_runs").update(id ? { task_id: id, status: "posted", posted_at: new Date().toISOString() } : { status: "failed", error: "DataForSEO did not accept the task." }).eq("id", r.id);
    } catch (e) {
      console.error("AI Shopping run not posted:", say(e)); // stays new; the next post tries again
    }
  }
}

// ─────────────── shop_runs_collect ───────────────

/** Collect finished runs, save their raw answer and cards, then match the brands that got new cards. */
export async function shopRunsCollectJob(db: SupabaseClient, job: Job) {
  const before = new Date(Date.now() - 4 * 60_000).toISOString();
  const { data: runs, error } = await db.from("shop_runs").select("id, workspace_id, brand_id, prompt_id, engine, day, task_id, posted_at").eq("status", "posted").lt("posted_at", before).order("posted_at").limit(300);
  if (error || !runs?.length) return finish(job.id);
  const ids = [...new Set(runs.map((r) => r.prompt_id as string))];
  const { data: prompts } = await db.from("shop_prompts").select("id, prompt").in("id", ids);
  const text = new Map((prompts ?? []).map((q) => [q.id as string, q.prompt as string]));
  const touched = new Map<string, string>();
  for (const r of runs) {
    if (!(await rateOk("dataforseo"))) break;
    try {
      const t = await getRaw(DFS[r.engine as ShopEngine], r.task_id as string);
      if (t.state === "waiting") {
        if (Date.now() - Date.parse(r.posted_at as string) > GIVE_UP_MS) await db.from("shop_runs").update({ status: "failed", error: "DataForSEO took too long.", done_at: new Date().toISOString() }).eq("id", r.id);
        continue;
      }
      if (t.state === "failed") {
        await db.from("shop_runs").update({ status: "failed", error: t.error.slice(0, 300), done_at: new Date().toISOString() }).eq("id", r.id);
        continue;
      }
      const engine = r.engine as ShopEngine;
      const cards = readCards(engine, t.result).cards;
      const sources = answerSources(engine, t.result).slice(0, 30);
      if (cards.length) {
        const rows = cards.map((c) => ({
          workspace_id: r.workspace_id,
          brand_id: r.brand_id,
          run_id: r.id,
          source_key: String(r.id),
          day: r.day,
          engine,
          prompt: (text.get(r.prompt_id as string) ?? "").slice(0, 500),
          block: c.block,
          position: c.position,
          title: c.title.slice(0, 500),
          seller: c.seller,
          domain: c.domain,
          url: c.url,
          price: c.price,
          regular: c.regular,
          currency: c.currency,
          gid: c.gid,
          ext_id: c.productId,
          image: c.image,
          name_only: c.nameOnly,
          store: storeName(c.seller, c.domain),
          text: c.text?.slice(0, 1500) ?? null,
          links: c.links.slice(0, 10),
        }));
        const res = await db.from("shop_cards").upsert(rows, { onConflict: "brand_id,day,engine,prompt,block,position,source_key", ignoreDuplicates: true });
        if (res.error) throw new Error(res.error.message);
      }
      const raw = gzipSync(Buffer.from(JSON.stringify(t.result ?? null))).toString("base64");
      await db.from("shop_runs").update({ status: "done", cards: cards.length, sources, raw_gz: raw, done_at: new Date().toISOString() }).eq("id", r.id);
      touched.set(r.brand_id as string, r.workspace_id as string);
    } catch (e) {
      console.error("AI Shopping run not collected:", say(e)); // stays posted; the next collect tries again
    }
  }
  const slot = new Date().toISOString().slice(0, 15);
  for (const [brandId, ws] of touched) await enqueue("shop_match", { brandId }, { workspaceId: ws, key: `shop_match:${brandId}:${slot}` });
  // Raw answers older than 30 days are dropped; the cards and numbers stay.
  await db.from("shop_runs").update({ raw_gz: null }).lt("day", new Date(Date.now() - 30 * DAY_MS).toISOString().slice(0, 10)).not("raw_gz", "is", null);
  await finish(job.id);
}

// ─────────────── Prices and the daily numbers ───────────────

type Brand = { id: string; workspace_id: string; name: string; domain: string; shop_aliases: string[] | null; shop_retailers: string[] | null; shop_floor: number | null };
const lower = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/** Store flags for a brand's cards of some days: own store, retailer, reseller and the price checks of section 7. */
export async function flagCards(db: SupabaseClient, brand: Brand, days: string[]) {
  if (!days.length) return;
  const own = new Set([brand.name, ...(brand.shop_aliases ?? [])].map(lower));
  const retailers = new Set((brand.shop_retailers ?? []).map(lower));
  const host = lower(brand.domain).replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  const { data: cards } = await db.from("shop_cards").select("id, day, store, domain, url, price, currency, verdict, product_id, own, flags").eq("brand_id", brand.id).in("day", days).not("run_id", "is", null).limit(20_000);
  if (!cards?.length) return;
  const productIds = [...new Set(cards.map((c) => c.product_id as string | null).filter(Boolean))] as string[];
  const prices = new Map<string, { min: number | null; max: number | null; currency: string | null; stock: boolean | null }>();
  for (let i = 0; i < productIds.length; i += 200) {
    const chunk = productIds.slice(i, i + 200);
    const { data: daily } = await db.from("shop_catalog_prices").select("product_id, day, price_min, price_max, currency, in_stock").in("product_id", chunk).in("day", days);
    for (const d of daily ?? []) prices.set(`${d.product_id}|${d.day}`, { min: d.price_min === null ? null : Number(d.price_min), max: d.price_max === null ? null : Number(d.price_max), currency: d.currency as string | null, stock: d.in_stock as boolean | null });
    // A day without a saved price uses today's catalog price.
    const { data: now } = await db.from("shop_catalog").select("id, price_min, price_max, currency, in_stock").in("id", chunk);
    for (const c of now ?? []) prices.set(`${c.id}|now`, { min: c.price_min === null ? null : Number(c.price_min), max: c.price_max === null ? null : Number(c.price_max), currency: c.currency as string | null, stock: c.in_stock as boolean | null });
  }
  const updates: { id: number; own: boolean; flags: string[] }[] = [];
  for (const c of cards) {
    const cardHost = lower((c.domain as string | null) || "").replace(/^www\./, "");
    const isOwn = own.has(lower(c.store as string | null)) || Boolean(host && cardHost && (cardHost === host || cardHost.endsWith(`.${host}`)));
    const isRetailer = isOwn || retailers.has(lower(c.store as string | null));
    let flags: string[] = [];
    if (c.verdict === "matched" && c.product_id) {
      const pr = prices.get(`${c.product_id}|${c.day}`) ?? prices.get(`${c.product_id}|now`);
      flags = priceFlags({ price: c.price === null ? null : Number(c.price), currency: c.currency as string | null, own: isOwn, retailer: isRetailer, retailersSet: retailers.size > 0, catalogMin: pr?.min ?? null, catalogMax: pr?.max ?? null, catalogCurrency: pr?.currency ?? null, inStock: pr?.stock ?? null, floorPct: brand.shop_floor === null ? null : Number(brand.shop_floor) });
    } else if (c.store && c.verdict && c.verdict !== "other" && !isRetailer && retailers.size) flags = ["reseller"];
    const before = (c.flags as string[]) ?? [];
    if (isOwn !== c.own || flags.join() !== before.join()) updates.push({ id: c.id as number, own: isOwn, flags });
  }
  for (const u of updates) await db.from("shop_cards").update({ own: u.own, flags: u.flags }).eq("id", u.id);
}

/** Rebuild shop_daily for some days from the daily runs and their matched cards. */
export async function rollupDays(db: SupabaseClient, brand: Brand, days: string[]) {
  for (const day of days) {
    const { data: runs } = await db.from("shop_runs").select("id, prompt_id, engine, sources").eq("brand_id", brand.id).eq("day", day).eq("kind", "daily").eq("status", "done");
    if (!runs?.length) continue;
    const { data: cards } = await db.from("shop_cards").select("run_id, block, position, verdict, product_id, rival, store, own, flags, links").eq("brand_id", brand.id).eq("day", day).not("run_id", "is", null).limit(20_000);
    const byRun = new Map<number, typeof cards>();
    for (const c of cards ?? []) byRun.set(c.run_id as number, [...(byRun.get(c.run_id as number) ?? []), c]);
    const input: RunInput[] = runs.map((r) => ({
      day,
      engine: r.engine as string,
      promptId: r.prompt_id as string,
      sources: (r.sources as string[]) ?? [],
      cards: (byRun.get(r.id as number) ?? []).map((c) => ({ block: c.block as number, position: c.position as number, verdict: c.verdict as RunInput["cards"][number]["verdict"], productId: c.product_id as string | null, rival: c.rival as string | null, store: c.store as string | null, own: Boolean(c.own), flags: (c.flags as string[]) ?? [], links: (c.links as string[]) ?? [] })),
    }));
    const rows = rollup(input).map((r) => ({ ...r, brand_id: brand.id, workspace_id: brand.workspace_id }));
    await db.from("shop_daily").delete().eq("brand_id", brand.id).eq("day", day);
    if (rows.length) {
      const { error } = await db.from("shop_daily").insert(rows);
      if (error) throw new Error(error.message);
    }
  }
}

/** After matching: flags, the daily numbers, reasons and alerts for the days that got new run cards. */
export async function afterMatch(db: SupabaseClient, brandId: string, days: string[]) {
  if (!days.length) return;
  const { data } = await db.from("brands").select("id, workspace_id, name, domain, shop_aliases, shop_retailers, shop_floor").eq("id", brandId).maybeSingle();
  if (!data) return;
  const brand = data as Brand;
  await flagCards(db, brand, days);
  await rollupDays(db, brand, days);
  await refreshReasons(db, brand).catch((e) => console.error("AI Shopping reasons:", say(e)));
  await shopAlerts(db, brand, days.sort().at(-1)!).catch((e) => console.error("AI Shopping alerts:", say(e)));
}

// ─────────────── Reasons (section 8) ───────────────

const REASON_SCHEMA = { type: "object", properties: { reasons: { type: "array", items: { type: "object", properties: { i: { type: "integer" }, reason: { type: "string" } }, required: ["i", "reason"], additionalProperties: false } } }, required: ["reasons"], additionalProperties: false };

/** One line per product on why AI picks it, made only of words from the AI's own text. Up to 10 products a run. */
async function refreshReasons(db: SupabaseClient, brand: Brand) {
  const since = new Date(Date.now() - 14 * DAY_MS).toISOString().slice(0, 10);
  const { data: cards } = await db.from("shop_cards").select("product_id, text").eq("brand_id", brand.id).eq("verdict", "matched").not("text", "is", null).gte("day", since).order("id", { ascending: false }).limit(500);
  const latest = new Map<string, string>();
  for (const c of cards ?? []) if (c.product_id && !latest.has(c.product_id as string)) latest.set(c.product_id as string, c.text as string);
  if (!latest.size) return;
  const { data: have } = await db.from("shop_reasons").select("product_id, at").in("product_id", [...latest.keys()]);
  const fresh = new Set((have ?? []).filter((h) => Date.parse(h.at as string) > Date.now() - 14 * DAY_MS).map((h) => h.product_id as string));
  const todo = [...latest.entries()].filter(([id]) => !fresh.has(id)).slice(0, 10);
  if (!todo.length || !(await rateOk("anthropic"))) return;
  const list = todo.map(([, t], i) => `${i}. ${t.replace(/\s+/g, " ").slice(0, 600)}`).join("\n");
  const r = await askJson<{ reasons: { i: number; reason: string }[] }>(
    `Each line is what an AI shopping answer said about one product. For each, write why the AI recommends it in one line of at most 12 words, using only words that appear in that line. No price.\n\n${list}`,
    REASON_SCHEMA,
    { model: process.env.SHOP_MODEL || "claude-haiku-5-5", maxTokens: 1200, effort: "low" },
  );
  const rows = (r.reasons ?? []).filter((x) => todo[x.i] && reasonOk(x.reason, todo[x.i][1])).map((x) => ({ product_id: todo[x.i][0], brand_id: brand.id, reason: x.reason.trim(), at: new Date().toISOString() }));
  if (rows.length) await db.from("shop_reasons").upsert(rows, { onConflict: "product_id" });
}

// ─────────────── Alerts ───────────────

/** Wrong prices on your own store, resellers, and a real drop in product share: each sent once, to Slack and webhooks. */
async function shopAlerts(db: SupabaseClient, brand: Brand, day: string) {
  const e = await entitlement(brand.workspace_id);
  if (!e.limits.alerts) return;
  const reasons: { key: string; text: string }[] = [];
  const { data: flagged } = await db.from("shop_cards").select("flags, store, price, product_id, model, engine").eq("brand_id", brand.id).eq("day", day).not("run_id", "is", null).overlaps("flags", ["own_price", "below_floor", "out_of_stock", "reseller"]).limit(200);
  const seen = new Set<string>();
  for (const c of flagged ?? []) {
    for (const f of (c.flags as string[]) ?? []) {
      const k = `${f}:${c.product_id ?? c.store}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const where = c.engine === "gpt" ? "ChatGPT" : "Google AI Mode";
      if (f === "own_price") reasons.push({ key: `${day}:${k}`, text: `${c.model ?? "A product"} shows $${c.price} from your store on ${where}, not your catalog price` });
      if (f === "below_floor") reasons.push({ key: `${day}:${k}`, text: `${c.model ?? "A product"} shows $${c.price} from ${c.store} on ${where}, under your price floor` });
      if (f === "out_of_stock") reasons.push({ key: `${day}:${k}`, text: `${c.model ?? "A product"} is out of stock but shows on ${where}` });
      if (f === "reseller") reasons.push({ key: `week:${day.slice(0, 7)}:${k}`, text: `${c.store} sells your products on ${where} and isn't on your retailer list` });
    }
  }
  // A real drop: this week against last week, by the two-proportion test.
  const from = new Date(Date.parse(`${day}T00:00:00Z`) - 13 * DAY_MS).toISOString().slice(0, 10);
  const { data: rows } = await db.from("shop_daily").select("day, engine, prompt_id, runs, card_runs, cards, stats").eq("brand_id", brand.id).gte("day", from).lte("day", day);
  const split = new Date(Date.parse(`${day}T00:00:00Z`) - 6 * DAY_MS).toISOString().slice(0, 10);
  const a = total(((rows ?? []) as never[]).filter((r: { day: string }) => r.day < split));
  const b = total(((rows ?? []) as never[]).filter((r: { day: string }) => r.day >= split));
  const c = changed(a.you.runs, a.cardRuns, b.you.runs, b.cardRuns);
  if (c.real && c.z < 0) reasons.push({ key: `drop:${split}`, text: `Product share fell from ${Math.round((a.you.runs / a.cardRuns) * 100)}% to ${Math.round((b.you.runs / b.cardRuns) * 100)}% this week` });
  if (!reasons.length) return;

  const { data: sent } = await db.from("shop_alerts_sent").select("key").eq("brand_id", brand.id).in("key", reasons.map((r) => r.key));
  const done = new Set((sent ?? []).map((s) => s.key as string));
  const fresh = reasons.filter((r) => !done.has(r.key)).slice(0, 8);
  if (!fresh.length) return;
  await db.from("shop_alerts_sent").upsert(fresh.map((r) => ({ brand_id: brand.id, key: r.key })), { onConflict: "brand_id,key", ignoreDuplicates: true });
  await dispatch(db, brand.workspace_id, "shopping.alert", { brand: { id: brand.id, name: brand.name, domain: brand.domain }, day, reasons: fresh.map((r) => r.text) });
  const [{ data: cfg }, { data: own }] = await Promise.all([
    db.from("integrations").select("slack_webhook, alert_points").eq("workspace_id", brand.workspace_id).maybeSingle(),
    db.from("brand_settings").select("slack_channel, alert_points").eq("brand_id", brand.id).maybeSingle(),
  ]);
  const { slack } = alertTarget(own, cfg);
  if (slack) await slackSend(slack, `${brand.name}: AI Shopping`, fresh.map((r) => r.text)).catch((err) => console.error("Slack alert failed:", say(err)));
}

// ─────────────── Prompts (section 4.1) ───────────────

const SUGGEST_SCHEMA = { type: "object", properties: { prompts: { type: "array", items: { type: "object", properties: { prompt: { type: "string" }, category: { type: "string" } }, required: ["prompt", "category"], additionalProperties: false } } }, required: ["prompts"], additionalProperties: false };
const stem = (w: string) => w.replace(/(ing|ers|er|es|s)$/, "");
/** Two prompts are the same when their words match after dropping endings and sorting. */
export const promptKey = (q: string) => [...new Set(q.toLowerCase().replace(/[^a-z0-9$ ]/g, " ").split(/\s+/).filter((w) => w && !["the", "a", "an", "for", "of", "to", "in", "and"].includes(w)).map(stem))].sort().join(" ");

/** Up to 40 shopping questions from the catalog's categories and products, with buyer words. Duplicates merged. */
export async function suggestPrompts(db: SupabaseClient, brandId: string): Promise<{ prompt: string; category: string }[]> {
  const { data: brand } = await db.from("brands").select("name").eq("id", brandId).maybeSingle();
  const { data: products } = await db.from("shop_catalog").select("title, product_type, price_min").eq("brand_id", brandId).limit(400);
  const { data: existing } = await db.from("shop_prompts").select("prompt").eq("brand_id", brandId);
  if (!products?.length) return [];
  const types = [...new Set(products.map((p) => p.product_type as string | null).filter(Boolean))].slice(0, 20);
  const sample = products.slice(0, 40).map((p) => `${p.title}${p.price_min ? ` ($${p.price_min})` : ""}`).join("; ");
  const r = await askJson<{ prompts: { prompt: string; category: string }[] }>(
    `Write 40 questions shoppers ask ChatGPT or Google when they want to buy products like these. Mix "best <category>", "best <category> under $<price>", "<category> for <use or person>", and "<product> vs <competitor>" for well-known competitors. Never name ${brand?.name ?? "the brand"} in a question. Give each a short category.\n\nCategories: ${types.join(", ") || "unknown"}\nProducts: ${sample}`,
    SUGGEST_SCHEMA,
    { model: process.env.SHOP_MODEL || "claude-haiku-5-5", maxTokens: 3000, effort: "low" },
  );
  const seen = new Set((existing ?? []).map((e) => promptKey(e.prompt as string)));
  const out: { prompt: string; category: string }[] = [];
  for (const q of r.prompts ?? []) {
    const k = promptKey(q.prompt);
    if (!k || seen.has(k) || q.prompt.length > 200) continue;
    seen.add(k);
    out.push({ prompt: q.prompt.trim(), category: q.category.trim().slice(0, 60) });
  }
  return out.slice(0, MAX_PROMPTS);
}

/** A deep check: 20 runs of one prompt on one engine, at once. */
export async function deepCheck(db: SupabaseClient, brandId: string, workspaceId: string, promptId: string, engine: ShopEngine) {
  const day = today();
  const { data: last } = await db.from("shop_runs").select("sample").eq("prompt_id", promptId).eq("engine", engine).eq("day", day).eq("kind", "deep").order("sample", { ascending: false }).limit(1);
  const start = Number(last?.[0]?.sample ?? 0);
  const rows = Array.from({ length: DEEP_RUNS }, (_, i) => ({ workspace_id: workspaceId, brand_id: brandId, prompt_id: promptId, engine, day, kind: "deep", sample: start + i + 1 }));
  const { error } = await db.from("shop_runs").insert(rows);
  if (error) throw new Error(error.message);
  await enqueue("shop_runs_post", { brandId }, { workspaceId, key: `shop_runs_post:deep:${brandId}:${Date.now()}` });
}

