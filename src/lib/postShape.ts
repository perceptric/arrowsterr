// A blog post's writing with its shape, for the writer persona's voice stats (writerPersona.ts). Pure, so tests can
// cover it. Server only in practice (cheerio).
import * as cheerio from "cheerio";
import type { PostShape } from "./writerPersona.ts";

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/** A post's paragraphs, lists and headings, from its HTML. Menus, footers and forms are left out. */
export function postShape(html: string): PostShape {
  const $ = cheerio.load(html.slice(0, 3_000_000));
  const title = squash($("h1").first().text() || $("title").first().text()).slice(0, 200);
  $("script, style, noscript, svg, iframe, template, nav, header, footer, aside, form, button, [role=navigation], [aria-hidden=true]").remove();
  const root = $("article").first().length ? $("article").first() : $("main").first().length ? $("main").first() : $("body");
  const paragraphs = root
    .find("p")
    .map((_, el) => squash($(el).text()))
    .get()
    .filter((t) => t.split(" ").length >= 8);
  const lists = root.find("ul, ol").filter((_, el) => $(el).find("li").length >= 2 && !$(el).find("a").length).length;
  const headings = root.find("h2, h3").length;
  const words = paragraphs.join(" ").split(/\s+/).filter(Boolean).length;
  return { title, paragraphs, lists, headings, words };
}
