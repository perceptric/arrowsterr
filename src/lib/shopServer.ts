import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { freshConfig, shopifyGql } from "./cmsTokens";
import { getRaw, postRaw } from "./dataforseo";
import { accessToken, api, seal } from "./google";
import { enqueue, enqueueMany, finish, rateOk, retry, type Job } from "./jobs";
import { safeFetch } from "./safeFetch";
import { fold, pullMerchant, pullShopify, SHOPIFY_PRODUCTS, type CatalogRow, type MerchantPage, type ShopifyPage, type SourceProduct } from "./shopCatalog";
import { decide, probeFacts, productLinks, siteFacts, slimPage, type ProbeFacts, type ShopMode, type SiteFacts, type SlimPage } from "./shopDetect";

// AI Shopping on the server (docs/ai-shopping-plan.md, sections 3, 3.1, 9 and 10): the catalog sync, the detection
// job, and Google Merchant Center's sign-in. The rules themselves live in shopCatalog.ts and shopDetect.ts.

const MERCHANT = "https://merchantapi.googleapis.com";
const day = () => new Date().toISOString().slice(0, 10);
const say = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);
/** A hiccup worth trying again (timeouts, busy, 5xx, 429), as opposed to a wrong setting. */
const passing = (e: unknown) => {
  const status = (e as { status?: number })?.status;
  return status === 429 || (status !== undefined && status >= 500) || /timeout|ECONNRESET|ETIMEDOUT|fetch failed|THROTTLED|50\d|429/i.test(say(e));
};

export type ShopSource = {
  id: string;
  workspace_id: string;
  brand_id: string;
  kind: "shopify" | "merchant" | "csv";
  cms_connection_id: string | null;
  account: string | null;
  name: string | null;
  email: string | null;
  refresh_token: string | null;
  status: string;
  error: string | null;
  products: number;
  variants: number;
  synced_at: string | null;
};

// ─────────────── Catalog ───────────────

/**
 * Save a source's products as its catalog: upsert every row, record today's prices, and remove products the source
 * no longer has. Only a complete pull reaches here, so a failed sync never empties a catalog.
 */
export async function saveCatalog(db: SupabaseClient, src: Pick<ShopSource, "id" | "workspace_id" | "brand_id">, rows: CatalogRow[]) {
  const now = new Date().toISOString();
  const ids: string[] = [];
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map((r) => ({ ...r, workspace_id: src.workspace_id, brand_id: src.brand_id, source_id: src.id, synced_at: now }));
    const { data, error } = await db.from("shop_catalog").upsert(chunk, { onConflict: "source_id,external_id" }).select("id, price_min, price_max, currency, in_stock");
    if (error) throw new Error(error.message);
    ids.push(...(data ?? []).map((d) => d.id as string));
    const prices = (data ?? []).map((d) => ({ product_id: d.id, day: day(), price_min: d.price_min, price_max: d.price_max, currency: d.currency, in_stock: d.in_stock }));
    if (prices.length) {
      const res = await db.from("shop_catalog_prices").upsert(prices, { onConflict: "product_id,day" });
      if (res.error) throw new Error(res.error.message);
    }
  }
  // Products gone from the source leave the catalog (their history goes with them).
  const { data: all } = await db.from("shop_catalog").select("id").eq("source_id", src.id);
  const keep = new Set(ids);
  const gone = (all ?? []).map((r) => r.id as string).filter((id) => !keep.has(id));
  for (let i = 0; i < gone.length; i += 200) await db.from("shop_catalog").delete().in("id", gone.slice(i, i + 200));
  const variants = rows.reduce((n, r) => n + r.variants, 0);
  await db.from("shop_sources").update({ status: "ok", error: null, products: rows.length, variants, synced_at: now }).eq("id", src.id);
  return { products: rows.length, variants };
}

async function pull(db: SupabaseClient, src: ShopSource): Promise<SourceProduct[] | null> {
  if (src.kind === "shopify") {
    const { data: conn } = await db.from("cms_connections").select("id, kind, config").eq("id", src.cms_connection_id ?? "").maybeSingle();
    if (!conn) throw Object.assign(new Error("The Shopify store was removed from Publishing sites. Connect it again."), { final: true });
    const c = await freshConfig(db, conn);
    return pullShopify(async (after) => {
      try {
        return await shopifyGql<ShopifyPage>(c, SHOPIFY_PRODUCTS, { after });
      } catch (e) {
        if (/access denied|read_products|403/i.test(say(e))) throw Object.assign(new Error("Shopify needs you to sign in again to allow reading products."), { final: true });
        throw e;
      }
    });
  }
  if (src.kind === "merchant") {
    if (!src.refresh_token) throw Object.assign(new Error("Sign in to Google Merchant Center again."), { final: true });
    if (!src.account) return null; // waiting for a person to pick the account
    const token = await accessToken(src.refresh_token);
    return pullMerchant((page) => api<MerchantPage>(`${MERCHANT}/products/v1/accounts/${src.account}/products?pageSize=1000${page ? `&pageToken=${encodeURIComponent(page)}` : ""}`, token, undefined, "Merchant Center"));
  }
  return null; // CSV catalogs change only when a new file is uploaded
}

/** Copy today's price for products whose source isn't read again (CSV), so every day has one. */
async function carryPrices(db: SupabaseClient, sourceId: string) {
  const { data } = await db.from("shop_catalog").select("id, price_min, price_max, currency, in_stock").eq("source_id", sourceId);
  const rows = (data ?? []).map((d) => ({ product_id: d.id, day: day(), price_min: d.price_min, price_max: d.price_max, currency: d.currency, in_stock: d.in_stock }));
  for (let i = 0; i < rows.length; i += 500) await db.from("shop_catalog_prices").upsert(rows.slice(i, i + 500), { onConflict: "product_id,day", ignoreDuplicates: true });
}

/** shop_catalog_sync: read one source into the catalog. */
export async function shopCatalogSyncJob(db: SupabaseClient, job: Job) {
  const { sourceId } = job.payload as { sourceId: string };
  const { data } = await db.from("shop_sources").select("*").eq("id", sourceId).maybeSingle();
  const src = data as ShopSource | null;
  if (!src) return finish(job.id);
  try {
    await db.from("shop_sources").update({ status: "syncing" }).eq("id", src.id);
    const products = await pull(db, src);
    if (products === null) {
      if (src.kind === "csv") await carryPrices(db, src.id);
      await db.from("shop_sources").update({ status: src.kind === "merchant" && !src.account ? "new" : "ok" }).eq("id", src.id);
      return finish(job.id);
    }
    await saveCatalog(db, src, fold(products));
    await finish(job.id);
  } catch (e) {
    const final = (e as { final?: boolean }).final || !passing(e) || job.attempts + 1 >= job.max_attempts;
    if (!final) {
      await db.from("shop_sources").update({ status: src.synced_at ? "ok" : "new" }).eq("id", src.id);
      return retry(job.id, say(e), 60 * 2 ** job.attempts);
    }
    await db.from("shop_sources").update({ status: "error", error: say(e) }).eq("id", src.id);
    await finish(job.id);
  }
}

// ─────────────── Google Merchant Center ───────────────

/** The Merchant Center accounts a signed-in Google account can read. */
export async function merchantAccounts(sealedRefresh: string): Promise<{ id: string; name: string }[]> {
  const token = await accessToken(sealedRefresh);
  const out: { id: string; name: string }[] = [];
  let page = "";
  for (let i = 0; i < 10; i++) {
    const data = await api<{ accounts?: { name?: string; accountId?: string; accountName?: string }[]; nextPageToken?: string }>(`${MERCHANT}/accounts/v1/accounts?pageSize=250${page ? `&pageToken=${encodeURIComponent(page)}` : ""}`, token, undefined, "Merchant Center");
    for (const a of data.accounts ?? []) {
      const id = a.accountId ?? a.name?.split("/").pop();
      if (id) out.push({ id, name: a.accountName || `Account ${id}` });
    }
    if (!data.nextPageToken) break;
    page = data.nextPageToken;
  }
  return out;
}

/** After Google's sign-in: save the source, and pick the account when there is only one. */
export async function merchantConnected(db: SupabaseClient, s: { brandId: string; workspaceId: string; userId: string }, refresh: string, email: string | null) {
  const sealed = seal(refresh);
  const { data, error } = await db
    .from("shop_sources")
    .upsert({ workspace_id: s.workspaceId, brand_id: s.brandId, kind: "merchant", refresh_token: sealed, email, status: "new", error: null, created_by: s.userId }, { onConflict: "brand_id,kind" })
    .select("id")
    .single();
  if (error) throw new Error(error.message + (/shop_sources/.test(error.message) ? " Run supabase/079_ai_shopping.sql." : ""));
  const accounts = await merchantAccounts(sealed).catch(() => []);
  if (accounts.length === 1) await pickMerchantAccount(db, data.id, s.workspaceId, accounts[0]);
  await storeAdded(db, s.brandId);
}

export async function pickMerchantAccount(db: SupabaseClient, sourceId: string, workspaceId: string, a: { id: string; name: string }) {
  await db.from("shop_sources").update({ account: a.id, name: a.name, status: "new", error: null }).eq("id", sourceId);
  await enqueue("shop_catalog_sync", { sourceId }, { workspaceId, key: `shop_catalog_sync:${sourceId}:${Date.now()}` });
}

/** A store was connected: AI Shopping turns on for brands on Auto (section 3.1, signal 1). */
export async function storeAdded(db: SupabaseClient, brandId: string) {
  await db.from("brands").update({ shop_on: true, shop_reason: "store", shop_checked_at: new Date().toISOString() }).eq("id", brandId).eq("shop_mode", "auto");
}

// ─────────────── Detection (section 3.1) ───────────────

/** Read the homepage, up to 6 product or collection pages, and Shopify's public product list. */
export async function readSite(domain: string): Promise<SiteFacts | null> {
  const host = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!host) return null;
  const home = await safeFetch(`https://${host}/`, { timeout: 12_000, maxBytes: 3_000_000 });
  const pages: SlimPage[] = [];
  if (home.ok && home.body) {
    const h = slimPage(home.body, home.url);
    pages.push(h);
    for (const path of productLinks(h)) {
      const r = await safeFetch(new URL(path, home.url).toString(), { timeout: 12_000, maxBytes: 3_000_000 });
      if (r.ok && r.body) pages.push(slimPage(r.body, r.url));
    }
  }
  let shopify = 0;
  const pj = await safeFetch(`https://${host}/products.json?limit=5`, { accept: "application/json", timeout: 10_000, maxBytes: 500_000 });
  try {
    const list = pj.ok ? (JSON.parse(pj.body) as { products?: unknown[] }).products : null;
    if (Array.isArray(list)) shopify = list.length;
  } catch {
    // Not a Shopify store.
  }
  return pages.length || shopify ? siteFacts(pages, shopify) : null;
}

type DetectPayload = { brandId: string; site?: SiteFacts | null; siteRead?: boolean; aim?: string | null; gpt?: string | null; postedAt?: number };
const PROBE_GIVE_UP_MS = 3 * 60 * 60_000;
/** Auto turns AI Shopping off only after this many weekly checks in a row find nothing, so one bad day never hides it. */
export const OFF_AFTER = 3;

/** shop_detect: decide whether a brand on Auto gets AI Shopping. */
export async function shopDetectJob(db: SupabaseClient, job: Job) {
  const p = job.payload as DetectPayload;
  const { data: brand } = await db.from("brands").select("id, workspace_id, name, domain, shop_mode, shop_on, shop_reason, shop_facts").eq("id", p.brandId).maybeSingle();
  if (!brand || (brand.shop_mode as ShopMode) !== "auto") return finish(job.id);
  const save = async (on: boolean, reason: string | null, facts: Record<string, unknown>) => {
    const misses = on ? 0 : Number((brand.shop_facts as { misses?: number } | null)?.misses ?? 0) + 1;
    // Once on, a brand stays on until OFF_AFTER checks in a row find nothing.
    const keep = !on && brand.shop_on && misses < OFF_AFTER;
    await db
      .from("brands")
      .update({ shop_on: on || keep, shop_reason: on ? reason : keep ? brand.shop_reason ?? null : null, shop_facts: { ...facts, misses }, shop_checked_at: new Date().toISOString() })
      .eq("id", brand.id);
    await finish(job.id);
  };

  const { count: sources } = await db.from("shop_sources").select("id", { count: "exact", head: true }).eq("brand_id", brand.id);
  if (sources) return save(true, "store", { sources });

  let site = p.site ?? null;
  if (!p.siteRead) {
    site = await readSite(brand.domain).catch(() => null);
    const d = decide({ sources: 0, site, probe: null, brandCards: 0 });
    if (d.on) return save(true, d.reason, { site });
  }

  // Ask AI Mode and ChatGPT "buy <brand>" through the cheap queue, then come back for the answers.
  if (p.aim === undefined) {
    if (!(await rateOk("dataforseo", 2))) return retry(job.id, "rate limit", 30, { count: false, payload: { ...p, site, siteRead: true } });
    const q = `buy ${brand.name}`;
    const [aim, gpt] = await Promise.all([postRaw("AI Mode", q).catch(() => null), postRaw("ChatGPT", q).catch(() => null)]);
    return retry(job.id, "waiting on DataForSEO", 300, { count: false, payload: { ...p, site, siteRead: true, aim, gpt, postedAt: Date.now() } });
  }
  const [aim, gpt] = await Promise.all([p.aim ? getRaw("AI Mode", p.aim).catch(() => ({ state: "failed" as const, error: "" })) : null, p.gpt ? getRaw("ChatGPT", p.gpt).catch(() => ({ state: "failed" as const, error: "" })) : null]);
  const late = Date.now() - (p.postedAt ?? 0) > PROBE_GIVE_UP_MS;
  if (!late && (aim?.state === "waiting" || gpt?.state === "waiting")) return retry(job.id, "waiting on DataForSEO", 180, { count: false });
  const probe: ProbeFacts | null = aim?.state === "done" || gpt?.state === "done" ? probeFacts(aim?.state === "done" ? aim.result : null, gpt?.state === "done" ? gpt.result : null, brand.domain) : null;

  const since = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
  const { data: seen } = await db.from("shop_seen").select("cards").eq("brand_id", brand.id).gte("day", since);
  const brandCards = (seen ?? []).reduce((n, r) => n + Number(r.cards ?? 0), 0);

  const d = decide({ sources: 0, site, probe, brandCards });
  await save(d.on, d.reason, { site, probe, brandCards });
}

/** Called by the scheduler every tick: weekly detection for brands on Auto, and each source's daily sync. */
export async function queueShopWork(db: SupabaseClient) {
  const week = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data: brands, error } = await db.from("brands").select("id, workspace_id").eq("shop_mode", "auto").or(`shop_checked_at.is.null,shop_checked_at.lt.${week}`).limit(25);
  if (error) return; // before the migration
  const stamp = day();
  const rows: Parameters<typeof enqueueMany>[0] = (brands ?? []).map((b) => ({ kind: "shop_detect", workspace_id: b.workspace_id, key: `shop_detect:${b.id}:${stamp}`, payload: { brandId: b.id } }));
  const { data: sources } = await db.from("shop_sources").select("id, workspace_id").or(`synced_at.is.null,synced_at.lt.${stamp}T00:00:00Z`).neq("status", "syncing").limit(50);
  for (const s of sources ?? []) rows.push({ kind: "shop_catalog_sync", workspace_id: s.workspace_id, key: `shop_catalog_sync:${s.id}:${stamp}`, payload: { sourceId: s.id } });
  if (rows.length) await enqueueMany(rows);
}
