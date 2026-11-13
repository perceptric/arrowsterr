// The site's logo, read the way a person finds it: the image or drawing inside the link to the homepage at the top
// of the page. Site builders like Framer draw the logo as several small SVGs that point at shapes defined elsewhere
// on the page (<use href="#id">), so those are put back together into one SVG that works in an <img>.
// Pure apart from cheerio, so tests can cover recorded pages.

import type { CheerioAPI, Cheerio } from "cheerio";
import type { AnyNode, Element } from "domhandler";

const NAMED = /(^|[^a-z])(logo|brand|home)([^a-z]|$)/i;
const LANGS = new Set("en de fr es it pt nl ja zh ko sv da no nb fi pl tr ru id vi th ar he cs hu ro uk el ms hi bg hr sk sl lt lv et".split(" "));
const HEIGHT = 32; // the rebuilt SVG's height; widths keep each part's shape

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};

/** Is this link the site's homepage? "/", "./", "#", the site's own address, or its home with a language like /en. */
export function isHomeHref(href: string, base: string): boolean {
  const h = href.trim();
  if (!h || h.startsWith("mailto:") || h.startsWith("tel:") || h.startsWith("javascript:")) return false;
  if (h === "#" || h === "./" || h === "/") return true;
  let u: URL;
  try {
    u = new URL(h, base);
  } catch {
    return false;
  }
  if (hostOf(u.toString()) !== hostOf(base) || u.search || u.hash) return false;
  const m = /^\/?(?:([a-z]{2})(?:-[a-z]{2})?\/?)?$/i.exec(u.pathname);
  return Boolean(m) && (!m![1] || LANGS.has(m![1].toLowerCase()));
}

const label = ($: CheerioAPI, e: AnyNode) => {
  const x = $(e);
  return `${x.attr("class") ?? ""} ${x.attr("id") ?? ""} ${x.attr("aria-label") ?? ""} ${x.attr("data-framer-name") ?? ""} ${x.attr("title") ?? ""} ${x.attr("alt") ?? ""}`;
};

/** A number list from a viewBox, or the width and height attributes. */
function boxOf(el: Cheerio<Element>): [number, number, number, number] | null {
  const vb = (el.attr("viewBox") ?? el.attr("viewbox") ?? "").trim().split(/[\s,]+/).map(Number);
  if (vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0) return vb as [number, number, number, number];
  const w = parseFloat(el.attr("width") ?? "");
  const h = parseFloat(el.attr("height") ?? "");
  return w > 0 && h > 0 ? [0, 0, w, h] : null;
}

/** An SVG's inside with every <use href="#id"> replaced by the shape it points at (two levels deep). */
function resolved($: CheerioAPI, svg: Cheerio<Element>): string {
  const copy = svg.clone();
  for (let round = 0; round < 2; round++) {
    copy.find("use").each((_, u) => {
      const ref = ($(u).attr("href") ?? $(u).attr("xlink:href") ?? "").replace(/^#/, "");
      if (!ref) return;
      const target = $(`[id="${ref.replace(/"/g, "")}"]`).first();
      if (!target.length) return;
      const tag = (target.get(0) as Element).tagName?.toLowerCase();
      if (tag === "svg" || tag === "symbol") {
        const box = boxOf(target);
        $(u).replaceWith(`<svg${box ? ` viewBox="${box.join(" ")}"` : ""} width="100%" height="100%">${target.html() ?? ""}</svg>`);
      } else $(u).replaceWith($.html(target));
    });
  }
  return copy.html() ?? "";
}

/** The text color the logo is drawn in: the closest fill or color set on it or a parent, else near black. */
function colorOf($: CheerioAPI, from: AnyNode, stop: AnyNode): string {
  const read = (style: string, prop: string) => new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, "i").exec(style)?.[1]?.trim();
  for (const e of [from, ...$(from).parentsUntil($(stop).parent()).get()]) {
    const style = $(e).attr("style") ?? "";
    const fill = read(style, "fill") ?? $(e).attr("fill");
    if (fill && !/none|currentcolor|var\(/i.test(fill)) return fill;
    const color = read(style, "color");
    if (color && !/currentcolor|var\(/i.test(color)) return color;
  }
  return "#111111";
}

/** Several SVGs side by side as one, each scaled to the same height, in the order they appear. */
export function joinSvgs($: CheerioAPI, svgs: Element[], color: string): string | null {
  const parts = svgs
    .map((s) => {
      const el = $(s);
      const box = boxOf(el);
      if (!box) return null;
      return { box, inner: resolved($, el) };
    })
    .filter((p): p is { box: [number, number, number, number]; inner: string } => Boolean(p && p.inner.trim()));
  if (!parts.length) return null;
  const gap = Math.round(HEIGHT * 0.2);
  let x = 0;
  const body = parts
    .map((p) => {
      const w = Math.round(p.box[2] * (HEIGHT / p.box[3]) * 100) / 100;
      const out = `<svg x="${x}" y="0" width="${w}" height="${HEIGHT}" viewBox="${p.box.join(" ")}">${p.inner}</svg>`;
      x += w + gap;
      return out;
    })
    .join("");
  const width = Math.round((x - gap) * 100) / 100;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${HEIGHT}" width="${width}" height="${HEIGHT}" fill="${color}" style="color:${color}">${body}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * The logo in the link to the homepage at the top of the page: its image, or its SVGs joined into one.
 * Links named logo or brand, and links inside the header or nav, go first. Links in the footer are skipped.
 * Null when there is no such link with a picture in it.
 */
export function homeLogo($: CheerioAPI, base: string): string | null {
  const links = $("a[href]")
    .toArray()
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => isHomeHref($(a).attr("href") ?? "", base) && !$(a).closest("footer").length)
    .map(({ a, i }) => {
      const named = NAMED.test(label($, a)) || $(a).find("*").toArray().slice(0, 6).some((e) => NAMED.test(label($, e)));
      const top = $(a).closest("header, nav, [role=banner]").length > 0;
      return { a, score: (named ? 4 : 0) + (top ? 2 : 0) - i / 10_000 };
    })
    .sort((x, y) => y.score - x.score);
  for (const { a } of links) {
    const img = $(a).find("img").first();
    const src = img.attr("src") ?? img.attr("data-src") ?? img.attr("srcset")?.split(/\s+/)[0];
    if (src && !src.startsWith("data:image/gif")) {
      try {
        return new URL(src, base).toString();
      } catch {
        /* a broken address: try the next link */
      }
    }
    // Small line icons (a menu or arrow) are left out; a logo part is wider than 16 units at its own scale.
    const svgs = $(a)
      .find("svg")
      .toArray()
      .filter((s) => !$(s).parents("svg").length)
      .filter((s) => {
        const box = boxOf($(s));
        return box !== null && (box[2] > 16 || box[3] > 16 || $(s).find("use").length > 0);
      });
    if (svgs.length) {
      const joined = joinSvgs($, svgs, colorOf($, svgs[0], a));
      if (joined) return joined;
    }
  }
  return null;
}

/** An image in the header is a logo only when it or its parents say so; a plain header image is often a photo or a drawing. */
export function namedImage($: CheerioAPI, img: AnyNode): boolean {
  return [img, ...$(img).parents().slice(0, 3).get()].some((e) => NAMED.test(label($, e))) || /logo/i.test($(img).attr("src") ?? "");
}
