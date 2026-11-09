import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { startPlay } from "./ask";
import { capsOf } from "./cmsEdit";
import type { CmsKind } from "./cmsTypes";
import { PLAYS, type Play } from "./plays";

// Fix buttons on Site Audit and On-page Audit: prepare a change set in the brand's own connected site for exactly
// the pages listed. Nothing goes live until someone approves and applies it.

export class FixError extends Error {
  constructor(message: string, public status: number, public connect = false) {
    super(message);
  }
}

export async function startFix(db: SupabaseClient, ws: string, userId: string, brand: { id: string; name: string }, play: Play, pages: string[]) {
  const { data: conns } = await db.from("cms_connections").select("id, kind, name, config").eq("workspace_id", ws).eq("brand_id", brand.id).order("created_at");
  if (!conns?.length) throw new FixError(`Connect ${brand.name}'s website to fix this.`, 409, true);
  let pick: { id: string } | null = null;
  let note = "";
  for (const c of conns) {
    const caps = await capsOf(c.kind as CmsKind, (c.config ?? {}) as Record<string, string>).catch(() => null);
    if (caps?.[PLAYS[play].cap]) {
      pick = c;
      break;
    }
    note ||= caps?.note ?? "";
  }
  if (!pick) throw new FixError(note || `${conns[0].name} can't make this fix yet.`, 409);
  return startPlay(db, ws, userId, null, pick.id, play, { limit: PLAYS[play].limit, ...(pages.length ? { ids: pages } : {}) });
}
