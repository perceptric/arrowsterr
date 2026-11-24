"use client";

// The Writer's cards under Zippie's replies (zippieWriter.ts): the top picks from the Calendar with Write buttons, and
// one piece that keeps updating while the writer works: researching, the outline from real searches with its
// planned blocks, writing, then the finished draft to open and publish in Drafts.

import { useCallback, useEffect, useState } from "react";
import type { PieceStatus, Pick } from "@/lib/contentPicks";
import { I, Icon, msgOf, type SendFn, type useApi } from "./Cards";

const WRITE_ARTICLE = "system:write-article";
const WRITE_OUTLINE = "system:write-outline";

/** Open an app page in place, the way the sidebar does. */
function goTo(path: string) {
  window.history.pushState(null, "", `${path}${window.location.search}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "")}K` : String(n));

/** The best Calendar pieces to write next, each with its reason and a Write button. */
export function PicksCard({ picks, canEdit, onSend }: { picks: Pick[]; canEdit: boolean; onSend: SendFn }) {
  return (
    <ol className="flex flex-col overflow-hidden rounded-aw-lg border border-rule bg-white" aria-label="Top picks">
      {picks.map((p, i) => (
        <li key={p.item_id} className="flex items-center gap-3.5 px-4 py-3.5 not-first:border-t not-first:border-rule-faint">
          <span className={`aw-num flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold ${i ? "bg-surface-2 text-body" : "bg-brand text-white"}`}>{i + 1}</span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[15px] font-medium text-ink [overflow-wrap:anywhere]">{p.keyword}</span>
            <span className="text-[13px] text-muted">{p.why}</span>
          </span>
          {p.volume ? <span className="aw-num hidden shrink-0 text-[13px] text-muted sm:inline">{p.volume.toLocaleString("en-US")} / mo</span> : null}
          {canEdit ? (
            <span className="flex shrink-0 gap-1.5">
              <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => onSend(`Outline “${p.keyword}”`, WRITE_OUTLINE)}>
                Outline
              </button>
              <button type="button" className={`aw-btn aw-btn--sm ${i ? "aw-btn--secondary" : "aw-btn--primary"}`} onClick={() => onSend(`Write “${p.keyword}”`, WRITE_ARTICLE)}>
                Write
              </button>
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/** One piece, from research to the finished draft. Asks again every 5 seconds while the writer works. */
export function PieceCard({ itemId, keyword, api, canEdit, onSend }: { itemId: string; keyword: string; api: ReturnType<typeof useApi>; canEdit: boolean; onSend: SendFn }) {
  const [piece, setPiece] = useState<PieceStatus | null>(null);
  const [error, setError] = useState("");
  // A piece just started may not have its outline row yet: keep asking for the first two minutes too.
  const [fresh, setFresh] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setFresh(false), 120_000);
    return () => clearTimeout(t);
  }, []);
  const load = useCallback(async () => {
    try {
      setPiece((await api<{ piece: PieceStatus }>("/api/ask", { action: "writer_piece", itemId })).piece);
      setError("");
    } catch (e) {
      setError(msgOf(e));
    }
  }, [api, itemId]);
  const busy = !piece || piece.outline?.busy || piece.draft?.busy || (!piece.outline && !piece.draft && fresh);
  useEffect(() => {
    // Reading the piece when the card shows, then while it's being written, is the point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [busy, load]);

  const o = piece?.outline ?? null;
  const d = piece?.draft ?? null;
  const title = o?.title || keyword;
  const frame = "flex flex-col overflow-hidden rounded-aw-lg border border-rule bg-white";
  const working = (label: string, note: string) => (
    <div className={`${frame} gap-2 px-4 py-4`} role="status" aria-live="polite">
      <span className="flex items-center gap-2.5 text-[15px] font-medium text-ink">
        <span className="aw-spin" aria-hidden="true" />
        {label}
      </span>
      <span className="pl-7 text-[13px] text-muted">{note}</span>
    </div>
  );
  const failed = (what: string, why: string | null, again: () => void) => (
    <div className={`${frame} gap-3 px-4 py-4`}>
      <span className="text-[14px] text-ink">
        The {what} for <strong>{keyword}</strong> stopped{why ? `: ${why}` : "."}
      </span>
      {canEdit ? (
        <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm self-start" onClick={again}>
          Try again
        </button>
      ) : null}
    </div>
  );

  if (error && !piece) return <p className="aw-error">{error}</p>;
  if (d?.status === "ready")
    return (
      <div className={`${frame} gap-3 px-4 py-4`}>
        <span className="flex items-start gap-3">
          <span className="zp-card__icon">
            <Icon d={I.doc} />
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[15px] font-semibold text-ink [overflow-wrap:anywhere]">{title}</span>
            <span className="text-[13px] text-muted">Draft ready{d.words ? ` · ${d.words.toLocaleString("en-US")} words` : ""} · in Drafts</span>
          </span>
        </span>
        <span className="flex gap-2 pl-[42px]">
          <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => goTo("/drafts")}>
            Open
          </button>
          <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" onClick={() => goTo("/drafts")}>
            Publish in Drafts
          </button>
        </span>
      </div>
    );
  if (d?.busy) return working(`Writing “${title}”`, `${d.status}. Then Zippie checks every fact against the sources and builds the blocks.`);
  if (d && d.status === "failed") return failed("draft", d.error, () => onSend(`Write the draft for “${keyword}” again`, WRITE_ARTICLE));
  if (!o || o.busy) return working(o ? `${o.status} “${keyword}”` : `Researching “${keyword}”`, "Reading Google's top pages, AI answers and what people search. The outline shows here in a few minutes.");
  if (o.status === "failed") return failed("outline", o.error, () => onSend(`Outline “${keyword}” again`, WRITE_OUTLINE));

  return (
    <div className={frame}>
      <div className="flex items-start gap-3 border-b border-rule-faint px-4 py-4">
        <span className="zp-card__icon">
          <Icon d={I.doc} />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[15px] font-semibold text-ink [overflow-wrap:anywhere]">{title}</span>
          <span className="text-[13px] text-muted">
            Outline · {o.headings.length} sections{o.words ? ` · about ${o.words.toLocaleString("en-US")} words` : ""}
          </span>
        </span>
      </div>
      <ol className="flex flex-col py-1.5">
        {o.headings.map((h, i) => (
          <li key={`${i}:${h.h2}`} className="flex gap-3.5 px-4 py-2.5">
            <span className="aw-num w-4 shrink-0 text-[14px] text-muted">{i + 1}</span>
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="flex items-baseline gap-3">
                <span className="flex-1 text-[15px] font-medium text-ink [overflow-wrap:anywhere]">{h.h2}</span>
                {h.searches_a_month ? <span className="aw-num shrink-0 text-[13px] text-muted">{compact(h.searches_a_month)} / mo</span> : null}
              </span>
              {h.subheadings.length ? <span className="text-[13px] text-muted">{h.subheadings.join(" · ")}</span> : null}
              {h.blocks.map((b) => (
                <span key={b} className="inline-flex items-center gap-2 self-start rounded-aw bg-surface-2 px-2.5 py-1.5 text-[13px] text-body">
                  <Icon d={I.box} size={14} />
                  {b}
                </span>
              ))}
            </span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2 border-t border-rule-faint bg-surface-2 px-4 py-3">
        {canEdit ? (
          <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" onClick={() => onSend(`Write the draft for “${keyword}”`, WRITE_ARTICLE)}>
            Write draft
          </button>
        ) : null}
        <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => goTo("/drafts")}>
          Open outline
        </button>
        <span className="ml-auto text-[12px] text-muted">The draft uses one of this month&apos;s drafts</span>
      </div>
    </div>
  );
}
