import { after } from "next/server";
import { requireTrack, take } from "@/lib/entitlements";
import { queueReady } from "@/lib/jobs";
import { bare, moveError, suppressed, validUrl, type Stage } from "@/lib/linkBuilding";
import { addProspects, CARD_COLS, checkLink, draftPitch, findAiCites, findBroken, findContact, findMentions, linkList, queueCheck, suppression, type Brand } from "@/lib/linkBuildingServer";
import { meteredRoute } from "@/lib/meter";
import { TASK_COST } from "@/lib/plans";
import { adminClient, isEditor, requireRole } from "@/lib/serverAuth";

export const maxDuration = 300;

const str = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const err = (error: string, status = 400) => Response.json({ error }, { status });
const SETUP = "Run supabase/064_link_building.sql with psql on the VPS database to turn on Link Building.";

// Link Building (docs/link-building.md). Cards are outreach_targets on the brand's "Link building" list.
//   list:   { brandId }                          viewers: every card, and which are on the do-not-contact list
//   find:   { brandId, source }                  editors: ai_cites (free), broken_page (20 tasks), unlinked_mention (20)
//   add:    { brandId, url, note? }              editors: one site by hand
//   move:   { brandId, id, stage, linkPage? }    editors: Won needs the page where the link is
//   draft:  { brandId, id }                      editors: find a contact email and draft a pitch (3 tasks)
//   save:   { brandId, id, email?, subject?, body?, note?, linkPage? }
//   sent:   { brandId, id }                      editors: the person sent it from their own email, so it moves to Contacted
//   dnc:    { brandId, id }                      editors: add to the do-not-contact list and close the card
//   check:  { brandId, id }                      editors: check a won link now
//   delete: { brandId, id }                      editors
async function handle(request: Request) {
  const body = await request.json().catch(() => ({}));
  const auth = await requireRole(request, body.workspaceId, "viewer");
  if ("denied" in auth) return auth.denied;
  const ws = String(body.workspaceId);
  const db = adminClient();
  if (!db) return err("Add SUPABASE_SECRET_KEY to the server's settings.", 500);
  const { data: brand } = await db.from("brands").select("id, name, domain, profile").eq("id", str(body.brandId, 60)).eq("workspace_id", ws).maybeSingle();
  if (!brand) return err("Brand not found.", 404);
  const b = brand as Brand;
  const editor = await isEditor(auth.sb, ws);

  if (body.action === "list") {
    const list = await linkList(db, ws, b.id);
    if (!list) return Response.json({ cards: [], blocked: [], canEdit: editor, rivals: (b.profile?.competitors ?? []).filter((c) => c.domain).length });
    const { data, error } = await db.from("outreach_targets").select(CARD_COLS).eq("list_id", list).order("created_at", { ascending: false }).limit(1000);
    if (error) return err(/stage|source|link_/.test(error.message) ? SETUP : error.message, 500);
    const dnc = await suppression(db, ws);
    const cards = (data ?? []) as unknown as { id: string; domain: string | null; email: string | null }[];
    return Response.json({ cards, blocked: cards.filter((c) => suppressed(c, dnc)).map((c) => c.id), canEdit: editor, rivals: (b.profile?.competitors ?? []).filter((c) => c.domain).length });
  }

  if (!editor) return err("Ask an editor to change Link Building.", 403);
  const listId = await linkList(db, ws, b.id, true);
  if (!listId) return err("Run supabase/040_outreach.sql with psql on the VPS database.", 500);

  if (body.action === "find") {
    const locked = await requireTrack(ws, "seo");
    if (locked) return locked;
    const source = str(body.source, 30);
    // AI cites and broken pages start from rivals; unlinked mentions only need the brand.
    if (source !== "unlinked_mention" && !(b.profile?.competitors ?? []).some((c) => c.domain)) return err("Add competitors with websites to the brand first.");
    const cost = source === "broken_page" ? TASK_COST.broken : source === "unlinked_mention" ? TASK_COST.mentions : 0;
    if (cost) {
      const took = await take(ws, "tasks", cost, { refundIfFree: false });
      if (!took.ok) return took.response;
    }
    try {
      const found = source === "ai_cites" ? await findAiCites(db, b) : source === "broken_page" ? await findBroken(b) : source === "unlinked_mention" ? await findMentions(b) : null;
      if (!found) return err("Pick where to find prospects.");
      const dnc = await suppression(db, ws);
      const added = await addProspects(db, ws, listId, found.filter((p) => !suppressed(p, dnc)));
      return Response.json({ found: found.length, added });
    } catch (e) {
      // The metered route hands the tasks back on its own when the answer is an error.
      return err(e instanceof Error ? e.message : String(e), 502);
    }
  }

  if (body.action === "add") {
    const raw = str(body.url, 500);
    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    if (!validUrl(url)) return err("Enter the site or page address.");
    const added = await addProspects(db, ws, listId, [{ domain: bare(url), url, source: "manual", note: str(body.note, 300) || "Added by hand", score: 0 }]);
    return added ? Response.json({ ok: true }) : err("That site is already on the board.");
  }

  // Every other action works on one card of this brand's list.
  const { data: card } = await db.from("outreach_targets").select(CARD_COLS).eq("id", str(body.id, 60)).eq("list_id", listId).maybeSingle();
  if (!card) return err("Card not found.", 404);
  const c = card as unknown as { id: string; domain: string | null; url: string | null; email: string | null; email_status: string; stage: Stage; source: string; note: string | null; link_page: string | null; draft_subject: string | null; draft_body: string | null };
  const dnc = await suppression(db, ws);
  const blocked = suppressed(c, dnc);
  const now = new Date().toISOString();
  const update = async (patch: Record<string, unknown>) => {
    const { data, error } = await db.from("outreach_targets").update({ ...patch, updated_at: now }).eq("id", c.id).select(CARD_COLS).single();
    if (error) return err(error.message, 500);
    return Response.json({ card: data });
  };

  if (body.action === "move") {
    const stage = str(body.stage, 20) as Stage;
    const linkPage = str(body.linkPage, 1000) || c.link_page;
    const why = moveError(stage, linkPage, blocked);
    if (why) return err(why, 409);
    const won = stage === "won";
    const res = await update({ stage, stage_at: now, ...(won ? { link_page: linkPage, link_live: null, link_misses: 0, link_checked_at: null } : {}) });
    if (won && res.ok) {
      if (await queueReady()) await queueCheck(ws, c.id);
      else after(() => checkLink(db, c.id));
    }
    return res;
  }

  if (body.action === "draft") {
    if (blocked) return err("This site is on your do-not-contact list.", 409);
    const took = await take(ws, "tasks", TASK_COST.pitch, { refundIfFree: false });
    if (!took.ok) return took.response;
    try {
      const contact = c.email ? { email: c.email, source: null } : await findContact(c.domain ?? bare(c.url ?? ""));
      if (contact.email && suppressed({ email: contact.email }, dnc)) return err("This contact is on your do-not-contact list.", 409);
      const pitch = await draftPitch(b, { domain: c.domain ?? bare(c.url ?? ""), url: c.url, note: c.note, source: c.source });
      return update({
        draft_subject: pitch.subject,
        draft_body: pitch.body,
        draft_status: "ready",
        drafted_at: now,
        ...(c.email ? {} : contact.email ? { email: contact.email, email_source: contact.source, email_status: "found" } : { email_status: "not_found" }),
      });
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e), 502);
    }
  }

  if (body.action === "save") {
    const patch: Record<string, unknown> = {};
    if (typeof body.email === "string") {
      const e = str(body.email, 200).toLowerCase();
      if (e && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(e)) return err("That email doesn't look right.");
      Object.assign(patch, { email: e || null, email_source: e ? "manual" : null, email_status: e ? "manual" : "pending" });
    }
    if (typeof body.subject === "string") patch.draft_subject = str(body.subject, 140);
    if (typeof body.body === "string") patch.draft_body = str(body.body, 2500);
    if (typeof body.note === "string") patch.note = str(body.note, 300);
    if (typeof body.linkPage === "string") {
      const u = str(body.linkPage, 1000);
      if (u && !validUrl(u)) return err("Enter the full page address.");
      patch.link_page = u || null;
    }
    return update(patch);
  }

  if (body.action === "sent") {
    if (blocked) return err("This site is on your do-not-contact list.", 409);
    return update({ stage: c.stage === "prospect" ? "contacted" : c.stage, stage_at: c.stage === "prospect" ? now : undefined, status: "sent" });
  }

  if (body.action === "dnc") {
    const value = (c.email || c.domain || bare(c.url ?? "")).toLowerCase();
    if (!value) return err("Nothing to block.");
    const { error } = await db.from("outreach_suppression").upsert({ workspace_id: ws, value, reason: "manual" }, { onConflict: "workspace_id,value", ignoreDuplicates: true });
    if (error) return err(error.message, 500);
    return update({ stage: "lost", stage_at: now, status: "do_not_contact" });
  }

  if (body.action === "check") {
    if (c.stage !== "won" || !c.link_page) return err("Only won links with a page can be checked.");
    await checkLink(db, c.id);
    const { data } = await db.from("outreach_targets").select(CARD_COLS).eq("id", c.id).single();
    return Response.json({ card: data });
  }

  if (body.action === "delete") {
    const { error } = await db.from("outreach_targets").delete().eq("id", c.id);
    if (error) return err(error.message, 500);
    return Response.json({ ok: true });
  }

  return err("Unknown action.");
}

export const POST = meteredRoute("link building", handle);
