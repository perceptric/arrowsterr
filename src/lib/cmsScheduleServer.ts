import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CMS_API } from "./cms";
import { freshConfig } from "./cmsTokens";
import { runCmsSchedule } from "./cmsSchedule";
import type { CmsKind, Published, PublishInput } from "./cmsTypes";
import { docToHtml } from "./docHtml";
import { dispatch } from "./integrations";
import { finish, type Job } from "./jobs";
import type { DocPublishMeta } from "./writerAgent";
import { framedModules } from "./wpModules";

// cms_publish: put a scheduled article live on its site (not WordPress, which has wp_publish) at its time, with the
// article as it is then. The rules are in cmsSchedule.ts; this file is the database and the CMS call.

type Meta = DocPublishMeta & { published?: Published[] };
const cut = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

export async function cmsPublishJob(db: SupabaseClient, job: Job) {
  const p = job.payload as { docId: string; connectionId: string; at: string };
  const { data: conn } = await db.from("cms_connections").select("id, kind, config, workspace_id").eq("id", p.connectionId).maybeSingle();
  // The site was disconnected, or it's WordPress (its own job): nothing to do.
  if (!conn || conn.kind === "wordpress" || !(conn.kind in CMS_API)) return finish(job.id);
  const doc = async () => {
    const { data, error } = await db.from("docs").select("id, title, content, meta, calendar_item_id").eq("id", p.docId).maybeSingle();
    if (error) throw new Error(error.message);
    return data as { id: string; title: string | null; content: unknown; meta: Meta | null; calendar_item_id: string | null } | null;
  };
  await runCmsSchedule(
    {
      record: async () => ((await doc())?.meta?.published ?? []).find((x) => x.connectionId === conn.id) ?? null,
      goLive: async (id) => {
        const d = await doc();
        if (!d) throw new Error("The article was deleted.");
        const m = d.meta ?? {};
        const input: PublishInput = {
          title: cut(m.title || d.title, 300) || "Untitled",
          html: framedModules(docToHtml(d.content)),
          slug: cut(m.slug, 120),
          description: cut(m.description, 400),
          image: /^https?:\/\//.test(cut(m.image, 1000)) ? cut(m.image, 1000) : "",
          schema: cut(m.schema, 50_000),
          live: true,
        };
        return CMS_API[conn.kind as CmsKind].publish(await freshConfig(db, conn), input, id);
      },
      save: async (rec) => {
        const d = await doc();
        if (!d) return;
        const m = d.meta ?? {};
        const { error } = await db
          .from("docs")
          .update({ meta: { ...m, published: [...(m.published ?? []).filter((x) => x.connectionId !== rec.connectionId), rec] } })
          .eq("id", d.id);
        if (error) throw new Error(error.message);
      },
      published: async (rec) => {
        const d = await doc();
        if (d?.calendar_item_id) await db.from("calendar_items").update({ status: "published", ...(rec.url ? { url: rec.url } : {}) }).eq("id", d.calendar_item_id);
        await dispatch(db, String(conn.workspace_id), "post.published", { title: d?.meta?.title || d?.title || "", url: rec.url, cms: conn.kind }).catch(() => {});
      },
    },
    p.at,
  );
  await finish(job.id);
}
