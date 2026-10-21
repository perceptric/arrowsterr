// The Library grid's data, read and written by the browser as the signed-in member (docs/content-grid.md).
// Rows are the Library's topics with their brief's plan and their article's doc. Columns people add live in
// writer_columns, their values in writer_cells (054_content_grid.sql).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PmNode } from "./docHtml";
import type { DocPublishMeta } from "./writerAgent";
import { listTopics, type Topic } from "./writerLibrary";

export type GridMeta = DocPublishMeta & { locked?: string[] };
export type GridDoc = { id: string; title: string; content: PmNode; meta: GridMeta; words: number; updated_at: string };
export type GridPlan = { h1: string; title: string; description: string; slug: string; outline: string[] };
export type GridColumn = { id: string; name: string; kind: "text" | "ai"; prompt: string; position: number };
export type GridCell = { value: string; status: "ready" | "generating" | "failed"; error: string | null };
export type GridRow = { topic: Topic; plan: GridPlan | null; doc: GridDoc | null; cells: Record<string, GridCell> };

const NOT_RUN = "Run supabase/054_content_grid.sql in Supabase.";
const missing = (m: string) => /writer_columns|writer_cells|schema cache|does not exist/.test(m);

/** Every row of a site's grid, newest first, and the columns people added. */
export async function listGrid(sb: SupabaseClient, siteId: string): Promise<{ rows: GridRow[]; columns: GridColumn[]; columnsError: string }> {
  const topics = await listTopics(sb, siteId);
  const briefIds = topics.map((t) => t.brief?.id).filter((x): x is string => Boolean(x));
  const docIds = topics.map((t) => t.draft?.doc_id).filter((x): x is string => Boolean(x));
  const [plans, docs, cols] = await Promise.all([
    briefIds.length ? sb.from("writer_briefs").select("id, plan:brief").in("id", briefIds) : Promise.resolve({ data: [], error: null }),
    docIds.length ? sb.from("docs").select("id, title, content, meta, words, updated_at").in("id", docIds) : Promise.resolve({ data: [], error: null }),
    sb.from("writer_columns").select("id, name, kind, prompt, position").eq("site_id", siteId).order("position").order("created_at"),
  ]);
  if (plans.error) throw new Error(plans.error.message);
  if (docs.error) throw new Error(docs.error.message);
  const columnsError = cols.error ? (missing(cols.error.message) ? NOT_RUN : cols.error.message) : "";
  const columns = (cols.data ?? []) as GridColumn[];
  const cells = columns.length && topics.length ? await sb.from("writer_cells").select("column_id, item_id, value, status, error").in("column_id", columns.map((c) => c.id)) : { data: [], error: null };
  type PlanRow = { id: string; plan: { h1?: string; titles?: string[]; metaDescription?: string; slug?: string; outline?: { h2: string }[] } | null };
  const planOf = new Map(((plans.data ?? []) as PlanRow[]).map((p) => [p.id, p.plan]));
  const docOf = new Map(((docs.data ?? []) as GridDoc[]).map((d) => [d.id, { ...d, meta: d.meta ?? {} }]));
  type CellRow = GridCell & { column_id: string; item_id: string };
  const cellRows = (cells.data ?? []) as CellRow[];
  const rows = topics.map((topic): GridRow => {
    const p = topic.brief ? planOf.get(topic.brief.id) : null;
    const plan = p ? { h1: p.h1 ?? "", title: p.titles?.[0] ?? p.h1 ?? "", description: p.metaDescription ?? "", slug: p.slug ?? "", outline: (p.outline ?? []).map((o) => o.h2) } : null;
    const own: Record<string, GridCell> = {};
    for (const c of cellRows) if (c.item_id === topic.id) own[c.column_id] = { value: c.value, status: c.status, error: c.error };
    return { topic, plan, doc: topic.draft?.doc_id ? (docOf.get(topic.draft.doc_id) ?? null) : null, cells: own };
  });
  return { rows, columns, columnsError };
}

const must = (r: { error: { message: string } | null }) => {
  if (r.error) throw new Error(missing(r.error.message) ? NOT_RUN : r.error.message);
};

/** Save an article's text and title. Words are counted by the caller. */
export async function saveGridDoc(sb: SupabaseClient, id: string, d: { title?: string; content?: PmNode; words?: number }) {
  must(await sb.from("docs").update({ ...d, updated_at: new Date().toISOString() }).eq("id", id));
}

export async function saveGridMeta(sb: SupabaseClient, id: string, meta: GridMeta) {
  const { error } = await sb.from("docs").update({ meta }).eq("id", id);
  if (error) throw new Error(/meta/.test(error.message) ? "Run supabase/021_doc_meta.sql in Supabase to save publishing details." : error.message);
}

export async function addColumn(sb: SupabaseClient, c: { workspace_id: string; site_id: string; name: string; kind: "text" | "ai"; prompt: string; position: number }): Promise<GridColumn> {
  const r = await sb.from("writer_columns").insert(c).select("id, name, kind, prompt, position").single();
  must(r);
  return r.data as GridColumn;
}

export async function updateColumn(sb: SupabaseClient, id: string, patch: Partial<Pick<GridColumn, "name" | "prompt" | "kind" | "position">>) {
  must(await sb.from("writer_columns").update(patch).eq("id", id));
}

export async function deleteColumn(sb: SupabaseClient, id: string) {
  must(await sb.from("writer_columns").delete().eq("id", id));
}

export async function saveCell(sb: SupabaseClient, c: { workspace_id: string; column_id: string; item_id: string; value: string }) {
  must(await sb.from("writer_cells").upsert({ ...c, status: "ready", error: null, updated_at: new Date().toISOString() }));
}
