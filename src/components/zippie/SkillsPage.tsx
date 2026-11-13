"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { askConfirm } from "@/components/Dialogs";
import { blankSkill, copyFiles, MAIN, matchSkills, parseSkill, type Skill } from "@/lib/skills/format";
import { GROUPS } from "@/lib/skills/defs/shared";
import { Markdown } from "../Markdown";
import { I, Icon, msgOf } from "./Cards";
import { useZippie } from "./ZippieContext";

// Skills, laid out like Omniscient's: a tree on the left with the team's Workspace skills, your Personal ones and the
// System skills in folders; the open skill on the right with its files. A skill's name opens its SKILL.md; only extra
// files show under it. Your own skills edit in place and save a moment after you stop typing. Explore, the first
// screen, shows every skill as a card.

const SPEED = { quick: { label: "Quick", cls: "" }, deep: { label: "Deep", cls: "zp-badge--violet" } } as const;
const SCOPE = { system: "System", workspace: "Workspace", personal: "Personal" } as const;
const short = (d: string) => d.split(/\s+Use it /)[0] ?? d;
const groupLabel = (g: string) => GROUPS.find((x) => x.key === g)?.label ?? "";
export const TREE_W = 288;

/** The open skill lives in the address (?skill=...), so a link opens it. */
const readOpen = () => (typeof window === "undefined" ? "" : (new URLSearchParams(window.location.search).get("skill") ?? ""));
function writeOpen(key: string) {
  const p = new URLSearchParams(window.location.search);
  if (key) p.set("skill", key);
  else p.delete("skill");
  window.history.replaceState(null, "", window.location.pathname + (p.size ? `?${p}` : ""));
}

export function SkillsPage() {
  const z = useZippie();
  const list = z.lib.skills;
  const [openKey, setOpenKey] = useState(readOpen);
  const [file, setFile] = useState(MAIN);
  const [fold, setFold] = useState<Record<string, boolean>>({});
  const [folders, setFolders] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const current = list.find((s) => s.key === openKey) ?? null;
  const editable = (s: Skill) => z.canEdit && s.scope !== "system" && (s.scope === "workspace" || s.ownerId === z.lib.me);

  const open = (key: string) => {
    setOpenKey(key);
    setFile(MAIN);
    writeOpen(key);
    const s = list.find((x) => x.key === key);
    if (s?.scope === "system") setFolders((f) => new Set(f).add(s.group));
  };
  // A skill opened from a link shows its folder.
  const [seenKey, setSeenKey] = useState("");
  if (current && current.key !== seenKey) {
    setSeenKey(current.key);
    if (current.scope === "system" && !folders.has(current.group)) setFolders(new Set(folders).add(current.group));
  }

  async function insert(scope: "workspace" | "personal", files: Record<string, string>) {
    setError("");
    try {
      const r = await z.api<{ id: string }>("/api/ask/library", { action: "skill_save", scope, files });
      z.reloadLib();
      open(r.id);
    } catch (e) {
      setError(msgOf(e));
    }
  }

  const scoped = (sc: "workspace" | "personal") => list.filter((s) => s.scope === sc);
  const row = (s: Skill, depth: number) => {
    const on = s.key === openKey;
    return (
      <div key={s.key} className="contents">
        <button type="button" className={`zp-tree__row ${depth ? "is-deep" : ""} ${on ? "is-on" : ""}`} aria-current={on ? "page" : undefined} onClick={() => open(s.key)}>
          <Icon d={I.box} size={15} />
          <span className="min-w-0 flex-1 wrap-break-word">{s.title}</span>
          {!s.ready ? <span className="text-[11px] text-faint">Soon</span> : null}
        </button>
        {on
          ? Object.keys(s.files)
              .filter((f) => f !== MAIN)
              .map((f) => (
                <button key={f} type="button" className={`zp-tree__file ${depth ? "is-deep" : ""} ${f === file ? "is-on" : ""}`} onClick={() => setFile(f)}>
                  <Icon d={I.file} size={13} />
                  <span className="min-w-0 wrap-anywhere">{f}</span>
                </button>
              ))
          : null}
      </div>
    );
  };
  const head = (key: string, label: string, n: number, add?: () => void) => (
    <div className="zp-tree__head">
      <button type="button" className="zp-tree__tog" aria-expanded={!fold[key]} onClick={() => setFold((f) => ({ ...f, [key]: !f[key] }))}>
        <span className={`zp-caret ${fold[key] ? "" : "is-open"}`}>
          <Icon d={I.chev} size={12} />
        </span>
        <span className="flex-1">{label}</span>
        {n ? <span className="text-faint tabular-nums">{n}</span> : null}
      </button>
      {add ? (
        <button type="button" className="zp-icon-btn zp-icon-btn--sm" onClick={add} aria-label={`New ${label.toLowerCase()} skill`} title={`New ${label.toLowerCase()} skill`}>
          <Icon d={I.plus} size={14} />
        </button>
      ) : null}
    </div>
  );

  return (
    <div className="zp-split">
      <aside className="zp-tree" style={{ width: TREE_W }} aria-label="Skills">
        {head("workspace", "Workspace", scoped("workspace").length, z.canEdit ? () => void insert("workspace", blankSkill()) : undefined)}
        {!fold.workspace ? scoped("workspace").length ? scoped("workspace").map((s) => row(s, 0)) : <p className="zp-tree__none">No skills</p> : null}
        {head("personal", "Personal", scoped("personal").length, z.canEdit ? () => void insert("personal", blankSkill()) : undefined)}
        {!fold.personal ? scoped("personal").length ? scoped("personal").map((s) => row(s, 0)) : <p className="zp-tree__none">No skills</p> : null}
        {head("system", "System", list.filter((s) => s.scope === "system").length)}
        {!fold.system
          ? GROUPS.map((g) => {
              const inG = list.filter((s) => s.scope === "system" && s.group === g.key);
              const on = folders.has(g.key);
              return (
                <div key={g.key} className="flex flex-col">
                  <button type="button" className="zp-tree__folder" aria-expanded={on} onClick={() => setFolders((f) => (f.has(g.key) ? new Set([...f].filter((x) => x !== g.key)) : new Set(f).add(g.key)))}>
                    <Icon d={I.folder} size={15} />
                    <span className="flex-1">{g.label}</span>
                    <span className="text-[12px] text-faint tabular-nums">{inG.length}</span>
                  </button>
                  {on ? inG.map((s) => row(s, 1)) : null}
                </div>
              );
            })
          : null}
      </aside>
      <section className="zp-pane">
        {error ? <div className="aw-error mx-6 mt-4">{error}</div> : null}
        {current ? (
          <Detail
            key={current.key}
            skill={current}
            file={file in current.files ? file : MAIN}
            onFile={setFile}
            editable={editable(current)}
            onUse={() => z.setPending({ key: current.key, title: current.title })}
            onCopy={() => void insert("personal", copyFiles(current, `${current.title} (copy)`))}
            onDeleted={() => {
              z.reloadLib();
              setOpenKey("");
              writeOpen("");
            }}
            onExplore={() => {
              setOpenKey("");
              writeOpen("");
            }}
          />
        ) : (
          <Explore list={list} onOpen={open} onNew={z.canEdit ? () => void insert("personal", blankSkill()) : undefined} />
        )}
      </section>
    </div>
  );
}

/** Every skill as a card, with search and the groups as tabs. */
function Explore({ list, onOpen, onNew }: { list: Skill[]; onOpen: (key: string) => void; onNew?: () => void }) {
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("all");
  const hit = (x: Skill) => group === "all" || (group === "yours" ? x.scope !== "system" : x.group === group);
  const found = matchSkills(list.filter(hit), q);
  const own = list.filter((x) => x.scope !== "system");
  const sections = [{ key: "yours", label: "Your skills", items: found.filter((x) => x.scope !== "system") }, ...GROUPS.map((g) => ({ key: g.key as string, label: g.label as string, items: found.filter((x) => x.scope === "system" && x.group === g.key) }))].filter((x) => x.items.length);
  const tabs = [{ v: "all", l: "All", n: list.length }, ...(own.length ? [{ v: "yours", l: "Your skills", n: own.length }] : []), ...GROUPS.map((g) => ({ v: g.key as string, l: g.label as string, n: list.filter((x) => x.scope === "system" && x.group === g.key).length }))];
  return (
    <div className="zp-pane__wide">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="zp-h2">Explore skills</h2>
          <p className="mt-1 text-[13px] text-muted">Type / in the chat to use one.</p>
        </div>
        {onNew ? (
          <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" onClick={onNew}>
            <Icon d={I.plus} size={13} /> New skill
          </button>
        ) : null}
      </div>
      <label className="mt-5 block">
        <span className="sr-only">Find a skill</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a skill" className="aw-input w-full" />
      </label>
      <div className="zp-tabs" role="tablist" aria-label="Skill groups">
        {tabs.map((t) => (
          <button key={t.v} type="button" role="tab" className="zp-tab" aria-selected={group === t.v} onClick={() => setGroup(t.v)}>
            {t.l}
            <span className="text-faint">{t.n}</span>
          </button>
        ))}
      </div>
      {sections.length ? (
        sections.map((sec) => (
          <div key={sec.key} className="mt-4">
            <p className="zp-lbl pb-2">{sec.label}</p>
            <div className="zp-grid">
              {sec.items.map((x) => (
                <button key={x.key} type="button" className="zp-skillcard" onClick={() => onOpen(x.key)}>
                  <span className="flex items-start gap-2">
                    <span className="min-w-0 flex-1 text-[13px] font-medium text-ink wrap-break-word">{x.title}</span>
                    {x.scope !== "system" ? <span className="zp-badge zp-badge--brand">{SCOPE[x.scope]}</span> : null}
                    <span className={`zp-badge ${SPEED[x.speed].cls}`}>{SPEED[x.speed].label}</span>
                  </span>
                  <span className="text-[12px] leading-relaxed text-muted wrap-break-word">{short(x.description) || "No description yet"}</span>
                </button>
              ))}
            </div>
          </div>
        ))
      ) : (
        <p className="py-10 text-center text-[13px] text-muted">No matches</p>
      )}
    </div>
  );
}

/** One skill: what it is, its files, and for your own skills the editor. */
function Detail({ skill, file, onFile, editable, onUse, onCopy, onDeleted, onExplore }: { skill: Skill; file: string; onFile: (f: string) => void; editable: boolean; onUse: () => void; onCopy: () => void; onDeleted: () => void; onExplore: () => void }) {
  const z = useZippie();
  const [files, setFiles] = useState(skill.files);
  const [mode, setMode] = useState<"read" | "edit">("read");
  const [state, setState] = useState<"" | "unsaved" | "saving" | "saved">("");
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const parsed = useMemo(() => parseSkill(files[MAIN] ?? ""), [files]);
  const text = files[file] ?? "";

  const save = (next: Record<string, string>) => {
    setState("unsaved");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setState("saving");
      try {
        await z.api("/api/ask/library", { action: "skill_save", id: skill.key, files: next });
        setState("saved");
        setError("");
        z.reloadLib();
      } catch (e) {
        setError(msgOf(e));
        setState("unsaved");
      }
    }, 900);
  };
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  return (
    <div className="zp-pane__in">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="aw-text-link text-[12px]" onClick={onExplore}>
          ← Skills
        </button>
        <span className={`zp-badge ${skill.scope === "workspace" ? "zp-badge--brand" : ""}`}>{SCOPE[skill.scope]}</span>
        <span className={`zp-badge ${SPEED[parsed.head.speed].cls}`}>{SPEED[parsed.head.speed].label}</span>
        {!skill.ready ? <span className="zp-badge zp-badge--warn">Soon</span> : null}
        {editable ? <span className="text-[12px] text-faint">{state === "saving" ? "Saving" : state === "unsaved" ? "Not saved" : state === "saved" ? "Saved" : ""}</span> : null}
        <span className="ml-auto flex flex-wrap items-center gap-2">
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
          {skill.ready ? (
            <button type="button" className="aw-btn aw-btn--ghost aw-btn--sm" onClick={onUse}>
              <Icon d={I.bolt} size={13} /> Use in chat
            </button>
          ) : null}
          {skill.scope === "system" ? (
            z.canEdit ? (
              <button type="button" className="aw-btn aw-btn--ghost aw-btn--sm" onClick={onCopy}>
                <Icon d={I.copy} size={13} /> Copy to edit
              </button>
            ) : null
          ) : editable ? (
            <button
              type="button"
              className="zp-icon-btn"
              aria-label="Delete skill"
              title="Delete skill"
              onClick={async () => {
                if (!(await askConfirm({ title: `Delete ${skill.title}?`, text: "Chats that used it stay.", action: "Delete", danger: true }))) return;
                try {
                  await z.api("/api/ask/library", { action: "skill_delete", id: skill.key });
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
      <h2 className="zp-stitle">
        <span className="zp-stitle__box">
          <Icon d={I.box} size={18} />
        </span>
        <span className="min-w-0 wrap-break-word">{parsed.title || skill.title}</span>
      </h2>
      <p className="mt-4 text-[14px] leading-relaxed text-body wrap-break-word">{parsed.head.description || <span className="text-faint">No description yet</span>}</p>
      <dl className="zp-facts">
        <dt>Result</dt>
        <dd>{parsed.head.result || "Answer"}</dd>
        {skill.group ? (
          <>
            <dt>Group</dt>
            <dd>{groupLabel(skill.group)}</dd>
          </>
        ) : null}
        <dt>Tools</dt>
        <dd className="flex flex-wrap gap-1.5">{parsed.head.tools.length ? parsed.head.tools.map((t) => <code key={t} className="zp-tool">{t}</code>) : <span className="text-faint">None</span>}</dd>
        {Object.keys(files).length > 1 ? (
          <>
            <dt>Files</dt>
            <dd className="flex flex-wrap gap-1.5">
              {Object.keys(files).map((f) => (
                <button key={f} type="button" className={`zp-filechip ${f === file ? "is-on" : ""}`} onClick={() => onFile(f)}>
                  <Icon d={f === MAIN ? I.box : I.file} size={13} />
                  <span className="wrap-anywhere">{f === MAIN ? parsed.title || skill.title : f}</span>
                </button>
              ))}
            </dd>
          </>
        ) : null}
      </dl>
      {error ? <div className="aw-error mt-3">{error}</div> : null}
      <div className="zp-filebox">
        <div className="zp-filebox__head">
          <Icon d={file === MAIN ? I.box : I.file} size={13} />
          {file === MAIN ? parsed.title || skill.title : file}
        </div>
        {editable && mode === "edit" ? (
          <textarea
            value={text}
            aria-label={file}
            spellCheck={false}
            onChange={(e) => {
              const next = { ...files, [file]: e.target.value };
              setFiles(next);
              save(next);
            }}
            className="zp-filebox__edit tw-bare"
          />
        ) : file === MAIN || file.endsWith(".md") ? (
          <div className="zp-md">
            <Markdown text={file === MAIN ? parseSkill(text).body : text} />
          </div>
        ) : (
          <pre className="zp-filebox__pre">{text}</pre>
        )}
      </div>
    </div>
  );
}
