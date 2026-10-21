import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { askJson } from "./claude";
import type { PmNode } from "./docHtml";
import { kindOf } from "./moduleCatalog";
import { contextPrefix, type BriefRow, type PlannedModule, type WriterContext } from "./writerBrief";
import { briefText, cellPlan, cleanSection, MODULE_TRIES, sectionNodes, sectionPrompt, sourcesFor, SECTION_SCHEMA, sectionPlain } from "./writerDraft";
import { MODULE_SCHEMA, modulePrompt, validateModule, wrapModule } from "./writerModules";
import { loadResearch, loadWriterContext, writerModel } from "./writerServer";

// Generate content in the Library grid (docs/content-grid.md): one section at a time, from the brief, its research
// and the brand, run while the person waits on the review screen. Each returns what it made; the browser puts it
// into the doc, so nothing someone is typing gets written over.

export type SectionAsk = { part: { kind: "intro" } | { kind: "section"; h2: string; index: number }; points: string[]; note: string; current: string; module: string | null };

/** The brand and research every call for this article starts with, cached by Claude. */
async function setup(db: SupabaseClient, b: BriefRow) {
  if (!b.brief) throw new Error("This article has no brief yet. Generate the brief first.");
  if (!b.research_run_id) throw new Error("This article's brief has no research. Regenerate the brief.");
  const [ctx, pack] = await Promise.all([loadWriterContext(db, b.site_id, b.brand_id), loadResearch(db, b.research_run_id)]);
  const sources = sourcesFor(b.brief, pack);
  return { ctx, brief: b.brief, prefix: `${contextPrefix(ctx, pack, sources)}\n\n${briefText(b.brief, b.notes)}`, sources };
}

/** The brand context, for the review screen's check (brandMissing in articleGrid.ts). */
export const brandOf = (db: SupabaseClient, b: Pick<BriefRow, "site_id" | "brand_id">): Promise<WriterContext> => loadWriterContext(db, b.site_id, b.brand_id);

/**
 * One section written from the brief: its plan (with the writer's edited points and note), cited from the research
 * in the Brand Voice. With a module picked, the module is built from the new text and goes at the section's end.
 * A module that fails its checks twice is left out and named in moduleError; the text still comes back.
 */
export async function generateSection(db: SupabaseClient, b: BriefRow, ask: SectionAsk): Promise<{ nodes: PmNode[]; moduleError: string | null }> {
  const { ctx, brief, prefix, sources } = await setup(db, b);
  const { plan, i } = cellPlan(brief, ask.part, ask.points);
  const note = [ask.note.trim(), ask.current.trim() ? `The writer's text so far, to keep what works:\n${ask.current.trim().slice(0, 8000)}` : ""].filter(Boolean).join("\n\n");
  const raw = await askJson(sectionPrompt(plan, i, brief, sources, null, note || null), SECTION_SCHEMA, { prefix, model: writerModel(), maxTokens: 4000 });
  const section = cleanSection(raw, plan[i]);
  if (!section.blocks.length) throw new Error("The writer came back empty. Try again, or change the points.");
  const nodes = sectionNodes(section) as PmNode[];
  const kind = ask.module ? kindOf(ask.module) : null;
  if (!kind) return { nodes, moduleError: null };
  const planned = brief.modules.find((m) => m.type === kind.id && m.placement.toLowerCase() === plan[i].h2.toLowerCase());
  const m: PlannedModule = planned ?? { type: kind.id, title: kind.label, purpose: kind.when, placement: plan[i].h2 || "the intro", inputs: [], outputs: [], data: "From the section and the sources.", why: kind.when };
  let lastError: string | null = null;
  for (let t = 0; t < MODULE_TRIES; t++) {
    const out = (await askJson(modulePrompt(m, { keyword: b.keyword, brand: ctx.brand.name, section: sectionPlain(section) }, lastError), MODULE_SCHEMA, { prefix, model: writerModel(), maxTokens: 12000 })) as { html?: unknown };
    const html = typeof out?.html === "string" ? out.html.trim() : "";
    const v = validateModule(html);
    if (v.ok) return { nodes: [...nodes, { type: "embed", attrs: { html: wrapModule(html, m, ctx.kit) } }], moduleError: null };
    lastError = v.error;
  }
  return { nodes, moduleError: `The ${kind.label.toLowerCase()} didn't pass its checks: ${lastError}` };
}
