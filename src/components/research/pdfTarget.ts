"use client";

import type { Site } from "@/lib/db";
import type { Gap } from "@/lib/gap";
import { nameFromDomain } from "@/lib/gap";
import type { DomainBulkRow, DomainReport, KeywordReport, KwSummary } from "@/lib/research";
import { peek } from "@/lib/stash";

// What Download PDF makes on a research page: the search that is open right now, read from the same saved state
// the tools keep (useStash keys in KeywordOverview, DomainResearch, KeywordGap and Bulk). The server reads the saved
// results again, so only the search itself is sent.

export type PdfTarget = { params: Record<string, unknown>; title: string; line: string } | { error: string };

export function researchTarget(page: "keywords" | "domain" | "gap", brandId: string, days: number): PdfTarget {
  const site = peek<Site | null>(`site:${brandId}`);
  if (!site) return { error: "Open a search first." };

  if (page === "keywords") {
    if (peek<string>(`kw:${site.id}:mode`) === "bulk") {
      const r = peek<{ id?: string | null; rows: KwSummary[]; country: string } | null>(`kwb:${site.id}:result`);
      return r?.id ? { params: { bulk: r.id }, title: `Keyword Report: ${r.rows.length.toLocaleString("en-US")} keywords`, line: `Bulk analysis · ${r.country}` } : { error: "Run a bulk analysis first." };
    }
    const r = peek<KeywordReport | null>(`kw:${site.id}:report`);
    return r ? { params: { keyword: r.keyword, country: r.country, device: r.device }, title: `Keyword Report: ${r.keyword}`, line: r.country } : { error: "Search for a keyword first." };
  }

  if (page === "domain") {
    if (peek<string>(`dom:${site.id}:mode`) === "bulk") {
      const r = peek<{ id?: string | null; rows: DomainBulkRow[]; country: string } | null>(`domb:${site.id}:result`);
      return r?.id ? { params: { bulk: r.id }, title: `Domain Report: ${r.rows.length.toLocaleString("en-US")} sites`, line: `Bulk analysis · ${r.country}` } : { error: "Run a bulk analysis first." };
    }
    const r = peek<DomainReport | null>(`dom:${site.id}:report`);
    return r ? { params: { domain: r.domain, scope: r.scope ?? "domain", country: r.country }, title: `Domain Report: ${r.domain}`, line: r.country } : { error: "Analyze a site first." };
  }

  const r = peek<{ gap: Gap; them: string } | null>(`gap:${site.id}`);
  return r ? { params: { siteId: site.id, competitor: r.them, days }, title: `Keyword Gap: vs ${nameFromDomain(r.them)}`, line: `${site.domain} vs ${r.them}` } : { error: "Compare with a competitor first." };
}
