// The Library grid's data, read and written by the browser as the signed-in member (docs/content-grid.md).
// Rows are the Library's topics with their brief's plan and their draft's doc.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PmNode } from "./docHtml";
import type { DocPublishMeta } from "./writerAgent";
import { listTopics, type Topic } from "./writerLibrary";

export type GridDoc = { id: string; title: string; content: PmNode; meta: DocPublishMeta; words: number; updated_at: string };
export type GridPlan = { h1: string; title: string; description: string; slug: string; outline: string[] };
export type GridRow = { topic: Topic; plan: GridPlan | null; doc: GridDoc | null };

/** Every row of a site's grid, newest first. */
export async function listGrid(sb: SupabaseClient, siteId: string): Promise<GridRow[]> {
  const topics = await listTopics(sb, siteId);
  const briefIds = topics.map((t) => t.brief?.id).filter((x): x is string => Boolean(x));
  const docIds = topics.map((t) => t.draft?.doc_id).filter((x): x is string => Boolean(x));
  const [plans, docs] = await Promise.all([
    briefIds.length ? sb.from("writer_briefs").select("id, plan:brief").in("id", briefIds) : Promise.resolve({ data: [], error: null }),
    docIds.length ? sb.from("docs").select("id, title, content, meta, words, updated_at").in("id", docIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (plans.error) throw new Error(plans.error.message);
  if (docs.error) throw new Error(docs.error.message);
  type PlanRow = { id: string; plan: { h1?: string; titles?: string[]; metaDescription?: string; slug?: string; outline?: { h2: string }[] } | null };
  const planOf = new Map(((plans.data ?? []) as PlanRow[]).map((p) => [p.id, p.plan]));
  const docOf = new Map(((docs.data ?? []) as GridDoc[]).map((d) => [d.id, { ...d, meta: d.meta ?? {} }]));
  return topics.map((topic): GridRow => {
    const p = topic.brief ? planOf.get(topic.brief.id) : null;
    const plan = p ? { h1: p.h1 ?? "", title: p.titles?.[0] ?? p.h1 ?? "", description: p.metaDescription ?? "", slug: p.slug ?? "", outline: (p.outline ?? []).map((o) => o.h2) } : null;
    return { topic, plan, doc: topic.draft?.doc_id ? (docOf.get(topic.draft.doc_id) ?? null) : null };
  });
}

/** Save a draft's publishing details: meta title, meta description and slug, which Publish reads. */
export async function saveGridMeta(sb: SupabaseClient, id: string, meta: DocPublishMeta) {
  const { error } = await sb.from("docs").update({ meta }).eq("id", id);
  if (error) throw new Error(/meta/.test(error.message) ? "Run supabase/021_doc_meta.sql in Supabase to save publishing details." : error.message);
}
