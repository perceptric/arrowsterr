"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { putStash, useStash } from "@/lib/stash";
import { siteForBrand, type Site } from "@/lib/db";
import { answered, brandStats } from "@/lib/metrics";
import type { View } from "@/lib/view";
import type { RunAuth } from "@/lib/runner";
import { BlockError, SkelBlock } from "../states";
import { EditorialCalendar, type Refresh } from "./EditorialCalendar";
import { DomainResearch, type SeoStart } from "./DomainResearch";
import { KeywordGap } from "./KeywordGap";
import { KeywordOverview } from "./KeywordOverview";
import { AnalyzeSeo, ResearchKeyword } from "./shared";
import type { WriterAccess } from "./ContentPiece";

export type Tool = "keywords" | "domain" | "gap" | "calendar";
const TITLES: Record<Tool, string> = {
  keywords: "Keyword Research",
  domain: "Domain Research",
  gap: "Competitive Analysis",
  calendar: "Editorial Calendar",
};

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
  sub,
  onSub,
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
  /** The Editorial Calendar's tab from the address (/editorial-calendar/list) and how to change it. */
  sub?: string;
  onSub?: (sub?: string) => void;
}) {
  const brand = view.brand;
  const [site, setSite] = useStash<Site | null | undefined>(`site:${brand.id}`, undefined);
  const [error, setError] = useStash(`site-error:${brand.id}`, "");
  const [tries, setTries] = useState(0);

  useEffect(() => {
    let live = true;
    siteForBrand(sb, brand, canEdit)
      .then((s) => {
        if (!live) return;
        setSite(s);
        setError("");
      })
      .catch((e) => {
        if (!live) return;
        setError(e instanceof Error ? e.message : String(e));
        setSite(null);
      });
    return () => {
      live = false;
    };
  }, [sb, brand, canEdit, setSite, setError, tries]);

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
      {/* The Editorial Calendar draws its own header, with its actions beside the title. */}
      {tool === "calendar" ? null : <h1 className="aw-h2">{TITLES[tool]}</h1>}
      {error ? <BlockError what={`research for ${brand.domain}`} onRetry={() => setTries((n) => n + 1)} /> : null}
      {site === undefined ? (
        <section className="aw-frame p-5">
          <SkelBlock lines={3} />
        </section>
      ) : !site ? (
        error ? null : <div className="aw-callout max-w-xl">Ask an editor to open Research once for {brand.domain} to set it up.</div>
      ) : tool === "keywords" ? (
        <KeywordOverview sb={sb} auth={auth} site={site} canEdit={canEdit} writer={writer} />
      ) : tool === "domain" ? (
        <DomainResearch sb={sb} auth={auth} site={site} canEdit={canEdit} writer={writer} start={seoStart} onStarted={onSeoStarted} />
      ) : tool === "gap" ? (
        <KeywordGap
          sb={sb}
          auth={auth}
          site={site}
          canEdit={canEdit}
          writer={writer}
          days={view.days}
          stats={brandStats(answered(view.current, view.filter), { name: brand.name, domain: brand.domain })}
          me={{ name: brand.name, logo: brand.logo }}
        />
      ) : (
        <EditorialCalendar sb={sb} auth={auth} site={site} canEdit={canEdit} refresh={refresh} writer={writer} brandName={brand.name} onSite={setSite} sub={sub} onSub={onSub} />
      )}
    </div>
    </ResearchKeyword.Provider>
    </AnalyzeSeo.Provider>
  );
}
