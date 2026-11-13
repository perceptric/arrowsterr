"use client";

import { EmptyScreen } from "../Drawing";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useEffect } from "react";
import { putStash, useStash } from "@/lib/stash";
import { siteForBrand, type Site } from "@/lib/db";
import { answered, brandStats } from "@/lib/metrics";
import type { View } from "@/lib/view";
import type { RunAuth } from "@/lib/runner";
import { Thinking } from "../ui";
import { EditorialCalendar, type Refresh } from "./EditorialCalendar";
import { DomainResearch, type SeoStart } from "./DomainResearch";
import { KeywordGap } from "./KeywordGap";
import { KeywordOverview } from "./KeywordOverview";
import { AnalyzeSeo, ResearchKeyword } from "./shared";
import type { WriterAccess } from "./shared";

export type Tool = "keywords" | "domain" | "gap" | "calendar" | "opportunities";
/** Research's tabs (docs/content-v3-plan.md, section 1). Content Research joins them in phase 2. */
const TABS: { id: Tool; label: string }[] = [
  { id: "keywords", label: "Keywords" },
  { id: "domain", label: "Domains" },
  { id: "gap", label: "Competitors" },
];

/** The Research tools for the website picked in the top bar. */
export function ResearchPage({
  sb,
  auth,
  view,
  canEdit,
  tool,
  onTool,
  seoStart,
  onSeoStarted,
  onSeo,
  refresh,
  writer,
}: {
  sb: SupabaseClient;
  auth: RunAuth;
  view: View;
  canEdit: boolean;
  tool: Tool;
  onTool: (t: Tool) => void;
  seoStart?: SeoStart | null;
  onSeoStarted?: () => void;
  onSeo?: (target: string, scope: SeoStart["scope"]) => void;
  refresh?: Refresh;
  writer?: WriterAccess;
}) {
  const brand = view.brand;
  const [site, setSite] = useStash<Site | null | undefined>(`site:${brand.id}`, undefined);
  const [error, setError] = useStash(`site-error:${brand.id}`, "");

  useEffect(() => {
    let live = true;
    siteForBrand(sb, brand, canEdit)
      .then((s) => live && setSite(s))
      .catch((e) => {
        if (!live) return;
        const message = e instanceof Error ? e.message : String(e);
        setError(/sites/.test(message) ? `${message}. Run supabase/006_research.sql in Supabase → SQL Editor.` : message);
        setSite(null);
      });
    return () => {
      live = false;
    };
  }, [sb, brand, canEdit, setSite, setError]);

  return (
    <AnalyzeSeo.Provider value={onSeo ?? null}>
    <ResearchKeyword.Provider
      value={
        site && canEdit
          ? (keyword) => {
              putStash(`kw:${site.id}:seed`, keyword);
              onTool("keywords");
            }
          : null
      }
    >
    <div className="flex flex-col gap-5">
      {/* Calendar and Opportunities draw their own header, with their actions beside the title. */}
      {tool === "calendar" || tool === "opportunities" ? null : (
        <header className="flex flex-col gap-3">
          <h1 className="aw-h2 mb-0!">Research</h1>
          <div className="aw-tabs flex max-w-full overflow-x-auto" role="tablist" aria-label="Research">
            {TABS.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tool === t.id} onClick={() => onTool(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
        </header>
      )}
      {error ? <p className="aw-error">{error}</p> : null}
      {site === undefined ? (
        <Thinking text={`Loading ${brand.domain}...`} />
      ) : !site ? (
        error ? null : (
          <EmptyScreen drawing="search" title="Research isn't set up yet">
            Ask an editor to open Research once for {brand.domain}.
          </EmptyScreen>
        )
      ) : tool === "keywords" ? (
        <KeywordOverview sb={sb} auth={auth} site={site} canEdit={canEdit} />
      ) : tool === "domain" ? (
        <DomainResearch sb={sb} auth={auth} site={site} canEdit={canEdit} start={seoStart} onStarted={onSeoStarted} />
      ) : tool === "gap" ? (
        <KeywordGap
          sb={sb}
          auth={auth}
          site={site}
          canEdit={canEdit}
          stats={brandStats(answered(view.current, view.filter), { name: brand.name, domain: brand.domain })}
          me={{ name: brand.name, logo: brand.logo }}
        />
      ) : (
        <EditorialCalendar
          key={tool}
          sb={sb}
          auth={auth}
          site={site}
          canEdit={canEdit}
          refresh={refresh}
          writer={writer}
          brandName={brand.name}
          onSite={setSite}
          mode={tool === "opportunities" ? "plan" : "calendar"}
        />
      )}
    </div>
    </ResearchKeyword.Provider>
    </AnalyzeSeo.Provider>
  );
}
