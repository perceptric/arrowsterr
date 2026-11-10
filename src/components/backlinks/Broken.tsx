"use client";

import type { BrokenPage } from "@/lib/backlinks";
import { Card, StatStrip } from "../ui";
import { CsvButton, fileName, Loading, msg, NotLoaded, num, SiteLink, Updated, useAnswer, type TabProps } from "./shared";
import { pathOf } from "./Overview";

// Links to the target's pages that are gone, grouped by page, each with a live page to redirect it to.

type Broken = { pages: BrokenPage[]; total: number; at: string };

export function BrokenTab(p: TabProps) {
  const { data, busy, load } = useAnswer<Broken>(p.call, p.memo, "broken", (r) => (r.broken as Broken) ?? null, p.armed, p.onError);
  if (data === null) return <Loading />;
  if (data === "none") return <NotLoaded canEdit={p.canEdit} busy={busy} label="Find broken links" onLoad={() => load(true)} />;
  const pages = data.pages;
  const sites = new Set(pages.flatMap((x) => x.from.map((f) => f.domain))).size;
  const links = pages.reduce((a, x) => a + x.links, 0);
  const rules = pages.map((x) => `${pathOf(x.page)} ${x.redirect} 301`).join("\n");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(rules);
    } catch (e) {
      p.onError(msg(e));
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span />
        <Updated at={data.at} busy={busy} canRefresh={p.canEdit} onRefresh={() => load(true)} />
      </div>
      <StatStrip
        stats={[
          { label: "Pages that are gone", value: num(pages.length), tone: pages.length ? "neg" : "pos", sub: "with links pointing at them" },
          { label: "Links to win back", value: num(links), sub: `from ${num(sites)} ${sites === 1 ? "site" : "sites"}` },
          { label: "Strongest linking site", value: pages.length ? String(Math.max(...pages.map((x) => x.from[0]?.rank ?? 0))) : "–", sub: "authority" },
        ]}
      />
      {pages.length ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <Card title="Links to pages that are gone" action={<CsvButton name={fileName(p.label, "broken-links")} head={["dead page", "status", "linking sites", "links", "strongest site", "redirect to"]} rows={pages.map((x) => [x.page, x.status, x.sites, x.links, x.from[0]?.domain ?? "", x.redirect])} />}>
            <div className="overflow-x-auto">
              <table className="aw-table">
                <thead>
                  <tr>
                    <th>Page that is gone</th>
                    <th className="text-right">Sites</th>
                    <th>Strongest links</th>
                    <th>Send it to</th>
                  </tr>
                </thead>
                <tbody>
                  {pages.map((x) => (
                    <tr key={x.page}>
                      <td className="min-w-52">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="aw-status aw-status--missed">{x.status}</span>
                          <span className="font-medium text-ink wrap-anywhere">{pathOf(x.page)}</span>
                        </span>
                      </td>
                      <td className="aw-num text-right">{num(x.sites)}</td>
                      <td className="min-w-56">
                        <span className="flex flex-col gap-1.5">
                          {x.from.slice(0, 3).map((f) => (
                            <SiteLink key={f.domain} domain={f.domain} href={f.url} onOpen={p.onOpen}>
                              <span className="aw-num text-[12px] text-muted">{f.rank}</span>
                            </SiteLink>
                          ))}
                        </span>
                      </td>
                      <td className="font-medium whitespace-nowrap text-[var(--signal)]">→ {x.redirect}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card title="Redirects to add">
            <div className="flex flex-col gap-3 px-5 pb-5">
              <pre className="max-h-80 overflow-auto rounded-[10px] bg-[var(--aw-surface-2)] p-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-body">{rules}</pre>
              <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm self-start" onClick={copy}>
                Copy redirects
              </button>
            </div>
          </Card>
        </div>
      ) : (
        <Card>
          <p className="px-5 py-6 text-[14px] text-body">No links point to pages that are gone.</p>
        </Card>
      )}
    </div>
  );
}
