import "server-only";
import { GoogleGenAI, Modality } from "@google/genai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { askClaude, askJson } from "./claude";
import type { PmNode } from "./docHtml";
import { charge } from "./meter";
import { brandText, contextPrefix, type BriefRow } from "./writerBrief";
import { briefText, cellPlan, cleanSection, sectionNodes, sectionPrompt, sourcesFor, SECTION_SCHEMA } from "./writerDraft";
import { loadResearch, loadWriterContext, writerModel } from "./writerServer";

// The paid calls behind the Library grid (docs/content-grid.md), each run while the person waits:
// write one cell again, make an image, and fill one cell of an AI column. Each returns what it made; the browser
// puts it into the doc or the cell, so nothing someone is typing gets written over.

/** One cell written again from the brief and the research, with the person's note. Returns the cell's new nodes. */
export async function rewritePart(
  db: SupabaseClient,
  b: BriefRow,
  part: { kind: "intro" } | { kind: "section"; h2: string; index: number },
  opts: { note: string; current: string },
): Promise<PmNode[]> {
  if (!b.brief) throw new Error("This article has no brief yet. Generate it first.");
  if (!b.research_run_id) throw new Error("This article's brief has no research.");
  const [ctx, pack] = await Promise.all([loadWriterContext(db, b.site_id, b.brand_id), loadResearch(db, b.research_run_id)]);
  const sources = sourcesFor(b.brief, pack);
  const prefix = `${contextPrefix(ctx, pack, sources)}\n\n${briefText(b.brief, b.notes)}`;
  const { plan, i } = cellPlan(b.brief, part);
  const ask = [opts.note.trim(), opts.current.trim() ? `The text now, to improve on (keep what works):\n${opts.current.trim().slice(0, 8000)}` : ""].filter(Boolean).join("\n\n");
  const raw = await askJson(sectionPrompt(plan, i, b.brief, sources, null, ask || null), SECTION_SCHEMA, { prefix, model: writerModel(), maxTokens: 4000 });
  const section = cleanSection(raw, plan[i]);
  if (!section.blocks.length) throw new Error("The writer came back empty. Try again with a different note.");
  return sectionNodes(section);
}

/** The image model. Gemini's image model unless IMAGE_MODEL says otherwise. */
const imageModel = () => process.env.IMAGE_MODEL?.trim() || "gemini-2.5-flash-image";
// What one image costs, for the meter. Set IMAGE_PRICE when the vendor's price changes (docs/content-grid.md).
const imagePrice = () => Number(process.env.IMAGE_PRICE) || 0.04;

/**
 * An image for an article, made from a short description in the brand's colors, saved to the doc's folder in the
 * doc-images bucket (028_doc_images.sql). Returns its public address and alt text.
 */
export async function makeImage(db: SupabaseClient, opts: { workspaceId: string; docId: string; siteId: string; brandId: string | null; prompt: string }): Promise<{ src: string; alt: string }> {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set on the server.");
  const ctx = await loadWriterContext(db, opts.siteId, opts.brandId);
  const k = ctx.kit;
  const look = k ? `Use the brand colors: primary ${k.colors.primary}, secondary ${k.colors.secondary}, ink ${k.colors.ink}.` : "";
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const resp = await ai.models.generateContent({
    model: imageModel(),
    contents: `An image for a blog article by ${ctx.brand.name}: ${opts.prompt}\n\nClean, modern, editorial. No text, letters or logos in the image. Wide 16:9. ${look}`,
    config: { responseModalities: [Modality.IMAGE] },
  });
  const data = resp.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
  if (!data?.data) throw new Error("The image model returned no image. Try a different description.");
  charge("gemini", imagePrice());
  const type = data.mimeType || "image/png";
  const slug = opts.prompt.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "image";
  const path = `${opts.workspaceId}/${opts.docId}/${Date.now()}-${slug}.${type.split("/")[1] ?? "png"}`;
  const { error } = await db.storage.from("doc-images").upload(path, Buffer.from(data.data, "base64"), { contentType: type, upsert: false });
  if (error) throw new Error(/bucket|not found/i.test(error.message) ? "Run supabase/028_doc_images.sql in Supabase to turn on images." : error.message);
  return { src: db.storage.from("doc-images").getPublicUrl(path).data.publicUrl, alt: opts.prompt.slice(0, 200) };
}

/** One cell of an AI column: the column's prompt with its references filled in, answered in the brand's voice. */
export async function fillColumnCell(db: SupabaseClient, opts: { siteId: string; brandId: string | null; prompt: string }): Promise<string> {
  const ctx = await loadWriterContext(db, opts.siteId, opts.brandId);
  const { text } = await askClaude(`${opts.prompt.slice(0, 12000)}\n\nReply with the answer only: no preamble, no notes, no quotes around it.`, {
    prefix: `You write for ${ctx.brand.name}.\n\n${brandText(ctx)}`,
    model: writerModel(),
    maxTokens: 2000,
  });
  return text.trim().slice(0, 20000);
}
