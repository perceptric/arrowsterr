"use client";

import { useCallback, useEffect, useState } from "react";
import { gapSpread, type GapRow } from "@/lib/backlinks";
import { Card, StatStrip } from "../ui";
import { C, Stack } from "./charts";
import { CsvButton, Fav, fileName, Loading, msg, num, SiteLink, Toggle, Updated, type TabProps } from "./shared";

// Sites that link to up to 10 competitors and not to the target, with sites AI cites flagged.

const MAX = 10;
type Gap = { rows: GapRow[]; at: string };

export function GapTab(p: TabProps) {
  const [rivals, setRivals] = useState<string[]>([]);
  const [suggested, setSuggested] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [gap, setGap] = useState<Gap | null | "none">(null);
  const [busy, setBusy] = useState("");
  const [f, setF] = useState({ two: false, ai: false, strong: false });
  const { call, onError } = p;

  const load = useCallback(
    async (fresh: boolean, list?: string[]) => {
      if (fresh) setBusy("load");
      onError("");
      try {
        const r = await call<{ gap?: Gap | null; rivals?: string[]; suggested?: string[]; notSaved?: boolean }>("gap", { ...(list ? { rivals: list } : {}), ...(fresh ? { refresh: true } : { peek: true }) });
        if (r.rivals) setRivals(r.rivals);
        if (r.suggested) setSuggested(r.suggested);
        setGap(r.notSaved || !r.gap ? "none" : r.gap);
      } catch (e) {
        onError(msg(e));
        setGap((g) => g ?? "none");
      } finally {
        setBusy("");
      }
    },
    [call, onError],
  );
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(false);
  }, [load]);

  const addRival = (raw: string) => {
    const d = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
    if (d && /\.[a-z]{2,}$/.test(d) && !rivals.includes(d) && rivals.length < MAX) setRivals([...rivals, d]);
    setInput("");
  };

  const all = gap && gap !== "none" ? gap.rows : [];
  const rows = all.filter((r) => (!f.two || r.rivals.length >= 2) && (!f.ai || r.aiCited > 0) && (!f.strong || r.rank >= 60));
  const spread = gapSpread(all);
  const cols = gap && gap !== "none" ? [...new Set(all.flatMap((r) => r.rivals))].sort((a, b) => rivals.indexOf(a) - rivals.indexOf(b)) : rivals;
  const you = p.isOwn ? "you" : p.label.replace(/[/?#].*$/, "");

  return (
    <div className="flex flex-col gap-4">
      <Card title="Competitors" action={<span className="text-[12px] text-muted">Up to {MAX}</span>}>
        <div className="flex flex-col gap-3 px-5 pb-5">
          <div className="flex flex-wrap items-center gap-2">
            {rivals.map((r) => (
              <span key={r} className="inline-flex items-center gap-1.5 rounded-full bg-[var(--aw-surface-2)] py-1 pr-1.5 pl-2.5 text-[13px] text-ink">
                <Fav domain={r} size={14} />
                {r}
                {p.canEdit ? (
                  <button type="button" aria-label={`Remove ${r}`} className="aw-iconbtn h-5! w-5!" onClick={() => setRivals(rivals.filter((x) => x !== r))}>
                    ×
                  </button>
                ) : null}
              </span>
            ))}
            {p.canEdit && rivals.length < MAX ? (
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  addRival(input);
                }}
              >
                <input className="aw-input py-1.5! text-[13px]!" value={input} onChange={(e) => setInput(e.target.value)} placeholder="competitor.com" aria-label="Add a competitor" />
                <button type="submit" className="aw-btn aw-btn--secondary aw-btn--sm" disabled={!input.trim()}>
                  Add
                </button>
              </form>
            ) : null}
          </div>
          {p.canEdit && suggested.some((s) => !rivals.includes(s)) && rivals.length < MAX ? (
            <div className="flex flex-wrap items-center gap-2">
              {suggested
                .filter((s) => !rivals.includes(s))
                .slice(0, MAX - rivals.length)
                .map((s) => (
                  <button key={s} type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => addRival(s)}>
                    + {s}
                  </button>
                ))}
            </div>
          ) : null}
          {p.canEdit ? (
            <div>
              <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" disabled={!rivals.length || busy === "load"} onClick={() => load(true, rivals)}>
                {busy === "load" ? "Finding" : "Find the gap"}
              </button>
            </div>
          ) : null}
        </div>
      </Card>

      {gap === null ? (
        <Loading />
      ) : gap === "none" ? null : (
        <>
          <StatStrip
            extra={<div className="mt-2"><Stack parts={[{ label: "1 competitor", value: spread[0], color: C.faint }, { label: "2 competitors", value: spread[1], color: C.sky }, { label: "3 or more", value: spread[2], color: C.signal }]} /></div>}
            stats={[
              { label: `Link to competitors, not to ${you}`, value: num(all.length) },
              { label: "Link to 2 or more competitors", value: num(spread[1] + spread[2]), sub: "The likeliest to link to you too" },
              { label: "AI cites them", value: num(all.filter((r) => r.aiCited > 0).length), sub: "in your AI answers, 30 days" },
            ]}
          />
          <Card
            title={`${num(rows.length)} sites link to ${cols.length === 1 ? "your competitor" : "your competitors"} and not to ${you}`}
            action={
              <span className="flex flex-wrap items-center gap-3">
                <CsvButton name={fileName(p.label, "link-gap")} head={["site", "authority", ...cols, "ai cites"]} rows={rows.map((g) => [g.domain, g.rank, ...cols.map((r) => (g.rivals.includes(r) ? "yes" : "")), g.aiCited])} />
                <Updated at={gap.at} busy={busy === "load"} canRefresh={p.canEdit} onRefresh={() => load(true, rivals)} />
              </span>
            }
          >
            <div className="flex flex-wrap gap-2 px-5 pb-3">
              <Toggle on={f.two} onClick={() => setF({ ...f, two: !f.two })}>Links to 2+ competitors</Toggle>
              <Toggle on={f.ai} onClick={() => setF({ ...f, ai: !f.ai })}>AI cites it</Toggle>
              <Toggle on={f.strong} onClick={() => setF({ ...f, strong: !f.strong })}>Authority 60+</Toggle>
            </div>
            {rows.length ? (
              <div className="overflow-x-auto">
                <table className="aw-table">
                  <thead>
                    <tr>
                      <th>Site</th>
                      <th className="text-right">Authority</th>
                      <th className="text-center text-[var(--signal)]">{you === "you" ? "You" : "Target"}</th>
                      {cols.map((r) => (
                        <th key={r} className="text-center" title={r}>
                          <span className="inline-flex items-center gap-1">
                            <Fav domain={r} size={12} />
                            {r.replace(/\.(com|io|co|org|net)$/, "")}
                          </span>
                        </th>
                      ))}
                      <th>AI cites it</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 500).map((g) => (
                      <tr key={g.domain}>
                        <td className="min-w-48">
                          <SiteLink domain={g.domain} onOpen={p.onOpen} />
                        </td>
                        <td className="aw-num text-right">{g.rank}</td>
                        <td className="bg-[var(--aw-brand-pale)] text-center text-muted">–</td>
                        {cols.map((r) => (
                          <td key={r} className="text-center">
                            {g.rivals.includes(r) ? <span className="font-bold text-pos" aria-label="Links">✓</span> : <span className="text-muted" aria-label="No link">–</span>}
                          </td>
                        ))}
                        <td>{g.aiCited ? <span className="aw-badge">{g.aiCited}×</span> : <span className="text-muted">–</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-5 pb-5 text-[13px] text-muted">No sites match these filters.</p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
