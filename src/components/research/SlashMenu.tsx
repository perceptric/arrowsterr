"use client";

import { Plugin } from "@tiptap/pm/state";
import { Extension, type Editor } from "@tiptap/react";
import { useEffect, useState } from "react";

// The slash menu for the article editors: type / at the start of a line for headings, lists, images and the agent.

/** The slash menu reads keys before the editor does, while it is open. */
export const slashKeysExtension = (box: { current: ((e: KeyboardEvent) => boolean) | null }) =>
  Extension.create({
    name: "awSlashKeys",
    addProseMirrorPlugins: () => [new Plugin({ props: { handleKeyDown: (_v, e) => box.current?.(e) ?? false } })],
  });

/** One choice in the slash menu. */
export type Slash = { id: string; label: string; hint: string; keys: string; icon: string; ai?: boolean };
export const SLASH: Slash[] = [
  { id: "h1", label: "Heading 1", hint: "The page title", keys: "h1 heading title", icon: "H1" },
  { id: "h2", label: "Heading 2", hint: "A main section", keys: "h2 heading section", icon: "H2" },
  { id: "h3", label: "Heading 3", hint: "A sub-section", keys: "h3 heading sub", icon: "H3" },
  { id: "p", label: "Text", hint: "A plain paragraph", keys: "p text paragraph", icon: "¶" },
  { id: "bullet", label: "Bullet list", hint: "A simple list", keys: "bullet list ul", icon: "•" },
  { id: "numbered", label: "Numbered list", hint: "Steps in order", keys: "numbered list ol steps", icon: "1." },
  { id: "quote", label: "Quote", hint: "A pull quote", keys: "quote blockquote", icon: "❝" },
  { id: "table", label: "Table", hint: "3 by 3, with a header row", keys: "table grid", icon: "⊞" },
  { id: "divider", label: "Divider", hint: "A line across the page", keys: "divider hr line", icon: "—" },
  { id: "image", label: "Image", hint: "Upload a picture", keys: "image picture photo upload img", icon: "▣" },
  { id: "write", label: "Write this line", hint: "The agent writes what belongs here", keys: "write agent ai line paragraph", icon: "✦", ai: true },
  { id: "section", label: "Write this section", hint: "The agent writes the section under the heading above", keys: "section agent ai write", icon: "✦", ai: true },
];

/** Type / at the start of a line for headings, lists, images and the agent. items leaves out choices, like the agent's in the plain editor. */
export function SlashMenu({
  editor,
  canvas,
  keysRef,
  onPick,
  items = SLASH,
}: {
  editor: Editor;
  canvas: React.RefObject<HTMLDivElement | null>;
  keysRef: React.RefObject<((e: KeyboardEvent) => boolean) | null>;
  onPick: (id: string, range: { from: number; to: number }) => void;
  items?: Slash[];
}) {
  const [menu, setMenu] = useState<{ q: string; from: number; to: number; x: number; y: number } | null>(null);
  const [i, setI] = useState(0);
  const [closedAt, setClosedAt] = useState<number | null>(null);
  // Each word of a choice can start the match, so /h finds headings and /im finds Image.
  const q = menu?.q.trim().toLowerCase() ?? "";
  const list = menu ? items.filter((s) => !q || `${s.keys} ${s.label.toLowerCase()}`.split(/\s+/).some((w) => w.startsWith(q))) : [];

  useEffect(() => {
    const check = () => {
      const s = editor.state.selection;
      const $f = s.$from;
      if (!s.empty || $f.parent.type.name !== "paragraph") return setMenu(null);
      const before = $f.parent.textBetween(0, $f.parentOffset, undefined, "￼");
      const m = before.match(/^\/([a-z0-9 ]{0,20})$/i);
      if (!m || closedAt === $f.start()) return setMenu(null);
      const box = canvas.current?.getBoundingClientRect();
      const c = editor.view.coordsAtPos($f.start());
      if (!box) return;
      setMenu((old) => {
        if (old?.q !== m[1]) setI(0);
        return { q: m[1], from: $f.start(), to: $f.pos, x: c.left - box.left, y: c.bottom - box.top + 6 };
      });
    };
    editor.on("update", check);
    editor.on("selectionUpdate", check);
    return () => {
      editor.off("update", check);
      editor.off("selectionUpdate", check);
    };
  }, [editor, canvas, closedAt]);

  useEffect(() => {
    keysRef.current = (e: KeyboardEvent) => {
      if (!menu) return false;
      if (e.key === "ArrowDown") {
        setI((x) => Math.min(list.length - 1, x + 1));
        return true;
      }
      if (e.key === "ArrowUp") {
        setI((x) => Math.max(0, x - 1));
        return true;
      }
      if ((e.key === "Enter" || e.key === "Tab") && list[i]) {
        onPick(list[i].id, { from: menu.from, to: menu.to });
        setMenu(null);
        return true;
      }
      if (e.key === "Escape") {
        setClosedAt(menu.from);
        setMenu(null);
        return true;
      }
      return false;
    };
    return () => {
      keysRef.current = null;
    };
  });

  if (!menu || !list.length) return null;
  return (
    <div className="aw-slash" style={{ left: menu.x, top: menu.y }} role="listbox" aria-label="Insert" onMouseDown={(e) => e.preventDefault()}>
      {list.map((s, k) => (
        <button
          key={s.id}
          type="button"
          role="option"
          aria-selected={k === i}
          className={`aw-slash__item ${k === i ? "is-hot" : ""}`}
          onMouseEnter={() => setI(k)}
          onClick={() => {
            onPick(s.id, { from: menu.from, to: menu.to });
            setMenu(null);
          }}
        >
          <span className={`aw-slash__icon ${s.icon === "✦" ? "is-ai" : ""}`}>{s.icon}</span>
          <span className="flex min-w-0 flex-col items-start">
            <span className="text-[13px] text-ink">{s.label}</span>
            <span className="text-[11px] text-muted">{s.hint}</span>
          </span>
          <span className="ml-auto font-mono text-[11px] text-faint">/{s.keys.split(" ")[0]}</span>
        </button>
      ))}
    </div>
  );
}
