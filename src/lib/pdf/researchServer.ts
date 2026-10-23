import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DAY, readCache } from "../cache";
import type { Run } from "../chats";
import { savedOnly } from "../dataforseo";
import { listRuns } from "../db";
import { domainReport } from "../domainReport";
import type { Gap } from "../gap";
import { parseTarget, Spend } from "../keywords";
import { keywordReport } from "../kwReport";
import { answered, brandStats, splitPeriods } from "../metrics";
import { MARKETS, marketOf, type DomainBulkRow, type KwSummary } from "../research";
import { normalizeSite } from "../site";
import { cleanResearch, domainBulkPdf, domainPdf, gapPdf, keywordBulkPdf, keywordPdf, type ResearchPage, type ResearchParams, type ResearchPdf } from "./research";

// A research page's PDF from saved results only (docs/reports.md, section 32.3). The page just showed them, so they
// are in the shared cache or the bulk_runs table; a PDF never runs a new search and never costs tasks.

export const NOT_SAVED_PDF = "These results are no longer saved. Run the search again, then download its PDF.";

export type ResearchMade = { data: ResearchPdf; params: ResearchParams; period: string; filters: string[] };

async function bulkRows<T>(db: SupabaseClient, workspaceId: string, id: string, kind: "keywords" | "domains") {
  const { data } = await db.from("bulk_runs").select("result, country, kind").eq("id", id).eq("workspace_id", workspaceId).maybeSingle();
  const run = data as { result: { rows?: T[] } | null; country: string; kind: string } | null;
  if (!run || run.kind !== kind || !Array.isArray(run.result?.rows)) throw new Error("This bulk analysis was deleted, or it belongs to another workspace.");
  return { rows: run.result.rows, country: run.country };
}

/** Read what was researched and build the PDF's numbers. Throws a short message when it can't. */
export async function researchData(db: SupabaseClient, workspaceId: string, brand: { id: string; name: string; domain: string }, page: ResearchPage, raw: unknown, now = Date.now()): Promise<ResearchMade> {
  const p = cleanResearch(page, raw);
  if (!p) throw new Error(page === "keywords" ? "Search for a keyword first." : page === "domain" ? "Analyze a site first." : "Compare with a competitor first.");
  const google = (country: string) => `Google · ${country}`;

  if (p.tool === "keyword") {
    const { data } = await savedOnly(() => keywordReport(p.keyword, p.country, p.device));
    if (!data) throw new Error(NOT_SAVED_PDF);
    return { data: keywordPdf(data), params: p, period: google(p.country), filters: [p.device === "mobile" ? "Mobile" : "Desktop"] };
  }
  if (p.tool === "keyword-bulk") {
    const run = await bulkRows<KwSummary>(db, workspaceId, p.bulk, "keywords");
    return { data: keywordBulkPdf(run.rows, run.country), params: p, period: google(run.country), filters: ["Bulk analysis"] };
  }
  if (p.tool === "domain-bulk") {
    const run = await bulkRows<DomainBulkRow>(db, workspaceId, p.bulk, "domains");
    return { data: domainBulkPdf(run.rows, run.country), params: p, period: google(run.country), filters: ["Bulk analysis"] };
  }
  if (p.tool === "domain") {
    const target = parseTarget(p.domain, p.scope);
    if (!target) throw new Error("Analyze a site first.");
    // The first 100 keywords, or the 500 from "Load more" when only those are saved.
    const first = await savedOnly(() => domainReport(target, p.country, false, new Spend()));
    const report = first.data ?? (await savedOnly(() => domainReport(target, p.country, true, new Spend()))).data;
    if (!report) throw new Error(NOT_SAVED_PDF);
    const scope = { domain: "", subdomain: "Subdomain", subfolder: "Folder", url: "Page" }[p.scope];
    return { data: domainPdf(report), params: p, period: google(p.country), filters: scope ? [scope] : [] };
  }

  // Competitive Analysis: the gap the page compared, and the brands AI names most in the same days.
  const { data: siteRow } = await db.from("sites").select("domain, profile").eq("id", p.siteId).eq("workspace_id", workspaceId).maybeSingle();
  const site = siteRow as { domain: string; profile: { country?: string } | null } | null;
  if (!site) throw new Error("Website not found.");
  const you = normalizeSite(site.domain)?.domain ?? site.domain;
  const them = normalizeSite(p.competitor)?.domain;
  if (!them) throw new Error("Compare with a competitor first.");
  const country = site.profile?.country && MARKETS[site.profile.country] ? site.profile.country : "United States";
  const m = marketOf(country);
  const gap = await readCache<Gap>(`gap:${m.location}:${m.language}:${you}:${them}`, 30 * DAY);
  if (!gap) throw new Error(NOT_SAVED_PDF);
  const runs = (await listRuns(db, brand.id, Math.min(730, p.days))) as Run[];
  const stats = brandStats(answered(splitPeriods(runs, p.days, now).current, () => true), { name: brand.name, domain: brand.domain });
  return { data: gapPdf(gap, { name: brand.name, domain: you }, them, stats, country), params: p, period: google(country), filters: [`AI answers from the last ${p.days} days`] };
}
