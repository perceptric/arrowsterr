"use client";

import { useEffect, useState } from "react";
import type { Site } from "@/lib/db";
import type { Keyword } from "@/lib/research";
import type { RunAuth } from "@/lib/runner";
import { expectedCtr } from "@/lib/seoAnalytics";
import { post } from "../research/shared";
import { SidePanel, Thinking } from "../ui";

// Keyword research for one search from the Search Console report's Queries table: where the brand ranks, the
// keyword's numbers, related keywords to add to the Calendar, and a refresh of the page that ranks.

export type Researched = { query: string; page: string | null; position: number | null; impressions: number; clicks: number };
export type CalendarPick = { keyword: string; page?: string | null; position?: number | null; notes?: string; volume?: number | null; kd?: number | null; intent?: string | null; cpc?: number | null };

const n = (v: number) => Math.round(v).toLocaleString("en-US");
const pct = (r: number) => `${(r * 100).toFixed(r < 0.1 ? 1 : 0)}%`;

export function ResearchPanel({ panel, days, auth, canEdit, siteOf, url, onClose, onAdd, onRefresh }: { panel: Researched; days: number; auth: RunAuth; canEdit: boolean; siteOf: () => Promise<Site | null>; url: (p: string) => string; onClose: () => void; onAdd: (item: CalendarPick) => void; onRefresh: (page: string, query: string) => void }) {
  const [rows, setRows] = useState<Keyword[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!canEdit) return;
    let live = true;
    siteOf()
      .then(async (site) => {
        if (!site) throw new Error("Set up the brand's website in Research first.");
        const d = await post<{ rows: Keyword[] }>(auth, "/api/research/keywords", { mode: "ideas", query: panel.query, siteId: site.id });
        if (live) setRows(d.rows ?? []);
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [panel.query, auth, canEdit, siteOf]);

  const main = rows?.find((r) => r.keyword.toLowerCase() === panel.query.toLowerCase()) ?? rows?.[0] ?? null;
  const related = (rows ?? []).filter((r) => r !== main).slice(0, 10);
  const trend =
    main?.trend?.length && main.trend.length >= 6
      ? (() => {
          const t = main.trend;
          const a = t.slice(0, 3).reduce((x, y) => x + y, 0);
          const b = t.slice(-3).reduce((x, y) => x + y, 0);
          return a ? Math.round(((b - a) / a) * 100) : null;
        })()
      : null;
  const ctr = panel.impressions ? panel.clicks / panel.impressions : 0;
  const top3 = panel.position && panel.position > 3 ? Math.max(0, Math.round((expectedCtr(3) * panel.impressions - panel.clicks) * (30 / Math.max(1, days)))) : 0;

  return (
    <SidePanel kicker="Keyword research" title={panel.query} onClose={onClose} narrow>
      <div className="flex flex-col gap-5">
        {panel.position ? (
          <div className="aw-callout">
            <b>You rank #{panel.position.toFixed(1)}</b> with {n(panel.impressions)} impressions and a {pct(ctr)} click rate.{" "}
            {top3 ? `The top 3 usually get about ${pct(expectedCtr(3))} of clicks, so moving up could add about ${n(top3)} clicks a month.` : "You're already in the top 3."}
          </div>
        ) : null}
        {!canEdit ? (
          <p className="aw-small">Ask an editor to run keyword research.</p>
        ) : error ? (
          <p className="aw-error">{error}</p>
        ) : !rows ? (
          <Thinking text="Looking up this keyword..." />
        ) : (
          <>
            {main ? (
              <div className="aw-an-mini">
                <div>
                  <span>Volume</span>
                  <b className="aw-num">{main.volume === null ? "–" : n(main.volume)}</b>
                </div>
                <div>
                  <span>Difficulty</span>
                  <b className="aw-num">{main.kd ?? "–"}</b>
                </div>
                <div>
                  <span>CPC</span>
                  <b className="aw-num">{main.cpc === null ? "–" : `$${main.cpc.toFixed(2)}`}</b>
                </div>
                <div>
                  <span>Trend</span>
                  <b className={`aw-num ${trend === null ? "" : trend >= 0 ? "text-pos" : "text-neg"}`}>{trend === null ? "–" : `${trend >= 0 ? "↑" : "↓"} ${Math.abs(trend)}%`}</b>
                </div>
              </div>
            ) : (
              <p className="aw-small">No data for this keyword yet.</p>
            )}
            {related.length ? (
              <div className="flex flex-col gap-2">
                <span className="aw-label mb-0!">Related keywords</span>
                <table className="aw-table aw-table--compact">
                  <tbody>
                    {related.map((r) => (
                      <tr key={r.keyword}>
                        <td>{r.keyword}</td>
                        <td className="aw-num text-right">{r.volume === null ? "–" : n(r.volume)}</td>
                        <td className="aw-num text-right">{r.kd ?? "–"}</td>
                        <td className="text-right">
                          <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" aria-label={`Add ${r.keyword} to the Calendar`} onClick={() => onAdd({ keyword: r.keyword, volume: r.volume, kd: r.kd, intent: r.intent, cpc: r.cpc })}>
                            +
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button type="button" className="aw-btn aw-btn--secondary" onClick={() => onAdd({ keyword: panel.query, volume: main?.volume, kd: main?.kd, intent: main?.intent, cpc: main?.cpc })}>
                Add to Calendar
              </button>
              {panel.page ? (
                <button type="button" className="aw-btn aw-btn--primary" onClick={() => onRefresh(panel.page!, panel.query)}>
                  Refresh {panel.page}
                </button>
              ) : null}
            </div>
            <p className="aw-small">
              Uses 10 tasks from your plan.{" "}
              {panel.page ? (
                <a href={url(panel.page)} target="_blank" rel="noopener noreferrer">
                  Open the page
                </a>
              ) : null}
            </p>
          </>
        )}
      </div>
    </SidePanel>
  );
}
