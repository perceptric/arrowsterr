// Brand Kits: read a site's CSS in depth. Pure, so the server and the tests share it.
// It parses every rule (inside @media, @supports and @layer too), resolves CSS variables, reads @font-face, and
// works out how the site styles its body, headings, links, buttons, fields and cards. learnKit hands the result
// to the agent as evidence, so the kit is measured from the site instead of guessed.

export type CssRule = { selector: string; decls: Record<string, string>; media: string | null };
export type FontFace = { family: string; weight: string; style: string; src: string };
export type RoleStyle = Record<string, string>;

/** Strip comments and split a stylesheet into rules. Nested blocks keep the media text they sit in. */
export function parseCss(css: string, media: string | null = null, out: CssRule[] = [], depth = 0): CssRule[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let i = 0;
  while (i < src.length && out.length < 60_000) {
    const open = src.indexOf("{", i);
    if (open < 0) break;
    const head = src.slice(i, open).trim();
    // Find the matching close brace.
    let d = 1;
    let j = open + 1;
    for (; j < src.length && d > 0; j++) {
      const ch = src[j];
      if (ch === "{") d++;
      else if (ch === "}") d--;
    }
    const body = src.slice(open + 1, j - 1);
    i = j;
    // A statement like @import or @charset before the block ends at its semicolon.
    const at = head.lastIndexOf(";");
    const sel = (at >= 0 ? head.slice(at + 1) : head).trim();
    if (!sel) continue;
    if (sel.startsWith("@")) {
      const name = sel.slice(1).split(/[\s(]/)[0].toLowerCase();
      if ((name === "media" || name === "supports" || name === "layer" || name === "container" || name === "document") && depth < 6) {
        const inner = name === "media" ? sel.slice(6).trim() : media;
        parseCss(body, media && inner && inner !== media ? `${media} and ${inner}` : inner, out, depth + 1);
      } else if (name === "font-face") {
        out.push({ selector: "@font-face", decls: declsOf(body), media });
      }
      continue;
    }
    out.push({ selector: sel.replace(/\s+/g, " "), decls: declsOf(body), media });
  }
  return out;
}

/** "color: red; background: url(a;b)" as a map. Later declarations win, like the browser. */
export function declsOf(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  let buf = "";
  let paren = 0;
  let quote = "";
  const flush = () => {
    const k = buf.indexOf(":");
    if (k > 0) {
      const prop = buf.slice(0, k).trim().toLowerCase();
      const value = buf.slice(k + 1).trim();
      if (prop && value && prop.length < 80 && value.length < 600) out[prop] = value;
    }
    buf = "";
  };
  for (const ch of body) {
    if (quote) {
      if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(") paren++;
    else if (ch === ")") paren = Math.max(0, paren - 1);
    else if (ch === ";" && !paren) {
      flush();
      continue;
    }
    buf += ch;
  }
  flush();
  return out;
}

const ROOT = /^(:root|html|body|:host|\[data-theme[^\]]*\]|\.light|\.theme-light)$/i;

/** CSS variables set on the page root (later wins), then on any other selector if the root didn't set them. */
export function rootVars(rules: CssRule[]): Record<string, string> {
  const root: Record<string, string> = {};
  const other: Record<string, string> = {};
  for (const r of rules) {
    if (r.selector === "@font-face") continue;
    const isRoot = r.selector.split(",").some((s) => ROOT.test(s.trim()));
    for (const [k, v] of Object.entries(r.decls)) {
      if (!k.startsWith("--")) continue;
      if (isRoot && !r.media?.includes("dark")) root[k] = v;
      else if (!(k in other)) other[k] = v;
    }
  }
  return { ...other, ...root };
}

/** Replace var(--x, fallback) with its value, a few levels deep. */
export function resolveVars(value: string, vars: Record<string, string>, depth = 0): string {
  if (depth > 6 || !value.includes("var(")) return value;
  const next = value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\))?[^()]*))?\)/g, (_, name: string, fallback?: string) => vars[name] ?? fallback?.trim() ?? "");
  return next === value ? value : resolveVars(next, vars, depth + 1);
}

/** Every @font-face: its family, weight, style and first font file. */
export function fontFaces(rules: CssRule[], base?: string): FontFace[] {
  const seen = new Set<string>();
  const out: FontFace[] = [];
  for (const r of rules) {
    if (r.selector !== "@font-face") continue;
    const family = (r.decls["font-family"] ?? "").replace(/["']/g, "").trim();
    if (!family) continue;
    const weight = r.decls["font-weight"] ?? "400";
    const style = r.decls["font-style"] ?? "normal";
    const key = `${family}|${weight}|${style}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let src = r.decls.src?.match(/url\(\s*["']?([^"')]+)["']?\s*\)/)?.[1] ?? "";
    if (src && base && !src.startsWith("data:")) {
      try {
        src = new URL(src, base).toString();
      } catch {}
    }
    out.push({ family, weight, style, src: src.startsWith("data:") ? "inline" : src });
  }
  return out.slice(0, 40);
}

// ─────────────── colors ───────────────

const NAMED: Record<string, string> = { white: "#ffffff", black: "#000000", red: "#ff0000", blue: "#0000ff", green: "#008000", gray: "#808080", grey: "#808080", orange: "#ffa500", purple: "#800080", yellow: "#ffff00" };
const h2 = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");

/** The first solid color in a CSS value as 6-digit hex: hex, rgb(), hsl() or a few names. Transparent is null. */
export function colorOf(value: string | undefined): string | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  const hx = v.match(/#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/);
  if (hx) {
    const s = hx[1];
    if (s.length === 8 && s.slice(6) === "00") return null;
    if (s.length === 4 && s[3] === "0") return null;
    const six = s.length <= 4 ? [...s.slice(0, 3)].map((c) => c + c).join("") : s.slice(0, 6);
    return `#${six}`;
  }
  const rgb = v.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)/);
  if (rgb) {
    const a = rgb[4] ? (rgb[4].endsWith("%") ? parseFloat(rgb[4]) / 100 : parseFloat(rgb[4])) : 1;
    if (a < 0.5) return null;
    return `#${h2(+rgb[1])}${h2(+rgb[2])}${h2(+rgb[3])}`;
  }
  const hsl = v.match(/hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:[\s,/]+([\d.]+%?))?\s*\)/);
  if (hsl) {
    const a = hsl[4] ? (hsl[4].endsWith("%") ? parseFloat(hsl[4]) / 100 : parseFloat(hsl[4])) : 1;
    if (a < 0.5) return null;
    const [hh, s, l] = [+hsl[1] / 360, +hsl[2] / 100, +hsl[3] / 100];
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const t = (x: number) => {
      const k = x < 0 ? x + 1 : x > 1 ? x - 1 : x;
      return k < 1 / 6 ? p + (q - p) * 6 * k : k < 1 / 2 ? q : k < 2 / 3 ? p + (q - p) * (2 / 3 - k) * 6 : p;
    };
    return `#${h2(t(hh + 1 / 3) * 255)}${h2(t(hh) * 255)}${h2(t(hh - 1 / 3) * 255)}`;
  }
  const name = v.match(/^[a-z]+$/)?.[0];
  return name ? (NAMED[name] ?? null) : null;
}

const count = (list: string[], n: number): [string, number][] => {
  const m = new Map<string, number>();
  for (const x of list) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
};

// ─────────────── roles ───────────────

/** How each part of a page is matched. A selector counts when one of its comma parts ends with the pattern. */
const ROLES: Record<string, RegExp> = {
  body: /^(html|body|:root)$/i,
  h1: /(^|[\s>])(h1|\.h1|\.heading-1|\.text-h1|\.display)$/i,
  h2: /(^|[\s>])(h2|\.h2|\.heading-2|\.text-h2)$/i,
  h3: /(^|[\s>])(h3|\.h3|\.heading-3|\.text-h3)$/i,
  p: /(^|[\s>])(p|\.text|\.body|\.paragraph)$/i,
  link: /(^|[\s>])a(:link)?$/i,
  button: /(^|[\s>.])(btn|button|cta)([-_](primary|main|solid|default))?(:not\([^)]*\))?$|^button$|^\[type=["']?submit["']?\]$/i,
  buttonSecondary: /(^|[\s>.])(btn|button)[-_]{1,2}(secondary|outline|ghost|alt|light|white)$/i,
  input: /(^|[\s>])(input|textarea|select|\.input|\.form-control|\.field)(\[[^\]]*\])?$/i,
  card: /(^|[\s>.])(card|tile|panel|box)$/i,
  nav: /(^|[\s>.])(nav|header|navbar|site-header|\.header)$/i,
  footer: /(^|[\s>.])(footer|site-footer)$/i,
};
const KEEP = ["color", "background", "background-color", "background-image", "font-family", "font-size", "font-weight", "line-height", "letter-spacing", "text-transform", "text-decoration", "border", "border-color", "border-width", "border-radius", "box-shadow", "padding", "transition"];

/** How the site styles each part, cascaded in source order. Phone-only media rules are skipped. */
export function roleStyles(rules: CssRule[], vars: Record<string, string>): Record<string, RoleStyle> {
  const out: Record<string, RoleStyle> = {};
  for (const r of rules) {
    if (r.selector === "@font-face") continue;
    if (r.media && /max-width|prefers-color-scheme:\s*dark|print/i.test(r.media)) continue;
    const parts = r.selector.split(",").map((s) => s.trim().replace(/::?(before|after|placeholder|selection|marker|-webkit-[\w-]+)$/i, "\u0000"));
    for (const [role, re] of Object.entries(ROLES)) {
      if (!parts.some((p) => !p.includes("\u0000") && !/:(hover|focus|active|visited|disabled)/.test(p) && re.test(p))) continue;
      const s = (out[role] ??= {});
      for (const k of KEEP) if (r.decls[k]) s[k] = resolveVars(r.decls[k].replace(/\s*!important/i, ""), vars).slice(0, 160);
    }
  }
  for (const k of Object.keys(out)) if (!Object.keys(out[k]).length) delete out[k];
  return out;
}

// ─────────────── the page's own elements ───────────────

/** A real element from the page: what it is, its classes and inline style, and its parents (nearest first). */
export type PageNode = { tag: string; id: string; classes: string[]; attrs: Record<string, string>; style: Record<string, string>; ancestors?: PageNode[] };

const INHERITED = ["color", "font-family", "font-size", "font-weight", "line-height", "letter-spacing", "text-transform"];
const STATE = /:(hover|focus|focus-visible|focus-within|active|visited|checked|disabled|placeholder-shown|target)|::?(before|after|placeholder|selection|marker|first-line|first-letter|-webkit-[\w-]+|-moz-[\w-]+)/i;

/** Split a selector into compound parts, ignoring combinators inside brackets and parentheses. */
function compounds(sel: string): string[] {
  const out: string[] = [];
  let buf = "";
  let depth = 0;
  for (const ch of sel.trim()) {
    if (ch === "[" || ch === "(") depth++;
    else if (ch === "]" || ch === ")") depth = Math.max(0, depth - 1);
    if (!depth && /[\s>+~]/.test(ch)) {
      if (buf) out.push(buf);
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (buf) out.push(buf);
  return out;
}

/** True when one compound (like a.btn.primary[type=button]) fits the element. :not() and structural pseudo-classes are ignored. */
function fits(compound: string, n: PageNode): boolean {
  const c = compound.replace(/:(not|is|where|has)\([^)]*\)/g, "").replace(/:[\w-]+(\([^)]*\))?/g, "");
  const tag = c.match(/^[a-z][\w-]*/i)?.[0];
  if (tag && tag !== "*" && tag.toLowerCase() !== n.tag) return false;
  for (const m of c.matchAll(/\.((?:\\.|[\w-])+)/g)) if (!n.classes.includes(m[1].replace(/\\/g, ""))) return false;
  for (const m of c.matchAll(/#([\w-]+)/g)) if (n.id !== m[1]) return false;
  for (const m of c.matchAll(/\[\s*([\w-]+)\s*(?:([~|^$*]?=)\s*["']?([^"'\]]*)["']?)?\s*\]/g)) {
    const v = n.attrs[m[1]];
    if (v === undefined) return false;
    const want = m[3] ?? "";
    if (m[2] === "=" && v !== want) return false;
    if (m[2] === "~=" && !v.split(/\s+/).includes(want)) return false;
    if (m[2] === "*=" && !v.includes(want)) return false;
    if (m[2] === "^=" && !v.startsWith(want)) return false;
    if (m[2] === "$=" && !v.endsWith(want)) return false;
  }
  return true;
}

const specificity = (sel: string) => {
  const ids = (sel.match(/#[\w-]+/g) ?? []).length;
  const cls = (sel.match(/\.[\w-]+|\[[^\]]+\]|:(?!not|is|where)[\w-]+/g) ?? []).length;
  const tags = (sel.replace(/\[[^\]]*\]|\([^)]*\)/g, "").match(/(^|[\s>+~])[a-z][\w-]*/gi) ?? []).length;
  return ids * 10_000 + cls * 100 + tags;
};

/** True when the whole selector fits: the last part on the element, the parts before it on its parents, in order. */
function matches(sel: string, n: PageNode): boolean {
  const parts = compounds(sel);
  if (!parts.length || !fits(parts[parts.length - 1], n)) return false;
  let up = 0;
  const chain = n.ancestors ?? [];
  for (let i = parts.length - 2; i >= 0; i--) {
    if (/^(html|body|:root)$/i.test(parts[i])) continue;
    while (up < chain.length && !fits(parts[i], chain[up])) up++;
    if (up >= chain.length) return false;
    up++;
  }
  return true;
}

/** The declarations that reach one element, in cascade order (specificity, then source order), inline style last. */
function cascade(rules: CssRule[], n: PageNode): Record<string, string> {
  const hits: { spec: number; order: number; decls: Record<string, string> }[] = [];
  rules.forEach((r, order) => {
    if (r.selector === "@font-face" || (r.media && /max-width|prefers-color-scheme:\s*dark|print/i.test(r.media))) return;
    let best = -1;
    for (const part of r.selector.split(",")) {
      const sel = part.trim();
      if (!sel || STATE.test(sel)) continue;
      if (matches(sel, n)) best = Math.max(best, specificity(sel));
    }
    if (best >= 0) hits.push({ spec: best, order, decls: r.decls });
  });
  hits.sort((a, b) => a.spec - b.spec || a.order - b.order);
  const out: Record<string, string> = {};
  for (const h of hits) Object.assign(out, h.decls);
  return { ...out, ...n.style };
}

/**
 * How the browser would style each element, close enough for a brand: its own cascaded rules and inline style, with
 * inherited text properties taken from its parents, and every CSS variable resolved against the root and its parents.
 */
export function computedRoles(all: CssRule[], vars: Record<string, string>, nodes: Record<string, PageNode>): Record<string, RoleStyle> {
  const out: Record<string, RoleStyle> = {};
  // Keep only rules that could reach one of these elements: every class, id and tag in a selector's last part
  // must appear somewhere on them. Big sites drop from tens of thousands of rules to a few hundred.
  const seen = { tags: new Set<string>(["*"]), classes: new Set<string>(), ids: new Set<string>() };
  for (const n of Object.values(nodes))
    for (const x of [n, ...(n.ancestors ?? [])]) {
      seen.tags.add(x.tag);
      for (const c of x.classes) seen.classes.add(c);
      if (x.id) seen.ids.add(x.id);
    }
  const possible = (sel: string) => {
    const parts = compounds(sel);
    const last = (parts[parts.length - 1] ?? "").replace(/:(not|is|where|has)\([^)]*\)/g, "");
    const tag = last.match(/^[a-z][\w-]*/i)?.[0]?.toLowerCase();
    if (tag && !seen.tags.has(tag)) return false;
    for (const m of last.matchAll(/\.((?:\\.|[\w-])+)/g)) if (!seen.classes.has(m[1].replace(/\\/g, ""))) return false;
    for (const m of last.matchAll(/#([\w-]+)/g)) if (!seen.ids.has(m[1])) return false;
    return true;
  };
  const rules = all.filter((r) => r.selector !== "@font-face" && r.selector.split(",").some((p) => possible(p.trim())));
  for (const [role, n] of Object.entries(nodes)) {
    const chain = [n, ...(n.ancestors ?? [])];
    const own = chain.map((x, i) => cascade(rules, { ...x, ancestors: chain.slice(i + 1) }));
    // Variables cascade from the root down to the element.
    const scope: Record<string, string> = { ...vars };
    for (const d of [...own].reverse()) for (const [k, v] of Object.entries(d)) if (k.startsWith("--")) scope[k] = v;
    const s: RoleStyle = {};
    for (const k of KEEP) {
      let v: string | undefined = own[0][k];
      if (v === undefined && INHERITED.includes(k)) v = own.slice(1).find((d) => d[k] !== undefined)?.[k];
      if (v === undefined) continue;
      const r = resolveVars(v.replace(/\s*!important/i, ""), scope).trim();
      if (r && !/^(inherit|initial|unset|revert)$/i.test(r)) s[k] = r.slice(0, 160);
    }
    if (Object.keys(s).length) out[role] = s;
  }
  return out;
}

/** The likely buttons (cta0, cta1 ...) become button and buttonSecondary: the first with a fill, then the next drawn differently. */
export function pickButtons(roles: Record<string, RoleStyle>): Record<string, RoleStyle> {
  const ctas = Object.keys(roles).filter((k) => /^cta\d$/.test(k)).sort().map((k) => roles[k]);
  const out = Object.fromEntries(Object.entries(roles).filter(([k]) => !/^cta\d$/.test(k)));
  const fill = (s: RoleStyle) => /gradient\(/.test(s.background ?? s["background-image"] ?? "") || Boolean(colorOf(s["background-color"]) ?? colorOf((s.background ?? "").replace(/url\([^)]*\)/g, "")));
  const line = (s: RoleStyle) => Boolean(colorOf(s["border-color"]) ?? colorOf(s.border ?? "")) && !/^(none|0)/.test(s.border ?? "");
  const main = ctas.find(fill) ?? ctas.find(line);
  if (!main) return out;
  const look = (s: RoleStyle) => `${s.background ?? ""}|${s["background-color"] ?? ""}|${s.border ?? ""}|${s.color ?? ""}`;
  const second = ctas.find((s) => s !== main && (fill(s) || line(s)) && look(s) !== look(main));
  return { ...out, button: main, ...(second ? { buttonSecondary: second } : {}) };
}

/** Which site builder or CSS framework made the page, from tell-tale names. */
export function frameworkOf(css: string, html = ""): string[] {
  const s = css.slice(0, 2_000_000) + html.slice(0, 400_000);
  const tells: [string, RegExp][] = [
    ["Tailwind", /--tw-[\w-]+:/],
    ["Framer", /framerusercontent|--framer-/],
    ["Webflow", /\.w-(nav|container|button)\b|webflow/i],
    ["Bootstrap", /--bs-[\w-]+:/],
    ["Shopify", /cdn\.shopify\.com/],
    ["WordPress", /wp-content|wp-block-/],
    ["Wix", /static\.wixstatic\.com/],
    ["Squarespace", /squarespace/i],
    ["HubSpot", /hs-sites|hubspotusercontent/],
  ];
  return tells.filter(([, re]) => re.test(s)).map(([n]) => n);
}

export type CssEvidence = {
  vars: [string, string][]; // brand-looking variables, resolved
  roles: Record<string, RoleStyle>;
  faces: FontFace[];
  textColors: [string, number][];
  bgColors: [string, number][];
  borderColors: [string, number][];
  sizes: [string, number][];
  radii: [string, number][];
  shadows: [string, number][];
  gradients: [string, number][];
  breakpoints: [string, number][];
  frameworks: string[];
  rules: number;
};

/** Everything learnKit measures from the CSS, in one pass. */
export function cssEvidence(css: string, opts: { base?: string; html?: string; nodes?: Record<string, PageNode> } = {}): CssEvidence {
  const rules = parseCss(css);
  const vars = rootVars(rules);
  const text: string[] = [];
  const bg: string[] = [];
  const border: string[] = [];
  const sizes: string[] = [];
  const radii: string[] = [];
  const shadows: string[] = [];
  const gradients: string[] = [];
  const bps: string[] = [];
  for (const r of rules) {
    if (r.selector === "@font-face") continue;
    const bp = r.media?.match(/(?:min|max)-width:\s*(\d+(?:\.\d+)?(?:px|em|rem))/)?.[1];
    if (bp) bps.push(bp);
    for (const [k, raw] of Object.entries(r.decls)) {
      if (k.startsWith("--")) continue;
      const v = resolveVars(raw, vars);
      if (k === "color") {
        const c = colorOf(v);
        if (c) text.push(c);
      } else if (k === "background" || k === "background-color") {
        if (/gradient\(/.test(v)) gradients.push(v.replace(/\s+/g, " ").slice(0, 140));
        const c = colorOf(v.replace(/[\w-]*gradient\([^)]*(\([^)]*\)[^)]*)*\)/g, ""));
        if (c) bg.push(c);
      } else if (k.startsWith("border") && !k.includes("radius") && !k.includes("width") && !k.includes("style")) {
        const c = colorOf(v);
        if (c) border.push(c);
      } else if (k === "font-size" && /^[\d.]+(px|rem|em)$/.test(v.trim())) sizes.push(v.trim());
      else if (k === "border-radius" && v.trim() !== "0" && v.length < 30) radii.push(v.trim());
      else if (k === "box-shadow" && v !== "none" && v.length < 160) shadows.push(v.replace(/\s+/g, " "));
    }
  }
  const brandVar = /(brand|primary|accent|secondary|color|bg|background|text|fg|ink|surface|border|radius|font|heading|button|btn|link|shadow)/i;
  const resolved = Object.entries(vars)
    .filter(([k]) => brandVar.test(k) && !/^--(tw|bs-gutter|framer-(?!.*color))/.test(k))
    .map(([k, v]) => [k, resolveVars(v, vars).replace(/\s+/g, " ").slice(0, 80)] as [string, string])
    .filter(([, v]) => v && v.length < 80)
    .slice(0, 80);
  return {
    vars: resolved,
    // The page's own elements win over generic rules for h1, a or .btn.
    roles: { ...roleStyles(rules, vars), ...pickButtons(computedRoles(rules, vars, opts.nodes ?? {})) },
    faces: fontFaces(rules, opts.base),
    textColors: count(text, 14),
    bgColors: count(bg, 14),
    borderColors: count(border, 8),
    sizes: count(sizes, 14),
    radii: count(radii, 8),
    shadows: count(shadows, 6),
    gradients: count(gradients, 4),
    breakpoints: count(bps, 6),
    frameworks: frameworkOf(css, opts.html),
    rules: rules.length,
  };
}

/** The evidence as short lines for the agent's prompt. */
export function evidenceText(e: CssEvidence): string {
  const pairs = (xs: [string, number][]) => xs.map(([v, n]) => `${v} (${n})`).join(", ") || "none";
  const role = (k: string) => {
    const s = e.roles[k];
    return s ? Object.entries(s).map(([p, v]) => `${p}: ${v}`).join("; ") : "not found";
  };
  return [
    `Rules read: ${e.rules}. Built with: ${e.frameworks.join(", ") || "unknown"}.`,
    `Brand CSS variables (resolved): ${e.vars.map(([k, v]) => `${k}: ${v}`).join("; ") || "none"}`,
    `Text colors (times used): ${pairs(e.textColors)}`,
    `Background colors: ${pairs(e.bgColors)}`,
    `Border colors: ${pairs(e.borderColors)}`,
    `Gradients: ${pairs(e.gradients)}`,
    `Font sizes: ${pairs(e.sizes)}`,
    `Corner radii: ${pairs(e.radii)}`,
    `Shadows: ${pairs(e.shadows)}`,
    `Breakpoints: ${pairs(e.breakpoints)}`,
    `@font-face: ${e.faces.map((f) => `${f.family} ${f.weight}${f.style !== "normal" ? ` ${f.style}` : ""}`).join(", ") || "none"}`,
    ...["body", "h1", "h2", "h3", "p", "link", "button", "buttonSecondary", "input", "card", "nav", "footer"].map((k) => `${k} style: ${role(k)}`),
  ].join("\n");
}
