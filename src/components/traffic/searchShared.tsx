"use client";

import { useEffect, useState } from "react";
import type { SearchReport, SearchRow } from "@/lib/searchEngines";
import { useStash } from "@/lib/stash";
import { BrandLogo } from "../BrandLogo";
import { favicon } from "../ui";

// Pieces the Search Console and Bing cards share: loading the report, and the states before there are numbers.

export type Call = (path: string, body: Record<string, unknown>) => Promise<unknown>;
export type Engine = "google" | "bing";
export type Ready = Extract<SearchReport, { property: string }>;

/** The report for one engine and period, kept while the person moves around the app. */
export function useSearchReport(call: Call, engine: Engine, brandId: string, days: number) {
  const [saved, setSaved] = useStash<Record<number, SearchReport>>(`search:${engine}:${brandId}`, {});
  const report = saved[days] ?? null;
  const [error, setError] = useState("");
  const [tries, setTries] = useState(0);
  const have = Boolean(report);
  useEffect(() => {
    if (have) return;
    let live = true;
    call("/api/search-console", { engine, days })
      .then((d) => {
        if (!live) return;
        setError("");
        setSaved((x) => ({ ...x, [days]: d as SearchReport }));
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [call, engine, days, have, tries, setSaved]);
  const retry = () => {
    setError("");
    setTries((t) => t + 1);
  };
  return { report, error: report ? "" : error, retry };
}

export const num = (n: number) => Math.round(n).toLocaleString("en-US");
export const rate = (n: number) => `${n.toFixed(1)}%`;
export const shortDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
/** "sc-domain:example.com" → "example.com", "https://www.example.com/" → "www.example.com". */
export const propertyName = (p: string) => p.replace(/^sc-domain:/, "").replace(/^https?:\/\//, "").replace(/\/$/, "");

// A full page load, so the app opens on that settings page.
const goTo = (path: string) => window.location.assign(path);

/** The card's title: the engine's icon and name. */
export function EngineTitle({ name, site }: { name: string; site: string }) {
  return (
    <span className="flex items-center gap-2">
      <BrandLogo src={favicon(site)} name={name} size={18} />
      {name}
    </span>
  );
}

/** Loading, errors, plan, sign-in and property states. Returns null once there are numbers to show. */
export function SearchState({ report, error, retry, name, domain }: { report: SearchReport | null; error: string; retry: () => void; name: string; domain: string }) {
  if (error)
    return (
      <div className="flex flex-col items-start gap-3 p-5">
        <p className="aw-error">{error}</p>
        <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={retry}>
          Try again
        </button>
      </div>
    );
  if (!report)
    return (
      <p className="aw-small p-5" role="status">
        Loading {name}...
      </p>
    );
  if (!report.allowed)
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 p-5">
        <p className="text-[14px] text-body">{name} numbers are on Starter and up.</p>
        <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => goTo("/settings/billing")}>
          See plans
        </button>
      </div>
    );
  if (!report.connected)
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 p-5">
        <p className="max-w-xl text-[14px] text-body">
          {report.ready ? `Connect ${name} to see the searches that bring people to ${domain}.` : "Connected apps are not set up on this server yet."}
        </p>
        {report.ready ? (
          <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => goTo("/settings/integrations")}>
            Connect {name}
          </button>
        ) : null}
      </div>
    );
  if (report.property === null)
    return (
      <div className="flex flex-col gap-2 p-5 text-[14px] text-body">
        <p>
          {name} has no site for <span className="font-medium text-ink">{domain || "this brand"}</span> on the connected account.
        </p>
        {report.sites.length ? <p className="aw-small">Sites on this account: {report.sites.map(propertyName).join(", ")}</p> : null}
        <p className="aw-small">Add and verify {domain || "the site"} in {name}, then check back.</p>
      </div>
    );
  return null;
}

/** A short top list: the query or page, then its numbers. */
export function TopTable({ head, rows, cell, position = false, empty }: { head: string; rows: SearchRow[]; cell?: (key: string) => React.ReactNode; position?: boolean; empty: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="aw-table aw-table--compact">
        <thead>
          <tr>
            <th>{head}</th>
            <th className="aw-num w-20">Clicks</th>
            <th className="aw-num w-28">Impressions</th>
            {position ? <th className="aw-num w-20">Position</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="max-w-xs truncate text-ink">{cell ? cell(r.key) : r.key}</td>
              <td className="aw-num text-ink">{num(r.clicks)}</td>
              <td className="aw-num">{num(r.impressions)}</td>
              {position ? <td className="aw-num">{r.position ? r.position.toFixed(1) : "–"}</td> : null}
            </tr>
          ))}
          {!rows.length ? (
            <tr>
              <td colSpan={position ? 4 : 3} className="aw-small">
                {empty}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
