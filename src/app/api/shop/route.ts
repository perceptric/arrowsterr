import { enqueue } from "@/lib/jobs";
import { authUrl, googleReady, MERCHANT_SCOPES, signState } from "@/lib/google";
import { adminClient, requireRole } from "@/lib/serverAuth";
import { fold, fromCsv } from "@/lib/shopCatalog";
import { shopOn, type ShopMode } from "@/lib/shopDetect";
import { merchantAccounts, saveCatalog, storeAdded, pickMerchantAccount, type ShopSource } from "@/lib/shopServer";
import { decide, rematch, reviewList } from "@/lib/shopMatchServer";
import { shopReport } from "@/lib/shopReportServer";
import { deepCheck, MAX_PROMPTS, postNew, promptKey, suggestPrompts } from "@/lib/shopRunsServer";

// AI Shopping's catalog and switch for one brand (docs/ai-shopping-plan.md, sections 3 and 3.1).
//   action "state" (viewers): the switch, the sources and the products.
//   Editors: "mode" (auto, on, off), "shopify" (use a store from Publishing sites), "merchant" (Google's sign-in link),
//   "accounts" and "account" (pick the Merchant Center account), "csv" (upload a file's text), "sync", "remove",
//   "decide" (Is this yours? yes with a product, or not ours) and "aliases" (other names the brand goes by).
//   "review" (viewers): the cards in doubt. "report" (viewers): the numbers and tables for a range.
//   Editors: "suggest", "prompts_add", "prompt_update", "prompt_remove", "deep" (20 runs of one prompt) and
//   "settings" (retailer list and price floor).
const MAX_CSV = 5_000_000;
const SOURCE_COLS = "id, kind, name, account, email, status, error, products, variants, synced_at, cms_connection_id";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const auth = await requireRole(request, body.workspaceId, ["state", "review", "report"].includes(body.action) ? "viewer" : "editor");
  if ("denied" in auth) return auth.denied;
  const db = adminClient();
  if (!db) return Response.json({ error: "Add SUPABASE_SECRET_KEY to the server's settings." }, { status: 500 });
  const { data: brand } = await auth.sb.from("brands").select("id, workspace_id, name, shop_mode, shop_on, shop_reason, shop_checked_at").eq("id", body.brandId).eq("workspace_id", body.workspaceId).maybeSingle();
  if (!brand) return Response.json({ error: "Brand not found." }, { status: 404 });
  const ws = brand.workspace_id as string;
  const fail = (error: string, status = 400) => Response.json({ error }, { status });
  const source = async (id: unknown) => {
    const { data } = await db.from("shop_sources").select("*").eq("id", String(id ?? "")).eq("brand_id", brand.id).maybeSingle();
    return data as ShopSource | null;
  };
  const sync = (sourceId: string) => enqueue("shop_catalog_sync", { sourceId }, { workspaceId: ws, key: `shop_catalog_sync:${sourceId}:${Date.now()}` });

  try {
    switch (body.action) {
      case "state": {
        const [sources, stores, products] = await Promise.all([
          db.from("shop_sources").select(SOURCE_COLS).eq("brand_id", brand.id).order("created_at"),
          db.from("cms_connections").select("id, name").eq("workspace_id", ws).eq("kind", "shopify").order("created_at"),
          db.from("shop_catalog").select("id, title, url, image, price_min, price_max, currency, in_stock, variants, product_type").eq("brand_id", brand.id).order("title").limit(2000),
        ]);
        const { data: names } = await db.from("brands").select("shop_aliases").eq("id", brand.id).maybeSingle();
        const { data: extra } = await db.from("brands").select("shop_retailers, shop_floor").eq("id", brand.id).maybeSingle();
        return Response.json({
          aliases: (names?.shop_aliases as string[] | undefined) ?? [],
          retailers: (extra?.shop_retailers as string[] | undefined) ?? [],
          floor: extra?.shop_floor === null || extra?.shop_floor === undefined ? null : Number(extra.shop_floor),
          mode: brand.shop_mode,
          on: shopOn(brand.shop_mode as ShopMode, brand.shop_on),
          auto: { on: brand.shop_on, reason: brand.shop_reason, checkedAt: brand.shop_checked_at },
          sources: sources.data ?? [],
          shopifyStores: stores.data ?? [],
          merchantReady: googleReady(),
          products: products.data ?? [],
        });
      }
      case "mode": {
        const mode = String(body.mode) as ShopMode;
        if (!["auto", "on", "off"].includes(mode)) return fail("Pick Auto, On or Off.");
        const { error } = await db.from("brands").update({ shop_mode: mode }).eq("id", brand.id);
        if (error) throw new Error(error.message);
        if (mode === "auto") await enqueue("shop_detect", { brandId: brand.id }, { workspaceId: ws, key: `shop_detect:${brand.id}:${Date.now()}` });
        return Response.json({ ok: true });
      }
      case "shopify": {
        const { data: conn } = await db.from("cms_connections").select("id, name").eq("id", String(body.connectionId ?? "")).eq("workspace_id", ws).eq("kind", "shopify").maybeSingle();
        if (!conn) return fail("Connect the Shopify store in Settings, Publishing sites first.");
        const { data, error } = await db
          .from("shop_sources")
          .upsert({ workspace_id: ws, brand_id: brand.id, kind: "shopify", cms_connection_id: conn.id, name: conn.name, status: "new", error: null }, { onConflict: "brand_id,kind" })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        await sync(data.id);
        await storeAdded(db, brand.id);
        return Response.json({ ok: true });
      }
      case "merchant": {
        if (!googleReady()) return fail("Google sign-in is not set up. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to the server's settings.", 500);
        const { data: user } = await auth.sb.auth.getUser(request.headers.get("authorization")!.replace(/^Bearer\s+/i, ""));
        if (!user?.user) return fail("Please sign in again.", 401);
        const host = request.headers.get("x-forwarded-host");
        const base = host ? `https://${host}` : new URL(request.url).origin;
        const back = typeof body.back === "string" && body.back.startsWith("/") && !body.back.startsWith("//") ? body.back : "/ai-shopping";
        return Response.json({ url: authUrl(base, signState({ brandId: brand.id, workspaceId: ws, userId: user.user.id, back, kind: "merchant" }), MERCHANT_SCOPES) });
      }
      case "accounts":
      case "account": {
        const { data: src } = await db.from("shop_sources").select("*").eq("brand_id", brand.id).eq("kind", "merchant").maybeSingle();
        if (!src?.refresh_token) return fail("Connect Merchant Center first.");
        const list = await merchantAccounts(src.refresh_token);
        if (body.action === "accounts") return Response.json({ accounts: list });
        const pick = list.find((a) => a.id === String(body.account));
        if (!pick) return fail("That account is not on this Google sign-in.");
        await pickMerchantAccount(db, src.id, ws, pick);
        return Response.json({ ok: true });
      }
      case "csv": {
        const text = typeof body.text === "string" ? body.text : "";
        if (!text.trim()) return fail("The file is empty.");
        if (text.length > MAX_CSV) return fail("The file is over 5 MB. Split it or use Merchant Center.");
        const read = fromCsv(text);
        if (read.missing.length) return fail("The file needs a title column.");
        const rows = fold(read.products);
        if (!rows.length) return fail("No products found in the file.");
        const { data, error } = await db
          .from("shop_sources")
          .upsert({ workspace_id: ws, brand_id: brand.id, kind: "csv", name: typeof body.name === "string" ? body.name.slice(0, 120) : "CSV", status: "syncing", error: null }, { onConflict: "brand_id,kind" })
          .select("id, workspace_id, brand_id")
          .single();
        if (error) throw new Error(error.message);
        const saved = await saveCatalog(db, data, rows);
        await storeAdded(db, brand.id);
        return Response.json({ ok: true, ...saved, skipped: read.skipped });
      }
      case "sync": {
        const src = await source(body.sourceId);
        if (!src) return fail("Not found.", 404);
        await db.from("shop_sources").update({ status: "syncing", error: null }).eq("id", src.id);
        await sync(src.id);
        return Response.json({ ok: true });
      }
      case "remove": {
        const src = await source(body.sourceId);
        if (!src) return fail("Not found.", 404);
        const { error } = await db.from("shop_sources").delete().eq("id", src.id);
        if (error) throw new Error(error.message);
        if (brand.shop_mode === "auto") await enqueue("shop_detect", { brandId: brand.id }, { workspaceId: ws, key: `shop_detect:${brand.id}:${Date.now()}` });
        return Response.json({ ok: true });
      }
      case "report": {
        const days = [7, 30, 90].includes(Number(body.days)) ? Number(body.days) : 30;
        const engine = body.engine === "gpt" || body.engine === "aim" ? body.engine : "all";
        return Response.json(await shopReport(db, { id: brand.id, name: brand.name as string }, days, engine));
      }
      case "suggest":
        return Response.json({ prompts: await suggestPrompts(db, brand.id) });
      case "prompts_add": {
        const list = (Array.isArray(body.prompts) ? body.prompts : [])
          .map((q: { prompt?: unknown; category?: unknown }) => ({ prompt: String(q?.prompt ?? "").trim().slice(0, 200), category: q?.category ? String(q.category).trim().slice(0, 60) : null }))
          .filter((q: { prompt: string }) => q.prompt.length >= 3);
        const { data: have } = await db.from("shop_prompts").select("prompt, active").eq("brand_id", brand.id);
        const keys = new Set((have ?? []).map((h) => promptKey(h.prompt as string)));
        const room = MAX_PROMPTS - (have ?? []).filter((h) => h.active).length;
        const fresh = list.filter((q: { prompt: string }) => {
          const k = promptKey(q.prompt);
          if (!k || keys.has(k)) return false;
          keys.add(k);
          return true;
        });
        if (fresh.length > room) return fail(`Up to ${MAX_PROMPTS} prompts. ${Math.max(0, room)} left.`);
        if (fresh.length) {
          const { error } = await db.from("shop_prompts").insert(fresh.map((q: { prompt: string; category: string | null }) => ({ ...q, workspace_id: ws, brand_id: brand.id })));
          if (error) throw new Error(error.message);
        }
        return Response.json({ ok: true, added: fresh.length });
      }
      case "prompt_update": {
        const { error } = await db.from("shop_prompts").update({ active: Boolean(body.active) }).eq("id", String(body.id ?? "")).eq("brand_id", brand.id);
        if (error) throw new Error(error.message);
        return Response.json({ ok: true });
      }
      case "prompt_remove": {
        const { error } = await db.from("shop_prompts").delete().eq("id", String(body.id ?? "")).eq("brand_id", brand.id);
        if (error) throw new Error(error.message);
        return Response.json({ ok: true });
      }
      case "deep": {
        const engine = body.engine === "aim" ? "aim" : "gpt";
        const { data: q } = await db.from("shop_prompts").select("id").eq("id", String(body.promptId ?? "")).eq("brand_id", brand.id).maybeSingle();
        if (!q) return fail("Prompt not found.", 404);
        await deepCheck(db, brand.id, ws, q.id as string, engine);
        await postNew(db, brand.id).catch(() => undefined);
        return Response.json({ ok: true });
      }
      case "settings": {
        const retailers = (Array.isArray(body.retailers) ? body.retailers : []).map((r: unknown) => String(r).trim()).filter((r: string) => r.length >= 2 && r.length <= 60).slice(0, 30);
        const floor = body.floor === null || body.floor === undefined || body.floor === "" ? null : Math.round(Number(body.floor));
        if (floor !== null && !(floor >= 1 && floor <= 100)) return fail("The price floor is a percent from 1 to 100.");
        const { error } = await db.from("brands").update({ shop_retailers: [...new Set(retailers)], shop_floor: floor }).eq("id", brand.id);
        if (error) throw new Error(error.message);
        await rematch(brand.id, ws);
        return Response.json({ ok: true });
      }
      case "review":
        return Response.json({ groups: await reviewList(db, brand.id) });
      case "decide": {
        const keys = Array.isArray(body.keys) ? body.keys.filter((k: unknown): k is string => typeof k === "string") : [];
        if (!keys.length) return fail("Nothing to decide.");
        let productId: string | null = null;
        if (body.productId) {
          const { data: pr } = await db.from("shop_catalog").select("id").eq("id", String(body.productId)).eq("brand_id", brand.id).maybeSingle();
          if (!pr) return fail("That product is not in this catalog.");
          productId = pr.id as string;
        }
        const { data: user } = await auth.sb.auth.getUser(request.headers.get("authorization")!.replace(/^Bearer\s+/i, ""));
        if (!user?.user) return fail("Please sign in again.", 401);
        await decide(db, brand.id, ws, keys, productId, user.user.id);
        return Response.json({ ok: true });
      }
      case "aliases": {
        const list = (Array.isArray(body.aliases) ? body.aliases : []).map((a: unknown) => String(a).trim()).filter((a: string) => a.length >= 2 && a.length <= 60).slice(0, 10);
        const { error } = await db.from("brands").update({ shop_aliases: [...new Set(list)] }).eq("id", brand.id);
        if (error) throw new Error(error.message);
        await rematch(brand.id, ws);
        return Response.json({ ok: true });
      }
      default:
        return fail("Unknown action.");
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return fail(/shop_prompts|shop_runs|shop_daily|shop_retailers|shop_floor|source_key/.test(msg) ? "Run supabase/081_shop_runs.sql on the database." : /shop_cards|shop_ids|shop_aliases/.test(msg) ? "Run supabase/080_shop_matching.sql on the database." : /shop_sources|shop_catalog|shop_mode/.test(msg) ? "Run supabase/079_ai_shopping.sql on the database." : msg.slice(0, 300), 500);
  }
}
