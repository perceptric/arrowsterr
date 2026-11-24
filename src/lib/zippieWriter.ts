import "server-only";

// Zippie's writing tools: write an outline or a whole article for a piece on the Editorial Calendar, and check how
// it's going. They start the same background jobs as the Write button (writerServer.ts), so the outline, the draft
// and the quota work the same way. ctx.db is the admin client: every query is scoped to ctx.ws by hand.

import type { SupabaseClient } from "@supabase/supabase-js";
import { dfsReady } from "./dataforseo";
import { entitlement, requireActive, requireWriter } from "./entitlements";
import { ToolError } from "./mcp/protocol";
import { draftQuota, periodOf } from "./plans";
import type { BriefRow } from "./writerBrief";
import { stepLabel } from "./writeFlow";
import { startBrief, startDraft } from "./writerServer";
import type { ToolCtx, ZippieTool } from "./zippieTools";

type Item = { id: string; site_id: string; keyword: string; status: string; extra: Record<string, unknown> | null };

const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

/** The calendar piece the person means: by id, or by keyword (an exact match first). */
async function findItem(ctx: ToolCtx, args: Record<string, unknown>): Promise<Item> {
  const id = str(args.item_id, 60);
  const keyword = str(args.keyword, 200).toLowerCase();
  if (!id && !keyword) throw new ToolError("Say which piece: its keyword, or its id from get_content_plan.");
  let q = ctx.db.from("calendar_items").select("id, site_id, keyword, status, extra").eq("workspace_id", ctx.ws);
  q = id ? q.eq("id", id) : q.ilike("keyword", `%${keyword.replace(/[%,]/g, "")}%`);
  const { data, error } = await q.limit(10);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Item[];
  const exact = rows.filter((r) => r.keyword.toLowerCase() === keyword);
  const pick = id ? rows : exact.length ? exact : rows;
  if (!pick.length) throw new ToolError(`"${keyword || id}" isn't on the Editorial Calendar. Add it with add_to_content_plan first, then write it.`);
  if (pick.length > 1) throw new ToolError(`More than one piece matches: ${pick.map((r) => `"${r.keyword}" (${r.id})`).join(", ")}. Ask which one, then pass its item_id.`);
  return pick[0];
}

/** Writing spends: the person must be an editor, the plan must have the writer and the workspace must be active. */
async function canWrite(ctx: ToolCtx) {
  if (!ctx.canEdit) throw new ToolError("Only editors and admins can start writing.");
  const blocked = (await requireWriter(ctx.ws)) ?? (await requireActive(ctx.ws));
  if (blocked) throw new ToolError(((await blocked.json().catch(() => ({}))) as { error?: string }).error ?? "Writing isn't available on this plan.");
  if (!process.env.ANTHROPIC_API_KEY) throw new ToolError("ANTHROPIC_API_KEY is not set on the server.");
}

/** Put the piece in Drafts (as the Write button does) and, for a whole article, mark it to draft as soon as its outline is done. */
async function markItem(db: SupabaseClient, item: Item, draftAfter: boolean) {
  const extra = { ...(item.extra ?? {}), in_writer_at: item.extra?.in_writer_at ?? new Date().toISOString(), ...(draftAfter ? { draft_after_outline: true } : {}) };
  const { error } = await db.from("calendar_items").update({ extra }).eq("id", item.id);
  if (error) throw new Error(error.message);
}

async function briefOf(db: SupabaseClient, ws: string, itemId: string) {
  const { data } = await db.from("writer_briefs").select("*").eq("item_id", itemId).eq("workspace_id", ws).maybeSingle();
  return data as BriefRow | null;
}

async function draftOf(db: SupabaseClient, ws: string, itemId: string) {
  const { data } = await db.from("writer_drafts").select("id, status, step, error, doc_id, words").eq("item_id", itemId).eq("workspace_id", ws).maybeSingle();
  return data as { id: string; status: string; step: string; error: string | null; doc_id: string | null; words: number | null } | null;
}

async function outline(ctx: ToolCtx, item: Item, note: string | null, draftAfter: boolean) {
  if (!dfsReady()) throw new ToolError("DataForSEO is not set up, so the writer can't research. Add DFS_LOGIN and DFS_PASSWORD to the server's settings.");
  await markItem(ctx.db, item, draftAfter);
  const out = await startBrief(ctx.db, { workspaceId: ctx.ws, item, userId: ctx.userId, note });
  if (!out.ok) throw new ToolError(out.error);
  return out.briefId;
}

export const WRITER_TOOLS: ZippieTool[] = [
  {
    name: "write_outline",
    label: "Starting the outline",
    description:
      "Start the writer on one piece from the Editorial Calendar: it researches Google's top pages, People Also Ask and the searches people make, then writes an outline whose headings come from those searches. Takes a few minutes and runs in the background; the outline lands in Drafts for review. Pass the piece's keyword or its item_id from get_content_plan. A note steers it (\"focus on restaurants\"). Writing it again replaces the outline.",
    input_schema: { type: "object", properties: { keyword: { type: "string" }, item_id: { type: "string" }, note: { type: "string", description: "One line to steer the outline." } } },
    async run(ctx, args) {
      await canWrite(ctx);
      const item = await findItem(ctx, args);
      const briefId = await outline(ctx, item, str(args.note, 300) || null, false);
      return { started: "outline", keyword: item.keyword, item_id: item.id, brief_id: briefId, takes: "about 3 to 6 minutes", open: "/drafts", next: "Check it with writing_status. When it's ready, write_article writes the draft from it." };
    },
  },
  {
    name: "write_article",
    label: "Starting the article",
    description:
      "Write a whole article for one piece from the Editorial Calendar. With no outline yet, it writes the outline first and then the draft, without stopping. With an outline ready, it writes the draft from it. Runs in the background (about 10 to 20 minutes from scratch) and counts as one of the month's drafts; the article lands in Drafts. Pass the keyword or item_id from get_content_plan. A note steers the draft.",
    input_schema: { type: "object", properties: { keyword: { type: "string" }, item_id: { type: "string" }, note: { type: "string", description: "One line to steer the draft." } } },
    async run(ctx, args) {
      await canWrite(ctx);
      const item = await findItem(ctx, args);
      const note = str(args.note, 300) || null;
      const [draft, b] = await Promise.all([draftOf(ctx.db, ctx.ws, item.id), briefOf(ctx.db, ctx.ws, item.id)]);
      if (draft?.status === "generating") return { already: "writing the draft", keyword: item.keyword, step: stepLabel("draft", draft.step), open: "/drafts" };
      if (draft?.status === "ready") return { already: "has a draft", keyword: item.keyword, title: b?.brief?.h1 ?? null, words: draft.words, open: "/drafts", next: "Ask before writing it again: a new draft replaces this one." };
      if (b && (b.status === "ready" || b.status === "approved") && b.brief) {
        // An outline is ready: approve it and write the draft from it, as the outline screen's Write draft does.
        let brief = b;
        if (b.status === "ready") {
          const now = new Date().toISOString();
          const { error } = await ctx.db.from("writer_briefs").update({ status: "approved", approved_by: ctx.userId, approved_at: now, updated_at: now }).eq("id", b.id).eq("status", "ready");
          if (error) throw new Error(error.message);
          brief = { ...b, status: "approved" };
        }
        const e = await entitlement(ctx.ws);
        const out = await startDraft(ctx.db, { brief, ...draftQuota(e.limits, periodOf("tasks", new Date(), e.anchor)), note, confirm: false, userId: ctx.userId });
        if (!out.ok) throw new ToolError(out.error);
        return { started: "draft from the outline", keyword: item.keyword, takes: "about 5 to 10 minutes", open: "/drafts", next: "Check it with writing_status." };
      }
      if (b?.status === "generating") {
        await markItem(ctx.db, item, true);
        return { started: "the draft will follow the outline being written now", keyword: item.keyword, step: stepLabel("brief", b.step), open: "/drafts" };
      }
      const briefId = await outline(ctx, item, note, true);
      return { started: "outline, then the draft right after", keyword: item.keyword, brief_id: briefId, takes: "about 10 to 20 minutes", open: "/drafts", next: "Check it with writing_status." };
    },
  },
  {
    name: "writing_status",
    label: "Checking the writer",
    description: "Where the writer is on one piece from the Editorial Calendar: the outline (its headings, the searches each answers and its subheadings) and the draft (step, title, words). Pass the keyword or item_id.",
    input_schema: { type: "object", properties: { keyword: { type: "string" }, item_id: { type: "string" } } },
    async run(ctx, args) {
      const item = await findItem(ctx, args);
      const [b, d] = await Promise.all([briefOf(ctx.db, ctx.ws, item.id), draftOf(ctx.db, ctx.ws, item.id)]);
      const volumes = new Map((b?.brief?.research.searches ?? []).map((q) => [q.keyword, q.volume ?? 0]));
      return {
        keyword: item.keyword,
        outline: b
          ? {
              status: b.status === "generating" ? stepLabel("brief", b.step) : b.status,
              error: b.error,
              title: b.brief?.h1 ?? null,
              headings: (b.brief?.outline ?? []).map((o) => ({
                h2: o.h2,
                searches_a_month: (o.searches ?? []).reduce((n, q) => n + (volumes.get(q) ?? 0), 0) || null,
                subheadings: o.h3.map((h) => h.title),
              })),
            }
          : null,
        draft: d ? { status: d.status === "generating" ? stepLabel("draft", d.step) : d.status, error: d.error, words: d.words, doc_id: d.doc_id } : null,
        open: "/drafts",
      };
    },
  },
];
