import type { Node as PmNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { Extension, type Editor } from "@tiptap/react";

// Highlights the text each open comment is on, found by its quote, so the article's saved content never changes for
// a comment. A highlight carries data-comment with the comment's id; the screen around the editor listens for clicks.

export type CommentMark = { id: string; quote: string };
type State = { marks: CommentMark[]; active: string | null; deco: DecorationSet };
const key = new PluginKey<State>("awComments");

/** Where a quote first appears inside one paragraph or heading, as editor positions. */
function find(doc: PmNode, quote: string): { from: number; to: number } | null {
  const want = quote.replace(/\s+/g, " ").trim();
  if (!want) return null;
  let hit: { from: number; to: number } | null = null;
  doc.descendants((block, pos) => {
    if (hit) return false;
    if (!block.isTextblock) return true;
    const segs: { text: string; at: number }[] = [];
    block.descendants((n, p) => {
      if (n.isText) segs.push({ text: n.text ?? "", at: pos + 1 + p });
    });
    const text = segs.map((s) => s.text).join("");
    const i = text.replace(/\s/g, " ").indexOf(want);
    if (i < 0) return false;
    const at = (offset: number) => {
      let run = 0;
      for (const s of segs) {
        if (offset <= run + s.text.length) return s.at + (offset - run);
        run += s.text.length;
      }
      return segs[segs.length - 1].at + segs[segs.length - 1].text.length;
    };
    hit = { from: at(i), to: at(i + want.length) };
    return false;
  });
  return hit;
}

function build(doc: PmNode, marks: CommentMark[], active: string | null) {
  const decos: Decoration[] = [];
  for (const m of marks) {
    const r = find(doc, m.quote);
    if (r && r.to > r.from) decos.push(Decoration.inline(r.from, r.to, { class: `aw-cmt${m.id === active ? " is-on" : ""}`, "data-comment": m.id }));
  }
  return DecorationSet.create(doc, decos);
}

export const CommentHighlight = Extension.create({
  name: "awCommentHighlight",
  addProseMirrorPlugins: () => [
    new Plugin<State>({
      key,
      state: {
        init: (_, { doc }) => ({ marks: [], active: null, deco: DecorationSet.create(doc, []) }),
        apply: (tr, old) => {
          const meta = tr.getMeta(key) as Partial<Pick<State, "marks" | "active">> | undefined;
          if (meta) {
            const marks = meta.marks ?? old.marks;
            const active = meta.active === undefined ? old.active : meta.active;
            return { marks, active, deco: build(tr.doc, marks, active) };
          }
          if (!tr.docChanged) return old;
          return { ...old, deco: build(tr.doc, old.marks, old.active) };
        },
      },
      props: { decorations: (state) => key.getState(state)?.deco },
    }),
  ],
});

/** Show these comments' quotes as highlights, with one of them picked. */
export function showComments(editor: Editor | null, marks: CommentMark[], active: string | null) {
  if (!editor || editor.isDestroyed) return;
  editor.view.dispatch(editor.state.tr.setMeta(key, { marks, active }));
}

/** True when the quote can still be found in the article. */
export const quoteFound = (editor: Editor | null, quote: string) => Boolean(editor && !editor.isDestroyed && find(editor.state.doc, quote));
