"use client";

import { Card, Delta, Spark, StatStrip } from "../ui";
import { EngineTitle, num, propertyName, rate, SearchState, shortDay, TopTable, useSearchReport, type Call } from "./searchShared";

const NAME = "Bing Webmaster Tools";

/** Bing for the brand's domain, kept small: its numbers against the period before, and top queries. */
export function BingCard({ call, brandId, domain, days, quiet = false }: { call: Call; brandId: string; domain: string; days: number; quiet?: boolean }) {
  const { report, error, retry } = useSearchReport(call, "bing", brandId, days);
  if (quiet && !(report?.allowed && report.connected)) return null;

  const title = <EngineTitle name="Bing" site="bing.com" />;
  const ready = report?.allowed && report.connected && report.property ? report : null;
  if (!ready)
    return (
      <Card title={title}>
        <SearchState report={report} error={error} retry={retry} name={NAME} domain={domain} />
      </Card>
    );

  const { current: c, previous: p } = ready;
  const hadPrev = p.impressions > 0;
  return (
    <Card
      title={title}
      action={
        <span className="aw-chip" title={ready.property}>
          {propertyName(ready.property)}
        </span>
      }
    >
      <div className="grid xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] xl:divide-x xl:divide-rule-faint">
        <div className="flex flex-col gap-4 p-5">
          <StatStrip
            stats={[
              { label: "Clicks", value: num(c.clicks), delta: hadPrev ? <Delta now={c.clicks} before={p.clicks} digits={0} /> : null },
              { label: "Impressions", value: num(c.impressions), delta: hadPrev ? <Delta now={c.impressions} before={p.impressions} digits={0} /> : null },
              { label: "Click rate", value: rate(c.ctr), delta: hadPrev ? <Delta now={c.ctr} before={p.ctr} unit=" pts" /> : null },
            ]}
          />
          {c.clicks ? (
            <div className="flex flex-col gap-1">
              <Spark values={ready.series.map((d) => d.clicks)} className="block h-11 w-full" />
              <span className="aw-small">Clicks by day</span>
            </div>
          ) : null}
          <p className="aw-small">
            {shortDay(ready.from)} to {shortDay(ready.to)}, against the {days} days before.
            {c.impressions ? "" : ` No Bing searches showed ${domain} in this period yet.`}
          </p>
        </div>
        <div className="border-t border-rule-faint xl:border-t-0">
          <TopTable head="Top Bing queries" rows={ready.queries} empty="No queries in this period." />
        </div>
      </div>
    </Card>
  );
}
