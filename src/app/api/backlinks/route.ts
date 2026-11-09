import { bareDomain, gapRivals, LINK_KINDS, weekAgo, type LinkKind, type Overview } from "@/lib/backlinks";
import { aiCited, gapRows, keys, loadGap, loadLinks, loadOverview, saved, snapshot } from "@/lib/backlinksServer";
import type { Profile } from "@/lib/db";
import { requireTrack, take } from "@/lib/entitlements";
import { meteredRoute } from "@/lib/meter";
import { TASK_COST } from "@/lib/plans";
import { linkList } from "@/lib/linkBuildingServer";
import { adminClient, isEditor, requireRole } from "@/lib/serverAuth";

export const maxDuration = 120;

const str = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const err = (error: string, status = 400) => Response.json({ error }, { status });

// Backlinks (docs/backlinks.md). Saved answers are free for everyone; a fresh one costs tasks and needs an editor.
// With peek, only saved answers come back, so opening the page never spends anything.
//   overview: { brandId, refresh? }               totals, new and lost by week, anchors, most linked pages, change since last week
//   links:    { brandId, kind, page?, refresh? }  100 linking sites per page: all, new, lost, follow, nofollow or spam
//   gap:      { brandId, rivals?, refresh? }      sites linking to up to 3 rivals but not the brand, AI-cited ones flagged
//   add:      { brandId, domains }                editors: put gap sites on the brand's Link building list
async function handle(request: Request) {
  const body = await request.json().catch(() => ({}));
  const auth = await requireRole(request, body.workspaceId, "viewer");
  if ("denied" in auth) return auth.denied;
  const ws = String(body.workspaceId);
  const db = adminClient();
  if (!db) return err("Add SUPABASE_SECRET_KEY to the server's settings.", 500);
  const { data: brand } = await db.from("brands").select("id, name, domain, profile").eq("id", str(body.brandId, 60)).eq("workspace_id", ws).maybeSingle();
  if (!brand) return err("Brand not found.", 404);
  const target = bareDomain(String(brand.domain));
  const editor = await isEditor(auth.sb, ws);
  const refresh = body.refresh === true;

  /** A saved answer, or a fresh one paid with tasks. Viewers only get saved answers. */
  async function get<T>(key: string, cost: number, load: () => Promise<T>): Promise<Response | { data: T; fresh: boolean }> {
    if (!refresh) {
      const hit = await saved<T>(key);
      if (hit !== undefined) return { data: hit, fresh: false };
    }
    // peek: opening the page shows saved answers only, so nothing is spent until someone asks.
    if (!editor || body.peek === true) return Response.json({ notSaved: true, canRefresh: editor });
    const locked = await requireTrack(ws, "seo");
    if (locked) return locked;
    const took = await take(ws, "tasks", cost, { refundIfFree: false });
    if (!took.ok) return took.response;
    try {
      return { data: await load(), fresh: true };
    } catch (e) {
      // The metered route hands the tasks back on its own when the answer is an error.
      return err(e instanceof Error ? e.message : String(e), 502);
    }
  }

  if (body.action === "overview") {
    const r = await get(keys.overview(target), TASK_COST.backlinks, () => loadOverview(target));
    if (r instanceof Response) return r;
    const o = r.data as Overview & { at: string };
    if (r.fresh) await snapshot(db, ws, brand.id, o);
    const { data: snaps } = await db.from("backlink_snapshots").select("day, rank, backlinks, domains, spam").eq("brand_id", brand.id).order("day", { ascending: false }).limit(20);
    const before = weekAgo((snaps ?? []) as { day: string; rank: number; backlinks: number; domains: number; spam: number }[], new Date().toISOString().slice(0, 10));
    return Response.json({ overview: o, before, canRefresh: editor });
  }

  if (body.action === "links") {
    const kind = (LINK_KINDS.some((k) => k.id === body.kind) ? body.kind : "all") as LinkKind;
    const page = Math.max(0, Math.min(9, Number(body.page) || 0));
    const r = await get(keys.links(target, kind, page), TASK_COST.links, () => loadLinks(target, kind, page));
    if (r instanceof Response) return r;
    return Response.json({ links: r.data, canRefresh: editor });
  }

  if (body.action === "gap") {
    const profile = (brand.profile ?? {}) as Profile;
    const asked = Array.isArray(body.rivals) ? (body.rivals as unknown[]).map((x) => str(x, 200)) : (profile.competitors ?? []).map((c) => c.domain);
    const rivals = gapRivals(asked, target);
    if (!rivals.length) return Response.json({ gap: null, rivals: [], suggested: (profile.competitors ?? []).map((c) => bareDomain(c.domain)).filter(Boolean) });
    const r = await get(keys.gap(target, rivals), TASK_COST.linkgap, () => loadGap(target, rivals));
    if (r instanceof Response) return r;
    const raw = r.data as { perRival: { rival: string; items: unknown[] }[]; at: string };
    const [cited, list] = await Promise.all([aiCited(db, brand.id), linkList(db, ws, brand.id)]);
    let added: string[] = [];
    if (list) {
      const { data: t } = await db.from("outreach_targets").select("domain").eq("list_id", list);
      added = (t ?? []).map((x) => String(x.domain));
    }
    return Response.json({ gap: { rows: gapRows(raw.perRival, target, cited), at: raw.at }, rivals, added, canRefresh: editor });
  }

  if (body.action === "add") {
    if (!editor) return err("Ask an editor to add these.", 403);
    const domains = (Array.isArray(body.domains) ? (body.domains as unknown[]) : []).map((d) => bareDomain(str(d, 200))).filter((d) => /\.[a-z]{2,}$/.test(d)).slice(0, 300);
    if (!domains.length) return err("Pick at least one site.");
    const list = await linkList(db, ws, brand.id, true);
    if (!list) return err("Run supabase/040_outreach.sql in Supabase.", 500);
    // Before 064_link_building.sql there's no source column; the cards still land on the list.
    const withSource = !(await db.from("outreach_targets").select("source").limit(1)).error;
    const { error } = await db
      .from("outreach_targets")
      .upsert(domains.map((d) => ({ list_id: list, workspace_id: ws, kind: "website", name: d, domain: d, url: `https://${d}`, added_from: "link_gap", ...(withSource ? { source: "link_gap", note: "Links to your rivals and not to you" } : {}) })), { onConflict: "list_id,kind,name", ignoreDuplicates: true });
    if (error) return err(error.message, 500);
    return Response.json({ added: domains });
  }

  return err("Unknown action.");
}

export const POST = meteredRoute("backlinks", handle);
