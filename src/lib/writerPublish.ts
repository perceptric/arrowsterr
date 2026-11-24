import "server-only";

// Autopilot's last step (Plan & Create › Writer): when a draft it started is done, send it to the brand's site, as a
// draft or live on its Calendar date. It uses the same server pieces as scheduled publishing: the article as HTML from
// the saved draft (docHtml.ts), WordPress through wpSync, every other CMS through CMS_API, and the publish jobs for a
// date still ahead. The person picked this in Autopilot's settings; nothing here runs for a piece they wrote by hand.

import type { SupabaseClient } from "@supabase/supabase-js";
import { CMS_API } from "./cms";
import { cmsScheduleKey } from "./cmsSchedule";
import { freshConfig } from "./cmsTokens";
import type { CmsKind, Published, PublishInput } from "./cmsTypes";
import { docToHtml } from "./docHtml";
import { indexNow } from "./indexing";
import { dispatch } from "./integrations";
import { enqueue } from "./jobs";
import type { DocPublishMeta } from "./writerAgent";
import { framedModules } from "./wpModules";
import { publishToWp, scheduleKey } from "./wpSync";
import { pubStore, wpClient } from "./wpSyncServer";

type Meta = DocPublishMeta & { published?: Published[] };
const cut = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

/** The Calendar date at 9:00 UTC, when it's still ahead; otherwise null (publish now). */
export function publishAt(due: string | null | undefined, now = new Date()): string | null {
  if (!due || !/^\d{4}-\d{2}-\d{2}$/.test(due)) return null;
  const at = new Date(`${due}T09:00:00Z`);
  return at.getTime() > now.getTime() + 5 * 60_000 ? at.toISOString() : null;
}

/** Send a draft to the first site connected to its brand. Returns what happened, in a line for the Writer chat. */
export async function autoPublish(db: SupabaseClient, ws: string, docId: string, live: boolean): Promise<string> {
  const { data: doc } = await db.from("docs").select("id, site_id, title, content, meta, calendar_item_id").eq("id", docId).maybeSingle();
  if (!doc) return "the draft was deleted";
  const { data: site } = await db.from("sites").select("brand_id").eq("id", doc.site_id).maybeSingle();
  const brandId = (site?.brand_id as string | null | undefined) ?? null;
  if (!brandId) return "it has no brand";
  const { data: conn } = await db.from("cms_connections").select("id, kind, config").eq("workspace_id", ws).eq("brand_id", brandId).order("created_at").limit(1).maybeSingle();
  if (!conn || !(conn.kind in CMS_API)) return "no publishing site is connected for this brand (Integrations)";
  const { data: item } = doc.calendar_item_id ? await db.from("calendar_items").select("due_date").eq("id", doc.calendar_item_id).maybeSingle() : { data: null };
  const at = live ? publishAt((item as { due_date?: string | null } | null)?.due_date) : null;
  const meta = (doc.meta ?? {}) as Meta;
  const title = cut(meta.title || doc.title, 300) || "Untitled";
  const html = docToHtml(doc.content);
  const now = live && !at;

  if (conn.kind === "wordpress") {
    const { pub } = await publishToWp(wpClient(conn.config as Record<string, string>), pubStore(db), {
      workspaceId: ws,
      docId: doc.id,
      connectionId: conn.id,
      title,
      html,
      mode: !live ? "draft" : at ? "schedule" : "publish",
      scheduleAt: at,
      options: { slug: cut(meta.slug, 120), metaDescription: cut(meta.description, 400), image: cut(meta.image, 1000), schema: cut(meta.schema, 50_000) },
    });
    if (at) await enqueue("wp_publish", { pubId: pub.id, at }, { workspaceId: ws, key: scheduleKey(pub.id, at), runAt: new Date(Date.parse(at) + 90_000), maxAttempts: 8 }).catch(() => {});
    if (now) await wentLive(db, ws, doc.calendar_item_id, title, pub.url ?? null, "wordpress");
  } else {
    const before = meta.published?.find((p) => p.connectionId === conn.id);
    const input: PublishInput = { title, html: framedModules(html), slug: cut(meta.slug, 120), description: cut(meta.description, 400), image: cut(meta.image, 1000), schema: cut(meta.schema, 50_000), live: now };
    const out = await CMS_API[conn.kind as CmsKind].publish(await freshConfig(db, conn), input, before?.id);
    const rec: Published = { connectionId: conn.id, kind: conn.kind as CmsKind, id: out.id, url: out.url ?? before?.url ?? null, live: now, at: new Date().toISOString(), ...(at ? { scheduledFor: at } : {}) };
    await db.from("docs").update({ meta: { ...meta, published: [...(meta.published ?? []).filter((p) => p.connectionId !== conn.id), rec] } }).eq("id", doc.id);
    if (at) await enqueue("cms_publish", { docId: doc.id, connectionId: conn.id, at }, { workspaceId: ws, key: cmsScheduleKey(doc.id, conn.id, at), runAt: new Date(at), maxAttempts: 8 }).catch(() => {});
    if (now) await wentLive(db, ws, doc.calendar_item_id, title, rec.url, conn.kind);
  }
  const where = CMS_NAME[conn.kind] ?? conn.kind;
  return !live ? `sent to ${where} as a draft` : at ? `scheduled on ${where} for ${at.slice(0, 10)}` : `published on ${where}`;
}

const CMS_NAME: Record<string, string> = { wordpress: "WordPress", webflow: "Webflow", shopify: "Shopify", hubspot: "HubSpot", ghost: "Ghost", framer: "Framer" };

async function wentLive(db: SupabaseClient, ws: string, itemId: string | null, title: string, url: string | null, cms: string) {
  if (itemId) await db.from("calendar_items").update({ status: "published", ...(url ? { url } : {}) }).eq("id", itemId);
  await dispatch(db, ws, "post.published", { title, url, cms }).catch(() => {});
  indexNow(ws, url);
}

/**
 * After a draft is done: when Autopilot marked its piece (calendar_items.extra.publish_after), send it on and leave a
 * line in that day's Autopilot chat. The mark is cleared first, so a retried job never publishes twice.
 */
export async function publishAfterDraft(db: SupabaseClient, draftId: string) {
  const { data: d } = await db.from("writer_drafts").select("item_id, doc_id, workspace_id").eq("id", draftId).maybeSingle();
  if (!d?.doc_id || !d.item_id) return;
  const { data: item } = await db.from("calendar_items").select("keyword, extra").eq("id", d.item_id).maybeSingle();
  const extra = ((item?.extra ?? {}) as Record<string, unknown>) ?? {};
  const after = extra.publish_after;
  if (after !== "draft" && after !== "live") return;
  const rest = { ...extra };
  delete rest.publish_after;
  await db.from("calendar_items").update({ extra: rest }).eq("id", d.item_id);
  let line: string;
  try {
    line = `**${item?.keyword ?? "A piece"}** is written and ${await autoPublish(db, d.workspace_id, d.doc_id, after === "live")}.`;
  } catch (e) {
    line = `**${item?.keyword ?? "A piece"}** is written, but sending it to your site failed: ${e instanceof Error ? e.message : String(e)}. Publish it from Drafts.`;
  }
  const thread = typeof extra.autopilot_thread === "string" ? extra.autopilot_thread : null;
  if (thread) await db.from("ask_messages").insert({ thread_id: thread, workspace_id: d.workspace_id, role: "assistant", content: line, text: line });
}
