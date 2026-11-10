"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { boardStats, SOURCES, STAGES, type Source, type Stage } from "@/lib/linkBuilding";
import type { RunAuth } from "@/lib/runner";
import { demoCards } from "@/lib/demo";
import { ToolStart, TsDomain } from "./ToolStart";
import { SidePanel, StatStrip, Thinking } from "./ui";
import { useApi } from "./ZippiePage";

// Link Building (docs/link-building.md): a board from prospect to won. Prospects come from the Backlinks link gap,
// sites AI cites for rivals, dead rival pages and unlinked mentions. Pitches are drafted here and sent from the
// person's own email. Won links are checked every week. An empty board shows example cards that move on screen only.

type CardRow = {
  id: string;
  name: string;
  domain: string | null;
  url: string | null;
  email: string | null;
  email_status: string;
  stage: Stage;
  source: Source;
  note: string | null;
  authority: number | null;
  stage_at: string;
  link_page: string | null;
  link_live: boolean | null;
  link_follow: boolean | null;
  link_checked_at: string | null;
  draft_subject: string | null;
  draft_body: string | null;
  status: string;
};
type Brand = { id: string; name: string; domain: string };

const SOURCE_CLASS: Record<Source, string> = { ai_cites: "aw-status--ranked", link_gap: "aw-status--pending", broken_page: "aw-status--warn", unlinked_mention: "aw-status--ranked", manual: "aw-status--pending" };
const sourceLabel = (s: Source) => SOURCES.find((x) => x.id === s)?.label ?? s;
const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function LinkBuildingPage({ brand, auth, onBacklinks }: { brand: Brand; auth: RunAuth; onBacklinks: () => void }) {
  const api = useApi(auth);
  const [cards, setCards] = useState<CardRow[] | null>(null);
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [canEdit, setCanEdit] = useState(false);
  const [rivals, setRivals] = useState(0);
  const [filter, setFilter] = useState<Source | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [wantStage, setWantStage] = useState<Stage | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [addUrl, setAddUrl] = useState("");
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<Stage | null>(null);
  const [demoState, setDemo] = useState<CardRow[]>(() => demoCards({ name: brand.name, domain: brand.domain }) as CardRow[]);

  const call = useCallback(<T,>(action: string, extra: Record<string, unknown> = {}) => api<T>("/api/link-building", { action, brandId: brand.id, ...extra }), [api, brand.id]);
  const load = useCallback(async () => {
    try {
      const r = await call<{ cards: CardRow[]; blocked: string[]; canEdit: boolean; rivals: number }>("list");
      setCards(r.cards);
      setBlocked(new Set(r.blocked));
      setCanEdit(r.canEdit);
      setRivals(r.rivals);
    } catch (e) {
      setError(msg(e));
      setCards((c) => c ?? []);
    }
  }, [call]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const isDemo = cards !== null && cards.length === 0;
  // An empty board opens on the tool's start page (ToolStart), with the example board inside it.
  const [showExample, setShowExample] = useState(false);
  const board = isDemo ? demoState : cards;
  const replace = (c: CardRow) => {
    const swap = (list: CardRow[] | null) => (list ?? []).map((x) => (x.id === c.id ? c : x));
    if (isDemo) setDemo(swap);
    else setCards(swap);
  };
  async function act(action: string, id: string, extra: Record<string, unknown> = {}) {
    if (isDemo) {
      // Example cards only move on screen.
      const c = demoState.find((x) => x.id === id);
      if (c && action === "move") replace({ ...c, stage: extra.stage as Stage, link_page: (extra.linkPage as string) ?? c.link_page, stage_at: new Date().toISOString() });
      if (action === "move") setWantStage(null);
      return action === "move";
    }
    setBusy(`${action}:${id}`);
    setError("");
    try {
      const r = await call<{ card?: CardRow; ok?: boolean }>(action, { id, ...extra });
      if (r.card) replace(r.card);
      if (action === "delete") {
        setCards((list) => (list ?? []).filter((x) => x.id !== id));
        setOpenId(null);
      }
      return true;
    } catch (e) {
      setError(msg(e));
      return false;
    } finally {
      setBusy("");
    }
  }
  async function move(c: CardRow, stage: Stage) {
    if (stage === c.stage) return;
    if (stage === "won" && !c.link_page) {
      setOpenId(c.id);
      setWantStage("won");
      return;
    }
    // Move on screen at once; put it back if the server says no.
    const before = c.stage;
    if (isDemo) return void act("move", c.id, { stage });
    replace({ ...c, stage });
    if (!(await act("move", c.id, { stage }))) replace({ ...c, stage: before });
  }
  async function find(source: Source) {
    setBusy(`find:${source}`);
    setError("");
    setNote("");
    try {
      const r = await call<{ found: number; added: number }>("find", { source });
      setNote(r.added ? `${r.added} new ${r.added === 1 ? "prospect" : "prospects"} added.` : r.found ? "Every site found is already on the board." : "No new prospects found.");
      await load();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy("");
    }
  }
  async function addSite() {
    setBusy("add");
    setError("");
    try {
      await call("add", { url: addUrl });
      setAddUrl("");
      await load();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy("");
    }
  }

  const shown = useMemo(() => (board ?? []).filter((c) => filter === "all" || c.source === filter), [board, filter]);
  const stats = boardStats(board ?? []);
  const open = board?.find((c) => c.id === openId) ?? null;
  const canMove = canEdit || isDemo;

  const finders = canEdit ? (
    <div className="flex flex-wrap gap-2">
      <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => find("ai_cites")} disabled={Boolean(busy) || !rivals}>
        {busy === "find:ai_cites" ? "Finding" : "Sites AI cites"}
      </button>
      <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => find("broken_page")} disabled={Boolean(busy) || !rivals}>
        {busy === "find:broken_page" ? "Finding" : "Dead rival pages"}
      </button>
      <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => find("unlinked_mention")} disabled={Boolean(busy)}>
        {busy === "find:unlinked_mention" ? "Searching" : "Unlinked mentions"}
      </button>
      <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={onBacklinks}>
        Link gap
      </button>
    </div>
  ) : null;

  if (cards === null) return <div className="flex flex-col gap-6"><h1 className="aw-h2 mb-0!">Link Building</h1><Thinking text="Loading" /></div>;

  const page = (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="mr-auto flex flex-wrap items-center gap-3">
          <h1 className="aw-h2 mb-0!">Link Building</h1>
          {isDemo ? <span className="aw-status aw-status--pending">Example data</span> : null}
          {isDemo ? (
            <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => setShowExample(false)}>
              About Link Building
            </button>
          ) : null}
        </div>
        {finders}
      </div>
      {error ? <p className="aw-error">{error}</p> : null}
      {note ? <p className="aw-callout">{note}</p> : null}

      <>
          <StatStrip
            tour={1}
            stats={[
              { label: "Links won", value: stats.won, tone: "pos" },
              { label: "Prospects", value: stats.prospects },
              { label: "Contacted", value: stats.reached },
              { label: "Reply rate", value: `${stats.replyRate}%` },
              { label: "Links gone", value: stats.gone, tone: stats.gone ? "neg" : undefined },
            ]}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div data-tour="2" className="flex flex-wrap gap-2">
              {[{ id: "all" as const, label: "All" }, ...SOURCES].map((s) => (
                <button key={s.id} type="button" aria-pressed={filter === s.id} onClick={() => setFilter(s.id)} className="aw-chip aw-chip--btn">
                  {s.label}
                </button>
              ))}
            </div>
            {canEdit ? (
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  addSite();
                }}
              >
                <input id="lb-add" className="aw-input py-1.5! text-[13px]!" value={addUrl} onChange={(e) => setAddUrl(e.target.value)} placeholder="site.com" aria-label="Add a site" />
                <button type="submit" className="aw-btn aw-btn--secondary aw-btn--sm" disabled={!addUrl.trim() || busy === "add"}>
                  Add
                </button>
              </form>
            ) : null}
          </div>
          <div data-tour="3" className="grid auto-cols-[minmax(240px,1fr)] grid-flow-col gap-3 overflow-x-auto pb-2">
            {STAGES.map((st) => {
              const list = shown.filter((c) => c.stage === st.id);
              return (
                <section
                  key={st.id}
                  aria-label={st.label}
                  data-tour={st.id === "won" ? "4" : undefined}
                  className={`flex min-h-72 flex-col gap-2 rounded-[12px] bg-[var(--aw-surface-2)] p-2.5 transition-shadow ${over === st.id ? "shadow-[inset_0_0_0_2px_var(--signal)]" : ""}`}
                  onDragOver={(e) => {
                    if (!drag || !canMove) return;
                    e.preventDefault();
                    setOver(st.id);
                  }}
                  onDragLeave={() => setOver((o) => (o === st.id ? null : o))}
                  onDrop={(e) => {
                    e.preventDefault();
                    setOver(null);
                    const c = board?.find((x) => x.id === drag);
                    setDrag(null);
                    if (c) move(c, st.id);
                  }}
                >
                  <div className="flex items-center justify-between px-1 pb-1 text-[13px] font-semibold text-ink">
                    {st.label}
                    <span className="font-medium text-muted">{list.length}</span>
                  </div>
                  {list.map((c) => (
                    <BoardCard
                      key={c.id}
                      c={c}
                      blocked={blocked.has(c.id)}
                      canEdit={canMove}
                      onOpen={() => {
                        setOpenId(c.id);
                        setWantStage(null);
                      }}
                      onNext={() => move(c, STAGES[STAGES.findIndex((s) => s.id === c.stage) + 1].id)}
                      onDrag={setDrag}
                    />
                  ))}
                </section>
              );
            })}
          </div>
      </>

      {open ? (
        <SidePanel title={open.domain ?? open.name} kicker={sourceLabel(open.source)} onClose={() => { setOpenId(null); setWantStage(null); }}>
          <Detail key={open.id} c={open} blocked={blocked.has(open.id)} canEdit={canMove} demo={isDemo} busy={busy} wantStage={wantStage} onAct={act} onMove={(s) => move(open, s)} />
        </SidePanel>
      ) : null}
    </div>
  );

  if (isDemo && !showExample)
    return (
      <ToolStart
        tool="linkbuilding"
        error={error}
        example={page}
        onOpenExample={() => setShowExample(true)}
        onCta={canEdit && rivals ? () => find("ai_cites") : undefined}
        below={note ? <p className="ts-err" style={{ background: "#e6f6ee", color: "#0b7a52" }}>{note}</p> : null}
        form={
          <>
            <div className="ts-q">
              <TsDomain domain={brand.domain} />
              {canEdit ? (
                <button type="button" className="ts-btn ts-btn--primary ts-btn--lg" onClick={() => find("ai_cites")} disabled={Boolean(busy) || !rivals}>
                  {busy === "find:ai_cites" ? "Finding" : "Sites AI cites"} <span className="ts-arr">→</span>
                </button>
              ) : null}
            </div>
            {canEdit ? (
              <div className="ts-qfoot">
                <span>Or find</span>
                <button type="button" onClick={() => find("broken_page")} disabled={Boolean(busy) || !rivals}>
                  {busy === "find:broken_page" ? "Finding" : "Dead rival pages"}
                </button>
                <button type="button" onClick={() => find("unlinked_mention")} disabled={Boolean(busy)}>
                  {busy === "find:unlinked_mention" ? "Searching" : "Unlinked mentions"}
                </button>
                <button type="button" onClick={onBacklinks}>
                  Link gap
                </button>
                {!rivals ? <span>Sites AI cites and dead rival pages need competitors on the brand.</span> : null}
              </div>
            ) : null}
          </>
        }
      />
    );
  return page;
}

function BoardCard({ c, blocked, canEdit, onOpen, onNext, onDrag }: { c: CardRow; blocked: boolean; canEdit: boolean; onOpen: () => void; onNext: () => void; onDrag: (id: string | null) => void }) {
  const last = c.stage === "won" || c.stage === "lost";
  return (
    <article
      draggable={canEdit}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDrag(c.id);
      }}
      onDragEnd={() => onDrag(null)}
      className={`flex flex-col gap-2 rounded-[10px] bg-[var(--aw-surface)] p-3 shadow-[0_0_0_1px_var(--aw-rule)] ${canEdit ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      <button type="button" onClick={onOpen} className="flex items-start gap-2 text-left">
        <span className="min-w-0 flex-1 text-[13.5px] font-semibold text-ink wrap-anywhere">{c.domain ?? c.name}</span>
        {c.authority !== null ? <span className="aw-num rounded-[6px] bg-[var(--signal-soft)] px-1.5 text-[12px] font-semibold text-[var(--signal-ink)]">{c.authority}</span> : null}
      </button>
      <span className="flex flex-wrap gap-1">
        <span className={`aw-status ${SOURCE_CLASS[c.source]}`}>{sourceLabel(c.source)}</span>
        {blocked ? <span className="aw-status aw-status--missed">Do not contact</span> : null}
        {c.stage === "won" ? <span className={`aw-status ${c.link_live === false ? "aw-status--missed" : c.link_live ? "aw-status--ranked" : "aw-status--pending"}`}>{c.link_live === false ? "Link gone" : c.link_live ? (c.link_follow === false ? "Live, nofollow" : "Live") : "Checking"}</span> : null}
      </span>
      {c.note ? <p className="text-[12px] leading-snug text-muted wrap-break-word">{c.note}</p> : null}
      <span className="flex items-center justify-between gap-2">
        <span className="text-[12px] text-muted">{c.draft_body ? "Pitch ready" : c.email ? "Email found" : when(c.stage_at)}</span>
        {canEdit && !last ? (
          <button type="button" className="aw-iconbtn" aria-label={`Move to ${STAGES[STAGES.findIndex((s) => s.id === c.stage) + 1].label}`} title={`Move to ${STAGES[STAGES.findIndex((s) => s.id === c.stage) + 1].label}`} onClick={onNext}>
            →
          </button>
        ) : null}
      </span>
    </article>
  );
}

function Detail({ c, blocked, canEdit, demo = false, busy, wantStage, onAct, onMove }: { c: CardRow; blocked: boolean; canEdit: boolean; demo?: boolean; busy: string; wantStage: Stage | null; onAct: (a: string, id: string, extra?: Record<string, unknown>) => Promise<boolean>; onMove: (s: Stage) => void }) {
  const [email, setEmail] = useState(c.email ?? "");
  const [subject, setSubject] = useState(c.draft_subject ?? "");
  const [body, setBody] = useState(c.draft_body ?? "");
  const [linkPage, setLinkPage] = useState(c.link_page ?? "");
  const [copied, setCopied] = useState(false);
  const [sure, setSure] = useState(false);
  // A new draft from the server replaces what's in the boxes.
  const [seenDraft, setSeenDraft] = useState(c.draft_body);
  if (c.draft_body !== seenDraft) {
    setSeenDraft(c.draft_body);
    setSubject(c.draft_subject ?? "");
    setBody(c.draft_body ?? "");
    if (c.email) setEmail(c.email);
  }
  const is = (a: string) => busy === `${a}:${c.id}`;
  const mailto = email ? `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` : "";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        {c.url ? (
          <a href={c.url} target="_blank" rel="noreferrer" className="text-[13px] text-[var(--signal-ink)] wrap-anywhere hover:underline">
            {c.url}
          </a>
        ) : null}
        {c.note ? <p className="text-[13px] text-body">{c.note}</p> : null}
        {blocked ? <p className="aw-error">This site is on your do-not-contact list.</p> : null}
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Stage">
        {STAGES.map((s) => (
          <button key={s.id} type="button" disabled={!canEdit} aria-pressed={c.stage === s.id} onClick={() => onMove(s.id)} className={`aw-btn aw-btn--sm ${c.stage === s.id ? "aw-btn--primary" : "aw-btn--secondary"}`}>
            {s.label}
          </button>
        ))}
      </div>

      {(c.stage === "won" || wantStage === "won") ? (
        <section className="flex flex-col gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[12px] text-muted">Page where the link is</span>
            <input id="lb-link-page" autoFocus={wantStage === "won"} className="aw-input" value={linkPage} onChange={(e) => setLinkPage(e.target.value)} placeholder="https://site.com/article" disabled={!canEdit} />
          </label>
          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              {c.stage !== "won" ? (
                <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" disabled={!linkPage.trim() || is("move")} onClick={() => onAct("move", c.id, { stage: "won", linkPage })}>
                  Mark as won
                </button>
              ) : (
                <>
                  <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" disabled={demo || linkPage === (c.link_page ?? "") || is("save")} onClick={() => onAct("save", c.id, { linkPage })}>
                    Save
                  </button>
                  <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" disabled={demo || !c.link_page || is("check")} onClick={() => onAct("check", c.id)}>
                    {is("check") ? "Checking" : "Check now"}
                  </button>
                </>
              )}
            </div>
          ) : null}
          {c.stage === "won" && c.link_checked_at ? (
            <p className={`text-[13px] ${c.link_live === false ? "text-neg" : "text-body"}`}>
              {c.link_live === false ? "The link wasn't found in the last two checks." : c.link_live ? `Live${c.link_follow === false ? ", nofollow" : ""}.` : "Not found in the last check. One more miss marks it gone."} Checked {when(c.link_checked_at)}.
            </p>
          ) : null}
        </section>
      ) : null}

      {c.stage !== "won" && c.stage !== "lost" ? (
        <section className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[12px] text-muted">Email</span>
            <span className="flex gap-2">
              <input id="lb-email" className="aw-input min-w-0 flex-1" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={c.email_status === "not_found" ? "No email found on the site" : "editor@site.com"} disabled={!canEdit} />
              {canEdit && email !== (c.email ?? "") ? (
                <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => onAct("save", c.id, { email })} disabled={demo || is("save")}>
                  Save
                </button>
              ) : null}
            </span>
          </label>
          {c.draft_body || subject || body ? (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-[12px] text-muted">Subject</span>
                <input id="lb-subject" className="aw-input" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={!canEdit} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[12px] text-muted">Pitch</span>
                <textarea id="lb-body" className="aw-input min-h-56 leading-relaxed" value={body} onChange={(e) => setBody(e.target.value)} disabled={!canEdit} />
              </label>
            </>
          ) : null}
          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => onAct("draft", c.id)} disabled={demo || blocked || is("draft")}>
                {is("draft") ? "Writing" : c.draft_body ? "Write again" : "Draft pitch"}
              </button>
              {subject !== (c.draft_subject ?? "") || body !== (c.draft_body ?? "") ? (
                <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => onAct("save", c.id, { subject, body })} disabled={demo || is("save")}>
                  Save pitch
                </button>
              ) : null}
              {body ? (
                <button
                  type="button"
                  className="aw-btn aw-btn--secondary aw-btn--sm"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(`${subject}\n\n${body}`);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    } catch {
                      setCopied(false);
                    }
                  }}
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              ) : null}
              {body && mailto && !blocked ? (
                <a className="aw-btn aw-btn--secondary aw-btn--sm" href={mailto}>
                  Open in email
                </a>
              ) : null}
              {body && !blocked && c.stage === "prospect" ? (
                <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" onClick={() => (demo ? onMove("contacted") : onAct("sent", c.id))} disabled={is("sent")}>
                  Mark as sent
                </button>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {canEdit ? (
        <div className="flex flex-wrap gap-2 border-t border-[var(--aw-rule)] pt-4">
          {!blocked ? (
            <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => onAct("dnc", c.id)} disabled={demo || is("dnc")}>
              Do not contact
            </button>
          ) : null}
          <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => (sure ? onAct("delete", c.id) : setSure(true))} disabled={demo || is("delete")}>
            {sure ? "Delete for good" : "Delete"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
