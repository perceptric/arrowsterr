// Brand Kits: the elements of a homepage that show its style, found with cheerio. Pure, so tests can run it.
import type * as cheerio from "cheerio";
import { declsOf, type PageNode } from "./brandCss.ts";

/**
 * The page's own body, headings, text, link, buttons, field and card, as cssEvidence reads them. Each comes with its
 * classes, inline style and parents, so hashed and builder-made classes (Framer, Webflow, CSS modules) still match.
 */
export function pageNodes($: cheerio.CheerioAPI): Record<string, PageNode> {
  type El = Parameters<typeof $>[0];
  const one = (e: El): PageNode => {
    const a = ($(e).attr() ?? {}) as Record<string, string>;
    const attrs = Object.fromEntries(Object.entries(a).slice(0, 30).map(([k, v]) => [k, String(v).slice(0, 200)]));
    return { tag: ((e as { tagName?: string }).tagName ?? "div").toLowerCase(), id: a.id ?? "", classes: (a.class ?? "").split(/\s+/).filter(Boolean).slice(0, 40), attrs, style: declsOf(a.style ?? "") };
  };
  const node = (e: El): PageNode => ({ ...one(e), ancestors: $(e).parents().slice(0, 12).get().map(one) });
  const out: Record<string, PageNode> = {};
  const put = (role: string, e: El | undefined) => {
    if (e) out[role] = node(e);
  };
  const words = (e: El) => $(e).text().replace(/\s+/g, " ").trim();
  put("body", $("body").get(0));
  for (const h of ["h1", "h2", "h3"]) put(h, $(h).filter((_, e) => words(e).length > 1).get(0));
  put("p", $("p").filter((_, e) => words(e).length > 60).get(0));
  put("link", $("main a[href], p a[href], article a[href]").filter((_, e) => words(e).length > 2 && !$(e).closest("nav, header, footer").length).get(0));
  const named = (e: El) => /(^|[^a-z])(btn|button|cta)([^a-z]|$)/i.test(`${$(e).attr("class") ?? ""} ${$(e).attr("data-framer-name") ?? ""} ${$(e).attr("role") ?? ""} ${$(e).attr("data-testid") ?? ""}`);
  const ctas = $("a[href], button")
    .filter((_, e) => {
      const t = words(e);
      return t.length > 1 && t.length < 32 && (named(e) || (e as { tagName?: string }).tagName === "button");
    })
    .get();
  // Up to 8 likely buttons. cssEvidence keeps the first with a fill as the main button and the next different one.
  ctas.slice(0, 8).forEach((e, i) => put(`cta${i}`, e));
  put("input", $('input[type="email"], input[type="text"], input:not([type]), textarea').get(0));
  put("card", $('[class*="card" i], [data-framer-name*="card" i]').get(0));
  put("nav", $("header, nav").get(0));
  put("footer", $("footer").get(0));
  return out;
}
