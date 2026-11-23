"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useState } from "react";
import { addComment, ago, deleteComment, resolveComment, threadsOf, type DocComment, type Me } from "@/lib/docCollab";
import { Seg } from "../ui";

// Comment threads on an article in Drafts. A thread starts on a quote from the text (the editor highlights it);
// people reply, resolve and reopen. The list and its loading live with the article screen, so the highlights and the
// comment count follow every change.

export function DocComments({
  sb,
  workspaceId,
  docId,
  me,
  canEdit,
  rows,
  error,
  draft,
  active,
  found,
  onRows,
  onDraftDone,
  onPick,
}: {
  sb: SupabaseClient;
  workspaceId: string;
  docId: string;
  me: Me | null;
  canEdit: boolean;
  rows: DocComment[] | null;
  error: string;
  /** The quote of a new comment being written, or null. */
  draft: string | null;
  active: string | null;
  found: (quote: string) => boolean;
  onRows: (rows: DocComment[]) => void;
  onDraftDone: () => void;
  onPick: (id: string) => void;
}) {
  const [filter, setFilter] = useState<"open" | "resolved">("open");
  const [body, setBody] = useState("");
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [fail, setFail] = useState("");

  async function run(id: string, fn: () => Promise<void>) {
    setBusy(id);
    setFail("");
    try {
      await fn();
    } catch (e) {
      setFail(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }
  const post = (quote: string) =>
    run("new", async () => {
      if (!me || !body.trim()) return;
      const c = await addComment(sb, { workspaceId, docId, quote, body: body.trim(), me });
      onRows([...(rows ?? []), c]);
      setBody("");
      setFilter("open");
      onDraftDone();
      onPick(c.id);
    });
  const reply = (t: DocComment) =>
    run(t.id, async () => {
      const text = (replies[t.id] ?? "").trim();
      if (!me || !text) return;
      const c = await addComment(sb, { workspaceId, docId, parentId: t.id, body: text, me });
      onRows([...(rows ?? []), c]);
      setReplies((r) => ({ ...r, [t.id]: "" }));
    });
  const resolve = (t: DocComment, on: boolean) =>
    run(t.id, async () => {
      await resolveComment(sb, t.id, on);
      onRows((rows ?? []).map((r) => (r.id === t.id ? { ...r, resolved_at: on ? new Date().toISOString() : null } : r)));
    });
  const remove = (t: DocComment) =>
    run(t.id, async () => {
      await deleteComment(sb, t.id);
      onRows((rows ?? []).filter((r) => r.id !== t.id && r.parent_id !== t.id));
    });

  if (error) return <p className="px-4 py-4 text-[13px] text-muted">{error}</p>;
  if (!rows) return <p className="px-4 py-4 text-[13px] text-muted">Loading comments...</p>;
  const threads = threadsOf(rows);
  const open = threads.filter((t) => !t.resolved_at);
  const shown = filter === "open" ? open : threads.filter((t) => t.resolved_at);
  const mine = (c: DocComment) => Boolean(me && c.author_id === me.id);

  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      {draft !== null ? (
        <form
          className="flex flex-col gap-2 border border-rule p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void post(draft);
          }}
        >
          <span className="aw-micro">New comment</span>
          <p className="line-clamp-3 border-l-2 border-[#D9A400] pl-2.5 text-[12px] text-muted">{draft}</p>
          <label className="sr-only" htmlFor="cmt-new">
            Comment
          </label>
          <textarea
            id="cmt-new"
            autoFocus
            value={body}
            rows={3}
            placeholder="Add a comment"
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void post(draft);
              } else if (e.key === "Escape") {
                e.stopPropagation();
                onDraftDone();
              }
            }}
            className="aw-input min-h-20 py-2"
          />
          <span className="flex items-center justify-end gap-2">
            <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={onDraftDone}>
              Cancel
            </button>
            <button type="submit" className="aw-btn aw-btn--primary aw-btn--sm" disabled={!body.trim() || busy === "new" || !me}>
              {busy === "new" ? "Posting..." : "Comment"}
            </button>
          </span>
        </form>
      ) : null}
      {fail ? <p className="aw-error text-[13px]">{fail}</p> : null}
      <Seg
        label="Show"
        value={filter}
        onChange={setFilter}
        options={[
          { id: "open", label: `Open ${open.length}` },
          { id: "resolved", label: `Resolved ${threads.length - open.length}` },
        ]}
      />
      {shown.length ? (
        <ul className="flex flex-col gap-3">
          {shown.map((t) => {
            const gone = !t.resolved_at && t.quote && !found(t.quote);
            return (
              <li key={t.id} className={`flex flex-col gap-2.5 border p-3 ${active === t.id ? "border-[#D9A400]" : "border-rule-faint"}`}>
                {t.quote ? (
                  <button type="button" className="line-clamp-2 border-l-2 border-[#D9A400] pl-2.5 text-left text-[12px] text-muted hover:text-ink" onClick={() => onPick(t.id)} title="Show in the text">
                    {t.quote}
                  </button>
                ) : null}
                {gone ? <span className="text-[12px] text-warn">The text this was on has changed.</span> : null}
                {[t, ...t.replies].map((c) => (
                  <div key={c.id} className="flex flex-col gap-0.5">
                    <span className="text-[12px] text-muted">
                      <b className="font-medium text-ink">{c.author_name || "Someone"}</b> · {ago(c.created_at)}
                    </span>
                    <p className="text-[13px] whitespace-pre-wrap text-body [overflow-wrap:anywhere]">{c.body}</p>
                    {c.id !== t.id && mine(c) ? (
                      <button type="button" className="aw-text-link self-start text-[12px] text-muted" disabled={busy === t.id} onClick={() => void remove(c)}>
                        Delete
                      </button>
                    ) : null}
                  </div>
                ))}
                {t.resolved_at ? null : (
                  <span className="flex items-end gap-2">
                    <label className="sr-only" htmlFor={`rp-${t.id}`}>
                      Reply
                    </label>
                    <textarea
                      id={`rp-${t.id}`}
                      rows={1}
                      value={replies[t.id] ?? ""}
                      placeholder="Reply"
                      onChange={(e) => setReplies((r) => ({ ...r, [t.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault();
                          void reply(t);
                        }
                      }}
                      className="aw-input min-h-9 flex-1 py-1.5"
                    />
                    <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" disabled={!(replies[t.id] ?? "").trim() || busy === t.id || !me} onClick={() => void reply(t)}>
                      Reply
                    </button>
                  </span>
                )}
                <span className="flex items-center gap-3 text-[12px]">
                  {canEdit || mine(t) ? (
                    <button type="button" className="aw-text-link" disabled={busy === t.id} onClick={() => void resolve(t, !t.resolved_at)}>
                      {t.resolved_at ? "Reopen" : "Resolve"}
                    </button>
                  ) : null}
                  {mine(t) && !t.replies.length ? (
                    <button type="button" className="aw-text-link text-muted" disabled={busy === t.id} onClick={() => void remove(t)}>
                      Delete
                    </button>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[13px] text-muted">{filter === "open" ? "No open comments. Select text in the article and click Comment to start one." : "No resolved comments."}</p>
      )}
    </div>
  );
}
