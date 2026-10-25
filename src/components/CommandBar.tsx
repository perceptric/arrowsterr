"use client";

// The command bar: ⌘K or Ctrl+K anywhere, even in a text box. Type to find a screen, a setting, a brand, a prompt
// or an Editorial Calendar keyword, or to run Add prompts, New report or Ask Zippie. Arrows move, Enter runs,
// Escape closes and focus goes back where it was. "?" outside text boxes lists the keyboard shortcuts.

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { rankCommands, type Command } from "@/lib/commands";
import { Search } from "./Icons";
import { Modal } from "./reports/Dialog";

export type CommandItem = Command & { run: () => void };

const MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = MAC ? "⌘" : "Ctrl+";

/** True when a key press is typing: a text box, a rich text editor or the spreadsheet grid. */
function typing(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el?.closest) return false;
  return Boolean(el.isContentEditable || el.closest("input, textarea, select, [contenteditable=''], [contenteditable='true'], [role='grid']"));
}

/** Mount once. commands is read each time the bar opens, so it always lists what is on screen now. */
export function CommandBar({ commands }: { commands: () => CommandItem[] }) {
  const [open, setOpen] = useState<"bar" | "keys" | null>(null);
  const back = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => {
          if (o === "bar") return null;
          if (!o) back.current = document.activeElement as HTMLElement | null;
          return "bar";
        });
        return;
      }
      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.defaultPrevented && !typing(e.target)) {
        e.preventDefault();
        setOpen((o) => {
          if (!o) back.current = document.activeElement as HTMLElement | null;
          return o ?? "keys";
        });
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  // Closing puts focus back where it was. Running a command leaves focus to the screen it opens.
  const close = (restore = true) => {
    setOpen(null);
    const el = back.current;
    back.current = null;
    // After the dialog is gone, so focus lands on the page and not on the closing dialog.
    if (restore) requestAnimationFrame(() => el?.isConnected && el.focus?.({ preventScroll: true }));
  };

  if (open === "keys") return <Shortcuts onClose={() => close()} />;
  if (open === "bar") return <Bar commands={commands} onClose={close} />;
  return null;
}

function Bar({ commands, onClose }: { commands: () => CommandItem[]; onClose: (restore?: boolean) => void }) {
  const [all] = useState(commands);
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const list = useMemo(() => rankCommands(all, q), [all, q]);
  const hot = Math.min(i, Math.max(0, list.length - 1));
  const listRef = useRef<HTMLUListElement | null>(null);

  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${hot}"]`)?.scrollIntoView({ block: "nearest" });
  }, [hot, list]);

  const run = (c: CommandItem | undefined) => {
    if (!c) return;
    onClose(false);
    c.run();
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!list.length) return;
      setI((hot + (e.key === "ArrowDown" ? 1 : list.length - 1)) % list.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(list[hot]);
    } else if (e.key === "Escape") {
      // Handled here, so a panel under the bar (Zippie) stays open.
      e.preventDefault();
      onClose();
    } else if (e.key === "Tab") {
      // Focus stays in the search box while the bar is open.
      e.preventDefault();
    }
  };

  return (
    <div className="tw-overlay print:hidden" onMouseDown={() => onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Command bar" onMouseDown={(e) => e.stopPropagation()} onKeyDown={onKey} className="tw-modal tw-modal--md">
        <label className="flex items-center gap-2">
          <Search size={16} className="shrink-0 text-muted" />
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setI(0);
            }}
            placeholder="Go to a screen, brand, prompt or keyword"
            aria-label="Search screens, brands, prompts and actions"
            role="combobox"
            aria-expanded="true"
            aria-controls="aw-command-list"
            aria-activedescendant={list[hot] ? `aw-command-${hot}` : undefined}
            className="aw-input w-full"
          />
        </label>
        <ul ref={listRef} id="aw-command-list" role="listbox" aria-label="Results" className="aw-pop__list max-h-96!">
          {list.map((c, k) => (
            <li key={`${c.group}:${c.id}`} id={`aw-command-${k}`} role="option" aria-selected={k === hot} data-i={k}>
              <button type="button" tabIndex={-1} className={`aw-pop__opt ${k === hot ? "is-hot" : ""}`} onMouseMove={() => k !== hot && setI(k)} onClick={() => run(c)}>
                <span className="min-w-0 truncate">{c.label}</span>
                <span className="shrink-0 truncate text-[12px] text-muted">{c.hint ?? c.group}</span>
              </button>
            </li>
          ))}
          {!list.length ? <li className="px-2 py-2 text-[13px] text-muted">No matches</li> : null}
        </ul>
      </div>
    </div>
  );
}

/** The "?" list of the app's keyboard shortcuts. */
function Shortcuts({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    [`${MOD}K`, "Open the command bar"],
    ["?", "Show keyboard shortcuts"],
    [`${MOD}B`, "Hide or show the sidebar"],
    [`${MOD}Z`, "Undo"],
    [`${MOD}Shift+Z`, "Redo"],
    ["Escape", "Close a dialog or panel"],
  ];
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose} width="max-w-md">
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[13px]">
        {rows.map(([k, what]) => (
          <Fragment key={k}>
            <dt>
              <kbd className="aw-num whitespace-nowrap text-ink">{k}</kbd>
            </dt>
            <dd className="text-body">{what}</dd>
          </Fragment>
        ))}
      </dl>
    </Modal>
  );
}
