import type { SupabaseClient } from "@supabase/supabase-js";

// What an API key may see. A workspace key sees every brand in its workspace; a brand key (aw_brand_…) sees one.
// The REST API (/api/v1) and the MCP server load brands only through brandRows, so the brand filter
// cannot be left out. tests/brandKeys.test.ts fails if a route or tool reads the brands table any other way.

export type KeyScope = { db: SupabaseClient; ws: string; brandId?: string | null };

/** The brands a key may see, as a query to add filters and order to. */
export function brandRows(scope: KeyScope, cols: string) {
  const q = scope.db.from("brands").select(cols).eq("workspace_id", scope.ws);
  return scope.brandId ? q.eq("id", scope.brandId) : q;
}

/** One brand by id, or null when the key may not see it (another workspace, or another brand for a brand key). */
export async function brandById<T = Record<string, unknown>>(scope: KeyScope, id: string, cols: string): Promise<T | null> {
  if (!id) return null;
  const { data } = await brandRows(scope, cols).eq("id", id).maybeSingle();
  return (data as T | null) ?? null;
}

/** Prompts tracked by every brand in the workspace, for the plan's prompt limit. A number only, never the brands. */
export async function promptsInUse(scope: KeyScope): Promise<number> {
  const { data, error } = await scope.db.from("brands").select("prompts").eq("workspace_id", scope.ws);
  if (error) throw new Error(error.message);
  return ((data ?? []) as { prompts: string[] | null }[]).reduce((n, b) => n + (b.prompts?.length ?? 0), 0);
}
