import "server-only";

// The Writer (Plan & Create › Writer): Zippie's tools to pick the next Calendar pieces, write an outline or a whole
// article, and check how it's going, plus Autopilot, which does the same on a schedule. They start the same background
// jobs as the Write button (writerServer.ts), so the outline, the draft and the quota work the same way.
// ctx.db is the admin client: every query is scoped to ctx.ws by hand.

import type { SupabaseClient } from "@supabase/supabase-js";
import { autopilotDue, cleanAutopilot, rankPicks, type Autopilot, type PieceStatus, type Pick, type WriterCard } from "./contentPicks";
import { dfsReady } from "./dataforseo";
import { entitlement, requireActive, requireWriter } from "./entitlements";
import { ToolError } from "./mcp/protocol";
import { kindLabel } from "./moduleCatalog";
import { draftQuota, periodOf } from "./plans";
import type { BriefRow } from "./writerBrief";
import { stepLabel } from "./writeFlow";
import { startBrief, startDraft } from "./writerServer";
import { brandOf } from "./zippieBrand";
import type { ToolCtx, ToolEmit, ZippieTool } from "./zippieTools";

type Item = { id: string; site_id: string; keyword: string; status: string; extra: Record<string, unknown> | null };

const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const today = () => new Date().toISOString().slice(0, 10);

/** The calendar piece the person means: by id, or by keyword (an exact match first). */
async function findItem(ctx: ToolCtx, args: Record<string, unknown>): Promise<Item> {
  const id = str(args.item_id, 60);
  const keyword = str(args.keyword, 200).toLowerCase();
  if (!id && !keyword) throw new ToolError("Say which piece: its keyword, or its id from get_content_plan or pick_content.");
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

/** Writing spends: the plan must have the writer, the workspace must be active and the server set up. */
async function writable(ws: string): Promise<string | null> {
  const blocked = (await requireWriter(ws)) ?? (await requireActive(ws));
  if (blocked) return ((await blocked.json().catch(() => ({}))) as { error?: string }).error ?? "Writing isn't available on this plan.";
  if (!process.env.ANTHROPIC_API_KEY) return "ANTHROPIC_API_KEY is not set on the server.";
  if (!dfsReady()) return "DataForSEO is not set up, so the writer can't research. Add DFS_LOGIN and DFS_PASSWORD to the server's settings.";
  return null;
}

async function canWrite(ctx: ToolCtx) {
  if (!ctx.canEdit) throw new ToolError("Only editors and admins can start writing.");
  const why = await writable(ctx.ws);
  if (why) throw new ToolError(why);
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

async function outline(db: SupabaseClient, ws: string, userId: string | null, item: Item, note: string | null, draftAfter: boolean) {
  await markItem(db, item, draftAfter);
  const out = await startBrief(db, { workspaceId: ws, item, userId, note });
  if (!out.ok) throw new ToolError(out.error);
  return out.briefId;
}

/** The brand's site (one per brand). */
async function siteOf(db: SupabaseClient, ws: string, brandId: string) {
  const { data } = await db.from("sites").select("id, profile").eq("workspace_id", ws).eq("brand_id", brandId).limit(1).maybeSingle();
  if (!data) throw new ToolError("This brand has no Calendar yet. Build the Content Plan in Calendar first.");
  return data as { id: string; profile: Record<string, unknown> | null };
}

/** The best pieces on a site's Calendar to write next (contentPicks.ts). */
export async function loadPicks(db: SupabaseClient, ws: string, siteId: string, n: number): Promise<Pick[]> {
  const { data, error } = await db.from("calendar_items").select("id, keyword, volume, difficulty, stage, due_date, status").eq("workspace_id", ws).eq("site_id", siteId).neq("status", "published").limit(1000);
  if (error) throw new Error(error.message);
  const items = (data ?? []) as { id: string; keyword: string; volume: number | null; difficulty: number | null; stage: string | null; due_date: string | null; status: string }[];
  if (!items.length) return [];
  const { data: briefs } = await db.from("writer_briefs").select("item_id").eq("workspace_id", ws).in("item_id", items.map((i) => i.id));
  const written = new Set(((briefs ?? []) as { item_id: string }[]).map((b) => b.item_id));
  return rankPicks(items.map((i) => ({ ...i, written: written.has(i.id) })), today(), n);
}

/** Where one piece stands: the outline's headings with their searches, H3s and planned blocks, and the draft. */
export async function pieceStatus(db: SupabaseClient, ws: string, itemId: string): Promise<PieceStatus | null> {
  const { data: item } = await db.from("calendar_items").select("id, keyword").eq("id", itemId).eq("workspace_id", ws).maybeSingle();
  if (!item) return null;
  const [b, d] = await Promise.all([briefOf(db, ws, itemId), draftOf(db, ws, itemId)]);
  const brief = b?.brief ?? null;
  const volumes = new Map((brief?.research.searches ?? []).map((q) => [q.keyword, q.volume ?? 0]));
  return {
    item_id: item.id,
    keyword: item.keyword,
    outline: b
      ? {
          status: b.status === "generating" ? stepLabel("brief", b.step) : b.status,
          busy: b.status === "generating",
          error: b.error,
          title: brief?.h1 ?? null,
          words: brief?.wordTarget ?? null,
          headings: (brief?.outline ?? []).map((o) => ({
            h2: o.h2,
            searches_a_month: (o.searches ?? []).reduce((n, q) => n + (volumes.get(q) ?? 0), 0) || null,
            subheadings: o.h3.map((h) => h.title),
            blocks: (brief?.modules ?? []).filter((m) => m.placement.toLowerCase() === o.h2.toLowerCase()).map((m) => `${kindLabel(m.type)}: ${m.title}`),
          })),
        }
      : null,
    draft: d ? { status: d.status === "generating" ? stepLabel("draft", d.step) : d.status, busy: d.status === "generating", error: d.error, words: d.words, doc_id: d.doc_id } : null,
  };
}

/** Show a card under the reply now, and keep it in the result so the chat shows it again when reopened. */
function card(emit: ToolEmit, c: WriterCard) {
  emit({ type: "writer", card: c });
  return c;
}

export const WRITER_TOOLS: ZippieTool[] = [
  {
    name: "pick_content",
    label: "Picking from the Calendar",
    description:
      "The best pieces on the brand's Editorial Calendar to write next, best first, with a short reason each: not written yet, weighed by searches, how easy they are to rank for, funnel stage and how soon they're due. Shows them as a card with Write buttons. Use it whenever someone wants to write without naming a keyword.",
    input_schema: { type: "object", properties: { brand: { type: "string" }, count: { type: "integer", minimum: 1, maximum: 10, description: "How many picks, 3 by default." } } },
    async run(ctx, args, emit) {
      const brand = await brandOf(ctx, args.brand);
      const site = await siteOf(ctx.db, ctx.ws, brand.id);
      const picks = await loadPicks(ctx.db, ctx.ws, site.id, Number(args.count) || 3);
      if (!picks.length) return { brand: brand.name, picks: [], note: "Nothing left to write on the Calendar. Build or refresh the plan in Calendar, or add a keyword." };
      return { brand: brand.name, picks, writer_card: card(emit, { view: "picks", brand: brand.name, picks }) };
    },
  },
  {
    name: "write_outline",
    label: "Starting the outline",
    description:
      "Start the writer on one piece from the Editorial Calendar: it researches Google's top pages, People Also Ask and the searches people make, then writes an outline whose headings come from those searches, with interactive blocks where they help. Takes a few minutes and runs in the background; the outline lands in Drafts for review. Pass the piece's keyword or item_id. A note steers it (\"focus on restaurants\"). Writing it again replaces the outline.",
    input_schema: { type: "object", properties: { keyword: { type: "string" }, item_id: { type: "string" }, note: { type: "string", description: "One line to steer the outline." } } },
    async run(ctx, args, emit) {
      await canWrite(ctx);
      const item = await findItem(ctx, args);
      const briefId = await outline(ctx.db, ctx.ws, ctx.userId, item, str(args.note, 300) || null, false);
      return { started: "outline", keyword: item.keyword, item_id: item.id, brief_id: briefId, takes: "about 3 to 6 minutes", writer_card: card(emit, { view: "piece", item_id: item.id, keyword: item.keyword }) };
    },
  },
  {
    name: "write_article",
    label: "Starting the article",
    description:
      "Write a whole article for one piece from the Editorial Calendar. With no outline yet, it writes the outline first and then the draft, without stopping. With an outline ready, it writes the draft from it. Runs in the background (about 10 to 20 minutes from scratch) and counts as one of the month's drafts; the article lands in Drafts. Pass the keyword or item_id. A note steers the draft.",
    input_schema: { type: "object", properties: { keyword: { type: "string" }, item_id: { type: "string" }, note: { type: "string", description: "One line to steer the draft." } } },
    async run(ctx, args, emit) {
      await canWrite(ctx);
      const item = await findItem(ctx, args);
      const note = str(args.note, 300) || null;
      const show = () => card(emit, { view: "piece", item_id: item.id, keyword: item.keyword });
      const [draft, b] = await Promise.all([draftOf(ctx.db, ctx.ws, item.id), briefOf(ctx.db, ctx.ws, item.id)]);
      if (draft?.status === "generating") return { already: "writing the draft", keyword: item.keyword, step: stepLabel("draft", draft.step), writer_card: show() };
      if (draft?.status === "ready") return { already: "has a draft", keyword: item.keyword, title: b?.brief?.h1 ?? null, words: draft.words, next: "Ask before writing it again: a new draft replaces this one.", writer_card: show() };
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
        return { started: "draft from the outline", keyword: item.keyword, takes: "about 5 to 10 minutes", writer_card: show() };
      }
      if (b?.status === "generating") {
        await markItem(ctx.db, item, true);
        return { started: "the draft will follow the outline being written now", keyword: item.keyword, step: stepLabel("brief", b.step), writer_card: show() };
      }
      const briefId = await outline(ctx.db, ctx.ws, ctx.userId, item, note, true);
      return { started: "outline, then the draft right after", keyword: item.keyword, brief_id: briefId, takes: "about 10 to 20 minutes", writer_card: show() };
    },
  },
  {
    name: "writing_status",
    label: "Checking the writer",
    description: "Where the writer is on one piece from the Editorial Calendar: the outline (its headings, the searches each answers, its subheadings and planned blocks) and the draft (step and words). Shows a card that keeps updating. Pass the keyword or item_id.",
    input_schema: { type: "object", properties: { keyword: { type: "string" }, item_id: { type: "string" } } },
    async run(ctx, args, emit) {
      const item = await findItem(ctx, args);
      const status = await pieceStatus(ctx.db, ctx.ws, item.id);
      return { ...status, writer_card: card(emit, { view: "piece", item_id: item.id, keyword: item.keyword }) };
    },
  },
];

// ─────────────── Autopilot ───────────────
/**
 * Autopilot, from the worker's schedule tick (every 10 minutes): for each brand whose Autopilot is due in its
 * workspace's time zone, pick the best pieces and start them as write_article does (or only the outline), as the
 * person who turned it on. The day is saved first, so a slow tick never runs a brand twice. A note lands in a Writer
 * chat for that day.
 */
export async function runAutopilots(db: SupabaseClient, now = new Date()) {
  const { data, error } = await db.from("sites").select("id, workspace_id, brand_id, profile").eq("profile->autopilot->>on", "true").limit(500);
  if (error) throw new Error(error.message);
  for (const site of (data ?? []) as { id: string; workspace_id: string; brand_id: string | null; profile: Record<string, unknown> | null }[]) {
    try {
      const a = cleanAutopilot(site.profile?.autopilot);
      const { data: w } = await db.from("workspaces").select("timezone").eq("id", site.workspace_id).maybeSingle();
      const { due, day } = autopilotDue(a, now, (w as { timezone?: string | null } | null)?.timezone);
      if (!due) continue;
      const fresh = await db.from("sites").select("profile").eq("id", site.id).maybeSingle();
      const profile = ((fresh.data as { profile?: Record<string, unknown> } | null)?.profile ?? {}) as Record<string, unknown>;
      if (cleanAutopilot(profile.autopilot).lastRun === day) continue;
      await db.from("sites").update({ profile: { ...profile, autopilot: { ...a, lastRun: day } } }).eq("id", site.id);
      await autopilotRun(db, site.workspace_id, site.id, site.brand_id, a, day);
    } catch (e) {
      console.error("Autopilot failed:", site.id, e instanceof Error ? e.message : e);
    }
  }
}

async function autopilotRun(db: SupabaseClient, ws: string, siteId: string, brandId: string | null, a: Autopilot, day: string) {
  const blocked = await writable(ws);
  const picks = blocked ? [] : await loadPicks(db, ws, siteId, a.count);
  const started: string[] = [];
  const failed: string[] = [];
  for (const p of picks) {
    try {
      const { data } = await db.from("calendar_items").select("id, site_id, keyword, status, extra").eq("id", p.item_id).maybeSingle();
      if (!data) continue;
      await outline(db, ws, a.by ?? null, data as Item, null, a.stop === "draft");
      started.push(p.keyword);
    } catch (e) {
      failed.push(`${p.keyword}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const brand = brandId ? ((await db.from("brands").select("name").eq("id", brandId).maybeSingle()).data as { name: string } | null)?.name : null;
  const what = a.stop === "draft" ? "the outline, then the draft" : "the outline, for your review";
  const text = blocked
    ? `Zippie's Autopilot didn't run today: ${blocked}`
    : !picks.length
      ? `Zippie's Autopilot found nothing left to write on ${brand ?? "the"} Calendar today. Build or refresh the plan in Calendar.`
      : [`Zippie's Autopilot started ${started.length === 1 ? "1 piece" : `${started.length} pieces`} for ${brand ?? "your brand"} today, writing ${what}:`, ...started.map((k) => `- **${k}**`), ...(failed.length ? ["", "These didn't start:", ...failed.map((f) => `- ${f}`)] : []), "", "They land in Drafts. Ask Zippie how they're going any time."].join("\n");
  if (!a.by) return;
  const { data: t } = await db.from("ask_threads").insert({ workspace_id: ws, title: `Autopilot · ${day}`, created_by: a.by }).select("id").single();
  if (t) await db.from("ask_messages").insert({ thread_id: (t as { id: string }).id, workspace_id: ws, role: "assistant", content: text, text });
}
