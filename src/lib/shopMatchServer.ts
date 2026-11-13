import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { askJson } from "./claude";
import { call, type DfsAnswer } from "./dataforseo";
import { enqueue, finish, rateOk, retry, type Job } from "./jobs";
import { safeFetch } from "./safeFetch";
import { gtin14 } from "./shopCatalog";
import { shopOn, type ShopMode } from "./shopDetect";
import { afterMatch } from "./shopRunsServer";
import { buildIndex, dhash, hamming, idKeys, lookupMatch, matchCard, nameInTitle, pictureNudge, rivalDictionary, rivalName, type LookupItem, type MatchIndex, type MatchProduct } from "./shopMatch";

// AI Shopping, phase 3 on the server (docs/ai-shopping-plan.md, section 5): save the cards from tracked answers,
// match them, check pictures, ask Google's product page about cards in doubt, and remember what people decide.

const say = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);
const DAY_MS = 86_400_000;

// ─────────────── Saving cards from the daily checks ───────────────

const onCache = new Map<string, { on: boolean; at: number }>();
async function brandShopOn(db: SupabaseClient, brandId: string) {
  const hit = onCache.get(brandId);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.on;
  const { data, error } = await db.from("brands").select("shop_mode, shop_on").eq("id", brandId).maybeSingle();
  const on = !error && Boolean(data) && shopOn(data!.shop_mode as ShopMode, data!.shop_on as boolean);
  onCache.set(brandId, { on, at: Date.now() });
  return on;
}

/** Save an answer's cards for a brand with AI Shopping on. Never stops the check that calls it. */
export async function saveCards(db: SupabaseClient, p: { workspaceId: string; brandId: string; engine: string; prompt: string; day: string }, answer: DfsAnswer) {
  try {
    if (!answer.cards?.length || !(await brandShopOn(db, p.brandId))) return;
    const engine = p.engine === "ChatGPT" ? "gpt" : p.engine === "AI Mode" ? "aim" : p.engine;
    const rows = answer.cards.map((c, i) => ({
      workspace_id: p.workspaceId,
      brand_id: p.brandId,
      day: p.day,
      engine,
      prompt: p.prompt.slice(0, 500),
      block: c.block ?? 1,
      position: c.position ?? i + 1,
      title: c.title.slice(0, 500),
      seller: c.seller,
      domain: c.domain,
      url: c.url ?? null,
      price: c.price ?? null,
      regular: c.regular ?? null,
      currency: c.currency ?? null,
      gid: c.gid ?? null,
      ext_id: c.productId ?? null,
      image: c.image ?? null,
      name_only: Boolean(c.nameOnly),
    }));
    const { error } = await db.from("shop_cards").upsert(rows, { onConflict: "brand_id,day,engine,prompt,block,position,source_key", ignoreDuplicates: true });
    if (error) console.error("AI Shopping cards not saved:", error.message);
  } catch (e) {
    console.error("AI Shopping cards not saved:", say(e));
  }
}

// ─────────────── The brand's index ───────────────

type CatalogRow = { id: string; title: string; price_min: number | null; price_max: number | null; url: string | null; handle: string | null; brand: string | null; gtins: string[] | null; mpns: string[] | null; image: string | null };

export async function loadIndex(db: SupabaseClient, brandId: string) {
  const { data: brand } = await db.from("brands").select("id, workspace_id, name, domain, shop_aliases").eq("id", brandId).maybeSingle();
  if (!brand) return null;
  const rows: CatalogRow[] = [];
  for (let from = 0; from < 20_000; from += 1000) {
    const { data } = await db.from("shop_catalog").select("id, title, price_min, price_max, url, handle, brand, gtins, mpns, image").eq("brand_id", brandId).range(from, from + 999);
    rows.push(...((data ?? []) as CatalogRow[]));
    if (!data || data.length < 1000) break;
  }
  const host = (u: string | null) => {
    try {
      return u ? new URL(u.startsWith("http") ? u : `https://${u}`).hostname.replace(/^www\./, "") : "";
    } catch {
      return "";
    }
  };
  // The brand's own stores: its site, and wherever its catalog's product pages live.
  const domains = [...new Set([host(brand.domain), ...rows.map((r) => host(r.url))].filter(Boolean))];
  const products: MatchProduct[] = rows.map((r) => ({ id: r.id, title: r.title, price_min: r.price_min === null ? null : Number(r.price_min), price_max: r.price_max === null ? null : Number(r.price_max), url: r.url, handle: r.handle, brand: r.brand, gtins: r.gtins ?? [], mpns: r.mpns ?? [] }));
  const idx = buildIndex(products, { name: brand.name, aliases: (brand.shop_aliases as string[] | null) ?? [], domains });
  const images = new Map(rows.map((r) => [r.id, r.image]));
  return { brand, idx, images };
}

// ─────────────── Pictures (section 5.3) ───────────────

type Sharp = (input: Buffer) => { resize: (w: number, h: number, o: { fit: string }) => { grayscale: () => { raw: () => { toBuffer: () => Promise<Buffer> } } } };
let sharpLib: Sharp | null | undefined;
async function loadSharp(): Promise<Sharp | null> {
  if (sharpLib !== undefined) return sharpLib;
  try {
    const name = "sharp";
    sharpLib = ((await import(/* webpackIgnore: true */ name)) as { default: Sharp }).default;
  } catch {
    sharpLib = null; // no picture check without it; matching works the same
  }
  return sharpLib;
}

async function pictureHash(db: SupabaseClient, url: string | null): Promise<bigint | null> {
  if (!url) return null;
  const { data } = await db.from("shop_image_hashes").select("hash").eq("url", url).maybeSingle();
  if (data) return data.hash ? BigInt(`0x${data.hash}`) : null;
  const sharp = await loadSharp();
  if (!sharp) return null;
  let hash: bigint | null = null;
  try {
    const r = await safeFetch(url, { raw: true, timeout: 10_000, maxBytes: 4_000_000, accept: "image/*" });
    if (r.ok && r.bytes) {
      const px = await sharp(r.bytes).resize(9, 8, { fit: "fill" }).grayscale().raw().toBuffer();
      hash = dhash(px);
    }
  } catch {
    hash = null;
  }
  await db.from("shop_image_hashes").upsert({ url, hash: hash === null ? null : hash.toString(16) });
  return hash;
}

// ─────────────── Rival names (section 5.5) ───────────────

const RIVALS_SCHEMA = { type: "object", properties: { names: { type: "array", items: { type: "object", properties: { i: { type: "integer" }, brand: { type: "string" } }, required: ["i", "brand"], additionalProperties: false } } }, required: ["names"], additionalProperties: false };

/** Claude Haiku names the brand of titles the dictionary couldn't. A name only counts if it is in the title. */
async function nameRivals(titles: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!titles.length || !(await rateOk("anthropic"))) return out;
  try {
    const list = titles.map((t, i) => `${i}. ${t}`).join("\n");
    const r = await askJson<{ names: { i: number; brand: string }[] }>(
      `Each line is a product title from a shopping card. Give the brand name exactly as it is written in the title. If the title names no brand, give an empty string.\n\n${list}`,
      RIVALS_SCHEMA,
      { model: process.env.SHOP_MODEL || "claude-haiku-5-5", maxTokens: 1500, effort: "low" },
    );
    for (const n of r.names ?? []) {
      const t = titles[n.i];
      if (t && nameInTitle(n.brand, t)) out.set(t, n.brand.trim());
    }
  } catch (e) {
    console.error("AI Shopping competitor names:", say(e));
  }
  return out;
}

// ─────────────── shop_match ───────────────

type CardRow = {
  id: number;
  brand_id: string;
  engine: string;
  title: string;
  seller: string | null;
  domain: string | null;
  url: string | null;
  price: number | null;
  gid: string | null;
  ext_id: string | null;
  image: string | null;
  verdict: string | null;
  product_id: string | null;
  rival: string | null;
  looked_up: boolean;
};

/** shop_match: match a brand's new cards, or every card of the last 30 days when all is set (after a decision or a catalog change). */
export async function shopMatchJob(db: SupabaseClient, job: Job) {
  const p = job.payload as { brandId: string; all?: boolean };
  const loaded = await loadIndex(db, p.brandId);
  if (!loaded) return finish(job.id);
  const { idx, images } = loaded;

  let q = db.from("shop_cards").select("*").eq("brand_id", p.brandId);
  q = p.all ? q.gte("day", new Date(Date.now() - 30 * DAY_MS).toISOString().slice(0, 10)) : q.is("matched_at", null);
  const { data: cards, error } = await q.order("id").limit(5000);
  if (error) throw new Error(error.message);
  if (!cards?.length) return finish(job.id);

  const memory = new Map<string, string | null>();
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from("shop_ids").select("key, product_id, decided_by").eq("brand_id", p.brandId).range(from, from + 999);
    for (const r of data ?? []) if (r.product_id || r.decided_by) memory.set(r.key as string, (r.product_id as string | null) ?? null);
    if (!data || data.length < 1000) break;
  }
  const { data: recent } = await db.from("shop_cards").select("title").eq("brand_id", p.brandId).gte("day", new Date(Date.now() - 30 * DAY_MS).toISOString().slice(0, 10)).limit(5000);
  const dict = rivalDictionary((recent ?? []).map((r) => r.title as string));

  const now = new Date().toISOString();
  const updates: Record<string, unknown>[] = [];
  const remember: { brand_id: string; key: string; product_id: string }[] = [];
  const unnamed: string[] = [];
  let pictures = 0;
  for (const c of cards as CardRow[]) {
    const card = { title: c.title, seller: c.seller, domain: c.domain, url: c.url, price: c.price === null ? null : Number(c.price), gid: c.gid, productId: c.ext_id, engine: c.engine };
    const keys = idKeys(card, idx);
    const known = keys.find((k) => memory.has(k));
    let r = matchCard(card, idx, { remembered: known ? memory.get(known) : undefined });
    // Pictures settle the close calls: a match by words that a far picture questions, or a doubt a close one confirms.
    if (r.how === "title" && r.model && r.score >= 0.8 && r.score < 1 && pictures < 200) {
      pictures++;
      const [a, b] = await Promise.all([pictureHash(db, c.image), pictureHash(db, images.get(r.model.products[0]) ?? null)]);
      const nudge = pictureNudge(a !== null && b !== null ? hamming(a, b) : null);
      if (nudge) r = matchCard(card, idx, { remembered: known ? memory.get(known) : undefined, picture: nudge });
    }
    const rival = r.verdict === "other" ? (rivalName(card, dict) ?? c.rival) : null;
    if (r.verdict === "other" && !rival && !(known && memory.get(known) === null)) unnamed.push(c.title);
    updates.push({ id: c.id, keys, verdict: r.verdict, product_id: r.model?.products[0] ?? null, model: r.model?.title ?? null, score: r.score, how: r.how, why: r.why, rival, matched_at: now });
    // A sure match by words remembers the card's exact IDs, never its name (people confirm names).
    if (r.verdict === "matched" && r.how === "title" && r.model) for (const k of keys.filter((x) => !x.startsWith("t:"))) if (!memory.has(k)) remember.push({ brand_id: p.brandId, key: k, product_id: r.model.products[0] });
  }

  const names = await nameRivals([...new Set(unnamed)].slice(0, 40));
  for (const u of updates) if (u.verdict === "other" && !u.rival) u.rival = names.get((cards as CardRow[]).find((c) => c.id === u.id)!.title) ?? null;

  // Whole rows go back in batches (an upsert on id), so thousands of cards take a few calls.
  const rows = (cards as Record<string, unknown>[]).map((c, i) => ({ ...c, ...updates[i] }));
  for (let i = 0; i < rows.length; i += 500) {
    const res = await db.from("shop_cards").upsert(rows.slice(i, i + 500), { onConflict: "id" });
    if (res.error) throw new Error(res.error.message);
  }
  if (remember.length) await db.from("shop_ids").upsert(remember, { onConflict: "brand_id,key", ignoreDuplicates: true });

  // Shopping runs' days: flags, the daily numbers, reasons and alerts (shopRunsServer.ts).
  const runDays = [...new Set((cards as Record<string, unknown>[]).filter((c) => c.run_id).map((c) => c.day as string))];
  await afterMatch(db, p.brandId, runDays);

  // Cards still in doubt that Google can describe go to the product lookup.
  const ask = (cards as CardRow[]).filter((c, i) => updates[i].verdict === "doubt" && c.gid && c.ext_id && !c.looked_up);
  if (ask.length) await enqueue("shop_lookup", { brandId: p.brandId }, { workspaceId: loaded.brand.workspace_id, key: `shop_lookup:${p.brandId}:${now.slice(0, 13)}` });
  await finish(job.id);
}

/** Match again after a person decides or the catalog changes. */
export const rematch = (brandId: string, workspaceId: string) => enqueue("shop_match", { brandId, all: true }, { workspaceId, key: `shop_match:all:${brandId}:${Date.now()}` });

// ─────────────── shop_lookup (section 5.1, step 4) ───────────────

const LOOKUP = "merchant/google/product_info";
const LOOKUP_MAX = 20;

/** shop_lookup: ask Google's product page about cards in doubt, up to 20 products a run, each once. */
export async function shopLookupJob(db: SupabaseClient, job: Job) {
  const p = job.payload as { brandId: string; tasks?: { gid: string; id: string | null }[]; postedAt?: number };
  if (!p.tasks) {
    const { data } = await db.from("shop_cards").select("gid, ext_id").eq("brand_id", p.brandId).eq("verdict", "doubt").eq("looked_up", false).not("gid", "is", null).not("ext_id", "is", null).limit(200);
    const byGid = new Map<string, string>();
    for (const r of data ?? []) if (!byGid.has(r.gid as string)) byGid.set(r.gid as string, r.ext_id as string);
    const pick = [...byGid.entries()].slice(0, LOOKUP_MAX);
    if (!pick.length) return finish(job.id);
    if (!(await rateOk("dataforseo", pick.length))) return retry(job.id, "rate limit", 30, { count: false });
    const tasks = await call(`${LOOKUP}/task_post`, pick.map(([, productId]) => ({ product_id: productId, location_code: Number(process.env.DFS_LOCATION_CODE) || 2840, language_code: process.env.DFS_LANGUAGE_CODE || "en", priority: 1 })));
    const posted = pick.map(([gid], i) => ({ gid, id: tasks[i]?.status_code === 20100 ? (tasks[i].id as string) : null }));
    return retry(job.id, "waiting on DataForSEO", 600, { count: false, payload: { ...p, tasks: posted, postedAt: Date.now() } });
  }

  const loaded = await loadIndex(db, p.brandId);
  if (!loaded) return finish(job.id);
  const late = Date.now() - (p.postedAt ?? 0) > 3 * 60 * 60_000;
  const settled: { gid: string; productId: string | null }[] = [];
  let waiting = false;
  for (const t of p.tasks) {
    if (!t.id) {
      settled.push({ gid: t.gid, productId: null });
      continue;
    }
    try {
      const [task] = await call(`${LOOKUP}/task_get/advanced/${t.id}`);
      const code = Number(task?.status_code);
      if (code >= 40600 && code < 40700 && !late) {
        waiting = true;
        continue;
      }
      const item = (task?.result?.[0]?.items?.[0] ?? null) as LookupItem | null;
      const m = code === 20000 && item ? lookupMatch(item, loaded.idx, gtin14) : null;
      settled.push({ gid: t.gid, productId: m?.products[0] ?? null });
    } catch (e) {
      if (!late) {
        waiting = true;
        console.error("AI Shopping lookup:", say(e));
      } else settled.push({ gid: t.gid, productId: null });
    }
  }
  if (waiting && !late) {
    // Keep what is settled; ask again for the rest.
    const left = p.tasks.filter((t) => !settled.some((s) => s.gid === t.gid));
    await applyLookups(db, p.brandId, settled);
    return retry(job.id, "waiting on DataForSEO", 300, { count: false, payload: { ...p, tasks: left } });
  }
  await applyLookups(db, p.brandId, settled);
  if (settled.some((s) => s.productId)) await rematch(p.brandId, loaded.brand.workspace_id);
  await finish(job.id);
}

async function applyLookups(db: SupabaseClient, brandId: string, settled: { gid: string; productId: string | null }[]) {
  if (!settled.length) return;
  const found = settled.filter((s) => s.productId).map((s) => ({ brand_id: brandId, key: `g:${s.gid}`, product_id: s.productId! }));
  if (found.length) await db.from("shop_ids").upsert(found, { onConflict: "brand_id,key", ignoreDuplicates: true });
  await db.from("shop_cards").update({ looked_up: true }).eq("brand_id", brandId).in("gid", settled.map((s) => s.gid));
}

// ─────────────── "Is this yours?" ───────────────

export type ReviewGroup = { keys: string[]; title: string; seller: string | null; price: number | null; image: string | null; engine: string; cards: number; score: number; suggestion: { productId: string; title: string; image: string | null; price: number | null } | null };

/** Cards in doubt, one entry per product (grouped by their most exact key), most seen first. */
export async function reviewList(db: SupabaseClient, brandId: string): Promise<ReviewGroup[]> {
  const { data } = await db
    .from("shop_cards")
    .select("keys, title, seller, price, image, engine, score, product_id")
    .eq("brand_id", brandId)
    .eq("verdict", "doubt")
    .gte("day", new Date(Date.now() - 30 * DAY_MS).toISOString().slice(0, 10))
    .limit(2000);
  const groups = new Map<string, ReviewGroup & { productId: string | null }>();
  for (const c of data ?? []) {
    const keys = (c.keys as string[]) ?? [];
    const k = keys[0] ?? `t:${c.title}`;
    const g = groups.get(k);
    if (g) {
      g.cards++;
      for (const x of keys) if (!g.keys.includes(x)) g.keys.push(x);
    } else groups.set(k, { keys: [...keys], title: c.title as string, seller: c.seller as string | null, price: c.price === null ? null : Number(c.price), image: c.image as string | null, engine: c.engine as string, cards: 1, score: Number(c.score ?? 0), suggestion: null, productId: c.product_id as string | null });
  }
  const list = [...groups.values()].sort((a, b) => b.cards - a.cards).slice(0, 30);
  const ids = [...new Set(list.map((g) => g.productId).filter(Boolean))] as string[];
  const { data: products } = ids.length ? await db.from("shop_catalog").select("id, title, image, price_min").in("id", ids) : { data: [] };
  const byId = new Map((products ?? []).map((x) => [x.id as string, x]));
  return list.map(({ productId, ...g }) => {
    const pr = productId ? byId.get(productId) : null;
    return { ...g, suggestion: pr ? { productId: pr.id as string, title: pr.title as string, image: (pr.image as string | null) ?? null, price: pr.price_min === null ? null : Number(pr.price_min) } : null };
  });
}

/** A person's answer: this product (productId) or not ours (null), for every key of the card. */
export async function decide(db: SupabaseClient, brandId: string, workspaceId: string, keys: string[], productId: string | null, userId: string) {
  const rows = [...new Set(keys)].filter((k) => /^[gsut]:/.test(k)).slice(0, 10).map((key) => ({ brand_id: brandId, key, product_id: productId, decided_by: userId, decided_at: new Date().toISOString() }));
  if (!rows.length) return;
  const { error } = await db.from("shop_ids").upsert(rows, { onConflict: "brand_id,key" });
  if (error) throw new Error(error.message);
  await rematch(brandId, workspaceId);
}

/** Every 10 minutes: brands with new cards get matched. */
export async function queueMatching(db: SupabaseClient) {
  const { data, error } = await db.from("shop_cards").select("brand_id, workspace_id").is("matched_at", null).limit(500);
  if (error || !data?.length) return;
  const slot = new Date().toISOString().slice(0, 15); // one per brand per 10 minutes
  const seen = new Set<string>();
  for (const r of data) {
    if (seen.has(r.brand_id as string)) continue;
    seen.add(r.brand_id as string);
    await enqueue("shop_match", { brandId: r.brand_id }, { workspaceId: r.workspace_id as string, key: `shop_match:${r.brand_id}:${slot}` });
  }
}

export type { MatchIndex };
