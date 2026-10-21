// The Library grid's data, read and written by the browser as the signed-in member (docs/content-grid.md).
// Rows are the Library's topics with their brief's plan and their article's doc. A doc starts from the brief
// (briefSkeleton) the first time someone writes a section, and is saved here as they write.
import type { SupabaseClient } from "@supabase/supabase-js";
import { briefSkeleton, docToText, planOf, type GridPlan, type RawBrief } from "./articleGrid";

export type { GridPlan };
import type { PmNode } from "./docHtml";
import type { DocPublishMeta } from "./writerAgent";
import { listTopics, type Topic } from "./writerLibrary";

export type GridDoc = { id: string; title: string; content: PmNode; meta: DocPublishMeta; words: number; updated_at: string };
export type GridRow = { topic: Topic; plan: GridPlan | null; doc: GridDoc | null };

const DOC_COLS = "id, calendar_item_id, title, content, meta, words, updated_at";

/** Every row of a site's grid, newest first. */
export async function listGrid(sb: SupabaseClient, siteId: string): Promise<GridRow[]> {
  const topics = await listTopics(sb, siteId);
  const briefIds = topics.map((t) => t.brief?.id).filter((x): x is string => Boolean(x));
  const ids = topics.map((t) => t.id);
  const [plans, docs] = await Promise.all([
    briefIds.length ? sb.from("writer_briefs").select("id, plan:brief").in("id", briefIds) : Promise.resolve({ data: [], error: null }),
    ids.length ? sb.from("docs").select(DOC_COLS).in("calendar_item_id", ids) : Promise.resolve({ data: [], error: null }),
  ]);
  if (plans.error) throw new Error(plans.error.message);
  if (docs.error) throw new Error(docs.error.message);
  const planById = new Map(((plans.data ?? []) as { id: string; plan: RawBrief | null }[]).map((p) => [p.id, planOf(p.plan)]));
  const docByItem = new Map(((docs.data ?? []) as (GridDoc & { calendar_item_id: string })[]).map((d) => [d.calendar_item_id, { ...d, meta: d.meta ?? {} }]));
  return topics.map((topic) => ({ topic, plan: topic.brief ? (planById.get(topic.brief.id) ?? null) : null, doc: docByItem.get(topic.id) ?? null }));
}

/**
 * The article's doc, made from the brief the first time someone writes: the H1 as its title, the brief's H2s and
 * FAQ as empty sections, and the brief's meta title, description and slug. A doc made a moment ago comes back.
 */
export async function startDoc(sb: SupabaseClient, r: { workspaceId: string; siteId: string; itemId: string; plan: GridPlan }): Promise<GridDoc> {
  const there = await sb.from("docs").select(DOC_COLS).eq("calendar_item_id", r.itemId).maybeSingle();
  if (there.error) throw new Error(there.error.message);
  if (there.data) return { ...(there.data as GridDoc), meta: (there.data as GridDoc).meta ?? {} };
  const meta: DocPublishMeta = { metaTitle: r.plan.title, description: r.plan.description, slug: r.plan.slug };
  const made = await sb
    .from("docs")
    .insert({ workspace_id: r.workspaceId, site_id: r.siteId, calendar_item_id: r.itemId, title: r.plan.h1 || "Untitled", content: briefSkeleton(r.plan), words: 0, meta })
    .select(DOC_COLS)
    .single();
  if (made.error) {
    // Two people started at once: use the one that won.
    if (made.error.code === "23505") return startDoc(sb, r);
    throw new Error(/meta/.test(made.error.message) ? "Run supabase/021_doc_meta.sql in Supabase." : made.error.message);
  }
  return { ...(made.data as GridDoc), meta: (made.data as GridDoc).meta ?? meta };
}

/** Save the article's text, with its word count. */
export async function saveGridDoc(sb: SupabaseClient, id: string, content: PmNode) {
  const words = docToText(content).split(/\s+/).filter(Boolean).length;
  const { error } = await sb.from("docs").update({ content, words, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
  return words;
}

/** Save a doc's publishing details: meta title, meta description and slug, which Publish reads. */
export async function saveGridMeta(sb: SupabaseClient, id: string, meta: DocPublishMeta) {
  const { error } = await sb.from("docs").update({ meta }).eq("id", id);
  if (error) throw new Error(/meta/.test(error.message) ? "Run supabase/021_doc_meta.sql in Supabase to save publishing details." : error.message);
}
