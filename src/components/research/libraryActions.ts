"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import Link from "@tiptap/extension-link";
import Table from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import { generateJSON } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { createDoc, docForItem, getDoc, replaceDocContent, updateCalendarItem, type CalendarItem, type CalendarStatus, type Doc } from "@/lib/db";
import { statusAfter } from "@/lib/library";
import type { RunAuth } from "@/lib/runner";
import { post } from "./shared";

/** What a generated draft may hold. The full editor reads it as is. */
const DRAFT_EXTENSIONS = [StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }), Link.configure({ openOnClick: false }), Table.configure({ resizable: false }), TableRow, TableHeader, TableCell];

type Json = { text?: string; content?: Json[] };
const textOf = (n: Json): string => (n.text ?? "") + " " + (n.content ?? []).map(textOf).join(" ");
const wordsIn = (doc: Json) => textOf(doc).split(/\s+/).filter(Boolean).length;

/**
 * Generate the draft for a piece from its saved brief, and save it as the piece's draft document.
 * A draft that already exists is kept as a version before the new one goes in, so no edit is lost.
 * The caller saves the brief first and asks before replacing a draft.
 */
export async function generateDraft(sb: SupabaseClient, auth: RunAuth, item: CalendarItem, signal?: AbortSignal): Promise<{ doc: Doc; status: CalendarStatus }> {
  const out = await post<{ title: string; html: string }>(auth, "/api/writer/draft", { itemId: item.id }, signal);
  const content = generateJSON(out.html, DRAFT_EXTENSIONS) as Record<string, unknown>;
  const next = { title: out.title || item.keyword, content, words: wordsIn(content as Json) };

  let doc: Doc;
  const current = await docForItem(sb, item.id);
  if (current) {
    await replaceDocContent(sb, { id: current.id, workspace_id: auth.workspaceId }, next);
    doc = await getDoc(sb, current.id);
  } else {
    doc = await createDoc(sb, { workspace_id: auth.workspaceId, site_id: item.site_id, calendar_item_id: item.id, ...next });
    // Another tab made the draft first: createDoc hands that one back. Keep it as a version and put the new one in.
    if (JSON.stringify(doc.content) !== JSON.stringify(content)) {
      await replaceDocContent(sb, { id: doc.id, workspace_id: auth.workspaceId }, next);
      doc = await getDoc(sb, doc.id);
    }
  }
  const status = statusAfter(item.status, "draft");
  if (status !== item.status) await updateCalendarItem(sb, item.id, { status });
  return { doc, status };
}
