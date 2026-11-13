// AI Shopping's numbers (docs/ai-shopping-plan.md, sections 4.3, 6, 7 and 8). Pure, no network, so tests can count
// them by hand. A run's matched cards become one shop_daily row per day, engine and prompt; screens add rows up.

export type CardVerdict = "matched" | "doubt" | "brand" | "other" | null;

/** One card of one run, after matching. */
export type RunCard = {
  block: number;
  position: number;
  verdict: CardVerdict;
  productId: string | null;
  rival: string | null;
  store: string | null;
  own: boolean;
  flags: string[];
  links: string[];
};
export type RunInput = { day: string; engine: string; promptId: string; cards: RunCard[]; sources: string[] };

/** How one brand, product or rival did: runs it showed in, its cards, and sums for position and visibility. */
export type Entity = { runs: number; cards: number; pos: number; vis: number };
export type DailyStats = {
  you: Entity;
  products: Record<string, Entity>;
  rivals: Record<string, Entity>;
  stores: Record<string, { cards: number; you: number; own: number }>;
  flags: Record<string, number>;
  sources: Record<string, number>;
};
export type DailyRow = { day: string; engine: string; prompt_id: string; runs: number; card_runs: number; cards: number; stats: DailyStats };

const zero = (): Entity => ({ runs: 0, cards: 0, pos: 0, vis: 0 });
const empty = (): DailyStats => ({ you: zero(), products: {}, rivals: {}, stores: {}, flags: {}, sources: {} });
const SOURCES_KEPT = 40;

/** A card's place in the answer: the first row's cards come first. */
export function ordered(cards: RunCard[]): RunCard[] {
  return [...cards].sort((a, b) => a.block - b.block || a.position - b.position);
}

/** Visibility weight of a place: position 1 counts 1, position 3 counts 0.5. */
export const weight = (position: number) => 1 / Math.log2(1 + position);

const isYours = (c: RunCard) => c.verdict === "matched" || c.verdict === "doubt" || c.verdict === "brand";

function addEntity(e: Entity, cards: number, best: number) {
  e.runs++;
  e.cards += cards;
  e.pos += best;
  e.vis += weight(best);
}

/** Roll a set of runs into one row per day, engine and prompt. */
export function rollup(runs: RunInput[]): DailyRow[] {
  const rows = new Map<string, DailyRow>();
  for (const r of runs) {
    const k = `${r.day}|${r.engine}|${r.promptId}`;
    const row = rows.get(k) ?? { day: r.day, engine: r.engine, prompt_id: r.promptId, runs: 0, card_runs: 0, cards: 0, stats: empty() };
    rows.set(k, row);
    row.runs++;
    const cards = ordered(r.cards);
    if (!cards.length) continue;
    row.card_runs++;
    row.cards += cards.length;
    const s = row.stats;
    const place = new Map(cards.map((c, i) => [c, i + 1]));

    const mine = cards.filter(isYours);
    if (mine.length) {
      addEntity(s.you, mine.length, place.get(mine[0])!);
      // The pages behind the brand's cards: their own cited pages first, then the answer's. Each once per run.
      for (const u of new Set([...mine.flatMap((c) => c.links), ...r.sources])) s.sources[u] = (s.sources[u] ?? 0) + 1;
    }
    const byProduct = new Map<string, RunCard[]>();
    for (const c of cards) if (c.verdict === "matched" && c.productId) byProduct.set(c.productId, [...(byProduct.get(c.productId) ?? []), c]);
    for (const [id, list] of byProduct) addEntity((s.products[id] ??= zero()), list.length, place.get(list[0])!);
    const byRival = new Map<string, RunCard[]>();
    for (const c of cards) if (c.verdict === "other" && c.rival) byRival.set(c.rival, [...(byRival.get(c.rival) ?? []), c]);
    for (const [name, list] of byRival) addEntity((s.rivals[name] ??= zero()), list.length, place.get(list[0])!);
    for (const c of cards) {
      if (!c.store) continue;
      const st = (s.stores[c.store] ??= { cards: 0, you: 0, own: 0 });
      st.cards++;
      if (isYours(c)) st.you++;
      if (c.own) st.own++;
    }
    for (const c of cards) for (const f of c.flags) s.flags[f] = (s.flags[f] ?? 0) + 1;
  }
  // Keep a row small: only the pages that backed the most runs.
  for (const row of rows.values()) {
    const top = Object.entries(row.stats.sources).sort((a, b) => b[1] - a[1]).slice(0, SOURCES_KEPT);
    row.stats.sources = Object.fromEntries(top);
  }
  return [...rows.values()];
}

// ─────────────── Adding rows up ───────────────

export type Totals = {
  runs: number;
  cardRuns: number;
  cards: number;
  you: Entity;
  products: Map<string, Entity>;
  rivals: Map<string, Entity>;
  stores: Map<string, { cards: number; you: number; own: number }>;
  flags: Map<string, number>;
  sources: Map<string, number>;
  prompts: Map<string, { runs: number; cardRuns: number; you: Entity }>;
};

const plus = (a: Entity, b: Entity) => {
  a.runs += b.runs;
  a.cards += b.cards;
  a.pos += b.pos;
  a.vis += b.vis;
};

export function total(rows: DailyRow[]): Totals {
  const t: Totals = { runs: 0, cardRuns: 0, cards: 0, you: zero(), products: new Map(), rivals: new Map(), stores: new Map(), flags: new Map(), sources: new Map(), prompts: new Map() };
  for (const r of rows) {
    t.runs += r.runs;
    t.cardRuns += r.card_runs;
    t.cards += r.cards;
    plus(t.you, r.stats.you);
    for (const [k, e] of Object.entries(r.stats.products)) plus(t.products.get(k) ?? (t.products.set(k, zero()), t.products.get(k)!), e);
    for (const [k, e] of Object.entries(r.stats.rivals)) plus(t.rivals.get(k) ?? (t.rivals.set(k, zero()), t.rivals.get(k)!), e);
    for (const [k, v] of Object.entries(r.stats.stores)) {
      const s = t.stores.get(k) ?? { cards: 0, you: 0, own: 0 };
      s.cards += v.cards;
      s.you += v.you;
      s.own += v.own;
      t.stores.set(k, s);
    }
    for (const [k, v] of Object.entries(r.stats.flags)) t.flags.set(k, (t.flags.get(k) ?? 0) + v);
    for (const [k, v] of Object.entries(r.stats.sources)) t.sources.set(k, (t.sources.get(k) ?? 0) + v);
    const p = t.prompts.get(r.prompt_id) ?? { runs: 0, cardRuns: 0, you: zero() };
    p.runs += r.runs;
    p.cardRuns += r.card_runs;
    plus(p.you, r.stats.you);
    t.prompts.set(r.prompt_id, p);
  }
  return t;
}

// ─────────────── How sure (section 4.3) ───────────────

export const MIN_RUNS = 10;
export type Rate = { k: number; n: number; p: number; lo: number; hi: number };

/** k of n as a share with its 95% Wilson interval, or null under 10 runs ("Too few runs"). */
export function rate(k: number, n: number, z = 1.96): Rate | null {
  if (n < MIN_RUNS) return null;
  const p = k / n;
  const z2 = z * z;
  const center = (k + z2 / 2) / (n + z2);
  const margin = (z * Math.sqrt((k * (n - k)) / n + z2 / 4)) / (n + z2);
  return { k, n, p, lo: Math.max(0, center - margin), hi: Math.min(1, center + margin) };
}

/** Two-proportion z-test. A change counts only at p < 0.05 with at least 30 runs on each side. */
export function changed(k1: number, n1: number, k2: number, n2: number): { z: number; p: number; real: boolean } {
  if (!n1 || !n2) return { z: 0, p: 1, real: false };
  const pooled = (k1 + k2) / (n1 + n2);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
  const z = se ? (k2 / n2 - k1 / n1) / se : 0;
  const p = 2 * (1 - normalCdf(Math.abs(z)));
  return { z, p, real: n1 >= 30 && n2 >= 30 && p < 0.05 };
}

/** Standard normal CDF (Abramowitz and Stegun 7.1.26, error under 1.5e-7). */
export function normalCdf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

// ─────────────── The numbers (section 6) ───────────────

export type Numbers = {
  cardRate: Rate | null;
  productShare: Rate | null;
  shelfShare: Rate | null;
  avgPosition: number | null;
  visibility: number | null;
  promptsIn: number;
  prompts: number;
  productsSeen: number;
};

/** Every run counts the same; runs without cards are left out of shares (the card rate shows them). */
export function numbers(t: Totals): Numbers {
  return {
    cardRate: rate(t.cardRuns, t.runs),
    productShare: rate(t.you.runs, t.cardRuns),
    shelfShare: rate(t.you.cards, t.cards),
    avgPosition: t.you.runs ? t.you.pos / t.you.runs : null,
    visibility: t.cardRuns >= MIN_RUNS ? t.you.vis / t.cardRuns : null,
    promptsIn: [...t.prompts.values()].filter((p) => p.you.runs > 0).length,
    prompts: t.prompts.size,
    productsSeen: [...t.products.values()].filter((p) => p.runs > 0).length,
  };
}

/** A brand's, product's or rival's share and place, from its totals. */
export function entityNumbers(e: Entity, cardRuns: number) {
  return { share: rate(e.runs, cardRuns), avgPosition: e.runs ? e.pos / e.runs : null, visibility: cardRuns >= MIN_RUNS ? e.vis / cardRuns : null };
}

/** Monday of a day's week, as YYYY-MM-DD. */
export function weekOf(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** Product share by week for the brand and the named rivals. Null where a week has under 10 runs with cards. */
export function weekly(rows: DailyRow[], rivals: string[]): { week: string; you: number | null; rivals: Record<string, number | null> }[] {
  const weeks = new Map<string, DailyRow[]>();
  for (const r of rows) weeks.set(weekOf(r.day), [...(weeks.get(weekOf(r.day)) ?? []), r]);
  return [...weeks.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([week, list]) => {
      const t = total(list);
      const share = (e: Entity | undefined) => rate(e?.runs ?? 0, t.cardRuns)?.p ?? null;
      return { week, you: share(t.you), rivals: Object.fromEntries(rivals.map((n) => [n, share(t.rivals.get(n))])) };
    });
}

// ─────────────── Stores and prices (section 7) ───────────────

const KNOWN: [RegExp, string][] = [
  [/(^|\.)amazon\.[a-z.]+$/, "Amazon"],
  [/(^|\.)walmart\.com$/, "Walmart"],
  [/(^|\.)target\.com$/, "Target"],
  [/(^|\.)bestbuy\.com$/, "Best Buy"],
  [/(^|\.)ebay\.[a-z.]+$/, "eBay"],
  [/(^|\.)costco\.com$/, "Costco"],
  [/(^|\.)homedepot\.com$/, "Home Depot"],
  [/(^|\.)lowes\.com$/, "Lowe's"],
  [/(^|\.)macys\.com$/, "Macy's"],
  [/(^|\.)nordstrom\.com$/, "Nordstrom"],
  [/(^|\.)kohls\.com$/, "Kohl's"],
  [/(^|\.)sephora\.com$/, "Sephora"],
  [/(^|\.)ulta\.com$/, "Ulta Beauty"],
  [/(^|\.)rei\.com$/, "REI"],
  [/(^|\.)zappos\.com$/, "Zappos"],
  [/(^|\.)dickssportinggoods\.com$/, "Dick's Sporting Goods"],
  [/(^|\.)wayfair\.com$/, "Wayfair"],
  [/(^|\.)etsy\.com$/, "Etsy"],
  [/(^|\.)chewy\.com$/, "Chewy"],
  [/(^|\.)cvs\.com$/, "CVS"],
  [/(^|\.)walgreens\.com$/, "Walgreens"],
];
const NAMES: Record<string, string> = { "amazon.com": "Amazon", amazon: "Amazon", "walmart.com": "Walmart", "target.com": "Target", "best buy": "Best Buy", ebay: "eBay", "ulta beauty": "Ulta Beauty", ulta: "Ulta Beauty" };

/**
 * One name per store: "Amazon.com", "amazon.com" and "Amazon - Seller X" are Amazon; "Gymshark US" is Gymshark;
 * "Away: Built for modern travel" is Away. Null when the card names no store.
 */
export function storeName(seller: string | null | undefined, domain: string | null | undefined): string | null {
  const host = (domain ?? "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  for (const [re, name] of KNOWN) if (host && re.test(host)) return name;
  let s = (seller ?? "").trim();
  if (s) {
    s = s.split(/\s+[-–—|]\s+|:\s/)[0].replace(/\s*\+\s*others?$/i, "").trim();
    s = s.replace(/\.(com|co\.uk|ca|net|org|us)$/i, "").replace(/\s+(us|usa|uk|official( store| site)?|store|shop)$/i, "").trim();
    const known = NAMES[s.toLowerCase()];
    if (known) return known;
    for (const [re, name] of KNOWN) if (re.test(`${s.toLowerCase()}.com`)) return name;
    if (s) return s;
  }
  if (!host) return null;
  const base = host.split(".").slice(-2)[0] === "co" ? host.split(".").slice(-3)[0] : host.split(".").slice(-2)[0];
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : null;
}

export type PriceInput = {
  price: number | null;
  currency: string | null;
  own: boolean;
  retailer: boolean;
  retailersSet: boolean;
  catalogMin: number | null;
  catalogMax: number | null;
  catalogCurrency: string | null;
  inStock: boolean | null;
  floorPct: number | null;
};

/**
 * Flags for one matched card (section 7): own_price (your store shows another price: stale data on your side),
 * price_gap (another store's price differs: information, not an error), below_floor, out_of_stock and reseller.
 */
export function priceFlags(x: PriceInput): string[] {
  const flags: string[] = [];
  if (!x.own && x.retailersSet && !x.retailer) flags.push("reseller");
  if (x.inStock === false) flags.push("out_of_stock");
  const p = x.price;
  if (p === null || !x.catalogMin || (x.currency && x.catalogCurrency && x.currency.toUpperCase() !== x.catalogCurrency.toUpperCase())) return flags;
  const lo = x.catalogMin;
  const hi = x.catalogMax ?? lo;
  const off = p < lo ? lo - p : p > hi ? p - hi : 0;
  if (off > Math.max(1, 0.02 * lo)) flags.push(x.own ? "own_price" : "price_gap");
  if (x.floorPct && p < (lo * x.floorPct) / 100) flags.push("below_floor");
  return flags;
}

// ─────────────── Reasons (section 8) ───────────────

const FILLER = new Set(["the", "and", "for", "with", "its", "it's", "this", "that", "are", "has", "have", "from", "you", "your", "a", "an", "of", "to", "in", "on", "is", "it", "as", "at", "by", "or", "but", "be", "so"]);
const wordsOf = (s: string) => s.toLowerCase().replace(/[’']/g, "'").match(/[a-z0-9$][a-z0-9$'.-]*/g)?.map((w) => w.replace(/[.'-]+$/, "")) ?? [];

/** A one-line reason counts only when every word that matters in it comes from the AI's own text. */
export function reasonOk(line: string, source: string): boolean {
  const have = new Set(wordsOf(source));
  const need = wordsOf(line).filter((w) => w.length >= 3 && !FILLER.has(w));
  return need.length > 0 && line.length <= 120 && need.every((w) => have.has(w) || have.has(w.replace(/s$/, "")) || have.has(`${w}s`));
}
