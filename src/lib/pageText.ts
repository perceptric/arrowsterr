// The words of a web page, without its menus, footers and scripts. Pure, so tests can cover it. Server only in practice (cheerio).
import * as cheerio from "cheerio";

/** The page's main writing: the article or main element when there is one, else the body. At most max characters. */
export function pageText(html: string, max = 6000): { title: string; text: string; words: number } {
  const $ = cheerio.load(html.slice(0, 3_000_000));
  const title = $("title").first().text().replace(/\s+/g, " ").trim().slice(0, 160);
  $("script, style, noscript, svg, iframe, template, nav, header, footer, aside, form, button, [role=navigation], [aria-hidden=true]").remove();
  const root = $("article").first().length ? $("article").first() : $("main").first().length ? $("main").first() : $("body");
  // Block elements end a line, so sentences from different paragraphs don't run together.
  root.find("p, li, h1, h2, h3, h4, h5, h6, blockquote, td, th, br, div").each((_, el) => {
    $(el).append("\n");
  });
  const text = root
    .text()
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.split(" ").length >= 4) // menus and labels are short; writing isn't
    .join("\n");
  return { title, text: text.slice(0, max), words: text.split(/\s+/).filter(Boolean).length };
}

export type PageBlock = { type: "p" | "li"; text: string };
export type PageOutline = { title: string; description: string; h1: string; intro: PageBlock[]; sections: { heading: string; level: 2 | 3; blocks: PageBlock[] }[] };

/**
 * A live page as an outline, for a refresh: its title, meta description, H1, the writing before the first heading,
 * and each H2 or H3 with its paragraphs and list items. Menus, footers and scripts are left out as in pageText.
 */
export function pageOutline(html: string): PageOutline {
  const $ = cheerio.load(html.slice(0, 3_000_000));
  const clean = (s: string) => s.replace(/\s+/g, " ").trim();
  const title = clean($("title").first().text()).slice(0, 200);
  const description = clean($('meta[name="description"]').attr("content") ?? "").slice(0, 400);
  $("script, style, noscript, svg, iframe, template, nav, header, footer, aside, form, button, [role=navigation], [aria-hidden=true]").remove();
  const root = $("article").first().length ? $("article").first() : $("main").first().length ? $("main").first() : $("body");
  const h1 = clean(root.find("h1").first().text() || $("h1").first().text()).slice(0, 200);
  const out: PageOutline = { title, description, h1, intro: [], sections: [] };
  root.find("h2, h3, p, li").each((_, el) => {
    const tag = (el as { tagName?: string }).tagName?.toLowerCase();
    // A list item inside another list item, or a paragraph inside a list item, is already in its parent's text.
    if (tag !== "h2" && tag !== "h3" && $(el).parents("li").length) return;
    const text = clean($(el).text());
    if (!text) return;
    if (tag === "h2" || tag === "h3") out.sections.push({ heading: text.slice(0, 200), level: tag === "h2" ? 2 : 3, blocks: [] });
    else if (text.split(" ").length >= 4 || tag === "li") (out.sections.at(-1)?.blocks ?? out.intro).push({ type: tag === "li" ? "li" : "p", text: text.slice(0, 2000) });
  });
  return out;
}
