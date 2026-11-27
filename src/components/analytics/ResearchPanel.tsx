"use client";

import { useEffect, useState } from "react";
import type { Site } from "@/lib/db";
import { closeVariations, exactKeyword, rankSentence } from "@/lib/keywordPanel";
import type { Keyword } from "@/lib/research";
import type { RunAuth } from "@/lib/runner";
import { expectedCtr } from "@/lib/seoAnalytics";
import { KdDot } from "../research/KeywordOverview";
import { post } from "../research/shared";
import { BusyButton, ErrorNote, SidePanel, SkeletonRows } from "../ui";
import { errorText } from "@/lib/errors";

// Keyword research for one search from the Search Console report's Queries table: where the brand ranks, the
// keyword's own numbers, close variations to add to the Calendar, and a refresh of the page that ranks.

export type Researched = { query: string; page: string | null; position: number | null; impressions: number; clicks: number };
export type CalendarPick = { keyword: string; page?: string | null; position?: number | null; notes?: string; volume?: number | null; kd?: number | null; intent?: string | null; cpc?: number | null };
/** What adding to the Calendar did: added, already there, or the error. */
export type CalendarResult = "added" | "exists" | { error: string };

const n = (v: number | null | undefined) => (v === null || v === undefined ? "–" : Math.round(v).toLocaleString("en-US"));

/** Turns a Calendar add into a done label, or throws its error so the button shows it. */
const added = async (r: Promise<CalendarResult>) => {
  const out = await r;
  if (typeof out === "object") throw out;
  return out === "exists" ? "In Calendar ✓" : "Added ✓";
};

export function ResearchPanel({ panel, days, auth, canEdit, siteOf, url, onClose, onAdd, onRefresh }: { panel: Researched; days: number; auth: RunAuth; canEdit: boolean; siteOf: () => Promise<Site | null>; url: (p: string) => string; onClose: () => void; onAdd: (item: CalendarPick) => Promise<CalendarResult>; onRefresh: (page: string, query: string) => void }) {
  const [data, setData] = useState<{ rows: Keyword[]; exact: Keyword | null } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!canEdit) return;
    let live = true;
    siteOf()
      .then(async (site) => {
        if (!site) throw new Error("Set up the brand's website in Research first.");
        const d = await post<{ rows: Keyword[]; exact?: Keyword | null }>(auth, "/api/research/keywords", { mode: "phrase", exact: true, query: panel.query, siteId: site.id });
        if (live) setData({ rows: d.rows ?? [], exact: d.exact ?? null });
      })
      .catch((e) => live && setError(errorText(e)));
    return () => {
      live = false;
    };
  }, [panel.query, auth, canEdit, siteOf]);

  const main = data ? exactKeyword(panel.query, data.rows, data.exact) : null;
  const variations = data ? closeVariations(panel.query, data.rows, 10) : [];
  const trend =
    main?.trend?.length && main.trend.length >= 6
      ? (() => {
          const t = main.trend;
          const a = t.slice(0, 3).reduce((x, y) => x + y, 0);
          const b = t.slice(-3).reduce((x, y) => x + y, 0);
          return a ? Math.round(((b - a) / a) * 100) : null;
        })()
      : null;
  const rank = rankSentence({ position: panel.position, impressions: panel.impressions, clicks: panel.clicks, days, top3Ctr: expectedCtr(3) });

  const footer = (
    <>
      {panel.page ? (
        <span className="aw-small truncate" title={panel.page}>
          {panel.page}
        </span>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <BusyButton
          stay
          className="aw-btn aw-btn--secondary"
          title="Add to your Calendar"
          onClick={() => added(onAdd({ keyword: panel.query, volume: main?.volume, kd: main?.kd, intent: main?.intent, cpc: main?.cpc }))}
        >
          Add to Calendar
        </BusyButton>
        {panel.page ? (
          <>
            <button type="button" className="aw-btn aw-btn--primary" title={`Refresh ${panel.page}`} onClick={() => onRefresh(panel.page!, panel.query)}>
              Refresh page
            </button>
            <a className="aw-btn aw-btn--ghost" href={url(panel.page)} target="_blank" rel="noopener noreferrer">
              Open page ↗
            </a>
          </>
        ) : null}
      </div>
      {canEdit ? <p className="aw-small">Each lookup uses 10 tasks from your plan.</p> : null}
    </>
  );

  return (
    <SidePanel kicker="Keyword research" title={panel.query} onClose={onClose} narrow footer={footer}>
      {rank ? <div className="aw-callout">{rank}</div> : null}
      {!canEdit ? (
        <p className="aw-small">Ask an editor to run keyword research.</p>
      ) : error ? (
        <ErrorNote error={error} />
      ) : !data ? (
        <div className="flex flex-col gap-4" role="status" aria-label="Looking up this keyword">
          <SkeletonRows rows={1} cols={4} />
          <SkeletonRows rows={6} cols={3} />
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <div className="aw-an-mini">
              <div>
                <span title="Google searches a month">Searches</span>
                <b className="aw-num">{n(main?.volume)}</b>
              </div>
              <div>
                <span>Difficulty</span>
                <b>{main?.kd === null || main?.kd === undefined ? "–" : <KdDot kd={main.kd} />}</b>
              </div>
              <div>
                <span>CPC</span>
                <b className="aw-num">{main?.cpc === null || main?.cpc === undefined ? "–" : `$${main.cpc.toFixed(2)}`}</b>
              </div>
              <div>
                <span>Trend</span>
                <b className={`aw-num ${trend === null ? "" : trend >= 0 ? "text-pos" : "text-neg"}`}>{trend === null ? "–" : `${trend >= 0 ? "↑" : "↓"} ${Math.abs(trend)}%`}</b>
              </div>
            </div>
            {!main ? <p className="aw-small">Google has no numbers for this exact keyword yet.</p> : null}
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="aw-h4">Close variations</h3>
            {variations.length ? (
              <div className="overflow-x-auto">
                <table className="aw-table aw-table--compact aw-table--keep" style={{ "--aw-table-min": "100%" } as React.CSSProperties}>
                  <thead>
                    <tr>
                      <th>Keyword</th>
                      <th className="w-24 text-right!">Searches</th>
                      <th className="w-24">Difficulty</th>
                      <th className="w-24" aria-label="Add to your Calendar" />
                    </tr>
                  </thead>
                  <tbody>
                    {variations.map((r) => (
                      <tr key={r.keyword}>
                        <td className="text-ink">{r.keyword}</td>
                        <td className="aw-num text-right">{n(r.volume)}</td>
                        <td>
                          <KdDot kd={r.kd} />
                        </td>
                        <td className="text-right">
                          <BusyButton
                            stay
                            className="aw-btn aw-btn--secondary aw-btn--sm"
                            title="Add to your Calendar"
                            label={`Add ${r.keyword} to your Calendar`}
                            onClick={() => added(onAdd({ keyword: r.keyword, volume: r.volume, kd: r.kd, intent: r.intent, cpc: r.cpc }))}
                          >
                            Add
                          </BusyButton>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="aw-small">No close variations of this keyword yet.</p>
            )}
          </div>
        </>
      )}
    </SidePanel>
  );
}
