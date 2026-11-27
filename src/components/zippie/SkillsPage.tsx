"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { askConfirm } from "@/components/Dialogs";
import { blankSkill, copyFiles, MAIN, matchSkills, parseSkill, type Skill } from "@/lib/skills/format";
import { GROUPS } from "@/lib/skills/defs/shared";
import { Drawing, EmptyNote, type DrawingKind } from "../Drawing";
import { Markdown } from "../Markdown";
import { toast } from "../ui";
import { I, Icon, msgOf } from "./Cards";
import { useZippie } from "./ZippieContext";

// Skills: every skill as a card with its picture (the isometric art from the empty screens), with search and the
// groups as tabs. Clicking a card opens the skill and its files; Use puts it in the chat box. Your own skills edit in
// place and save a moment after you stop typing.

const SPEED = { quick: "Quick", deep: "Deep" } as const;
const SCOPE = { system: "System", workspace: "Workspace", personal: "Personal" } as const;
const short = (d: string) => d.split(/\s+Use it /)[0] ?? d;
const groupLabel = (g: string) => GROUPS.find((x) => x.key === g)?.label ?? "";
const FEATURED = ["system:site-health-check", "system:write-article", "system:ai-visibility-review"];

/** The picture on each skill's card. Skills not listed take their group's picture. */
const ART: Record<string, DrawingKind> = {
  "site-health-check": "gears", "page-audit": "search", "indexing-check": "lock", "page-speed": "clock", "broken-links": "link", "structured-data": "files",
  "image-check": "palette", canonicals: "flag", hreflang: "globe", "site-move": "refresh", "ai-crawlers": "zippie", "llms-txt": "drafts",
  "cluster-link-plan": "sources", "add-internal-links": "link", "orphan-pages": "flag", "link-new-post": "plug", "anchor-review": "prompts", cannibalization: "gap",
  "write-outline": "files", "write-article": "drafts", "meta-writer": "prompts", "faq-builder": "queue", "content-refresh": "refresh", "answer-first": "zippie",
  "content-brief": "reports", "ai-visibility-review": "globe", "competitor-teardown": "gap", "prompt-finder": "prompts", "source-outreach": "sources",
  "community-replies": "visitors", "content-gaps": "opportunities", "cluster-review": "chart", "rank-drop": "traffic", "monthly-report": "reports",
  "writer-persona": "palette", humanize: "drafts", "anti-ai-review": "lock", "pattern-check": "queue", "fix-structure": "files", "claim-check": "flag",
  "fact-safety": "lock", "house-lint": "gears", "plain-language": "prompts", "brand-review": "palette", copyedit: "drafts", proofread: "search",
  "cut-to-length": "clock", "style-sheet": "files", "business-writing": "reports", "press-release": "globe", "create-a-skill": "gears", "add-to-knowledge": "files",
};
const GROUP_ART: Record<string, DrawingKind> = { tech: "gears", links: "link", page: "drafts", ai: "globe", research: "reports", writing: "drafts", helpers: "gears" };
const artOf = (s: Skill): DrawingKind => (s.scope === "system" ? (ART[s.slug] ?? GROUP_ART[s.group]) : undefined) ?? "zippie";

/** The card's line: a system skill's opening line, or the start of the description. */
function blurb(s: Skill) {
  const line = parseSkill(s.files[MAIN] ?? "")
    .body.split("\n")
    .map((l) => l.trim())
    .find((l) => l && !/^[#|>*-]/.test(l));
  return (s.scope === "system" && line) || short(s.description) || "No description yet";
}

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
  const [error, setError] = useState("");
  const current = list.find((s) => s.key === openKey) ?? null;
  const editable = (s: Skill) => z.canEdit && s.scope !== "system" && (s.scope === "workspace" || s.ownerId === z.lib.me);

  const open = (key: string) => {
    setOpenKey(key);
    setFile(MAIN);
    writeOpen(key);
  };
  const use = (s: Pick<Skill, "key" | "title">) => {
    z.setPending({ key: s.key, title: s.title });
    toast(`Added ${s.title} to the chat`);
  };

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

  return (
    <div className="zp-split">
      <section className="zp-pane">
        {error ? <div className="aw-error mx-6 mt-4">{error}</div> : null}
        {current ? (
          <Detail
            key={current.key}
            skill={current}
            file={file in current.files ? file : MAIN}
            onFile={setFile}
            editable={editable(current)}
            onUse={() => use(current)}
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
          <Explore list={list} onOpen={open} onUse={use} onNew={z.canEdit ? (scope) => void insert(scope, blankSkill()) : undefined} />
        )}
      </section>
    </div>
  );
}

/** One skill as a card: its picture, name, opening line and what it hands back. The name opens it; Use puts it in the chat. */
function SkillCard({ s, big, onOpen, onUse }: { s: Skill; big?: boolean; onOpen: (key: string) => void; onUse: (s: Skill) => void }) {
  return (
    <div className={`zp-skill ${big ? "zp-skill--big" : ""}`}>
      <div className="zp-skill__art">
        <span className="zp-skill__tags">
          <span className={`zp-skill__tag ${s.speed === "deep" ? "is-deep" : ""}`}>{SPEED[s.speed]}</span>
          {s.scope !== "system" ? <span className="zp-skill__tag">{SCOPE[s.scope]}</span> : null}
          {!s.ready ? <span className="zp-skill__tag">Soon</span> : null}
        </span>
        <Drawing kind={artOf(s)} size={big ? 260 : 210} crop />
      </div>
      <h3 className="zp-skill__title">
        <button type="button" onClick={() => onOpen(s.key)}>
          {s.title}
        </button>
      </h3>
      <p className="zp-skill__text">{blurb(s)}</p>
      <span className="zp-skill__meta">
        <Icon d={I.file} size={13} />
        {s.result || "Answer"}
      </span>
      {s.ready ? (
        <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm zp-skill__use" onClick={() => onUse(s)} aria-label={`Use ${s.title} in the chat`}>
          Use
        </button>
      ) : null}
    </div>
  );
}

/** Every skill as a card, with search and the groups as tabs. */
function Explore({ list, onOpen, onUse, onNew }: { list: Skill[]; onOpen: (key: string) => void; onUse: (s: Skill) => void; onNew?: (scope: "workspace" | "personal") => void }) {
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("all");
  const mine = group === "workspace" || group === "personal";
  const hit = (x: Skill) => group === "all" || (mine ? x.scope === group : x.scope === "system" && x.group === group);
  const found = matchSkills(list.filter(hit), q);
  const sections = [
    { key: "workspace", label: "Workspace", items: found.filter((x) => x.scope === "workspace") },
    { key: "personal", label: "Personal", items: found.filter((x) => x.scope === "personal") },
    ...GROUPS.map((g) => ({ key: g.key as string, label: g.label as string, items: found.filter((x) => x.scope === "system" && x.group === g.key) })),
  ].filter((x) => x.items.length);
  const count = (v: string) => list.filter((x) => (v === "workspace" || v === "personal" ? x.scope === v : x.scope === "system" && x.group === v)).length;
  const tabs = [{ v: "all", l: "All", n: list.length }, ...GROUPS.map((g) => ({ v: g.key as string, l: g.label as string, n: count(g.key) })), { v: "workspace", l: "Workspace", n: count("workspace") }, { v: "personal", l: "Personal", n: count("personal") }];
  const featured = group === "all" && !q.trim() ? FEATURED.map((k) => list.find((x) => x.key === k)).filter((x): x is Skill => !!x) : [];
  return (
    <div className="zp-pane__wide">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="zp-h2">Skills</h2>
          <p className="mt-1 text-[14px] text-muted">Pick a skill and Zippie runs it on your site. You can also type / in the chat.</p>
        </div>
        {onNew ? (
          <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" onClick={() => onNew(group === "workspace" ? "workspace" : "personal")}>
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
          <button key={t.v} type="button" role="tab" className={`zp-tab ${t.v === "workspace" ? "zp-tab--split" : ""}`} aria-selected={group === t.v} onClick={() => setGroup(t.v)}>
            {t.l}
            <span className="text-faint">{t.n}</span>
          </button>
        ))}
      </div>
      {featured.length ? (
        <div className="zp-skills zp-skills--big">
          {featured.map((x) => (
            <SkillCard key={x.key} s={x} big onOpen={onOpen} onUse={onUse} />
          ))}
        </div>
      ) : null}
      {sections.length ? (
        sections.map((sec) => (
          <div key={sec.key} className="mt-7">
            {mine ? null : (
              <h3 className="zp-skills__head">
                {sec.label}
                <span>{sec.items.length}</span>
              </h3>
            )}
            <div className="zp-skills">
              {sec.items.map((x) => (
                <SkillCard key={x.key} s={x} onOpen={onOpen} onUse={onUse} />
              ))}
            </div>
          </div>
        ))
      ) : mine && !q.trim() ? (
        <EmptyNote drawing="gears" action={onNew ? <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => onNew(group as "workspace" | "personal")}><Icon d={I.plus} size={13} /> New skill</button> : undefined}>
          {group === "workspace" ? "Skills you make for the whole team show up here." : "Skills only you can see show up here."}
        </EmptyNote>
      ) : (
        <p className="py-10 text-center text-[13px] text-muted">No skills match {`"${q.trim()}"`}.</p>
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
        <span className="zp-badge">{SPEED[parsed.head.speed]}</span>
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
          <Drawing kind={artOf(skill)} size={64} crop />
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
