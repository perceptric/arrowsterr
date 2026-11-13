"use client";

import { askConfirm } from "@/components/Dialogs";
import { useCallback, useEffect, useState } from "react";
import type { RunAuth } from "@/lib/runner";
import { CMS, type CmsKind } from "@/lib/cmsTypes";
import { MAIN, parseSkill } from "@/lib/skills/format";
import type { Proposal } from "@/lib/zippieTools";
import { ConnectWizard } from "../ConnectWizard";
import { Markdown } from "../Markdown";
import { Zippie } from "../Zippie";

// Zippie's replies and the cards inside them: a change set to review, a Connect card, and a skill or Knowledge page to
// save. Shared by the chat bar's panel and the Zippie page.

export type Card = { kind: "changeset" | "setup"; id: string } | { kind: "proposal"; id: string; proposal: Proposal };
export type Msg = { id: number | string; role: "user" | "assistant"; text: string; tools: string[]; cards: Card[]; working?: string; skill?: string; context?: string };
export type SendFn = (text: string, skillKey?: string | null) => void;

const TOOL_LABEL: Record<string, string> = {
  list_cms_connections: "Checked your CMS",
  get_site_content: "Read your posts and pages",
  propose_changes: "Prepared changes",
  get_change_set: "Checked a change set",
  load_skill: "Loaded a skill",
  read_knowledge: "Read your knowledge",
  list_brands: "Looked up your brands",
  get_ai_visibility: "Read AI visibility",
  get_visibility_trend: "Read the trend",
  get_prompts: "Read your prompts",
  get_prompt_answers: "Read AI answers",
  get_competitors: "Compared competitors",
  get_cited_sources: "Read cited sources",
  get_content_plan: "Read the Content Plan",
  get_topic_bank: "Read the topic bank",
  show_setup: "Opened a setup guide",
  add_to_content_plan: "Added to the Content Plan",
  update_content_plan: "Updated the Content Plan",
  remove_from_content_plan: "Removed from the Content Plan",
};
const toolLabel = (n: string) => TOOL_LABEL[n] ?? n.replace(/_/g, " ");

export function useApi(auth: RunAuth) {
  return useCallback(
    async <T,>(path: string, body: Record<string, unknown>): Promise<T> => {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await auth.token()}` },
        body: JSON.stringify({ ...body, workspaceId: auth.workspaceId }),
      });
      const out = await res.json().catch(() => ({ error: `The server returned ${res.status}.` }));
      if (!res.ok) throw new Error(out.error ?? `The server returned ${res.status}.`);
      return out as T;
    },
    [auth],
  );
}

export const msgOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ─────────────── Icons ───────────────

export function Spark({ size = 14, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden="true">
      <path d="M12 1.5c.6 4.9 2.9 8.6 10.5 10.5-7.6 1.9-9.9 5.6-10.5 10.5-.6-4.9-2.9-8.6-10.5-10.5C9.1 10.1 11.4 6.4 12 1.5z" fill="currentColor" />
    </svg>
  );
}
export const Icon = ({ d, size = 16 }: { d: string; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: d }} />
);
export const I = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5Z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7Z"/>',
  dots: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
  note: '<path d="M4 4h16v12l-4 4H4Z"/><path d="M16 20v-4h4"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  panel: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M14.5 4.5v15"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/>',
  box: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
  doc: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h5"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
  expand: '<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>',
};

export function Reply({ m, api, auth, canEdit, onSend }: { m: Msg; api: ReturnType<typeof useApi>; auth: RunAuth; canEdit: boolean; onSend: SendFn }) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  return (
    <div className="zp-reply">
      <Zippie size={30} mood={m.working ? "thinking" : "idle"} className="mt-0.5" />
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        {m.skill ? (
          <span className="zp-used">
            <Icon d={I.box} size={13} /> Used {m.skill}
          </span>
        ) : null}
        {m.tools.length ? (
          <div>
            <button type="button" className="zp-steps" onClick={() => setOpen(!open)} aria-expanded={open}>
              <Spark size={12} /> Did {m.tools.length} step{m.tools.length === 1 ? "" : "s"}
              <span className={`transition-transform ${open ? "rotate-90" : ""}`}>
                <Icon d={I.chev} size={13} />
              </span>
            </button>
            {open ? (
              <ul className="zp-steps__list">
                {m.tools.map((t, i) => (
                  <li key={i}>
                    <Icon d={I.check} size={13} /> {toolLabel(t)}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        {m.text ? <Markdown text={m.text} /> : null}
        {m.cards.map((c) =>
          c.kind === "changeset" ? (
            <ChangeSetCard key={c.id} id={c.id} api={api} canEdit={canEdit} />
          ) : c.kind === "proposal" ? (
            <ProposalCard key={c.id} proposal={c.proposal} api={api} canEdit={canEdit} />
          ) : (
            <SetupCard key={c.id} id={c.id} auth={auth} canEdit={canEdit} onSend={onSend} />
          ),
        )}
        {m.working ? (
          <span className="aw-agent-working text-[13px]" role="status" aria-live="polite">
            {m.working}...
          </span>
        ) : m.text ? (
          <div className="flex gap-1">
            <button
              type="button"
              className="zp-icon-btn zp-icon-btn--sm"
              title={copied ? "Copied" : "Copy"}
              aria-label="Copy"
              onClick={() => {
                navigator.clipboard.writeText(m.text).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                });
              }}
            >
              <Icon d={copied ? I.check : I.copy} size={14} />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ─────────────── Cards in the chat ───────────────

type SetRow = { id: string; title: string; status: string; step: string; error: string | null; cms_connections: { name: string; kind: string } | null };
type Change = { id: number; url: string | null; label: string; field: string; before: Record<string, unknown> | null; after: Record<string, unknown>; note: string; status: string; error: string | null };
const STATUS: Record<string, string> = {
  ready: "aw-status--warn",
  proposed: "aw-status--warn",
  approved: "aw-status--pending",
  applied: "aw-status--ranked",
  undone: "aw-status--pending",
  rejected: "aw-status--pending",
  failed: "aw-status--missed",
  partly: "aw-status--warn",
  preparing: "aw-status--pending",
  applying: "aw-status--pending",
  running: "aw-status--pending",
  done: "aw-status--ranked",
};

/** A change set Zippie prepared: review each change, approve, apply to the site, or undo. */
/** A card Zippie puts in the chat when something needs connecting. One click opens the guide. */
function SetupCard({ id, auth, canEdit, onSend }: { id: string; auth: RunAuth; canEdit: boolean; onSend: SendFn }) {
  const [kind, platform] = id.split(":") as ["cms" | "traffic", CmsKind | undefined];
  const [open, setOpen] = useState(false);
  const [connected, setConnected] = useState("");
  const label = CMS.find((c) => c.id === platform)?.label;
  if (kind === "traffic") {
    return (
      <div className="zp-setup-card">
        <Zippie size={34} mood="happy" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[14px] font-medium text-ink">Set up website tracking</span>
          <span className="text-[13px] text-muted">Add the tracking script or connect Google Analytics.</span>
        </span>
        <button
          type="button"
          className="aw-btn aw-btn--primary aw-btn--sm"
          onClick={() => {
            window.history.pushState(null, "", "/traffic");
            window.dispatchEvent(new PopStateEvent("popstate"));
          }}
        >
          Open Traffic
        </button>
      </div>
    );
  }
  return (
    <div className="zp-setup-card">
      <Zippie size={34} mood="happy" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[14px] font-medium text-ink">{connected ? `${connected} is connected` : `Connect ${label ?? "your CMS"}`}</span>
        <span className="text-[13px] text-muted">{connected ? "Zippie can read and fix your pages now." : "Zippie walks you through it, one click at a time."}</span>
      </span>
      {connected ? (
        <span className="aw-status aw-status--ranked">Connected</span>
      ) : (
        <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" onClick={() => setOpen(true)} disabled={!canEdit} title={canEdit ? undefined : "Ask an admin to connect it"}>
          Connect
        </button>
      )}
      {open ? (
        <ConnectWizard
          auth={auth}
          platform={platform ?? null}
          onConnected={(c) => setConnected(c.name)}
          onClose={() => {
            setOpen(false);
            if (connected) onSend(`I connected ${connected}. Pick up where we left off.`, null);
          }}
        />
      ) : null}
    </div>
  );
}

export function ChangeSetCard({ id, api, canEdit }: { id: string; api: ReturnType<typeof useApi>; canEdit: boolean }) {
  const [set, setSet] = useState<SetRow | null>(null);
  const [changes, setChanges] = useState<Change[]>([]);
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const r = await api<{ set: SetRow; changes: Change[] }>("/api/ask/changes", { action: "get", setId: id });
      setSet(r.set);
      setChanges(r.changes);
    } catch (e) {
      setError(msgOf(e));
    }
  }, [api, id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  useEffect(() => {
    if (set?.status !== "preparing" && set?.status !== "applying") return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [set?.status, load]);
  const act = async (body: Record<string, unknown>, ask?: string) => {
    if (ask && !(await askConfirm({ title: ask, action: "Continue", danger: false }))) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/ask/changes", { ...body, setId: id });
      await load();
    } catch (e) {
      setError(msgOf(e));
    } finally {
      setBusy(false);
    }
  };
  if (!set) return <div className="zp-card text-[13px] text-muted">{error || "Loading changes..."}</div>;
  const working = set.status === "preparing" || set.status === "applying";
  const open = changes.filter((c) => ["proposed", "rejected", "failed"].includes(c.status));
  const approved = changes.filter((c) => c.status === "approved");
  const live = changes.filter((c) => c.status === "applied");
  const shown = all ? changes : changes.slice(0, 3);
  return (
    <div className="zp-pcard">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="zp-card__icon">
            <Spark size={13} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[14px] font-medium text-ink">{set.title}</p>
            <p className="text-[12px] text-muted">
              {set.cms_connections?.name ?? "CMS"} · <span className={`aw-status ${STATUS[set.status] ?? ""}`}>{set.status}</span> {set.error || set.step}
            </p>
          </div>
        </div>
        {canEdit && !working ? (
          <div className="flex flex-wrap gap-2">
            {open.length ? (
              <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" disabled={busy} onClick={() => act({ action: "review", approve: open.map((c) => c.id) })}>
                Approve all ({open.length})
              </button>
            ) : null}
            {approved.length ? (
              <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" disabled={busy} onClick={() => act({ action: "apply" }, `Make ${approved.length} change${approved.length === 1 ? "" : "s"} live on ${set.cms_connections?.name ?? "your site"}? You can undo them.`)}>
                Apply {approved.length} to the site
              </button>
            ) : null}
            {live.length ? (
              <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" disabled={busy} onClick={() => act({ action: "undo" }, `Put ${live.length} page${live.length === 1 ? "" : "s"} back the way they were?`)}>
                Undo
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {working ? <span className="aw-agent-working text-[13px]">{set.step || "Working"}...</span> : null}
      {error ? <p className="aw-error">{error}</p> : null}
      {shown.length ? (
        <div className="flex flex-col divide-y divide-rule-faint">
          {shown.map((c) => (
            <div key={c.id} className="flex flex-col gap-2 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className={`aw-status ${STATUS[c.status] ?? ""}`}>{c.status}</span>
                  {c.url ? (
                    <a href={c.url} target="_blank" rel="noreferrer" className="truncate text-[13px] font-medium text-ink hover:underline">
                      {c.label || c.url}
                    </a>
                  ) : (
                    <span className="truncate text-[13px] font-medium text-ink">{c.label}</span>
                  )}
                </span>
                {canEdit && !working && !["applied", "undone"].includes(c.status) ? (
                  <span className="flex shrink-0 gap-2">
                    {c.status !== "approved" ? (
                      <button type="button" className="aw-text-link text-[13px]" disabled={busy} onClick={() => act({ action: "review", approve: [c.id] })}>
                        Approve
                      </button>
                    ) : null}
                    {c.status !== "rejected" ? (
                      <button type="button" className="aw-text-link text-[13px] text-muted!" disabled={busy} onClick={() => act({ action: "review", reject: [c.id] })}>
                        Skip
                      </button>
                    ) : null}
                  </span>
                ) : null}
              </div>
              <Diff c={c} />
              {c.error ? <p className="text-[12px] text-[#B3093C]">{c.error}</p> : null}
            </div>
          ))}
        </div>
      ) : null}
      {changes.length > 3 ? (
        <button type="button" className="aw-text-link self-start text-[13px]" onClick={() => setAll(!all)}>
          {all ? "Show less" : `Show all ${changes.length} changes`}
        </button>
      ) : null}
    </div>
  );
}

/** What a change does, shown the way it reads on the page. */
function Diff({ c }: { c: Change }) {
  const a = c.after;
  if (c.field === "meta") {
    const b = c.before ?? {};
    return (
      <div className="grid gap-2 text-[13px] sm:grid-cols-2">
        <div className="rounded-lg bg-surface-2 p-3">
          <p className="mb-1 text-[11px] font-medium text-muted uppercase">Now</p>
          <p className="font-medium text-ink">{String(b.title || "No SEO title")}</p>
          <p className="text-body">{String(b.description || "No meta description")}</p>
        </div>
        <div className="rounded-lg bg-brand-pale p-3">
          <p className="mb-1 text-[11px] font-medium text-brand uppercase">Zippie&apos;s version</p>
          <p className="font-medium text-ink">{String(a.title ?? "")}</p>
          <p className="text-body">{String(a.description ?? "")}</p>
        </div>
      </div>
    );
  }
  if (c.field === "alt") {
    return (
      <div className="flex flex-col gap-2 text-[13px]">
        {((a.images as { src: string; alt: string }[]) ?? []).map((img) => (
          <div key={img.src} className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.src} alt="" className="h-12 w-16 shrink-0 rounded-md object-cover" loading="lazy" />
            <span className="text-body">“{img.alt}”</span>
          </div>
        ))}
      </div>
    );
  }
  if (c.field === "faq") {
    return (
      <div className="flex flex-col gap-2 text-[13px]">
        {((a.items as { q: string; a: string }[]) ?? []).map((f) => (
          <div key={f.q}>
            <p className="font-medium text-ink">{f.q}</p>
            <p className="text-body">{f.a}</p>
          </div>
        ))}
      </div>
    );
  }
  if (c.field === "links") {
    return (
      <ul className="flex flex-col gap-1 text-[13px]">
        {((a.links as { anchor: string; url: string }[]) ?? []).map((l) => (
          <li key={l.url + l.anchor} className="text-body">
            “{l.anchor}” → <span className="text-ink">{l.url}</span>
          </li>
        ))}
      </ul>
    );
  }
  if (c.field === "schema") {
    let pretty = String(a.json ?? "");
    try {
      pretty = JSON.stringify(JSON.parse(pretty), null, 2);
    } catch {}
    return (
      <details className="text-[13px]">
        <summary className="cursor-pointer text-body">{c.note || "Structured data"}</summary>
        <pre className="aw-md-code mt-2 max-h-72">{pretty}</pre>
      </details>
    );
  }
  return <p className="text-[13px] text-body">{c.note}</p>;
}

// ─────────────── Right panel: chats and projects ───────────────


/** A skill or Knowledge page Zippie wrote in the chat. Nothing saves until the person presses Save. */
function ProposalCard({ proposal, api, canEdit }: { proposal: Proposal; api: ReturnType<typeof useApi>; canEdit: boolean }) {
  const [state, setState] = useState<"" | "saving" | "saved">("");
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const isSkill = proposal.kind === "skill";
  const head = isSkill ? parseSkill(proposal.files[MAIN] ?? "") : null;
  const title = isSkill ? head!.title || "New skill" : proposal.title;
  const save = async () => {
    setState("saving");
    setError("");
    try {
      if (proposal.kind === "skill") await api("/api/ask/library", { action: "skill_save", files: proposal.files, scope: proposal.scope });
      else await api("/api/ask/library", { action: "knowledge_save", name: proposal.title, content: proposal.body, scope: proposal.scope, replaces: proposal.replaces });
      setState("saved");
      window.dispatchEvent(new Event("zippie:library"));
    } catch (e) {
      setError(msgOf(e));
      setState("");
    }
  };
  return (
    <div className="zp-pcard">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-faint">
          <Icon d={isSkill ? I.box : I.doc} size={15} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[13px] font-medium text-ink wrap-break-word">{title}</span>
          <span className="text-[12px] text-muted">
            {isSkill ? "Skill" : proposal.replaces ? `Knowledge, replaces ${proposal.replaces}` : "Knowledge page"} · {proposal.scope === "personal" ? "Personal" : "Workspace"}
          </span>
        </span>
      </div>
      {isSkill && head?.head.description ? <p className="text-[12.5px] text-body wrap-break-word">{head.head.description}</p> : null}
      {open ? <pre className="zp-pcard__pre">{isSkill ? proposal.files[MAIN] : proposal.body}</pre> : null}
      {error ? <p className="aw-error">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        {state === "saved" ? (
          <span className="aw-status aw-status--ranked">Saved</span>
        ) : (
          <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" onClick={save} disabled={!canEdit || state === "saving"} title={canEdit ? "" : "Editors and admins can save"}>
            {state === "saving" ? "Saving..." : isSkill ? "Save skill" : "Save to Knowledge"}
          </button>
        )}
        <button type="button" className="aw-btn aw-btn--ghost aw-btn--sm" onClick={() => setOpen(!open)}>
          {open ? "Hide" : "Read it"}
        </button>
      </div>
    </div>
  );
}

/** Read a file the person picked: text as text, PDFs as base64 for the server to read. */
export async function readFile(f: File): Promise<{ name: string; content?: string; pdf?: string }> {
  if (f.size > 10_000_000) throw new Error(`${f.name} is over 10 MB.`);
  if (/\.pdf$/i.test(f.name) || f.type === "application/pdf") {
    const bytes = new Uint8Array(await f.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { name: f.name, pdf: btoa(bin) };
  }
  return { name: f.name, content: await f.text() };
}

