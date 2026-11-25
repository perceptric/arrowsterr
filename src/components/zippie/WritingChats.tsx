"use client";

// Writing chats on screen (writingChats.ts): the Writer's Recent writing list, the Working on bar at the top of an open
// writing chat, and the link from an article in Drafts back to the chats about it. The Zippie sidebar's Content writing
// folder is in App.tsx, next to the other chats.

import { useEffect, useState } from "react";
import { ago } from "@/lib/docCollab";
import { isAutopilot, splitChats, STATE_DOT, STATE_LABEL, type WritingPiece } from "@/lib/writingChats";
import { Pop } from "../Pickers";
import { goTo, I, Icon } from "./Cards";
import { useZippie, useZippieMaybe } from "./ZippieContext";

const openPiece = (itemId: string) => goTo(`/drafts?item=${itemId}`);

/** One piece: its keyword and where it stands. */
export function PieceChip({ piece, onOpen }: { piece: WritingPiece; onOpen?: () => void }) {
  const body = (
    <>
      <span className="min-w-0 truncate">{piece.keyword}</span>
      <StateDot piece={piece} />
    </>
  );
  return onOpen ? (
    <button type="button" className="inline-flex max-w-full items-center gap-2 rounded-aw border border-rule bg-white px-3 py-1.5 text-[13px] text-ink hover:border-brand" onClick={onOpen} title="Open in Drafts">
      <Icon d={I.file} size={14} />
      {body}
    </button>
  ) : (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-aw-sm border border-rule-faint bg-surface-2 px-2 py-0.5 text-[12.5px] text-body">{body}</span>
  );
}

/** The colored dot and the word for where a piece stands. */
export function StateDot({ piece, label }: { piece: Pick<WritingPiece, "state">; label?: string }) {
  return (
    <span className="inline-flex flex-none items-center gap-1.5 text-[12px] font-normal text-muted">
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${STATE_DOT[piece.state]}`} aria-hidden="true" />
      {label ?? STATE_LABEL[piece.state]}
    </span>
  );
}

/** Autopilot's tag on its chats. */
export function AutopilotTag() {
  return <span className="flex-none rounded-aw-xs bg-surface-2 px-1.5 text-[11px] font-semibold text-body">Autopilot</span>;
}

/** The Writer's last five writing chats, under its suggestions. */
export function RecentWriting() {
  const z = useZippie();
  const { writing } = splitChats(z.threads, z.writing.projectId, z.writing.pieces);
  if (!writing.length) return null;
  return (
    <section aria-label="Recent writing" className="mt-6 flex w-full max-w-2xl flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-ink">Recent writing</h2>
        <button type="button" className="aw-text-link text-[13px]" onClick={() => goTo(`/zippie${window.location.search}`)}>
          All writing chats
        </button>
      </div>
      <ul className="flex flex-col overflow-hidden rounded-aw-lg border border-rule bg-white">
        {writing.slice(0, 5).map((t) => {
          const auto = isAutopilot(t);
          const pieces = z.writing.pieces[t.id] ?? [];
          return (
            <li key={t.id} className="not-first:border-t not-first:border-rule-faint">
              <button type="button" className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left hover:bg-surface-2" onClick={() => z.openThread(t.id)}>
                <span className={`grid h-8 w-8 flex-none place-items-center rounded-aw ${auto ? "bg-surface-2 text-body" : "bg-brand-bg text-brand"}`}>
                  <Icon d={auto ? I.clock : I.chat} size={16} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex min-w-0 items-center gap-2 text-[15px] font-medium text-ink">
                    <span className="min-w-0 truncate">{t.title}</span>
                    {auto ? <AutopilotTag /> : null}
                  </span>
                  {pieces.length ? (
                    <span className="flex flex-wrap gap-1.5">
                      {pieces.slice(0, 4).map((p) => (
                        <PieceChip key={p.item_id} piece={p} />
                      ))}
                      {pieces.length > 4 ? <span className="text-[12.5px] text-muted">+{pieces.length - 4} more</span> : null}
                    </span>
                  ) : null}
                </span>
                <span className="flex-none text-[12.5px] text-faint">{ago(t.updated_at)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** At the top of an open writing chat: the pieces it worked on, each opening in Drafts. */
export function WorkingOn({ compact = false }: { compact?: boolean }) {
  const z = useZippie();
  const pieces = z.threadId ? z.writing.pieces[z.threadId] : undefined;
  if (!pieces?.length) return null;
  return (
    <div className={`flex flex-wrap items-center gap-2 border-b border-rule-faint bg-surface-2 ${compact ? "px-3.5 py-2.5" : "px-6 py-3"}`} aria-label="Working on">
      <span className="text-[13px] text-muted">Working on</span>
      {pieces.map((p) => (
        <PieceChip key={p.item_id} piece={p} onOpen={() => openPiece(p.item_id)} />
      ))}
    </div>
  );
}

type Chat = { id: string; title: string; updated_at: string };

/** On an article in Drafts: the chats that worked on it. One opens in Zippie; several open a short list. */
export function ChatsAboutPiece({ itemId }: { itemId: string }) {
  const z = useZippieMaybe();
  const api = z?.api;
  const [chats, setChats] = useState<Chat[]>([]);
  const [at, setAt] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (!api) return;
    api<{ chats: Chat[] }>("/api/ask", { action: "item_chats", itemId })
      .then((r) => setChats(r.chats ?? []))
      .catch(() => {});
  }, [api, itemId]);
  if (!z || !chats.length) return null;
  const open = (id: string) => {
    setAt(null);
    z.openThread(id);
    goTo(`/zippie${window.location.search}`);
  };
  const n = chats.length;
  return (
    <>
      <button type="button" className="aw-btn aw-btn--ghost aw-btn--sm" onClick={(e) => (n === 1 ? open(chats[0].id) : setAt(e.currentTarget.getBoundingClientRect()))} title={n === 1 ? `Open "${chats[0].title}" in Zippie` : "Chats about this article"}>
        <Icon d={I.chat} size={14} />
        {n === 1 ? "1 chat about this article" : `${n} chats about this article`}
      </button>
      {at ? (
        <Pop anchor={at} onClose={() => setAt(null)} width={280} label="Chats about this article">
          <div className="aw-pop__list" role="menu">
            {chats.map((c) => (
              <button key={c.id} type="button" role="menuitem" className="aw-pop__opt" onClick={() => open(c.id)}>
                <span className="min-w-0 flex-1 truncate">{c.title}</span>
                <span className="flex-none text-[12px] text-faint">{ago(c.updated_at)}</span>
              </button>
            ))}
          </div>
        </Pop>
      ) : null}
    </>
  );
}
