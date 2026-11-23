"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "../reports/Dialog";

// The command menu on the Drafts screens: ⌘K (Ctrl K) opens a search over the screen's sections and actions, and ?
// opens the keyboard shortcuts. Each screen hands in its own commands, worked out when the menu opens.

export type Command = { group: string; label: string; hint?: string; run: () => void };
export type ShortcutGroup = { title: string; keys: [label: string, keys: string[]][] };

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const modKey = () => (isMac() ? "⌘" : "Ctrl");
const typingIn = (t: EventTarget | null) => t instanceof HTMLElement && Boolean(t.closest("input, textarea, select, [contenteditable='true']"));

export function CommandMenu({ commands, shortcuts }: { commands: () => Command[]; shortcuts: ShortcutGroup[] }) {
  const [open, setOpen] = useState(false);
  const [keys, setKeys] = useState(false);
  const [q, setQ] = useState("");
  const [at, setAt] = useState(0);
  const [list, setList] = useState<Command[]>([]);
  const back = useRef<HTMLElement | null>(null);
  const input = useRef<HTMLInputElement | null>(null);

  const all = (): Command[] => [...commands(), { group: "Help", label: "Keyboard shortcuts", hint: "?", run: () => setKeys(true) }];

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => {
          if (!o) back.current = document.activeElement as HTMLElement | null;
          return !o;
        });
        return;
      }
      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !typingIn(e.target) && !document.querySelector("[role='dialog']")) {
        e.preventDefault();
        setKeys(true);
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  });

  useEffect(() => {
    if (!open) return;
    // The list is worked out when the menu opens, so it shows the screen as it is now.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setList(all());
    setQ("");
    setAt(0);
    requestAnimationFrame(() => input.current?.focus());
    // Only when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = words.length
    ? list
        .filter((c) => words.every((w) => `${c.label} ${c.group}`.toLowerCase().includes(w)))
        .sort((a, b) => Number(!a.label.toLowerCase().startsWith(words[0])) - Number(!b.label.toLowerCase().startsWith(words[0])))
    : list;
  const hot = Math.min(at, Math.max(0, shown.length - 1));

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) back.current?.focus?.({ preventScroll: true });
  };
  const run = (c: Command | undefined) => {
    if (!c) return;
    close(false);
    c.run();
  };

  return (
    <>
      {open ? (
        <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/30 px-4 pt-[12vh]" onMouseDown={(e) => e.target === e.currentTarget && close()}>
          <div role="dialog" aria-modal="true" aria-label="Search and commands" className="flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-aw-lg border border-rule bg-white shadow-aw-lg">
            <input
              ref={input}
              value={q}
              role="combobox"
              aria-expanded="true"
              aria-controls="aw-cmd-list"
              aria-activedescendant={shown.length ? `aw-cmd-${hot}` : undefined}
              placeholder="Search sections and actions…"
              aria-label="Search sections and actions"
              onChange={(e) => {
                setQ(e.target.value);
                setAt(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  if (shown.length) setAt((hot + (e.key === "ArrowDown" ? 1 : -1) + shown.length) % shown.length);
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  run(shown[hot]);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  close();
                } else if (e.key === "Tab") e.preventDefault();
              }}
              className="h-12 w-full border-b border-rule px-4 text-[15px] text-ink outline-none"
            />
            <div id="aw-cmd-list" role="listbox" aria-label="Results" className="min-h-0 flex-1 overflow-y-auto p-1.5">
              {shown.length ? (
                shown.map((c, i) => (
                  <div key={`${c.group}:${c.label}:${i}`}>
                    {i === 0 || shown[i - 1].group !== c.group ? <div className="aw-micro px-2.5 pt-2.5 pb-1">{c.group}</div> : null}
                    <button
                      type="button"
                      id={`aw-cmd-${i}`}
                      role="option"
                      aria-selected={i === hot}
                      ref={i === hot ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setAt(i)}
                      onClick={() => run(c)}
                      className={`flex w-full items-center gap-3 px-2.5 py-2 text-left text-[13px] ${i === hot ? "bg-brand-bg text-ink" : "text-body"}`}
                    >
                      <span className="min-w-0 flex-1 truncate">{c.label}</span>
                      {c.hint ? <span className="font-mono text-[11px] text-muted">{c.hint}</span> : null}
                    </button>
                  </div>
                ))
              ) : (
                <p className="px-3 py-6 text-center text-[13px] text-muted">Nothing matches &ldquo;{q}&rdquo;.</p>
              )}
            </div>
            <div className="flex flex-wrap gap-4 border-t border-rule-faint px-3 py-2 text-[11px] text-muted">
              <span>↑ ↓ to move</span>
              <span>Enter to run</span>
              <span>Esc to close</span>
            </div>
          </div>
        </div>
      ) : null}
      {keys ? (
        <Modal title="Keyboard shortcuts" onClose={() => setKeys(false)} width="max-w-md">
          <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto">
            {[{ title: "Anywhere here", keys: [["Search sections and actions", [modKey(), "K"]], ["Show this list", ["?"]]] } as ShortcutGroup, ...shortcuts].map((g) => (
              <div key={g.title} className="flex flex-col gap-1.5">
                <span className="aw-micro">{g.title}</span>
                {g.keys.map(([label, k]) => (
                  <div key={label} className="flex items-center justify-between gap-4 text-[13px]">
                    <span className="text-body">{label}</span>
                    <span className="flex shrink-0 gap-1">
                      {k.map((x) => (
                        <kbd key={x} className="rounded-aw-xs border border-rule px-1.5 font-mono text-[11px] text-ink">
                          {x}
                        </kbd>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Modal>
      ) : null}
    </>
  );
}
