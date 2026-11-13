// AI Shopping: match a product card to the brand's catalog (docs/ai-shopping-plan.md, section 5). Pure, no network.
// A wrong match is worse than none, so a card is only matched when one model is clearly it; anything close goes to
// "Is this yours?" and anything else counts for the brand without a product.
//
// Real stores list each color (or shade, or gender) as its own product: "The Medium in Coast Blue", "Pro Filt'r
// Foundation — #485", "Men's Wool Runner - Natural Grey". Products that differ only in that are one model, and cards
// match models.

export type MatchProduct = { id: string; title: string; price_min: number | null; price_max: number | null; url?: string | null; handle?: string | null; brand?: string | null; aliases?: string[]; gtins?: string[]; mpns?: string[] };
export type MatchBrand = { name: string; aliases?: string[]; domains?: string[] };
export type Model = { key: string; title: string; tokens: string[]; products: string[]; priceMin: number | null; priceMax: number | null; handles: string[]; markers: string[]; gtins: string[]; mpns: string[] };
export type MatchIndex = { brand: { names: string[][]; tokens: Set<string>; domains: string[] }; models: Model[]; vocab: Set<string>; variantVocab: Set<string>; df: Map<string, number> };
export type MatchCard = { title: string; seller?: string | null; domain?: string | null; url?: string | null; price?: number | null };
export type Verdict = "matched" | "doubt" | "brand" | "other";
export type MatchResult = { verdict: Verdict; model: Model | null; score: number; how: "id" | "link" | "title" | "none"; why: string };

export const MATCHED = 0.9;
export const DOUBT = 0.6;

// ─────────────── Words ───────────────

const STOP = new Set(["the", "a", "an", "and", "of", "for", "by", "with", "x", "new", "our", "in", "to", "from", "on", "at"]);
/** Words that name who a product is for. Men's and women's versions of one shoe are one model; kids' are not. */
const GENDER = new Set(["men", "women", "mens", "womens", "unisex", "male", "female"]);
/** Words that make a card a different thing from a single product: bundles, sets of several, samples, used goods. */
const MARKERS: Record<string, string> = { bundle: "bundle", "&": "bundle", "+": "bundle", or: "or", duo: "duo", trio: "trio", kit: "kit", sample: "sample", mini: "mini", deluxe: "sample", refurbished: "used", renewed: "used", used: "used", "pre-owned": "used", open: "used", travel: "travel" };
const MULTI = /\b(set of \d+|pack of \d+|\d+[- ]?(pack|pk|piece|pc|pairs?|count|ct)\b|twin pack|two pack|2 pack|\d+ ?x ?\d*(?=\s|$))/;
/** Common colors and sizes, dropped from cards when the catalog doesn't use them in a model's name. */
const GENERIC = new Set(
  "black white grey gray navy blue red green pink purple brown beige cream ivory tan olive yellow orange gold silver charcoal natural khaki teal maroon burgundy lilac lavender sand stone multi marl heather light dark twin full queen king cal california split xl xxl xs small large extra regular tall short petite wide narrow size sizes".split(" "),
);

function clean(s: string) {
  return s
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[™®©]/g, "")
    .replace(/&amp;/g, "&")
    .replace(/\b\d+\s*x\s*(?=\d)/g, " ") // "2 x 0.12 oz"
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:fl\.?\s*oz|oz|ml|l|g|kg|lbs?|mm|cm|ct|count)\b\.?/g, " ") // sizes and amounts
    .replace(/\bsize\s+[a-z0-9.\/]+/g, " ")
    .replace(/#\s*\d+\w*/g, " "); // shade numbers
}

const canon = (w: string) => {
  let t = w.replace(/^[-.'#]+|[-.'#]+$/g, "");
  if (t.endsWith("'s")) t = t.slice(0, -2);
  t = t.replace(/'$/, "");
  if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss") && !/\d/.test(t)) t = t.slice(0, -1);
  return t;
};

/** Raw words of a title, before stop words and the brand are taken out. Punctuation goes; +, & and $ stay. */
function words(s: string): string[] {
  return clean(s)
    .replace(/[()[\]{},;:!?|"“”*]/g, " ")
    .replace(/\s[-–—]+\s|[—–]/g, " ")
    .replace(/\//g, " ")
    .split(/\s+/)
    .map(canon)
    .filter(Boolean);
}

/** A model generation: "2", "3", "v2", "2.0", "gen". Cards and models must agree on these. */
const GEN = /^(v?\d{1,2}(\.\d)?|gen\d?|\d{1,2}")$/;

function markersOf(title: string, ws: string[]): string[] {
  const out = new Set<string>();
  for (const w of ws) if (MARKERS[w]) out.add(MARKERS[w]);
  if (MULTI.test(clean(title))) out.add("multi");
  return [...out];
}

// ─────────────── The catalog's models ───────────────

const SEP_DASH = /\s+[-–—|]\s+|\s*[—–]\s*/;

/** Split "Name - Color", "Name — #485" or "Name in Coast Blue" into the name and the variant. */
function splitTitle(t: string): { name: string; variant: string | null; inSplit: boolean } {
  const dash = t.split(SEP_DASH);
  if (dash.length > 1) return { name: dash[0], variant: dash.slice(1).join(" "), inSplit: false };
  const i = t.toLowerCase().lastIndexOf(" in ");
  if (i > 0) return { name: t.slice(0, i), variant: t.slice(i + 4), inSplit: true };
  return { name: t, variant: null, inSplit: false };
}

function brandWords(brand: MatchBrand, products: MatchProduct[]): string[][] {
  const names = [brand.name, ...(brand.aliases ?? []), ...products.map((p) => p.brand ?? "")].map((n) => n.trim()).filter((n) => n.length >= 2);
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const n of names) {
    const w = words(n).filter((x) => !STOP.has(x));
    const k = w.join(" ");
    if (w.length && !seen.has(k)) {
      seen.add(k);
      out.push(w);
    }
  }
  // Longest first, so "fenty beauty" goes before "fenty".
  return out.sort((a, b) => b.length - a.length);
}

/** Take the brand's name off the front of a title's words (and anywhere it appears whole). */
function dropBrand(ws: string[], names: string[][]): string[] {
  let out = ws;
  for (const n of names) {
    for (let i = 0; i + n.length <= out.length; i++) {
      if (n.every((w, j) => out[i + j] === w)) {
        out = [...out.slice(0, i), ...out.slice(i + n.length)];
        i--;
      }
    }
  }
  return out;
}

export function buildIndex(products: MatchProduct[], brand: MatchBrand): MatchIndex {
  const live = products.filter((p) => p.title?.trim() && !(p.price_max !== null && p.price_max !== undefined && Number(p.price_max) <= 0));
  const names = brandWords(brand, live);
  // A " in " split counts only when the name has several variants or the variant follows several names.
  const parts = live.map((p) => ({ p, ...splitTitle(p.title.replace(/\s*\([^)]*\)\s*$/, "").trim()) }));
  const perName = new Map<string, Set<string>>();
  const perVariant = new Map<string, Set<string>>();
  for (const x of parts) {
    if (!x.variant) continue;
    const n = x.name.toLowerCase();
    const v = x.variant.toLowerCase();
    if (!perName.has(n)) perName.set(n, new Set());
    perName.get(n)!.add(v);
    if (!perVariant.has(v)) perVariant.set(v, new Set());
    perVariant.get(v)!.add(n);
  }
  const variantVocab = new Set<string>();
  const groups = new Map<string, { titles: Map<string, number>; ps: MatchProduct[]; tokens: string[]; markers: string[] }>();
  for (const x of parts) {
    let name = x.name;
    if (x.variant && x.inSplit) {
      const generic = words(x.variant).every((w) => GENERIC.has(w));
      if (!((perName.get(x.name.toLowerCase())?.size ?? 0) >= 2 || (perVariant.get(x.variant.toLowerCase())?.size ?? 0) >= 2 || generic)) name = `${x.name} in ${x.variant}`;
    }
    if (name !== x.name || x.variant) for (const w of words(x.variant ?? "")) variantVocab.add(w);
    if (name !== x.name) for (const w of words(x.variant ?? "")) variantVocab.delete(w);
    const raw = words(name);
    const ws = dropBrand(raw, names).filter((w) => !GENDER.has(w));
    const tokens = [...new Set(ws.filter((w) => !STOP.has(w) && !MARKERS[w]))];
    if (!tokens.length) continue;
    const markers = markersOf(name, ws);
    const key = [...[...tokens].sort(), ...markers.sort().map((m) => `#${m}`)].join(" ");
    const g = groups.get(key) ?? { titles: new Map<string, number>(), ps: [] as MatchProduct[], tokens, markers };
    const display = name.replace(/^(men's|women's|mens|womens)\s+/i, "").trim();
    g.titles.set(display, (g.titles.get(display) ?? 0) + 1);
    g.ps.push(x.p);
    groups.set(key, g);
  }
  const models: Model[] = [...groups.entries()].map(([key, g]) => {
    const prices = g.ps.flatMap((p) => [p.price_min, p.price_max]).filter((n): n is number => typeof n === "number" && n > 0).map(Number);
    return {
      key,
      title: [...g.titles.entries()].sort((a, b) => b[1] - a[1])[0][0],
      tokens: g.tokens,
      products: g.ps.map((p) => p.id).sort(),
      priceMin: prices.length ? Math.min(...prices) : null,
      priceMax: prices.length ? Math.max(...prices) : null,
      handles: g.ps.map((p) => p.handle ?? "").filter(Boolean),
      markers: g.markers,
      gtins: [...new Set(g.ps.flatMap((p) => p.gtins ?? []))],
      mpns: [...new Set(g.ps.flatMap((p) => (p.mpns ?? []).map((m) => m.toLowerCase().replace(/[\s-]/g, ""))))],
    };
  });
  const vocab = new Set(models.flatMap((m) => m.tokens));
  for (const w of vocab) variantVocab.delete(w);
  const df = new Map<string, number>();
  for (const m of models) for (const t of m.tokens) df.set(t, (df.get(t) ?? 0) + 1);
  const domains = (brand.domains ?? []).map((d) => d.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "")).filter(Boolean);
  return { brand: { names, tokens: new Set(names.flat()), domains }, models, vocab, variantVocab, df };
}

// ─────────────── One card ───────────────

const hostOf = (u: string | null | undefined) => {
  if (!u) return "";
  try {
    return new URL(u).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return u.toLowerCase().replace(/^www\./, "");
  }
};
const onDomain = (host: string, domains: string[]) => Boolean(host) && domains.some((d) => host === d || host.endsWith(`.${d}`));

/** True when the card is the brand's: its name in the title, the store named after it, or a link to its own site. */
export function namesBrand(card: MatchCard, idx: MatchIndex): boolean {
  const ws = words(card.title);
  const has = (list: string[]) => idx.brand.names.some((n) => list.some((_, i) => n.every((w, j) => list[i + j] === w)));
  if (has(ws)) return true;
  const seller = words(card.seller ?? "");
  if (seller.length && idx.brand.names.some((n) => n.every((w, j) => seller[j] === w))) return true;
  return onDomain(hostOf(card.domain), idx.brand.domains) || onDomain(hostOf(card.url), idx.brand.domains);
}

/** The card's words that say which product it is: brand, sizes, colors and filler taken out. */
export function cardTokens(card: MatchCard, idx: MatchIndex): { tokens: string[]; markers: string[] } {
  const ws = dropBrand(words(card.title), idx.brand.names).filter((w) => !GENDER.has(w));
  const markers = markersOf(card.title, ws);
  const tokens = ws.filter((w) => {
    if (STOP.has(w) || MARKERS[w]) return false;
    if (idx.vocab.has(w)) return true;
    if (idx.variantVocab.has(w) || GENERIC.has(w)) return false; // a color, shade or size the catalog uses as a variant
    if (/^\d{3,}$/.test(w)) return false; // shade or style numbers
    return true;
  });
  return { tokens: [...new Set(tokens)], markers };
}

const idf = (idx: MatchIndex, t: string) => Math.log(1 + idx.models.length / (1 + (idx.df.get(t) ?? 0)));

/** Price check: a card under half or over twice the model's price is likely a bundle, a used one or another product. */
function priceOff(card: MatchCard, m: Model): boolean {
  const p = Number(card.price);
  if (!p || p <= 0 || !m.priceMin || !m.priceMax) return false;
  return p < m.priceMin * 0.5 || p > m.priceMax * 2;
}

/**
 * Match one card. remembered is a person's (or an earlier exact) decision for this card's ID: a product ID, or null
 * for "not ours". picture is the picture check's nudge (+0.1, 0 or -0.1).
 */
export function matchCard(card: MatchCard, idx: MatchIndex, opts: { remembered?: string | null; picture?: number } = {}): MatchResult {
  const modelOf = (productId: string) => idx.models.find((m) => m.products.includes(productId)) ?? null;
  if (opts.remembered === null) return { verdict: "other", model: null, score: 1, how: "id", why: "Marked not ours" };
  if (opts.remembered) {
    const m = modelOf(opts.remembered);
    if (m) return { verdict: "matched", model: m, score: 1, how: "id", why: "Remembered" };
  }
  if (!namesBrand(card, idx)) return { verdict: "other", model: null, score: 0, how: "none", why: "Another brand" };

  // Own store link: the card opens one of the catalog's product pages.
  const host = hostOf(card.url);
  if (card.url && onDomain(host, idx.brand.domains)) {
    try {
      const path = new URL(card.url).pathname.toLowerCase();
      const handle = /\/products\/([^/?#]+)/.exec(path)?.[1];
      const m = handle ? idx.models.find((x) => x.handles.some((h) => h.toLowerCase() === handle)) : null;
      if (m) return { verdict: "matched", model: m, score: 1, how: "link", why: "Own store link" };
    } catch {
      // Not a link.
    }
  }

  const { tokens, markers } = cardTokens(card, idx);
  if (!tokens.length) return { verdict: "brand", model: null, score: 0.5, how: "none", why: "No product words" };
  const T = new Set(tokens);
  const genOk = (m: Model) => tokens.filter((t) => GEN.test(t)).every((t) => m.tokens.includes(t)) && m.tokens.filter((t) => GEN.test(t)).every((t) => T.has(t));
  // A bundle card only matches a bundle model, and a single product only a single one.
  const markersOk = (m: Model) => markers.length === m.markers.length && markers.every((k) => m.markers.includes(k));

  // Full: every word of the model is on the card. The most specific full model wins, but only when the card carries
  // none of the words that set a more specific sibling apart (that would make it the sibling, or unclear).
  const full = idx.models.filter((m) => m.tokens.every((t) => T.has(t)) && genOk(m) && markersOk(m));
  const supersetsOf = (m: Model) => idx.models.filter((s) => s !== m && s.tokens.length > m.tokens.length && m.tokens.every((t) => s.tokens.includes(t)));
  const clear = full.filter((m) => !supersetsOf(m).some((s) => s.tokens.some((t) => !m.tokens.includes(t) && T.has(t) && !full.includes(s))));
  const best = [...clear].sort((a, b) => b.tokens.length - a.tokens.length);
  // Words on the card that name a close sibling (one sharing half the model's words) are a reason for doubt;
  // words from unrelated products ("checked" from a lock set) are not.
  const siblingWords = (m: Model) => new Set(idx.models.filter((s) => s !== m && s.tokens.filter((t) => m.tokens.includes(t)).length * 2 >= m.tokens.length).flatMap((s) => s.tokens));
  const top = best[0];
  const rivals = top ? best.filter((m) => m !== top && m.tokens.length === top.tokens.length) : [];

  let model: Model | null = null;
  let unclear = false; // several models fit: ask, without suggesting one
  let score = 0.5;
  let why = "No model fits";
  if (top && !rivals.length) {
    model = top;
    const near = siblingWords(top);
    const extra = tokens.filter((t) => !top.tokens.includes(t) && near.has(t)).length;
    score = 0.95 - Math.min(0.09, extra * 0.03);
    why = extra ? "Model words, with others" : "Model words";
  } else if (top) {
    unclear = true;
    score = 0.7;
    why = "Two models fit";
  } else {
    // Partial: the card names fewer words than a model has. One model is a guess to ask about; several are unclear.
    const partial = idx.models.filter((m) => tokens.every((t) => m.tokens.includes(t)) && genOk(m) && markersOk(m));
    if (partial.length === 1) {
      const m = partial[0];
      const cover = tokens.reduce((n, t) => n + idf(idx, t), 0) / m.tokens.reduce((n, t) => n + idf(idx, t), 0);
      model = m;
      score = Math.min(0.85, 0.6 + 0.3 * cover);
      why = "Part of a model's name";
    } else if (partial.length > 1) {
      unclear = true;
      score = 0.65;
      why = `${partial.length} models fit`;
    }
  }
  if (model && priceOff(card, model)) {
    score -= 0.2;
    why += ", price far off";
  }
  if (model && opts.picture) score += opts.picture;
  score = Math.max(0, Math.min(1, Math.round(score * 100) / 100));
  const verdict: Verdict = model && score >= MATCHED ? "matched" : (model || unclear) && score >= DOUBT ? "doubt" : "brand";
  return { verdict, model: verdict === "brand" ? null : model, score, how: model || unclear ? "title" : "none", why };
}

// ─────────────── Remembering ───────────────

/**
 * The keys a card is remembered by, most exact first: Google's product ID (AI Mode), the store and its product ID
 * (ChatGPT), the link, and the card's product words (for ChatGPT cards that show only a name).
 */
export function idKeys(card: MatchCard & { gid?: string | null; productId?: string | null; engine?: string }, idx?: MatchIndex): string[] {
  const out: string[] = [];
  if (card.gid) out.push(`g:${card.gid}`);
  const host = hostOf(card.domain || card.url);
  if (card.productId && card.engine !== "aim" && host) out.push(`s:${host}|${card.productId}`);
  if (card.url && card.engine !== "aim") {
    try {
      const u = new URL(card.url);
      out.push(`u:${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "")}`);
    } catch {
      // Not a link.
    }
  }
  const ws = idx ? cardTokens(card, idx).tokens : words(card.title).filter((w) => !STOP.has(w));
  if (ws.length) out.push(`t:${[...new Set(ws)].sort().join(" ")}`);
  return out;
}

// ─────────────── Rivals (section 5.5) ───────────────

/** Leading runs of words that start at least `min` different product titles: the brands in the data. */
export function rivalDictionary(titles: string[], min = 3): Set<string> {
  const starts = new Map<string, Set<string>>();
  for (const t of new Set(titles)) {
    const ws = words(t);
    for (let n = 1; n <= Math.min(3, ws.length - 1); n++) {
      const k = ws.slice(0, n).join(" ");
      if (!starts.has(k)) starts.set(k, new Set());
      starts.get(k)!.add(ws.slice(n).join(" "));
    }
  }
  return new Set([...starts.entries()].filter(([k, v]) => v.size >= min && !STOP.has(k) && !/^\d/.test(k)).map(([k]) => k));
}

/** A rival card's brand: the longest leading run in the dictionary, or the store when the title starts with it. */
export function rivalName(card: MatchCard, dict: Set<string>): string | null {
  const ws = words(card.title);
  for (let n = Math.min(3, ws.length - 1); n >= 1; n--) {
    const k = ws.slice(0, n).join(" ");
    if (dict.has(k)) return properCase(card.title, n);
  }
  const seller = words(card.seller ?? "");
  if (seller.length && seller.every((w, i) => ws[i] === w)) return properCase(card.title, seller.length);
  return null;
}

/** A name Claude gave only counts when it appears in the title letter for letter. */
export const nameInTitle = (name: string, title: string) => Boolean(name.trim()) && title.toLowerCase().includes(name.trim().toLowerCase());

const properCase = (title: string, n: number) =>
  title
    .replace(/[()[\],]/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, n)
    .join(" ");

// ─────────────── Picture (section 5.3) ───────────────

/** A 64-bit difference hash from a 9×8 grayscale picture (72 values, row by row). */
export function dhash(gray: ArrayLike<number>): bigint {
  let h = BigInt(0);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) h = (h << BigInt(1)) | (gray[y * 9 + x] > gray[y * 9 + x + 1] ? BigInt(1) : BigInt(0));
  return h;
}
export function hamming(a: bigint, b: bigint): number {
  let x = a ^ b;
  let n = 0;
  while (x) {
    n += Number(x & BigInt(1));
    x >>= BigInt(1);
  }
  return n;
}
/** +0.1 for a close picture (10 bits or fewer apart), -0.1 for a far one (over 24), else 0. */
export const pictureNudge = (distance: number | null) => (distance === null ? 0 : distance <= 10 ? 0.1 : distance > 24 ? -0.1 : 0);

// ─────────────── Google product lookup (section 5.1, step 4) ───────────────

/** One product from DataForSEO's Merchant Google product info (product_info_element). */
export type LookupItem = { title?: string; url?: string; specifications?: { specification_name?: string; specification_value?: string }[] | null; sellers?: { title?: string; url?: string }[] | null };

/**
 * Settle a card in doubt from Google's product page: a seller link to one of the brand's own product pages, or a
 * GTIN, UPC, EAN or model number in the specifications that is in exactly one model. Anything else settles nothing.
 */
export function lookupMatch(item: LookupItem, idx: MatchIndex, gtin14: (v: string) => string | null): Model | null {
  for (const s of [{ url: item.url }, ...(item.sellers ?? [])]) {
    if (!s.url || !onDomain(hostOf(s.url), idx.brand.domains)) continue;
    try {
      const handle = /\/products\/([^/?#]+)/.exec(new URL(s.url).pathname.toLowerCase())?.[1];
      const m = handle ? idx.models.filter((x) => x.handles.some((h) => h.toLowerCase() === handle)) : [];
      if (m.length === 1) return m[0];
    } catch {
      // Not a link.
    }
  }
  for (const spec of item.specifications ?? []) {
    const name = (spec.specification_name ?? "").toLowerCase();
    const value = spec.specification_value ?? "";
    if (/gtin|upc|ean|isbn|barcode/.test(name)) {
      const g = gtin14(value);
      const m = g ? idx.models.filter((x) => x.gtins.includes(g)) : [];
      if (m.length === 1) return m[0];
    }
    if (/\b(mpn|model( number)?|part number|manufacturer part)\b/.test(name)) {
      const v = value.toLowerCase().replace(/[\s-]/g, "");
      const m = v.length >= 4 ? idx.models.filter((x) => x.mpns.includes(v)) : [];
      if (m.length === 1) return m[0];
    }
  }
  return null;
}
