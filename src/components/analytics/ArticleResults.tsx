"use client";

import { useEffect, useState } from "react";
import type { RunAuth } from "@/lib/runner";
import type { Result, ResultMetric } from "@/lib/seoAnalytics";
import type { ArticleResult } from "@/lib/seoAnalyticsServer";
import { Delta } from "../ui";

// Before and after for one published article or refresh (Analytics, docs/seo-analytics.md): the days since it went live
// against the same number of days before, from the synced Search Console and GA4 data. Shown on the article in Drafts
// and on its card in Zippie. Shows nothing until the article is live and Google is connected.

const n = (v: number | null) => (v === null ? "–" : Math.round(v).toLocaleString("en-US"));

/** A count's change as a percent, or a position's change in places (lower is better). */
function ResultDelta({ m, position = false }: { m: ResultMetric; position?: boolean }) {
  if (m.change === null) return null;
  return position ? <Delta now={m.change} before={0} lowerIsBetter digits={1} /> : <Delta now={m.change * 100} before={0} unit="%" digits={0} />;
}

const RESULT_COLS: { key: keyof Result; label: string; position?: boolean }[] = [
  { key: "clicks", label: "Clicks" },
  { key: "position", label: "Position", position: true },
  { key: "sessions", label: "Sessions" },
  { key: "conversions", label: "Key events" },
  { key: "ai_sessions", label: "From AI" },
];

function resultSpan(r: Pick<ArticleResult, "event" | "days" | "full" | "at">) {
  const since = r.event === "refreshed" ? "since the refresh" : "since it went live";
  return r.full ? `${r.days} days ${since}, against the ${r.days} days before` : `${r.days} ${r.days === 1 ? "day" : "days"} ${since}, against the same number of days before`;
}

export function ArticleResults({ itemId, brandId, auth }: { itemId: string; brandId: string | null; auth: RunAuth }) {
  const [r, setR] = useState<ArticleResult | null>(null);
  useEffect(() => {
    if (!brandId) return;
    let live = true;
    (async () => {
      const res = await fetch("/api/seo-analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await auth.token()}` },
        body: JSON.stringify({ action: "results", itemId, workspaceId: auth.workspaceId, brandId }),
      });
      if (!res.ok) return;
      const d = (await res.json()) as { results: ArticleResult[]; connected: boolean };
      if (live && d.connected) setR(d.results[0] ?? null);
    })().catch(() => {});
    return () => {
      live = false;
    };
  }, [itemId, brandId, auth]);

  if (!r?.result) return null;
  const res = r.result;
  return (
    <div className="aw-an-results" aria-label="Results since it went live">
      <span className="aw-an-results__span">{resultSpan(r)}</span>
      <dl className="aw-an-results__list">
        {RESULT_COLS.map((c) => (
          <div key={c.key}>
            <dt>{c.label}</dt>
            <dd>
              <span className="aw-num">{c.position ? (res.position.after === null ? "–" : res.position.after.toFixed(1)) : n(res[c.key].after)}</span>
              <ResultDelta m={res[c.key]} position={c.position} />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
