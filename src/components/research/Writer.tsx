import type { Editor } from "@tiptap/react";
import type { BrandGuideline } from "@/lib/writerTypes";

// Helpers the article editors share: the draft's own text and brand-styled tables for export.

/** The writer's own text, without the notes. */
export const draftText = (ed: Editor) => {
  const parts: string[] = [];
  ed.state.doc.forEach((n) => {
    if (n.type.name !== "note") parts.push(n.textContent);
  });
  return parts.join("\n");
};
/** Tables in the brand's style for export: the main brand color on the header row. */
export const brandTables = (html: string, g: BrandGuideline | null) => {
  const main = g?.colors.find((c) => /primary|brand|main/i.test(`${c.name} ${c.use}`))?.hex ?? g?.colors[0]?.hex ?? "#0943B0";
  return html
    .replace(/<table(?![^>]*style=)/g, '<table style="width:100%;border-collapse:collapse;margin:1.5em 0"')
    .replace(/<th(?=[\s>])(?![^>]*style=)/g, `<th style="background:${main};color:#fff;text-align:left;padding:10px 12px"`)
    .replace(/<td(?=[\s>])(?![^>]*style=)/g, '<td style="padding:10px 12px;border-bottom:1px solid #e5e7eb"');
};
