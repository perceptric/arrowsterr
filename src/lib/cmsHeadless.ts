// Contentful, Sanity and Strapi: the article's HTML as each one's rich text, and the bodies of the requests that
// save it. Pure: no network, so tests can cover it. The calls are in cms.ts.
//
// The HTML is read into plain blocks first (htmlBlocks), then written out as Contentful rich text, Sanity Portable
// Text or Strapi blocks. Images are uploaded by the caller first and passed in by their address; an image that
// didn't upload is left out. Interactive modules and the FAQ schema only fit an HTML body, so a structured body
// goes without them.
import { createHash } from "node:crypto";
import { parseHTML } from "linkedom";
import { cmsSlug } from "./cmsMap.ts";

type Config = Record<string, string>;
export type Article = { title: string; html: string; slug: string; description: string; image: string; live: boolean };

// ─────────────── HTML to blocks ───────────────

export type Mark = "bold" | "italic" | "underline" | "strike" | "code";
export type Span = { text: string; marks: Mark[]; href?: string };
export type Block =
  | { type: "p" | "quote" | "code"; spans: Span[] }
  | { type: "h"; level: number; spans: Span[] }
  | { type: "li"; list: "bullet" | "number"; level: number; spans: Span[] }
  | { type: "hr" }
  | { type: "img"; src: string; alt: string }
  | { type: "table"; rows: { head: boolean; cells: Span[][] }[] };

type El = { nodeType: number; tagName: string; textContent: string | null; childNodes: ArrayLike<El>; getAttribute(n: string): string | null; hasAttribute(n: string): boolean; querySelectorAll(s: string): ArrayLike<El> };

const SKIP = new Set(["SCRIPT", "STYLE", "IFRAME", "NOSCRIPT", "TEMPLATE", "FORM", "BUTTON", "INPUT", "SELECT", "TEXTAREA", "SVG", "CANVAS", "VIDEO", "AUDIO", "OBJECT", "EMBED"]);
const BOXES = new Set(["DIV", "SECTION", "ARTICLE", "FIGURE", "FIGCAPTION", "HEADER", "FOOTER", "MAIN", "ASIDE", "NAV", "DETAILS", "SUMMARY", "DL", "DT", "DD", "CENTER"]);
const MARKS: Record<string, Mark> = { STRONG: "bold", B: "bold", EM: "italic", I: "italic", U: "underline", S: "strike", STRIKE: "strike", DEL: "strike", CODE: "code" };

const kids = (el: El) => Array.from(el.childNodes);
const tag = (el: El) => (el.tagName ?? "").toUpperCase();
/** Notes, modules (raw or framed) and anything that only runs in a browser are left out. */
const skipped = (el: El) => SKIP.has(tag(el)) || el.hasAttribute("data-note") || el.hasAttribute("data-aw-module") || el.hasAttribute("data-embed") || /\barrowsterr-module\b/.test(el.getAttribute("class") ?? "");
const safeHref = (h: string | null) => {
  const v = (h ?? "").trim();
  return /^(https?:|mailto:|tel:|\/|#)/i.test(v) ? v : undefined;
};
const sameMarks = (a: Mark[], b: Mark[]) => a.length === b.length && a.every((m) => b.includes(m));

function push(spans: Span[], s: Span) {
  const last = spans[spans.length - 1];
  if (last && last.href === s.href && sameMarks(last.marks, s.marks)) last.text += s.text;
  else spans.push({ ...s, marks: [...s.marks] });
}

/** Spaces trimmed at both ends and around line breaks, and empty spans dropped. */
function tidy(spans: Span[]): Span[] {
  const out = spans.map((s) => ({ ...s, text: s.text.replace(/ *\n */g, "\n") }));
  if (out.length) {
    out[0].text = out[0].text.replace(/^\s+/, "");
    out[out.length - 1].text = out[out.length - 1].text.replace(/\s+$/, "");
  }
  return out.filter((s) => s.text);
}

function inline(n: El, marks: Mark[], href: string | undefined, spans: Span[], after: Block[]) {
  if (n.nodeType === 3) {
    const t = (n.textContent ?? "").replace(/\s+/g, " ");
    if (t) push(spans, { text: t, marks, ...(href ? { href } : {}) });
    return;
  }
  if (n.nodeType !== 1 || skipped(n)) return;
  const t = tag(n);
  if (t === "BR") return push(spans, { text: "\n", marks, ...(href ? { href } : {}) });
  if (t === "IMG") {
    const src = (n.getAttribute("src") ?? "").trim();
    if (/^https?:\/\//i.test(src)) after.push({ type: "img", src, alt: n.getAttribute("alt") ?? "" });
    return;
  }
  const m = MARKS[t];
  const next = m && !marks.includes(m) ? [...marks, m] : marks;
  const link = t === "A" ? (safeHref(n.getAttribute("href")) ?? href) : href;
  for (const c of kids(n)) inline(c, next, link, spans, after);
}

function spansOf(el: El, after: Block[]) {
  const s: Span[] = [];
  for (const c of kids(el)) inline(c, [], undefined, s, after);
  return tidy(s);
}

function list(el: El, kind: "bullet" | "number", level: number, out: Block[]) {
  for (const li of kids(el)) {
    if (li.nodeType !== 1) continue;
    const t = tag(li);
    if (t === "UL" || t === "OL") {
      list(li, t === "OL" ? "number" : "bullet", level + 1, out);
      continue;
    }
    if (t !== "LI") continue;
    const s: Span[] = [];
    const after: Block[] = [];
    const nested: El[] = [];
    for (const c of kids(li)) {
      const ct = c.nodeType === 1 ? tag(c) : "";
      if (ct === "UL" || ct === "OL") nested.push(c);
      else if (ct === "P" || ct === "DIV") {
        if (s.length) push(s, { text: "\n", marks: [] });
        for (const g of kids(c)) inline(g, [], undefined, s, after);
      } else inline(c, [], undefined, s, after);
    }
    const spans = tidy(s);
    if (spans.length || nested.length) out.push({ type: "li", list: kind, level, spans });
    out.push(...after);
    for (const n of nested) list(n, tag(n) === "OL" ? "number" : "bullet", level + 1, out);
  }
}

function table(el: El): Block | null {
  const rows: { head: boolean; cells: Span[][] }[] = [];
  for (const tr of Array.from(el.querySelectorAll("tr"))) {
    const cells: Span[][] = [];
    let head = true;
    for (const td of kids(tr)) {
      if (td.nodeType !== 1 || (tag(td) !== "TD" && tag(td) !== "TH")) continue;
      if (tag(td) === "TD") head = false;
      cells.push(spansOf(td, []));
    }
    if (cells.length) rows.push({ head, cells });
  }
  return rows.length ? { type: "table", rows } : null;
}

function walk(parent: El, out: Block[], quote: boolean) {
  let spans: Span[] = [];
  let after: Block[] = [];
  const flush = () => {
    const s = tidy(spans);
    if (s.length) out.push({ type: quote ? "quote" : "p", spans: s });
    out.push(...after);
    spans = [];
    after = [];
  };
  for (const n of kids(parent)) {
    if (n.nodeType !== 1) {
      inline(n, [], undefined, spans, after);
      continue;
    }
    if (skipped(n)) continue;
    const t = tag(n);
    const h = /^H([1-6])$/.exec(t);
    if (t === "P" || h) {
      flush();
      const a: Block[] = [];
      const s = spansOf(n, a);
      if (s.length) out.push(h ? { type: "h", level: Number(h[1]), spans: s } : { type: quote ? "quote" : "p", spans: s });
      out.push(...a);
    } else if (t === "UL" || t === "OL") {
      flush();
      list(n, t === "OL" ? "number" : "bullet", 1, out);
    } else if (t === "BLOCKQUOTE") {
      flush();
      walk(n, out, true);
    } else if (t === "PRE") {
      flush();
      const text = (n.textContent ?? "").replace(/\s+$/, "");
      if (text.trim()) out.push({ type: "code", spans: [{ text, marks: [] }] });
    } else if (t === "HR") {
      flush();
      out.push({ type: "hr" });
    } else if (t === "TABLE") {
      flush();
      const tb = table(n);
      if (tb) out.push(tb);
    } else if (t === "IMG") {
      flush();
      inline(n, [], undefined, [], out);
    } else if (BOXES.has(t)) {
      flush();
      walk(n, out, quote);
    } else inline(n, [], undefined, spans, after);
  }
  flush();
}

/** The article's HTML as plain blocks: headings, paragraphs, lists with their depth, quotes, code, tables and images. */
export function htmlBlocks(html: string): Block[] {
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  const out: Block[] = [];
  walk(document.body as unknown as El, out, false);
  return out;
}

/** Each image address in the blocks, once, for the caller to upload. */
export const imageSources = (blocks: Block[]) => [...new Set(blocks.flatMap((b) => (b.type === "img" ? [b.src] : [])))];

/** A table as plain lines, for a body that has no tables. */
const tableLines = (b: Extract<Block, { type: "table" }>): Span[][] =>
  b.rows.map((r) => {
    const line: Span[] = [];
    r.cells.forEach((c, i) => [...(i ? [{ text: " | ", marks: [] }] : []), ...c].forEach((s) => push(line, s)));
    return line;
  });

type ListTree = { list: "bullet" | "number"; items: { spans: Span[]; children: ListTree[] }[] };
type Li = Extract<Block, { type: "li" }>;

/** Flat list items with depths as nested lists. A list never skips a level, so a jump of two goes one deeper. */
function listTrees(run: Li[]): ListTree[] {
  const roots: ListTree[] = [];
  const stack: ListTree[] = [];
  for (const li of run) {
    const d = Math.min(Math.max(0, li.level - 1), stack.length);
    stack.length = Math.min(stack.length, d + 1);
    let cur = stack[d];
    if (!cur || cur.list !== li.list) {
      cur = { list: li.list, items: [] };
      if (d === 0) roots.push(cur);
      else {
        const parent = stack[d - 1];
        if (!parent.items.length) parent.items.push({ spans: [], children: [] });
        parent.items[parent.items.length - 1].children.push(cur);
      }
      stack[d] = cur;
      stack.length = d + 1;
    }
    cur.items.push({ spans: li.spans, children: [] });
  }
  return roots;
}

/** The blocks, with each run of list items taken together. */
function runs(blocks: Block[]): (Block | { type: "list"; trees: ListTree[] })[] {
  const out: (Block | { type: "list"; trees: ListTree[] })[] = [];
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].type !== "li") {
      out.push(blocks[i]);
      continue;
    }
    const run: Li[] = [];
    while (i < blocks.length && blocks[i].type === "li") run.push(blocks[i++] as Li);
    i--;
    out.push({ type: "list", trees: listTrees(run) });
  }
  return out;
}

// ─────────────── Contentful rich text ───────────────

type CfNode = { nodeType: string; data: Record<string, unknown>; content?: CfNode[]; value?: string; marks?: { type: string }[] };
export type CfAllow = { nodes?: string[]; marks?: string[] };
const CF_MARK: Record<Mark, string> = { bold: "bold", italic: "italic", underline: "underline", strike: "strikethrough", code: "code" };

export const cfLink = (id: string) => ({ sys: { type: "Link", linkType: "Asset", id } });

/** A document in Contentful's rich text, kept to the nodes and marks the field allows. assets maps image addresses to asset ids. */
export function contentfulDoc(blocks: Block[], assets: Record<string, string>, allow: CfAllow = {}) {
  const ok = (t: string) => !allow.nodes || allow.nodes.includes(t);
  const text = (value: string, marks: string[] = []): CfNode => ({ nodeType: "text", value, marks: marks.filter((m) => !allow.marks || allow.marks.includes(m)).map((type) => ({ type })), data: {} });
  const inlines = (spans: Span[], extra: string[] = []): CfNode[] => {
    const out: CfNode[] = [];
    for (const s of spans) {
      const t = text(s.text, [...s.marks.map((m) => CF_MARK[m]), ...extra]);
      if (s.href && ok("hyperlink")) {
        // The editor keeps a text node on each side of a link; the same shape is sent here.
        if (out[out.length - 1]?.nodeType !== "text") out.push(text(""));
        out.push({ nodeType: "hyperlink", data: { uri: s.href }, content: [t] });
      } else out.push(t);
    }
    if (out[out.length - 1]?.nodeType !== "text") out.push(text(""));
    return out;
  };
  const para = (spans: Span[], extra: string[] = []): CfNode => ({ nodeType: "paragraph", data: {}, content: inlines(spans, extra) });
  const listNode = (tree: ListTree): CfNode => ({
    nodeType: tree.list === "number" ? "ordered-list" : "unordered-list",
    data: {},
    content: tree.items.map((it) => ({ nodeType: "list-item", data: {}, content: [para(it.spans), ...it.children.map(listNode)] })),
  });
  const flatItems = (tree: ListTree): CfNode[] => tree.items.flatMap((it) => [para([{ text: "• ", marks: [] }, ...it.spans]), ...it.children.flatMap(flatItems)]);

  const content: CfNode[] = [];
  for (const b of runs(blocks)) {
    if (b.type === "list") {
      for (const tree of b.trees) content.push(...(ok(tree.list === "number" ? "ordered-list" : "unordered-list") ? [listNode(tree)] : flatItems(tree)));
    } else if (b.type === "p") content.push(para(b.spans));
    else if (b.type === "h") content.push(ok(`heading-${b.level}`) ? { nodeType: `heading-${b.level}`, data: {}, content: inlines(b.spans) } : para(b.spans, ["bold"]));
    else if (b.type === "quote") {
      const last = content[content.length - 1];
      if (!ok("blockquote")) content.push(para(b.spans, ["italic"]));
      else if (last?.nodeType === "blockquote") last.content!.push(para(b.spans));
      else content.push({ nodeType: "blockquote", data: {}, content: [para(b.spans)] });
    } else if (b.type === "code") content.push(para(b.spans, ["code"]));
    else if (b.type === "hr") {
      if (ok("hr")) content.push({ nodeType: "hr", data: {}, content: [] });
    } else if (b.type === "img") {
      if (assets[b.src] && ok("embedded-asset-block")) content.push({ nodeType: "embedded-asset-block", data: { target: cfLink(assets[b.src]) }, content: [] });
    } else if (b.type === "table") {
      if (ok("table"))
        content.push({
          nodeType: "table",
          data: {},
          content: b.rows.map((r) => ({ nodeType: "table-row", data: {}, content: r.cells.map((c) => ({ nodeType: r.head ? "table-header-cell" : "table-cell", data: {}, content: [para(c)] })) })),
        });
      else content.push(...tableLines(b).map((l) => para(l)));
    }
  }
  return { nodeType: "document", data: {}, content: content.length ? content : [para([])] };
}

// ─────────────── Sanity Portable Text ───────────────

const PT_MARK: Record<Mark, string> = { bold: "strong", italic: "em", underline: "underline", strike: "strike-through", code: "code" };

/** Short keys, unique in one body. */
export const keyMaker = (prefix = "k") => {
  let n = 0;
  return () => `${prefix}${(n++).toString(36)}`;
};

/** The blocks as Portable Text. images maps image addresses to Sanity image asset ids. */
export function portableText(blocks: Block[], images: Record<string, string>, key = keyMaker()) {
  const block = (spans: Span[], style: string, extra: Record<string, unknown> = {}, more: string[] = []) => {
    const markDefs: { _type: "link"; _key: string; href: string }[] = [];
    const children = spans.map((s) => {
      const marks = [...s.marks.map((m) => PT_MARK[m]), ...more];
      if (s.href) {
        let def = markDefs.find((d) => d.href === s.href);
        if (!def) markDefs.push((def = { _type: "link", _key: key(), href: s.href }));
        marks.push(def._key);
      }
      return { _type: "span", _key: key(), text: s.text, marks };
    });
    return { _type: "block", _key: key(), style, markDefs, children: children.length ? children : [{ _type: "span", _key: key(), text: "", marks: [] }], ...extra };
  };
  const out: Record<string, unknown>[] = [];
  for (const b of blocks) {
    if (b.type === "p") out.push(block(b.spans, "normal"));
    else if (b.type === "h") out.push(block(b.spans, `h${b.level}`));
    else if (b.type === "quote") out.push(block(b.spans, "blockquote"));
    else if (b.type === "code") out.push(block(b.spans, "normal", {}, ["code"]));
    else if (b.type === "li") out.push(block(b.spans, "normal", { listItem: b.list, level: b.level }));
    else if (b.type === "img") {
      if (images[b.src]) out.push({ _type: "image", _key: key(), asset: { _type: "reference", _ref: images[b.src] }, ...(b.alt ? { alt: b.alt } : {}) });
    } else if (b.type === "table") out.push(...tableLines(b).map((l) => block(l, "normal")));
  }
  return out;
}

// ─────────────── Strapi blocks ───────────────

/** The blocks as Strapi's Rich text (Blocks). files maps image addresses to the files Strapi's upload gave back. */
export function strapiBlocks(blocks: Block[], files: Record<string, Record<string, unknown>>) {
  const inlines = (spans: Span[], more: Partial<Record<string, true>> = {}) => {
    const out = spans.map((s) => {
      const t: Record<string, unknown> = { type: "text", text: s.text, ...more };
      for (const m of s.marks) t[m === "strike" ? "strikethrough" : m] = true;
      return s.href ? { type: "link", url: s.href, children: [t] } : t;
    });
    return out.length ? out : [{ type: "text", text: "" }];
  };
  const listNode = (tree: ListTree): Record<string, unknown> => ({
    type: "list",
    format: tree.list === "number" ? "ordered" : "unordered",
    children: tree.items.flatMap((it) => [{ type: "list-item", children: inlines(it.spans) }, ...it.children.map(listNode)]),
  });
  const out: Record<string, unknown>[] = [];
  for (const b of runs(blocks)) {
    if (b.type === "list") out.push(...b.trees.map(listNode));
    else if (b.type === "p") out.push({ type: "paragraph", children: inlines(b.spans) });
    else if (b.type === "h") out.push({ type: "heading", level: b.level, children: inlines(b.spans) });
    else if (b.type === "quote") out.push({ type: "quote", children: inlines(b.spans) });
    else if (b.type === "code") out.push({ type: "code", children: [{ type: "text", text: b.spans.map((s) => s.text).join("") }] });
    else if (b.type === "img") {
      if (files[b.src]) out.push({ type: "image", image: files[b.src], children: [{ type: "text", text: "" }] });
    } else if (b.type === "table") out.push(...tableLines(b).map((l) => ({ type: "paragraph", children: inlines(l) })));
  }
  return out.length ? out : [{ type: "paragraph", children: [{ type: "text", text: "" }] }];
}

// ─────────────── Fields ───────────────

/** A field name: letters, numbers and underscores, with dots into nested objects (seo.description). */
export const FIELD = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;

/** The field names typed in a box, split on commas, or the fallback when it's empty. */
export function fieldList(v: string | undefined, fallback: string[] = []): string[] {
  const list = [...new Set((v ?? "").split(/[,\s]+/).map((s) => s.trim()).filter(Boolean))];
  return list.length ? list : fallback;
}

/** Every field name in a config that isn't a valid name, so connecting can say so. */
export function badFields(c: Config, keys: string[]) {
  return keys.flatMap((k) => fieldList(c[k]).filter((f) => !FIELD.test(f)));
}

/** Set a value at a dotted path, making the objects on the way. */
export function setPath(obj: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split(".");
  let cur = obj;
  for (const p of parts.slice(0, -1)) {
    const next = cur[p];
    cur = cur[p] = next && typeof next === "object" && !Array.isArray(next) ? { ...(next as Record<string, unknown>) } : {};
  }
  cur[parts[parts.length - 1]] = value;
  return obj;
}

export type Names = { title: string[]; body: string; slug: string | null; description: string[]; image: string | null };

/** Field names for Sanity and Strapi from the config, with the usual names where a box was left empty. */
export function headlessNames(c: Config, body: string): Names {
  return {
    title: fieldList(c.titleField, ["title"]),
    body: fieldList(c.bodyField, [body])[0],
    slug: fieldList(c.slugField, ["slug"])[0] ?? null,
    description: fieldList(c.descriptionField),
    image: fieldList(c.imageField)[0] ?? null,
  };
}

/** Each field path and its value. The slug and image come already shaped for the CMS. */
export function articlePairs(n: Names, p: Article, v: { body: unknown; slug: unknown; image?: unknown }): [string, unknown][] {
  const out: [string, unknown][] = n.title.map((t) => [t, p.title]);
  out.push([n.body, v.body]);
  if (n.slug) out.push([n.slug, v.slug]);
  if (p.description) for (const d of n.description) out.push([d, p.description]);
  if (n.image && v.image !== undefined && v.image !== null) out.push([n.image, v.image]);
  return out;
}

/** The live post's address from a pattern like https://example.com/blog/{slug}. Without {slug}, the slug goes at the end. */
export function postUrl(pattern: string | undefined, slug: string): string | null {
  const p = (pattern ?? "").trim();
  if (!/^https?:\/\/[^\s]+$/i.test(p)) return null;
  return p.includes("{slug}") ? p.replace(/\{slug\}/g, encodeURIComponent(slug)) : `${p.replace(/\/+$/, "")}/${encodeURIComponent(slug)}`;
}

const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const EXT: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", avif: "image/avif", svg: "image/svg+xml" };
const extOf = (url: string) => /\.([a-z0-9]{3,4})(?:[?#]|$)/i.exec(url)?.[1]?.toLowerCase() ?? "";
/** An image's type from its address, for CMSs that ask for one. */
export const imageType = (url: string) => EXT[extOf(url)] ?? "image/jpeg";
/** A file name from the image's address, the same each time, so a CMS can find an image it already has. */
export const imageName = (url: string) => `arrowsterr-${hash(url).slice(0, 16)}.${EXT[extOf(url)] ? extOf(url) : "jpg"}`;

// ─────────────── Contentful ───────────────

export const CONTENTFUL = "https://api.contentful.com";
export const cfPath = (c: Config, rest: string) => `${CONTENTFUL}/spaces/${encodeURIComponent(c.spaceId.trim())}/environments/${encodeURIComponent((c.environment || "master").trim())}${rest}`;
export const cfHead = (c: Config, version?: number, type?: string): Record<string, string> => ({
  Authorization: `Bearer ${c.token.trim()}`,
  "Content-Type": "application/vnd.contentful.management.v1+json",
  ...(version !== undefined ? { "X-Contentful-Version": String(version) } : {}),
  ...(type ? { "X-Contentful-Content-Type": type } : {}),
});

export type CfField = { id: string; name: string; type: string; linkType?: string; validations?: { enabledNodeTypes?: string[]; enabledMarks?: string[] }[]; disabled?: boolean; omitted?: boolean };
export type CfMap = { title: CfField[]; body: CfField; slug: CfField | null; description: CfField[]; image: CfField | null };

const TEXT = ["Symbol", "Text"];
const isAsset = (f: CfField) => f.type === "Link" && f.linkType === "Asset";

/** The nodes and marks a rich text field allows, when it limits them. */
export function cfAllow(f: CfField): CfAllow {
  const v = f.validations ?? [];
  return { nodes: v.find((x) => x.enabledNodeTypes)?.enabledNodeTypes, marks: v.find((x) => x.enabledMarks)?.enabledMarks };
}

/**
 * Which fields of the content type get each part of the article. A typed ID must be on the type; an empty box picks
 * the field named like it. Returns a message when the type can't take an article.
 */
export function contentfulMap(fields: CfField[], c: Config, displayField?: string): CfMap | string {
  const live = fields.filter((f) => !f.disabled && !f.omitted);
  const find = (name: string) => live.find((f) => f.id === name) ?? live.find((f) => f.id.toLowerCase() === name.toLowerCase() || f.name.toLowerCase() === name.toLowerCase());
  const named = (types: (f: CfField) => boolean, re: RegExp, not: CfField[] = []) => live.find((f) => types(f) && !not.includes(f) && (re.test(f.id) || re.test(f.name)));
  const given = (key: string, kinds: (f: CfField) => boolean, what: string): CfField[] | string => {
    const out: CfField[] = [];
    for (const name of fieldList(c[key])) {
      const f = find(name);
      if (!f) return `This content type has no field ${name}.`;
      if (!kinds(f)) return `The ${name} field can't hold ${what}.`;
      out.push(f);
    }
    return out;
  };
  const text = (f: CfField) => TEXT.includes(f.type);

  const body = given("bodyField", (f) => f.type === "RichText" || f.type === "Text", "the article. Use a Rich text or Long text field");
  if (typeof body === "string") return body;
  const bodyField = body[0] ?? named((f) => f.type === "RichText", /body|content|article|post|text/i) ?? live.find((f) => f.type === "RichText") ?? named((f) => f.type === "Text", /body|content|article|post/i);
  if (!bodyField) return "This content type needs a Rich text or Long text field for the article.";

  const title = given("titleField", text, "a title");
  if (typeof title === "string") return title;
  const display = live.find((f) => f.id === displayField && text(f));
  const titles = title.length ? title : [display ?? named((f) => f.type === "Symbol", /^(title|name|headline)$/i)].filter((f): f is CfField => Boolean(f));
  if (!titles.length) return "Type the ID of the title field.";

  const slug = given("slugField", (f) => f.type === "Symbol", "a slug. Use a Short text field");
  if (typeof slug === "string") return slug;
  const description = given("descriptionField", text, "a description");
  if (typeof description === "string") return description;
  const image = given("imageField", (f) => isAsset(f) || text(f), "an image. Use a Media field");
  if (typeof image === "string") return image;
  const used = [bodyField, ...titles];
  const slugField = slug[0] ?? named((f) => f.type === "Symbol", /^slug$/i, used) ?? null;
  const descField = description.length ? description : [named(text, /description|summary|excerpt|intro|teaser/i, [...used, ...(slugField ? [slugField] : [])])].filter((f): f is CfField => Boolean(f));
  const imageField = image[0] ?? named(isAsset, /image|cover|hero|thumbnail|featured|photo/i) ?? null;
  return { title: titles, body: bodyField, slug: slugField, description: descField, image: imageField };
}

/** The entry's fields, each under the space's main language. Short text is cut to Contentful's 255 characters. */
export function contentfulFields(map: CfMap, p: Article, locale: string, body: unknown, image: unknown) {
  const fields: Record<string, Record<string, unknown>> = {};
  const put = (f: CfField, v: unknown) => (fields[f.id] = { [locale]: typeof v === "string" && f.type === "Symbol" ? v.slice(0, 255) : v });
  for (const t of map.title) put(t, p.title);
  put(map.body, body);
  if (map.slug) put(map.slug, cmsSlug(p));
  if (p.description) for (const d of map.description) put(d, p.description);
  if (map.image && image !== null && image !== undefined) put(map.image, image);
  return fields;
}

/** An update keeps the entry's other fields and languages, since Contentful replaces every field on a save. */
export function cfMerge(cur: Record<string, Record<string, unknown>> | undefined, next: Record<string, Record<string, unknown>>) {
  const out: Record<string, Record<string, unknown>> = { ...(cur ?? {}) };
  for (const [k, v] of Object.entries(next)) out[k] = { ...(out[k] ?? {}), ...v };
  return out;
}

/** An image's asset id comes from its address, so the same image is one asset however often it's published. */
export const cfAssetId = (url: string) => `arw${hash(url).slice(0, 32)}`;
export const cfAssetBody = (url: string, title: string, locale: string) => ({
  fields: { title: { [locale]: title.slice(0, 255) }, file: { [locale]: { contentType: imageType(url), fileName: imageName(url), upload: url } } },
});

// ─────────────── Sanity ───────────────

export const SANITY_API = "v2025-02-19";
export const sanityUrl = (c: Config, rest: string) => `https://${encodeURIComponent(c.projectId.trim())}.api.sanity.io/${SANITY_API}${rest}`;
export const sanityDataset = (c: Config) => encodeURIComponent((c.dataset || "production").trim());

/** One query for connecting and publishing: how many posts there are, and one post's body and image to see their shape. */
export function sanitySampleQuery(c: Config, n: Names) {
  const pick = [`"body": ${n.body}`, ...(n.image ? [`"image": ${n.image}`] : [])].join(", ");
  const query = `{"count": count(*[_type == $type && !(_id in path("drafts.**"))]), "sample": *[_type == $type && defined(${n.body})][0]{${pick}}}`;
  const q = new URLSearchParams({ query, $type: JSON.stringify(c.docType.trim()), perspective: "raw" });
  return sanityUrl(c, `/data/query/${sanityDataset(c)}?${q}`);
}

/** A body kept as a string gets HTML; anything else, or no post yet, gets Portable Text. */
export const sanityHtmlBody = (sample: unknown) => typeof sample === "string";

export const sanitySlug = (p: Article) => ({ _type: "slug", current: cmsSlug(p) });
export const sanityImage = (assetId: string) => ({ _type: "image", asset: { _type: "reference", _ref: assetId } });

type Doc = Record<string, unknown>;
const SYSTEM = ["_id", "_rev", "_createdAt", "_updatedAt"];

/**
 * The mutations that save a post. It starts from the draft, else the live post, so fields people added in Sanity
 * stay. Live writes the post and drops its draft, as Publish does in Sanity; a draft leaves the live post as it is.
 */
export function sanityMutations(id: string, type: string, live: boolean, cur: { published: Doc | null; draft: Doc | null }, pairs: [string, unknown][]) {
  const base = Object.fromEntries(Object.entries(cur.draft ?? cur.published ?? {}).filter(([k]) => !SYSTEM.includes(k)));
  const doc: Doc = { ...base, _type: type };
  for (const [k, v] of pairs) setPath(doc, k, v);
  if (live) return [{ createOrReplace: { ...doc, _id: id } }, { delete: { id: `drafts.${id}` } }];
  return [{ createOrReplace: { ...doc, _id: `drafts.${id}` } }];
}

// ─────────────── Strapi ───────────────

export const strapiBase = (u: string) =>
  (/^https?:\/\//i.test(u.trim()) ? u.trim() : `https://${u.trim()}`).replace(/\/+$/, "").replace(/\/api$/i, "").replace(/\/admin(\/.*)?$/i, "");
export const strapiPlural = (c: Config) => c.collection.trim().replace(/^\/?(api\/)?/i, "").replace(/\/+$/, "");
export const strapiHead = (c: Config) => ({ Authorization: `Bearer ${c.token.trim()}` });

export type StrapiEntry = { version: 4 | 5; id: string; fields: Record<string, unknown>; publishedAt: string | null };

/** One entry from Strapi's answer: Strapi 5 gives documentId and flat fields, Strapi 4 an id and attributes. */
export function strapiEntry(data: unknown): StrapiEntry | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (typeof d.documentId === "string") return { version: 5, id: d.documentId, fields: d, publishedAt: (d.publishedAt as string | null) ?? null };
  if (d.attributes && typeof d.attributes === "object" && d.id !== undefined) {
    const a = d.attributes as Record<string, unknown>;
    return { version: 4, id: String(d.id), fields: a, publishedAt: (a.publishedAt as string | null) ?? null };
  }
  return null;
}

/** Stored ids say the version: Strapi 4 ids are numbers, Strapi 5 document ids are not. */
export const strapiVersionOf = (id: string): 4 | 5 => (/^\d+$/.test(id) ? 4 : 5);

const strapiPath = (c: Config) => `${strapiBase(c.baseUrl)}/api/${encodeURIComponent(strapiPlural(c))}`;
export const strapiListUrl = (c: Config) => `${strapiPath(c)}?${new URLSearchParams({ "pagination[pageSize]": "1", populate: "*" })}`;
/** One entry, including a draft: Strapi 5 reads it with status=draft, Strapi 4 with publicationState=preview. */
export const strapiOneUrl = (c: Config, version: 4 | 5, id: string) =>
  `${strapiPath(c)}/${encodeURIComponent(id)}?${version === 5 ? "status=draft" : "publicationState=preview"}`;
/** Strapi 5 picks draft or live with status; Strapi 4 with publishedAt in the body. */
export function strapiSaveUrl(c: Config, version: 4 | 5, live: boolean, id?: string) {
  const path = `${strapiPath(c)}${id ? `/${encodeURIComponent(id)}` : ""}`;
  return version === 5 ? `${path}?status=${live ? "published" : "draft"}` : path;
}

/** The data to save. On Strapi 4 a live post keeps its first publish date, and a draft has none. */
export function strapiData(version: 4 | 5, pairs: [string, unknown][], live: boolean, publishedAt: string | null, now: Date) {
  const data: Record<string, unknown> = {};
  for (const [k, v] of pairs) setPath(data, k, v);
  if (version === 4) data.publishedAt = live ? publishedAt || now.toISOString() : null;
  return data;
}

/** Field names for Strapi, checked against an entry when there is one. A slug left at its usual name is dropped when the collection has none. */
export function strapiNames(c: Config, fields: Record<string, unknown> | null): Names | string {
  const n = headlessNames(c, "content");
  if (!fields) return n;
  const has = (path: string) => path.split(".")[0] in fields;
  for (const f of [...n.title, n.body, ...(c.slugField ? [n.slug!] : []), ...n.description, ...(n.image ? [n.image] : [])]) {
    if (!has(f)) return `This collection has no field ${f.split(".")[0]}.`;
  }
  if (!c.slugField && n.slug && !has(n.slug)) n.slug = null;
  return n;
}

/** How the body field stores text, from an entry: blocks are a list, Markdown or text is a string. Null when unknown. */
export function strapiBodyKind(fields: Record<string, unknown> | null, body: string): "blocks" | "html" | null {
  const v = fields?.[body];
  return Array.isArray(v) ? "blocks" : typeof v === "string" ? "html" : null;
}
