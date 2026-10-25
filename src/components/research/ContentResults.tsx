"use client";

import { useEffect } from "react";
import type { Chat } from "@/lib/chats";
import type { CalendarItem } from "@/lib/db";
import { citedPathsOf, contentRows, type ContentRow, type TrafficData } from "@/lib/reports";
import type { RunAuth } from "@/lib/runner";
import { useStash } from "@/lib/stash";
import { Sheet } from "../Sheet";
import { Card, pct } from "../ui";

const num = (n: number | null | undefined) => (n === null || n === undefined ? "–" : n.toLocaleString("en-US"));

export { citedPathsOf };

/** Results for every published page: AI citations, visits and visits from AI. */
export function ContentResults({ auth, brandId, domain, days, chats, items }: { auth: RunAuth; brandId: string; domain: string; days: number; chats: Chat[]; items: CalendarItem[] }) {
  const [saved, setSaved] = useStash<Record<number, { traffic: TrafficData | null }>>(`results:${brandId}`, {});
  const data = saved[days];

  useEffect(() => {
    let live = true;
    const call = async <T,>(path: string, body: Record<string, unknown>): Promise<T | null> => {
      try {
        const res = await fetch(path, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${await auth.token()}` },
          body: JSON.stringify({ ...body, workspaceId: auth.workspaceId, brandId }),
        });
        return res.ok ? ((await res.json()) as T) : null;
      } catch {
        return null;
      }
    };
    call<TrafficData>("/api/traffic", { days }).then((traffic) => live && setSaved((x) => ({ ...x, [days]: { traffic } })));
    return () => {
      live = false;
    };
  }, [auth, brandId, days, setSaved]);

  const t = data?.traffic ?? null;
  const rows = contentRows({ items, citedPaths: chats.length ? citedPathsOf(chats, domain) : null, traffic: t });

  if (!rows.length)
    return <div className="aw-callout">No published pages yet. Set a page to Published and add its live URL. Its AI citations and visits show up here.</div>;

  return (
    <div className="flex flex-col gap-4">
      <div className="aw-stats aw-stats--tight" style={{ ["--cols" as string]: 3 }}>
        {[
          { lab: "Published pages", v: rows.length },
          { lab: "Cited by AI", v: chats.length ? rows.filter((r) => (r.cited ?? 0) > 0).length : "–" },
          { lab: "Visits from AI", v: t ? num(rows.reduce((n, r) => n + (r.aiVisits ?? 0), 0)) : "–" },
        ].map((s) => (
          <div key={s.lab} className="aw-stat">
            <div className="aw-stat__lab">{s.lab}</div>
            <span className="aw-stat__num">{s.v}</span>
          </div>
        ))}
      </div>
      <Card title={`Results · last ${days} days`}>
        <Sheet<ContentRow>
          label="Content results"
          rows={rows}
          rowKey={(r) => r.id}
          sort={{ key: "visits", desc: true }}
          cols={[
            {
              id: "keyword",
              label: "Page",
              type: "text",
              value: (r) => r.keyword,
              width: 240,
              cell: (r) => (
                <span className="flex flex-col">
                  <span className="text-ink">{r.keyword}</span>
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="max-w-72 truncate text-[12px]">
                    {r.path}
                  </a>
                </span>
              ),
            },
            { id: "job", label: "Job", type: "list", value: (r) => (r.action === "update" ? "Updated" : "New"), options: ["New", "Updated"] },
            { id: "published", label: "Published", type: "date", value: (r) => r.published },
            { id: "cited", label: "Cited in AI answers", type: "number", value: (r) => (r.cited === null ? null : Math.round(r.cited)), cell: (r) => (r.cited === null ? "–" : r.cited ? pct(r.cited) : <span className="text-muted">Not yet</span>) },
            { id: "visits", label: "Visits", type: "number", value: (r) => r.visits },
            { id: "ai", label: "From AI", type: "number", value: (r) => r.aiVisits },
          ]}
        />
      </Card>
      <p className="aw-small">
        {!t ? "Connect Google Analytics in Brand settings for visits. " : ""}AI citations come from the daily prompt checks in the period picked in the top bar.
      </p>
    </div>
  );
}
