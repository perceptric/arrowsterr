import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueueMany } from "./jobs";
import { readHistory, readVitals, type Vitals } from "./tech/google";

// Chrome UX Report for Technical SEO, Speed (docs/technical-seo-plan.md, phase 2): real visitors' Core Web Vitals for
// the whole site (phone and desktop) with about 6 months of weekly history, and for the brand's most valuable pages.
// Free with a Google Cloud API key that has the Chrome UX Report API turned on (CRUX_API_KEY, or the PageSpeed key).

const API = "https://chromeuxreport.googleapis.com/v1/records";
export const cruxKey = () => (process.env.CRUX_API_KEY || process.env.GOOGLE_API_KEY || process.env.PAGESPEED_API_KEY || "").trim();
const FORMS = [
  { id: "phone", api: "PHONE" },
  { id: "desktop", api: "DESKTOP" },
] as const;
const PAGES_PER_SYNC = 100;

async function crux(path: "queryRecord" | "queryHistoryRecord", body: Record<string, unknown>) {
  const res = await fetch(`${API}:${path}?key=${encodeURIComponent(cruxKey())}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
  // 404 means Google has too few visits for this site or page: no data, which is a normal answer.
  if (res.status === 404) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Chrome UX Report: ${data.error?.message ?? res.status}`);
  return data;
}

/** The daily tick: one sync a day for each brand that crawled its site or connected Search Console in 30 days. */
export async function queueCwvSyncs(db: SupabaseClient) {
  if (!cruxKey()) return;
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const { data: audits } = await db.from("site_audits").select("brand_id, workspace_id").gte("created_at", since).not("brand_id", "is", null).limit(5000);
  const { data: gsc } = await db.from("gsc_connections").select("brand_id, workspace_id");
  const day = new Date().toISOString().slice(0, 10);
  const brands = new Map([...(audits ?? []), ...(gsc ?? [])].map((b) => [b.brand_id as string, b.workspace_id as string]));
  await enqueueMany([...brands].map(([brandId, ws]) => ({ kind: "cwv_sync" as const, workspace_id: ws, key: `cwv_sync:${brandId}:${day}`, payload: { brandId } })));
}

/** The site's origin as CrUX knows it: the crawl's root when there is one, else https:// and the brand's domain. */
async function originOf(db: SupabaseClient, brandId: string) {
  const { data: a } = await db.from("site_audits").select("result").eq("brand_id", brandId).eq("status", "done").order("created_at", { ascending: false }).limit(1).maybeSingle();
  const root = (a?.result as { root?: string } | null)?.root;
  if (root) return new URL(root).origin;
  const { data: b } = await db.from("brands").select("domain").eq("id", brandId).maybeSingle();
  const d = String(b?.domain ?? "").replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return d ? `https://${d}` : null;
}

/** One brand's sync: the origin on both devices with history, then up to 100 pages on phones (Google indexes mobile). */
export async function syncCwv(db: SupabaseClient, brandId: string) {
  if (!cruxKey()) return;
  const { data: brand } = await db.from("brands").select("workspace_id").eq("id", brandId).maybeSingle();
  const origin = await originOf(db, brandId);
  if (!brand || !origin) return;
  const ws = brand.workspace_id as string;
  for (const f of FORMS) {
    const [now, hist] = await Promise.all([crux("queryRecord", { origin, formFactor: f.api }), crux("queryHistoryRecord", { origin, formFactor: f.api })]);
    await db.from("cwv_origin").upsert({ brand_id: brandId, workspace_id: ws, form_factor: f.id, fetched_at: new Date().toISOString(), vitals: now ? readVitals(now) : {}, history: hist ? readHistory(hist) : {} });
  }
  // Pages: the most clicked from Search Console, else the latest crawl's pages with the most links in.
  const { data: top } = await db.from("gsc_pages").select("page").eq("brand_id", brandId).order("clicks", { ascending: false }).limit(PAGES_PER_SYNC);
  let urls = (top ?? []).map((p) => p.page as string);
  if (urls.length < PAGES_PER_SYNC) {
    const { data: a } = await db.from("site_audits").select("id").eq("brand_id", brandId).eq("status", "done").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (a) {
      const { data: more } = await db.from("crawl_pages").select("url").eq("audit_id", a.id).eq("indexable", true).order("links_in", { ascending: false }).limit(PAGES_PER_SYNC);
      urls = [...new Set([...urls, ...(more ?? []).map((m) => m.url as string)])].slice(0, PAGES_PER_SYNC);
    }
  }
  const rows: { brand_id: string; workspace_id: string; url: string; form_factor: string; fetched_at: string; vitals: Vitals; source: string }[] = [];
  // CrUX allows about 150 calls a minute; 5 at a time with a short pause stays well under it.
  for (let i = 0; i < urls.length; i += 5) {
    const got = await Promise.all(urls.slice(i, i + 5).map(async (url) => ({ url, rec: await crux("queryRecord", { url, formFactor: "PHONE" }).catch(() => null) })));
    for (const g of got) if (g.rec) rows.push({ brand_id: brandId, workspace_id: ws, url: g.url, form_factor: "phone", fetched_at: new Date().toISOString(), vitals: readVitals(g.rec), source: "crux" });
    await new Promise((r) => setTimeout(r, 2500));
  }
  if (rows.length) await db.from("cwv_urls").upsert(rows);
}
