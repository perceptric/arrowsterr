"use client";

import { track } from "@/lib/analytics";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useState } from "react";
import { getDoc, getGuideline } from "@/lib/db";
import { docToHtml } from "@/lib/docHtml";
import type { RunAuth } from "@/lib/runner";
import type { WriteState } from "@/lib/writeFlow";
import { Confirm } from "../reports/Dialog";
import { PublishPanel } from "../research/PublishPanel";
import { post } from "../research/shared";
import { brandTables } from "../research/Writer";
import { exportClean } from "../research/writerNodes";
import { OutlinePanel } from "./OutlinePanel";

// The Write cell (docs/agentic-writing.md, section 1): Write outline, Write draft, Publish content and View post,
// with the open button beside it. The button is plain; useWriteActions runs what it does and draws the sidebar,
// Publish and the confirm outside any grid, so typing in them never reaches the grid's keys.

const OpenIcon = () => (
  <svg className="aw-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </svg>
);

/** One piece's Write cell. onAct runs the main button; onOpen the open button. */
export function WriteButton({ state, busy, canEdit, onAct, onOpen }: { state: WriteState; busy: boolean; canEdit: boolean; onAct: () => void; onOpen: () => void }) {
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };
  const main = (label: string, primary = true, title?: string) => (
    <button type="button" className={`aw-btn ${primary ? "aw-btn--primary" : "aw-btn--secondary"} aw-btn--sm whitespace-nowrap`} disabled={busy} title={title} onClick={stop(onAct)}>
      {busy ? "Starting..." : label}
    </button>
  );
  const open = (title: string) => (
    <button type="button" className="aw-iconbtn shrink-0" title={title} aria-label={title} onClick={stop(onOpen)}>
      <OpenIcon />
    </button>
  );
  const s = state;
  return (
    <span className="flex items-center gap-1">
      {s.kind === "busy" ? (
        <span className="tw-tag tw-tag--orange whitespace-nowrap">{s.label}</span>
      ) : s.kind === "view" ? (
        main("View post", false)
      ) : !canEdit ? (
        <span className="text-muted">–</span>
      ) : s.kind === "outline" ? (
        main("Write outline")
      ) : s.kind === "draft" ? (
        main("Write draft")
      ) : s.kind === "publish" ? (
        main("Publish content")
      ) : (
        main("Try again", true, s.error)
      )}
      {s.kind === "draft" ? open("Open outline") : s.kind === "publish" || (s.kind === "view" && s.docId) ? open("Open draft") : null}
    </span>
  );
}

type Piece = { id: string; keyword: string };

/**
 * What the Write buttons do, for one screen. act(piece, state) runs a piece's main button; open(piece, state) its
 * open button. overlays holds the outline sidebar, Publish and the confirm; render it outside the grid.
 * onChanged reloads the screen's rows. beforeOutline puts a piece in the Library first.
 */
export function useWriteActions({
  sb,
  auth,
  brandId,
  siteId,
  canEdit,
  onChanged,
  beforeOutline,
  onUpgrade,
}: {
  sb: SupabaseClient;
  auth: RunAuth;
  brandId: string | null;
  siteId: string;
  canEdit: boolean;
  onChanged: () => void;
  beforeOutline?: (itemId: string) => Promise<void> | void;
  /** Set when this workspace's plan has no writer: the buttons open the plans page. */
  onUpgrade?: () => void;
}) {
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [outline, setOutline] = useState<{ itemId: string; briefId: string } | null>(null);
  const [publishing, setPublishing] = useState<{ docId: string; title: string; html: string } | null>(null);
  const [replace, setReplace] = useState<{ itemId: string; briefId: string } | null>(null);
  const [replacing, setReplacing] = useState(false);

  const mark = (id: string, on: boolean) => setBusy((b) => (on ? new Set([...b, id]) : new Set([...b].filter((x) => x !== id))));
  const fail = (keyword: string, e: unknown) => setError(`${keyword}: ${e instanceof Error ? e.message : String(e)}`);

  async function writeOutline(p: Piece) {
    await beforeOutline?.(p.id);
    await post(auth, "/api/agentic-writer", { action: "brief", itemId: p.id });
    track("outline_started", {});
  }

  /** Write draft. A draft edited by hand asks before it is written over. True when the draft started. */
  async function writeDraft(p: Piece, briefId: string, confirm = false): Promise<boolean> {
    try {
      await post(auth, "/api/agentic-writer", { action: "draft", briefId, confirm });
      track("draft_started", {});
      return true;
    } catch (e) {
      if (/edited by hand/i.test(e instanceof Error ? e.message : String(e))) {
        setReplace({ itemId: p.id, briefId });
        return false;
      }
      throw e;
    }
  }

  async function openPublish(docId: string) {
    const [doc, guideline] = await Promise.all([getDoc(sb, docId), getGuideline(sb, siteId).catch(() => null)]);
    setPublishing({ docId, title: doc.title, html: brandTables(exportClean(docToHtml(doc.content)), guideline) });
  }

  async function act(p: Piece, s: WriteState) {
    if (s.kind === "busy") return;
    if (s.kind === "view") return void window.open(s.url, "_blank", "noopener,noreferrer");
    if (!canEdit) return;
    if (onUpgrade) return onUpgrade();
    setError("");
    mark(p.id, true);
    try {
      if (s.kind === "outline" || (s.kind === "retry" && s.target === "outline")) await writeOutline(p);
      else if (s.kind === "draft" || (s.kind === "retry" && s.target === "draft" && s.briefId)) await writeDraft(p, s.briefId!);
      else if (s.kind === "publish") await openPublish(s.docId);
      onChanged();
    } catch (e) {
      fail(p.keyword, e);
    } finally {
      mark(p.id, false);
    }
  }

  /** Run one action for several pieces: Write outline or Write draft from the bulk bar. */
  async function actMany(list: { piece: Piece; state: WriteState }[], kind: "outline" | "draft") {
    if (!canEdit) return;
    if (onUpgrade) return onUpgrade();
    setError("");
    const todo = list.filter(({ state: s }) => (kind === "outline" ? s.kind === "outline" || (s.kind === "retry" && s.target === "outline") : s.kind === "draft" || (s.kind === "retry" && s.target === "draft")));
    const errors: string[] = [];
    for (const { piece } of todo) mark(piece.id, true);
    for (const { piece, state: s } of todo) {
      try {
        if (kind === "outline") await writeOutline(piece);
        else if ((s.kind === "draft" || s.kind === "retry") && s.briefId) await post(auth, "/api/agentic-writer", { action: "draft", briefId: s.briefId });
      } catch (e) {
        errors.push(`${piece.keyword}: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        mark(piece.id, false);
      }
    }
    if (errors.length) setError(errors.join(" "));
    onChanged();
  }

  function open(p: Piece, s: WriteState) {
    if (s.kind === "draft") return setOutline({ itemId: p.id, briefId: s.briefId });
    const docId = s.kind === "publish" ? s.docId : s.kind === "view" ? s.docId : null;
    if (docId) window.open(`/library?doc=${encodeURIComponent(docId)}${brandId ? `&brand=${encodeURIComponent(brandId)}` : ""}`, "_blank", "noopener");
  }

  const piece = outline ? { id: outline.itemId, keyword: "" } : null;
  const overlays = (
    <>
      {outline && piece ? (
        <OutlinePanel
          sb={sb}
          auth={auth}
          briefId={outline.briefId}
          brandId={brandId}
          canEdit={canEdit}
          onClose={() => {
            setOutline(null);
            onChanged();
          }}
          onWriteDraft={async () => {
            if (onUpgrade) {
              onUpgrade();
              return false;
            }
            try {
              const started = await writeDraft(piece, outline.briefId);
              if (started) onChanged();
              return started;
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
              return false;
            }
          }}
        />
      ) : null}
      {publishing ? (
        <PublishPanel
          sb={sb}
          auth={auth}
          docId={publishing.docId}
          brandId={brandId ?? undefined}
          title={publishing.title}
          html={() => publishing.html}
          onClose={() => {
            setPublishing(null);
            onChanged();
          }}
        />
      ) : null}
      {replace ? (
        <Confirm
          title="Replace your edits?"
          text="This draft was edited by hand. Writing a new draft replaces those edits."
          action="Write draft"
          busy={replacing}
          onClose={() => setReplace(null)}
          onConfirm={async () => {
            setReplacing(true);
            try {
              await post(auth, "/api/agentic-writer", { action: "draft", briefId: replace.briefId, confirm: true });
              setReplace(null);
              setOutline(null);
              onChanged();
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
              setReplace(null);
            } finally {
              setReplacing(false);
            }
          }}
        />
      ) : null}
    </>
  );

  return { act, actMany, open, busy, error, setError, overlays };
}
