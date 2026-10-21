import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { askClaude, askJson } from "./claude";
import type { PmNode } from "./docHtml";
import { kindOf } from "./moduleCatalog";
import { brandText, contextPrefix, type BriefRow, type PlannedModule } from "./writerBrief";
import { briefText, cellPlan, cleanSection, MODULE_TRIES, sectionNodes, sectionPrompt, sourcesFor, SECTION_SCHEMA } from "./writerDraft";
import { MODULE_SCHEMA, modulePrompt, validateModule, wrapModule } from "./writerModules";
import { loadResearch, loadWriterContext, writerModel } from "./writerServer";

// The paid calls behind the Library grid (docs/content-grid.md), each run while the person waits:
// write one cell again, build an interactive module, and fill one cell of an AI column. Each returns what it made; the browser
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

/**
 * One interactive module for a cell, built while the person waits: the kind they picked from the catalog, from the
 * section's text and (when the article has one) the brief and its research. Checked like the draft's modules and
 * tried once more with the reason when it fails. Returns the block to put in the article.
 */
export async function buildCellModule(
  db: SupabaseClient,
  opts: { b: BriefRow | null; siteId: string; brandId: string | null; keyword: string; kind: string; h2: string; current: string; note: string },
): Promise<string> {
  const kind = kindOf(opts.kind);
  if (!kind) throw new Error("Unknown kind of module.");
  const ctx = await loadWriterContext(db, opts.siteId, opts.brandId);
  let prefix = `You are the senior content designer for ${ctx.brand.name}.\n\n${brandText(ctx)}`;
  if (opts.b?.brief && opts.b.research_run_id) {
    const pack = await loadResearch(db, opts.b.research_run_id);
    prefix = `${contextPrefix(ctx, pack, sourcesFor(opts.b.brief, pack))}\n\n${briefText(opts.b.brief, opts.b.notes)}`;
  }
  const note = opts.note.trim();
  const m: PlannedModule = { type: kind.id, title: note.slice(0, 120) || kind.label, purpose: note || kind.when, placement: opts.h2 || "the intro", inputs: [], outputs: [], data: "From the section below and the sources.", why: kind.when };
  let lastError: string | null = null;
  for (let i = 0; i < MODULE_TRIES; i++) {
    const raw = (await askJson(modulePrompt(m, { keyword: opts.keyword, brand: ctx.brand.name, section: opts.current }, lastError), MODULE_SCHEMA, { prefix, model: writerModel(), maxTokens: 12000 })) as { html?: unknown };
    const html = typeof raw?.html === "string" ? raw.html.trim() : "";
    const v = validateModule(html);
    if (v.ok) return wrapModule(html, m, ctx.kit);
    lastError = v.error;
  }
  throw new Error(`The module didn't pass its checks: ${lastError} Try again, or add a note.`);
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
