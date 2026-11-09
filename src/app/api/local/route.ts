import type { Profile } from "@/lib/db";
import { requireTrack, take } from "@/lib/entitlements";
import { cityOf, localPrompts, SPACINGS, type Location, type Place } from "@/lib/local";
import { findPlaces, startScan } from "@/lib/localServer";
import { TOOLS as MCP_TOOLS } from "@/lib/mcp/tools";
import { meteredRoute } from "@/lib/meter";
import { TASK_COST } from "@/lib/plans";
import { marketOf } from "@/lib/research";
import { adminClient, requireRole } from "@/lib/serverAuth";

export const maxDuration = 120;

const str = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const err = (error: string, status = 400) => Response.json({ error }, { status });

// Local Research (docs/local-research.md). Reading scans needs no route: the page asks Supabase.
//   find:     { brandId, query }                   editors: the business on Google Maps by name and city (1 task)
//   set:      { brandId, place }                   editors: use this place as the brand's location
//   clear:    { brandId }                          editors
//   settings: { brandId, keywords?, spacing?, weekly? }   up to 5 keywords; spacing 0.5, 1 or 2 miles
//   scan:     { brandId, keyword }                 editors: a grid scan now, on the priority queue (12 tasks)
//   prompts:  { brandId }                          editors: track local prompts in AI Visibility (plan limits apply)
async function handle(request: Request) {
  const body = await request.json().catch(() => ({}));
  const auth = await requireRole(request, body.workspaceId, "editor");
  if ("denied" in auth) return auth.denied;
  const ws = String(body.workspaceId);
  const db = adminClient();
  if (!db) return err("Add SUPABASE_SECRET_KEY to the server's settings.", 500);
  const { data: me } = await auth.sb.auth.getUser();
  const { data: brand } = await db.from("brands").select("id, name, domain, profile").eq("id", str(body.brandId, 60)).eq("workspace_id", ws).maybeSingle();
  if (!brand) return err("Brand not found.", 404);
  const profile = (brand.profile ?? {}) as Profile;
  const saveLocation = async (loc: Location | undefined) => {
    const next = { ...profile, location: loc };
    if (!loc) delete next.location;
    const { error } = await db.from("brands").update({ profile: next }).eq("id", brand.id);
    if (error) return err(error.message, 500);
    return Response.json({ location: loc ?? null });
  };

  if (body.action === "find") {
    const locked = await requireTrack(ws, "seo");
    if (locked) return locked;
    const query = str(body.query, 200);
    if (query.length < 3) return err("Enter the business name and city.");
    const took = await take(ws, "tasks", TASK_COST.localfind, { refundIfFree: false });
    if (!took.ok) return took.response;
    try {
      return Response.json({ places: await findPlaces(query, profile.country) });
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e), 502);
    }
  }

  if (body.action === "set") {
    const p = (body.place ?? {}) as Partial<Place>;
    if (!p.title || typeof p.lat !== "number" || typeof p.lng !== "number") return err("Pick a business from the list.");
    const keep = profile.location;
    return saveLocation({
      title: str(p.title, 200),
      cid: p.cid ? str(p.cid, 60) : null,
      placeId: p.placeId ? str(p.placeId, 200) : null,
      address: p.address ? str(p.address, 300) : null,
      phone: p.phone ? str(p.phone, 60) : null,
      category: p.category ? str(p.category, 100) : null,
      categories: Array.isArray(p.categories) ? p.categories.slice(0, 10).map((c) => str(c, 100)) : [],
      lat: p.lat,
      lng: p.lng,
      city: cityOf(p.address),
      keywords: keep?.keywords ?? (p.category ? [p.category.toLowerCase()] : []),
      spacing: keep?.spacing ?? 1,
      weekly: keep?.weekly ?? true,
    });
  }

  if (body.action === "clear") return saveLocation(undefined);

  const loc = profile.location;
  if (!loc) return err("Add the business location first.");

  if (body.action === "settings") {
    const next = { ...loc };
    if (Array.isArray(body.keywords)) next.keywords = [...new Set((body.keywords as unknown[]).map((k) => str(k, 80).toLowerCase()).filter(Boolean))].slice(0, 5);
    if (SPACINGS.includes(Number(body.spacing))) next.spacing = Number(body.spacing);
    if (typeof body.weekly === "boolean") next.weekly = body.weekly;
    return saveLocation(next);
  }

  if (body.action === "scan") {
    const locked = await requireTrack(ws, "seo");
    if (locked) return locked;
    const keyword = str(body.keyword, 80).toLowerCase();
    if (!keyword) return err("Pick a keyword.");
    const since = new Date(Date.now() - 15 * 60_000).toISOString();
    const { data: running } = await db.from("local_scans").select("id").eq("brand_id", brand.id).eq("keyword", keyword).eq("status", "running").gte("created_at", since).limit(1);
    if (running?.length) return Response.json({ scanId: running[0].id });
    const took = await take(ws, "tasks", TASK_COST.localnow, { refundIfFree: false });
    if (!took.ok) return took.response;
    try {
      const pack = took.fromPack ?? 0;
      const scanId = await startScan(db, ws, me.user?.id ?? null, brand.id, loc, keyword, { fast: true, language: marketOf(profile.country).language, charge: took.period ? { period: took.period, plan: TASK_COST.localnow - pack, pack } : null });
      return Response.json({ scanId });
    } catch (e) {
      // The metered route hands the tasks back on its own when the answer is an error.
      return err(e instanceof Error ? e.message : String(e), 502);
    }
  }

  if (body.action === "prompts") {
    const prompts = localPrompts(loc, loc.keywords);
    if (!prompts.length) return err("The business address has no city.");
    const tool = MCP_TOOLS.find((t) => t.name === "add_prompts");
    if (!tool) return err("Tracking prompts isn't available.", 500);
    try {
      await tool.run({ db, ws }, { brand: brand.name, topic: "Local", prompts });
      return Response.json({ added: prompts });
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  }

  return err("Unknown action.");
}

export const POST = meteredRoute("local research", handle);
