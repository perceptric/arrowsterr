"use client";

import { useState } from "react";
import { aiLinkRows } from "@/lib/backlinks";
import { Card, Seg, StatStrip } from "../ui";
import { C, Priority, Stack } from "./charts";
import { CsvButton, Fav, fileName, Loading, NotLoaded, num, SiteLink, Updated, useAnswer, type TabProps } from "./shared";

// Sites the brand's AI answers cite in the last 30 days, which of them link to the target, which link only to
// competitors, and the order to go after them.

type Raw = { cited: { domain: string; cites: number; engines: string[] }[]; mine: string[]; byRival: Record<string, string[]>; ranks: Record<string, number>; at: string };
type AiData = { empty: true } | { empty: false; raw: Raw; rivals: string[] };

const ENGINE: Record<string, { letter: string; color: string }> = {
  ChatGPT: { letter: "G", color: "var(--aw-e-chatgpt, #10A37F)" },
  Perplexity: { letter: "P", color: "var(--aw-e-perplexity, #20808D)" },
  Gemini: { letter: "G", color: "var(--aw-e-gemini, #4285F4)" },
  Claude: { letter: "C", color: "var(--aw-e-claude, #D97757)" },
  "AI Overview": { letter: "O", color: "#4285F4" },
  "AI Mode": { letter: "M", color: "var(--aw-e-aimode, #1A73E8)" },
};

export function AiTab(p: TabProps) {
  const { data, busy, load } = useAnswer<AiData>(p.call, p.memo, "ai", (r) => (r.empty ? { empty: true } : r.ai ? { empty: false, raw: r.ai as Raw, rivals: (r.rivals as string[]) ?? [] } : null), p.armed, p.onError);
  const [view, setView] = useState<"gap" | "all" | "linked">("gap");
  if (data === null) return <Loading />;
  if (data === "none") return <NotLoaded canEdit={p.canEdit} busy={busy} label="Check AI-cited sites" onLoad={() => load(true)} />;
  if (data.empty)
    return (
      <Card>
        <p className="px-5 py-6 text-[14px] text-body">No AI answers with sources in the last 30 days. Track prompts first, then sites AI cites show here.</p>
      </Card>
    );
  const { raw, rivals } = data;
  const rows = aiLinkRows(raw.cited, raw.mine, raw.byRival, raw.ranks);
  const linked = rows.filter((r) => r.linksYou);
  const gap = rows.filter((r) => !r.linksYou && r.competitors.length);
  const total = rows.reduce((a, r) => a + r.cites, 0) || 1;
  const fromLinked = Math.round((linked.reduce((a, r) => a + r.cites, 0) / total) * 100);
  const shown = view === "gap" ? gap : view === "linked" ? linked : rows;
  const you = p.isOwn ? "you" : p.label.replace(/[/?#].*$/, "");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[13px] text-body">Sites ChatGPT, Perplexity, Gemini and Claude cited in your tracked prompts over the last 30 days. A link from one of them helps on Google and in AI answers.</span>
        <Updated at={raw.at} busy={busy} canRefresh={p.canEdit} onRefresh={() => load(true)} />
      </div>
      <StatStrip
        extra={<div className="mt-2"><Stack parts={[{ label: "Link", value: linked.length, color: C.signal }, { label: "Don't link", value: rows.length - linked.length, color: "var(--aw-surface-2)" }]} /></div>}
        stats={[
          { label: `AI-cited sites that link to ${you}`, value: `${num(linked.length)} of ${num(rows.length)}`, sub: `${rows.length ? Math.round((linked.length / rows.length) * 100) : 0}% covered` },
          { label: `Link to competitors, not to ${you}`, value: num(gap.length), tone: gap.length ? "neg" : "pos", sub: "The first sites to go after" },
          { label: `Citations from sites that link to ${you}`, value: `${fromLinked}%`, sub: "of every citation in your answers" },
        ]}
      />
      <Card
        title="Sites AI cites, by priority"
        action={
          <span className="flex flex-wrap items-center gap-3">
            <Seg label="Show" value={view} onChange={setView} options={[{ id: "gap", label: `Competitors only ${gap.length}` }, { id: "all", label: `All ${rows.length}` }, { id: "linked", label: `Linking to ${you === "you" ? "you" : "it"} ${linked.length}` }]} />
            <CsvButton name={fileName(p.label, "ai-cited-links")} head={["site", "times cited", "cited by", "authority", "links to target", "competitors linking", "priority"]} rows={shown.map((r) => [r.domain, r.cites, r.engines.join(" "), r.rank, r.linksYou ? "yes" : "no", r.competitors.join(" "), r.priority])} />
          </span>
        }
      >
        {shown.length ? (
          <div className="overflow-x-auto">
            <table className="aw-table">
              <thead>
                <tr>
                  <th>Site AI cites</th>
                  <th className="text-right">Cited, 30 days</th>
                  <th>Cited by</th>
                  <th className="text-right">Authority</th>
                  <th>Links to {you}</th>
                  <th>Competitors it links to</th>
                  <th>Priority</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.domain}>
                    <td className="min-w-52">
                      <SiteLink domain={r.domain} onOpen={p.onOpen} />
                    </td>
                    <td className="aw-num text-right font-semibold text-ink">{num(r.cites)}</td>
                    <td>
                      <span className="flex flex-wrap gap-1">
                        {r.engines.map((e) => (
                          <span key={e} title={e} aria-label={e} className="inline-grid h-5 w-5 place-items-center rounded-[6px] text-[10px] font-bold text-white" style={{ background: ENGINE[e]?.color ?? C.grey }}>
                            {ENGINE[e]?.letter ?? e[0]}
                          </span>
                        ))}
                      </span>
                    </td>
                    <td className="aw-num text-right">{r.rank || "–"}</td>
                    <td>{r.linksYou ? <span className="aw-status aw-status--ranked">Yes</span> : <span className="aw-status aw-status--missed">No</span>}</td>
                    <td>
                      {r.competitors.length ? (
                        <span className="flex flex-wrap items-center gap-1.5">
                          {r.competitors.map((c) => (
                            <span key={c} title={c} className="inline-flex items-center gap-1 text-[12px] text-body">
                              <Fav domain={c} size={14} />
                              {c}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="text-muted">{rivals.length ? "None" : "No competitors set"}</span>
                      )}
                    </td>
                    <td>{r.linksYou ? <span className="text-muted">–</span> : <Priority value={r.priority} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 pb-5 text-[13px] text-muted">No sites in this list.</p>
        )}
      </Card>
    </div>
  );
}
