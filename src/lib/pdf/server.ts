import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanKit } from "../brandKit";
import type { Run } from "../chats";
import { listRuns, topicsOf, type Brand } from "../db";
import { availableEngines } from "../engines";
import { entitlement } from "../entitlements";
import { reportLimits } from "../plans";
import { tokensFor, type PdfDesign } from "./design";
import { cleanParams, isAiPage, pdfData, PDF_PAGES, viewOf, type PdfPage, type PdfSnapshot } from "./pages";
import { researchTitle } from "./research";
import { researchData } from "./researchServer";

// Builds a page's PDF snapshot on the server (docs/reports.md, section 32): the same data the page shows,
// the design the plan allows, frozen so the stored file and a re-download always match.

const BRAND_COLS = "id, workspace_id, url, domain, name, logo, category, prompts, daily, profile, topics";
const day = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export type Made = { snapshot: PdfSnapshot; params: Record<string, unknown>; design: PdfDesign; title: string; brandId: string };

export async function makeSnapshot(db: SupabaseClient, workspaceId: string, brandId: string, page: PdfPage, wanted: PdfDesign, rawParams: unknown, now = Date.now()): Promise<Made> {
  const { data: b, error } = await db.from("brands").select(BRAND_COLS).eq("id", brandId).eq("workspace_id", workspaceId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!b) throw new Error("That brand is not in this workspace.");
  const brand = b as Brand;
  const ent = await entitlement(workspaceId);
  const whiteLabel = reportLimits(ent.plan).whiteLabel;
  const kitRow = wanted === "brand" && whiteLabel ? await db.from("brand_kits").select("kit").eq("workspace_id", workspaceId).eq("key", "workspace").maybeSingle() : { data: null };
  const kit = kitRow.data ? cleanKit((kitRow.data as { kit: unknown }).kit) : null;
  const tokens = tokensFor(wanted, kit, whiteLabel);
  const pdfBrand = { name: brand.name, domain: brand.domain, logo: brand.logo || null };
  const at = new Date(now).toISOString();

  if (!isAiPage(page)) {
    const r = await researchData(db, workspaceId, brand, page, rawParams, now);
    const title = researchTitle(r.data);
    const snapshot: PdfSnapshot = { v: 1, title, brand: pdfBrand, period: r.period, filters: r.filters, at, tokens, data: r.data };
    return { snapshot, params: r.params, design: tokens.design, title, brandId: brand.id };
  }

  const params = cleanParams(rawParams, ent.limits.historyDays);
  const runs = (await listRuns(db, brand.id, Math.min(730, params.days * 2))) as Run[];
  const view = viewOf(pdfBrand, runs, topicsOf(brand), availableEngines(), params, now);
  const title = PDF_PAGES.find((p) => p.id === page)!.title;
  const snapshot: PdfSnapshot = {
    v: 1,
    title,
    brand: pdfBrand,
    period: `Last ${params.days} days · ${day(now - params.days * 864e5)} – ${day(now - 864e5)}`,
    filters: [params.topic ? `Topic: ${params.topic}` : "", params.model ? `Model: ${params.model}` : ""].filter(Boolean),
    at,
    tokens,
    data: pdfData(page, view),
  };
  return { snapshot, params, design: tokens.design, title, brandId: brand.id };
}
