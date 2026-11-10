import type { Profile } from "@/lib/db";
import { entitlement, requireTrack, take } from "@/lib/entitlements";
import { cityOf, gridOf, localLimits, localPrompts, scanTasks, SCHEDULES, SIZES, SPACINGS, type Location, type Place, type Schedule } from "@/lib/local";
import { findPlaces, locationOf, locationsOf, startScan, type SavedLocation } from "@/lib/localServer";
import { queueProfileRead } from "@/lib/localProfileServer";
import { draftReply, queueReviewPull } from "@/lib/localReviewsServer";
import { TOOLS as MCP_TOOLS } from "@/lib/mcp/tools";
import { meteredRoute } from "@/lib/meter";
import { TASK_COST } from "@/lib/plans";
import { marketOf } from "@/lib/research";
import { adminClient, requireRole } from "@/lib/serverAuth";

export const maxDuration = 120;

const str = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const err = (error: string, status = 400) => Response.json({ error }, { status });

// Local Research (docs/local-research.md). Reading locations and scans needs no route: the page asks Supabase.
//   limits:   { brandId }                          locations and keywords per location on this plan
//   find:     { brandId, query }                   editors: the business on Google Maps by name and city (1 task)
//   set:      { brandId, place, locationId? }      editors: add a location, or change the business of one
//   remove:   { brandId, locationId }              editors: delete a location and its scans
//   settings: { brandId, locationId, name?, keywords?, spacing?, size?, shape?, center?, schedule? }
//   scan:     { brandId, locationId, keyword }     editors: a grid scan now, on the priority queue (tasks by points)
//   prompts:  { brandId, locationId }              editors: track local prompts in AI Visibility (plan limits apply)
//   profile:  { brandId, locationId }              editors: read the Google profiles now (the business and its 3 leaders)
//   reviews:  { brandId, locationId }              editors: pull the Google reviews now (the business and its 3 leaders)
//   reply:    { brandId, locationId, reviewId }    editors: a draft reply to one of the business's reviews (1 task)
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
  const limits = localLimits(String((await entitlement(ws)).plan));
  const save = async (loc: SavedLocation) => {
    const { id, ...data } = loc;
    const { error } = await db.from("local_locations").update({ data }).eq("id", id).eq("brand_id", brand.id);
    if (error) return err(error.message, 500);
    return Response.json({ location: loc });
  };

  try {
    if (body.action === "limits") return Response.json({ limits });

    if (body.action === "find") {
      const locked = await requireTrack(ws, "seo");
      if (locked) return locked;
      const query = str(body.query, 200);
      if (query.length < 3) return err("Enter the business name and city.");
      const took = await take(ws, "tasks", TASK_COST.localfind, { refundIfFree: false });
      if (!took.ok) return took.response;
      return Response.json({ places: await findPlaces(query, profile.country) });
    }

    if (body.action === "set") {
      const p = (body.place ?? {}) as Partial<Place>;
      if (!p.title || typeof p.lat !== "number" || typeof p.lng !== "number") return err("Pick a business from the list.");
      const keep = body.locationId ? await locationOf(db, brand.id, str(body.locationId, 60)) : null;
      if (body.locationId && !keep) return err("Location not found.", 404);
      const all = keep ? [] : await locationsOf(db, brand.id);
      if (!keep && all.length >= limits.locations) return err(`Your plan tracks ${limits.locations} ${limits.locations === 1 ? "location" : "locations"}. Remove one or upgrade to add more.`);
      const address = p.address ? str(p.address, 300) : null;
      const data: Location = {
        title: str(p.title, 200),
        cid: p.cid ? str(p.cid, 60) : null,
        placeId: p.placeId ? str(p.placeId, 200) : null,
        address,
        phone: p.phone ? str(p.phone, 60) : null,
        category: p.category ? str(p.category, 100) : null,
        categories: Array.isArray(p.categories) ? p.categories.slice(0, 10).map((c) => str(c, 100)) : [],
        lat: p.lat,
        lng: p.lng,
        city: cityOf(address),
        keywords: keep?.keywords ?? (p.category ? [p.category.toLowerCase()] : []),
        spacing: keep?.spacing ?? 1,
        weekly: keep?.weekly ?? true,
        name: keep?.name ?? (cityOf(address) || str(p.title, 60)),
        size: keep?.size ?? 7,
        shape: keep?.shape ?? "square",
        center: keep?.center ?? null,
        schedule: keep?.schedule ?? "weekly",
      };
      if (keep) return save({ ...data, id: keep.id });
      const { data: row, error } = await db.from("local_locations").insert({ workspace_id: ws, brand_id: brand.id, data, position: all.length }).select("id").single();
      if (error || !row) return err(error?.message ?? "Could not add the location.", 500);
      return Response.json({ location: { ...data, id: row.id } });
    }

    const loc = body.locationId ? await locationOf(db, brand.id, str(body.locationId, 60)) : null;
    if (!loc) return err("Pick a location first.");

    if (body.action === "remove") {
      const { error } = await db.from("local_locations").delete().eq("id", loc.id).eq("brand_id", brand.id);
      if (error) return err(error.message, 500);
      return Response.json({ removed: loc.id });
    }

    if (body.action === "settings") {
      const next: SavedLocation = { ...loc };
      if (typeof body.name === "string") next.name = str(body.name, 60) || loc.name;
      if (Array.isArray(body.keywords)) {
        const kws = [...new Set((body.keywords as unknown[]).map((k) => str(k, 80).toLowerCase()).filter(Boolean))];
        if (kws.length > limits.keywords) return err(`Your plan tracks ${limits.keywords} keywords per location.`);
        next.keywords = kws;
      }
      if (SPACINGS.includes(Number(body.spacing))) next.spacing = Number(body.spacing);
      if (SIZES.includes(Number(body.size))) next.size = Number(body.size);
      if (body.shape === "square" || body.shape === "circle") next.shape = body.shape;
      if (SCHEDULES.some((x) => x.id === body.schedule)) {
        next.schedule = body.schedule as Schedule;
        next.weekly = body.schedule !== "off";
      }
      if (body.center === null) next.center = null;
      else if (body.center && typeof body.center === "object") {
        const c = body.center as { lat?: unknown; lng?: unknown };
        const lat = Number(c.lat);
        const lng = Number(c.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 85 || Math.abs(lng) > 180) return err("That center isn't on the map.");
        next.center = { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
      }
      return save(next);
    }

    if (body.action === "scan") {
      const locked = await requireTrack(ws, "seo");
      if (locked) return locked;
      const keyword = str(body.keyword, 80).toLowerCase();
      if (!keyword) return err("Pick a keyword.");
      const since = new Date(Date.now() - 15 * 60_000).toISOString();
      const { data: running } = await db.from("local_scans").select("id").eq("location_id", loc.id).eq("keyword", keyword).eq("status", "running").gte("created_at", since).limit(1);
      if (running?.length) return Response.json({ scanId: running[0].id });
      const cost = scanTasks(gridOf(loc).points.length, true);
      const took = await take(ws, "tasks", cost, { refundIfFree: false });
      if (!took.ok) return took.response;
      const pack = took.fromPack ?? 0;
      // The metered route hands the tasks back on its own when the answer is an error.
      const scanId = await startScan(db, ws, me.user?.id ?? null, brand.id, loc, keyword, { fast: true, language: marketOf(profile.country).language, charge: took.period ? { period: took.period, plan: cost - pack, pack } : null });
      return Response.json({ scanId });
    }

    if (body.action === "profile") {
      const locked = await requireTrack(ws, "seo");
      if (locked) return locked;
      const took = await take(ws, "tasks", TASK_COST.localprofile, { refundIfFree: false });
      if (!took.ok) return took.response;
      await queueProfileRead(loc.id, ws);
      return Response.json({ queued: true });
    }

    if (body.action === "reviews") {
      const locked = await requireTrack(ws, "seo");
      if (locked) return locked;
      const took = await take(ws, "tasks", TASK_COST.localreviews, { refundIfFree: false });
      if (!took.ok) return took.response;
      await queueReviewPull(loc.id, ws);
      return Response.json({ queued: true });
    }

    if (body.action === "reply") {
      const locked = await requireTrack(ws, "seo");
      if (locked) return locked;
      const reviewId = str(body.reviewId, 60);
      if (!reviewId) return err("Pick a review.");
      const took = await take(ws, "tasks", TASK_COST.localreply, { refundIfFree: false });
      if (!took.ok) return took.response;
      // The metered route hands the task back on its own when the answer is an error.
      return Response.json({ text: await draftReply(db, brand.id, loc, reviewId) });
    }

    if (body.action === "prompts") {
      const prompts = localPrompts(loc, loc.keywords);
      if (!prompts.length) return err("The business address has no city.");
      const tool = MCP_TOOLS.find((t) => t.name === "add_prompts");
      if (!tool) return err("Tracking prompts isn't available.", 500);
      await tool.run({ db, ws }, { brand: brand.name, topic: "Local", prompts });
      return Response.json({ added: prompts });
    }
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e), 502);
  }

  return err("Unknown action.");
}

export const POST = meteredRoute("local research", handle);
