"use client";

import { useState } from "react";
import { TrendChart } from "../TrendChart";
import { Card, Delta, pos, Seg, StatStrip, YOU_COLOR } from "../ui";
import { EngineTitle, num, propertyName, rate, SearchState, shortDay, TopTable, useSearchReport, type Call } from "./searchShared";

const NAME = "Google Search Console";

/** Google Search Console for the brand's domain: the period against the one before, by day, top queries and pages. */
export function SearchConsoleCard({ call, brandId, domain, days, quiet = false }: { call: Call; brandId: string; domain: string; days: number; quiet?: boolean }) {
  const { report, error, retry } = useSearchReport(call, "google", brandId, days);
  const [metric, setMetric] = useState<"clicks" | "impressions">("clicks");
  const ready = report?.allowed && report.connected && report.property ? report : null;
  // On a page that isn't about search, show the card only once it has something to show.
  if (quiet && !(report?.allowed && report.connected)) return null;

  const title = <EngineTitle name={NAME} site="search.google.com" />;
  if (!ready)
    return (
      <Card title={title}>
        <SearchState report={report} error={error} retry={retry} name={NAME} domain={domain} />
      </Card>
    );

  const { current: c, previous: p } = ready;
  const hadPrev = p.impressions > 0;
  const name = metric === "clicks" ? "Clicks" : "Impressions";
  const points = ready.series.map((d) => ({ at: d.day, label: shortDay(d.day), values: { [name]: d[metric] } }));
  const pagePath = (u: string) => {
    try {
      return new URL(u).pathname || "/";
    } catch {
      return u;
    }
  };

  return (
    <Card
      title={title}
      action={
        <span className="aw-chip" title={ready.property}>
          {propertyName(ready.property)}
        </span>
      }
    >
      <div className="flex flex-col gap-5 p-5">
        <StatStrip
          stats={[
            { label: "Clicks", value: num(c.clicks), delta: hadPrev ? <Delta now={c.clicks} before={p.clicks} digits={0} /> : null },
            { label: "Impressions", value: num(c.impressions), delta: hadPrev ? <Delta now={c.impressions} before={p.impressions} digits={0} /> : null },
            { label: "Click rate", value: rate(c.ctr), delta: hadPrev ? <Delta now={c.ctr} before={p.ctr} unit=" pts" /> : null },
            { label: "Avg. position", value: pos(c.position), delta: hadPrev && c.position !== null && p.position !== null ? <Delta now={c.position} before={p.position} lowerIsBetter /> : null },
          ]}
        />
        <p className="aw-small">
          {shortDay(ready.from)} to {shortDay(ready.to)}, against the {days} days before. Google shares numbers about three days late.
        </p>
        {c.impressions ? (
          <div className="flex flex-col gap-2">
            <div>
              <Seg
                label="Search Console chart"
                value={metric}
                onChange={setMetric}
                options={[
                  { id: "clicks", label: "Clicks" },
                  { id: "impressions", label: "Impressions" },
                ]}
              />
            </div>
            <TrendChart points={points} lines={[{ name, color: YOU_COLOR, isYou: true }]} metric="count" mode="bar" />
          </div>
        ) : (
          <p className="text-[14px] text-body">No Google searches showed {domain} in this period yet.</p>
        )}
      </div>
      <div className="grid border-t border-rule-faint xl:grid-cols-2 xl:divide-x xl:divide-rule-faint">
        <TopTable head="Top queries" rows={ready.queries} position empty="No queries in this period." />
        <TopTable
          head="Top pages"
          rows={ready.pages}
          empty="No pages in this period."
          cell={(u) => (
            <a href={u} target="_blank" rel="noopener noreferrer nofollow" title={u}>
              {pagePath(u)}
            </a>
          )}
        />
      </div>
    </Card>
  );
}
