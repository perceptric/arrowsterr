"use client";

import { useEffect, useRef, useState } from "react";
import { askConfirm, askText } from "@/components/Dialogs";
import { EmptyNote } from "../Drawing";
import { Markdown } from "../Markdown";
import { I, Icon, msgOf, readFile } from "./Cards";
import { TREE_W } from "./SkillsPage";
import { useZippie, type KnowledgeRow } from "./ZippieContext";

// Knowledge, laid out like Omniscient's: the pages on the left (the team's Workspace pages, then your Personal ones),
// the open page on the right with Preview and Edit. Zippie and the writer read every page. Files and links become
// pages too; their text can be edited like any other.

const FILE_TYPES = ".txt,.md,.markdown,.csv,.json,.html,.htm,.xml,.pdf";
const ago = (iso: string) => {
  const d = (Date.now() - Date.parse(iso)) / 1000;
  if (d < 90) return "just now";
  if (d < 3600) return `${Math.round(d / 60)} minutes ago`;
  if (d < 86400) return `${Math.round(d / 3600)} hours ago`;
  if (d < 172800) return "yesterday";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};
const readOpen = () => (typeof window === "undefined" ? "" : (new URLSearchParams(window.location.search).get("page") ?? ""));
function writeOpen(id: string) {
  const p = new URLSearchParams(window.location.search);
  if (id) p.set("page", id);
  else p.delete("page");
  window.history.replaceState(null, "", window.location.pathname + (p.size ? `?${p}` : ""));
}

export function KnowledgePage() {
  const z = useZippie();
  const docs = z.lib.knowledge;
  const [openId, setOpenId] = useState(readOpen);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const current = docs.find((d) => d.id === openId) ?? docs[0] ?? null;
  const open = (id: string) => {
    setOpenId(id);
    writeOpen(id);
  };
  const total = docs.reduce((n, d) => n + d.chars, 0);

  async function create(scope: "workspace" | "personal") {
    setError("");
    try {
      const r = await z.api<{ item: KnowledgeRow }>("/api/ask/library", { action: "knowledge_save", name: "Untitled", content: "", scope });
      z.reloadLib();
      open(r.item.id);
    } catch (e) {
      setError(msgOf(e));
    }
  }
  async function upload(list: FileList | null) {
    if (!list?.length) return;
    setError("");
    for (const f of [...list]) {
      setBusy(`Reading ${f.name}`);
      try {
        await z.api("/api/ask/library", { action: "knowledge_add", kind: "file", ...(await readFile(f)) });
      } catch (e) {
        setError(msgOf(e));
      }
    }
    setBusy("");
    z.reloadLib();
  }
  async function addLink() {
    const url = await askText({ title: "Add a page from a link", placeholder: "https://", action: "Add" });
    if (!url) return;
    setBusy("Reading the page");
    setError("");
    try {
      const r = await z.api<{ item: KnowledgeRow }>("/api/ask/library", { action: "knowledge_add", kind: "url", url });
      z.reloadLib();
      open(r.item.id);
    } catch (e) {
      setError(msgOf(e));
    }
    setBusy("");
  }

  const group = (scope: "workspace" | "personal", label: string) => {
    const mine = docs.filter((d) => d.scope === scope);
    return (
      <>
        <div className="zp-tree__head">
          <span className="zp-lbl flex-1 px-2">{label}</span>
          {z.canEdit ? (
            <button type="button" className="zp-icon-btn zp-icon-btn--sm" onClick={() => void create(scope)} aria-label={`New ${label.toLowerCase()} page`} title={`New ${label.toLowerCase()} page`}>
              <Icon d={I.plus} size={14} />
            </button>
          ) : null}
        </div>
        {mine.length ? (
          mine.map((d) => (
            <button key={d.id} type="button" className={`zp-tree__row ${current?.id === d.id ? "is-on" : ""}`} aria-current={current?.id === d.id ? "page" : undefined} onClick={() => open(d.id)}>
              <Icon d={d.kind === "url" ? I.link : d.kind === "file" ? I.file : I.doc} size={15} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="wrap-break-word">{d.name || "Untitled"}</span>
                <span className="text-[11.5px] font-normal text-faint">Edited {ago(d.updated_at ?? d.created_at)}</span>
              </span>
            </button>
          ))
        ) : (
          <p className="zp-tree__none">No pages</p>
        )}
      </>
    );
  };

  return (
    <div className="zp-split">
      <aside className="zp-tree" style={{ width: TREE_W }} aria-label="Knowledge pages">
        <div className="flex gap-1 px-1 pt-3">
          <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm flex-1" onClick={() => fileInput.current?.click()} disabled={!z.canEdit || Boolean(busy)}>
            <Icon d={I.upload} size={13} /> Upload
          </button>
          <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm flex-1" onClick={() => void addLink()} disabled={!z.canEdit || Boolean(busy)}>
            <Icon d={I.link} size={13} /> Link
          </button>
          <input ref={fileInput} type="file" multiple accept={FILE_TYPES} className="hidden" onChange={(e) => (void upload(e.target.files), (e.target.value = ""))} />
        </div>
        {group("workspace", "Workspace")}
        {group("personal", "Personal")}
        <p className="px-2 pt-4 text-[12px] text-faint">Zippie and the writer read every page. {Math.round(total / 1000).toLocaleString("en-US")}K characters.</p>
      </aside>
      <section className="zp-pane">
        {busy ? <p className="mx-6 mt-4 text-[13px] text-muted">{busy}...</p> : null}
        {error ? <div className="aw-error mx-6 mt-4">{error}</div> : null}
        {current ? (
          <Page key={current.id} doc={current} onDeleted={() => (z.reloadLib(), open(""))} />
        ) : (
          <div className="zp-pane__in">
            <EmptyNote
              drawing="files"
              action={
                z.canEdit ? (
                  <button type="button" className="aw-btn aw-btn--primary" onClick={() => void create("workspace")}>
                    Add your first page
                  </button>
                ) : undefined
              }
            >
              Teach Zippie and the writer about your brand: your product, your proof, your competitors and how you write.
            </EmptyNote>
          </div>
        )}
      </section>
    </div>
  );
}

/** One Knowledge page: title and text, Preview or Edit, saved a moment after you stop typing. */
function Page({ doc, onDeleted }: { doc: KnowledgeRow; onDeleted: () => void }) {
  const z = useZippie();
  const [name, setName] = useState(doc.name);
  const [body, setBody] = useState<string | null>(null);
  const [mode, setMode] = useState<"read" | "edit">("read");
  const [state, setState] = useState("");
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editable = z.canEdit && (doc.scope === "workspace" || doc.owner_id === z.lib.me);

  useEffect(() => {
    z.api<{ item: { content: string } }>("/api/ask/library", { action: "knowledge_get", id: doc.id })
      .then((r) => {
        setBody(r.item.content);
        if (!r.item.content.trim() && editable) setMode("edit");
      })
      .catch((e) => setError(msgOf(e)));
    // Once per page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const save = (next: { name: string; content: string }) => {
    setState("Not saved");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setState("Saving");
      try {
        await z.api("/api/ask/library", { action: "knowledge_save", id: doc.id, name: next.name, content: next.content });
        setState("Saved");
        setError("");
        z.reloadLib();
      } catch (e) {
        setError(msgOf(e));
        setState("Not saved");
      }
    }, 900);
  };

  return (
    <div className="zp-pane__in">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`zp-badge ${doc.scope === "workspace" ? "zp-badge--brand" : ""}`}>{doc.scope === "workspace" ? "Shared with the team" : "Only you"}</span>
        {doc.source ? <span className="text-[12px] text-muted wrap-anywhere">{doc.kind === "url" ? doc.source : `From ${doc.source}`}</span> : null}
        <span className="text-[12px] text-faint">{state}</span>
        <span className="ml-auto flex items-center gap-2">
          {editable ? (
            <span className="zp-seg">
              <button type="button" aria-pressed={mode === "read"} onClick={() => setMode("read")}>
                Preview
              </button>
              <button type="button" aria-pressed={mode === "edit"} onClick={() => setMode("edit")}>
                Edit
              </button>
            </span>
          ) : null}
          {editable ? (
            <button
              type="button"
              className="zp-icon-btn"
              aria-label="Delete page"
              title="Delete page"
              onClick={async () => {
                if (!(await askConfirm({ title: `Delete ${doc.name || "this page"}?`, text: "Zippie and the writer stop reading it.", action: "Delete", danger: true }))) return;
                try {
                  await z.api("/api/ask/library", { action: "knowledge_delete", id: doc.id });
                  onDeleted();
                } catch (e) {
                  setError(msgOf(e));
                }
              }}
            >
              <Icon d={I.trash} size={15} />
            </button>
          ) : null}
        </span>
      </div>
      <input
        value={name}
        readOnly={!editable}
        aria-label="Title"
        placeholder="Untitled"
        onChange={(e) => {
          setName(e.target.value);
          if (body !== null) save({ name: e.target.value, content: body });
        }}
        className="zp-kn-title tw-bare"
      />
      {error ? <div className="aw-error mt-2">{error}</div> : null}
      <div className="zp-filebox">
        {body === null ? (
          <p className="px-5 py-4 text-[13px] text-muted">Opening...</p>
        ) : editable && mode === "edit" ? (
          <textarea
            value={body}
            aria-label="Page"
            placeholder="Write in plain words. Use ## for headings and - for lists."
            onChange={(e) => {
              setBody(e.target.value);
              save({ name, content: e.target.value });
            }}
            className="zp-filebox__edit zp-filebox__edit--prose tw-bare"
          />
        ) : (
          <div className="zp-md">{body.trim() ? <Markdown text={body} /> : <p className="text-faint">Nothing here yet.</p>}</div>
        )}
      </div>
    </div>
  );
}
