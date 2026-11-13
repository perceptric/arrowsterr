"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { matchSkills, type Skill } from "@/lib/skills/format";
import { GROUPS } from "@/lib/skills/defs/shared";
import { I, Icon } from "./Cards";

// The box people type to Zippie in, on every page and in the panel. Typing / opens the skills menu: the team's own
// skills first, then the system groups, with the highlighted skill's description beside the list. A skill picked
// shows as a chip and goes with the message. The page chip says what's on screen; ✕ asks without it.

const SPEED = { quick: "Quick", deep: "Deep" } as const;

export function Composer({
  skills,
  busy,
  onSend,
  onStop,
  here,
  pending,
  onPending,
  placeholder = "Ask Zippie, or type / for skills",
  big = false,
  autoFocus = false,
}: {
  skills: Skill[];
  busy: boolean;
  onSend: (text: string, skillKey: string | null, withHere: boolean) => void;
  onStop: () => void;
  here?: string | null;
  pending?: Pick<Skill, "key" | "title"> | null;
  onPending?: (s: Pick<Skill, "key" | "title"> | null) => void;
  placeholder?: string;
  big?: boolean;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState("");
  const [skill, setSkill] = useState<Pick<Skill, "key" | "title"> | null>(null);
  const [withHere, setWithHere] = useState(true);
  const [menu, setMenu] = useState<{ q: string; i: number } | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const ready = useMemo(() => skills.filter((s) => s.ready), [skills]);

  // A skill picked on the Skills page lands here.
  const [seenPending, setSeenPending] = useState(pending);
  if (pending !== seenPending) {
    setSeenPending(pending);
    if (pending) setSkill(pending);
  }
  useEffect(() => {
    if (!pending) return;
    box.current?.focus();
    onPending?.(null);
  }, [pending, onPending]);
  useEffect(() => {
    const t = box.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${Math.min(t.scrollHeight, 200)}px`;
  }, [text]);
  // A new page brings its chip back.
  const [seenHere, setSeenHere] = useState(here);
  if (here !== seenHere) {
    setSeenHere(here);
    setWithHere(true);
  }

  const hits = menu ? matchSkills(ready, menu.q) : [];
  const sections = menu
    ? [{ key: "yours", label: "Your skills", items: hits.filter((s) => s.scope !== "system") }, ...GROUPS.map((g) => ({ key: g.key as string, label: g.label as string, items: hits.filter((s) => s.scope === "system" && s.group === g.key) }))].filter((x) => x.items.length)
    : [];
  const ordered = sections.flatMap((x) => x.items);
  const at = menu ? Math.min(menu.i, Math.max(0, ordered.length - 1)) : 0;
  const sel = ordered[at];

  const pick = (s: Skill) => {
    setSkill({ key: s.key, title: s.title });
    setText((t) => t.replace(/(^|\s)\/[\w-]*$/, "$1").trimStart());
    setMenu(null);
    box.current?.focus();
  };
  const go = () => {
    const msg = text.trim() || (skill ? `Run ${skill.title}` : "");
    if (!msg || busy) return;
    onSend(msg, skill?.key ?? null, Boolean(here) && withHere);
    setText("");
    setSkill(null);
    setMenu(null);
  };

  return (
    <div className="relative">
      {menu ? (
        <div className="zp-slash" role="listbox" aria-label="Skills">
          {ordered.length ? (
            <>
              <div className="zp-slash__list">
                {sections.map((sec) => (
                  <div key={sec.key}>
                    <div className="zp-slash__group">{sec.label}</div>
                    {sec.items.map((s) => (
                      <button
                        key={s.key}
                        type="button"
                        role="option"
                        aria-selected={s === sel}
                        className="zp-slash__opt"
                        onMouseDown={(e) => e.preventDefault()}
                        onMouseEnter={() => setMenu((m) => (m ? { ...m, i: ordered.indexOf(s) } : m))}
                        onClick={() => pick(s)}
                      >
                        <Icon d={I.box} size={14} />
                        <span className="min-w-0 flex-1 wrap-break-word">{s.title}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
              {sel ? (
                <div className="zp-slash__prev">
                  <b>{sel.title}</b>
                  <span className="flex flex-wrap gap-1">
                    <span className={`zp-badge ${sel.speed === "deep" ? "zp-badge--violet" : ""}`}>{SPEED[sel.speed]}</span>
                    <span className="zp-badge">{sel.scope === "system" ? (GROUPS.find((g) => g.key === sel.group)?.label ?? "System") : sel.scope === "workspace" ? "Workspace" : "Personal"}</span>
                  </span>
                  <span className="wrap-break-word">{sel.description}</span>
                </div>
              ) : null}
            </>
          ) : (
            <div className="zp-slash__prev">No matches</div>
          )}
        </div>
      ) : null}
      <div className={`zp-cbox ${big ? "zp-cbox--big" : ""}`}>
        {skill || (here && withHere) ? (
          <div className="zp-cbox__chips">
            {skill ? (
              <span className="zp-chip zp-chip--skill">
                <Icon d={I.box} size={12} />
                <span className="wrap-anywhere">{skill.title}</span>
                <button type="button" onClick={() => setSkill(null)} aria-label={`Ask without ${skill.title}`}>
                  <Icon d={I.x} size={11} />
                </button>
              </span>
            ) : null}
            {here && withHere ? (
              <span className="zp-chip" title="Zippie starts from this page">
                <Icon d={I.doc} size={12} />
                <span className="wrap-anywhere">{here}</span>
                <button type="button" onClick={() => setWithHere(false)} aria-label={`Ask without ${here}`}>
                  <Icon d={I.x} size={11} />
                </button>
              </span>
            ) : null}
          </div>
        ) : null}
        <textarea
          ref={box}
          rows={1}
          value={text}
          autoFocus={autoFocus}
          aria-label="Ask Zippie"
          placeholder={skill ? `Ask with ${skill.title}` : placeholder}
          onChange={(e) => {
            const v = e.target.value;
            setText(v);
            const m = /(?:^|\s)\/([\w-]*)$/.exec(v);
            setMenu(m ? { q: m[1], i: menu?.i ?? 0 } : null);
          }}
          onKeyDown={(e) => {
            if (menu && ordered.length) {
              if (e.key === "ArrowDown") return (e.preventDefault(), setMenu({ ...menu, i: Math.min(ordered.length - 1, at + 1) }));
              if (e.key === "ArrowUp") return (e.preventDefault(), setMenu({ ...menu, i: Math.max(0, at - 1) }));
              if (e.key === "Enter" || e.key === "Tab") return (e.preventDefault(), sel && pick(sel));
            }
            if (menu && e.key === "Escape") return (e.preventDefault(), setMenu(null));
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              go();
            }
          }}
          onBlur={() => setTimeout(() => setMenu(null), 150)}
          className="zp-cbox__input tw-bare"
        />
        <div className="zp-cbox__bar">
          <button type="button" className="zp-icon-btn" aria-label="Skills" title="Skills (/)" onMouseDown={(e) => e.preventDefault()} onClick={() => setMenu(menu ? null : { q: "", i: 0 })}>
            <Icon d={I.box} size={16} />
          </button>
          <span className="zp-cbox__hint">/ for skills</span>
          <span className="flex-1" />
          {busy ? (
            <button type="button" className="zp-send" onClick={onStop} aria-label="Stop" title="Stop">
              <Icon d={I.stop} size={14} />
            </button>
          ) : (
            <button type="button" className="zp-send" onClick={go} disabled={!text.trim() && !skill} aria-label="Send" title="Send">
              <Icon d={I.up} size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
