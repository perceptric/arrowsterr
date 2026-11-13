import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { changed, entityNumbers, numbers, total, weekly, type DailyRow, type Numbers, type Rate } from "./shopNumbers";

// What the AI Shopping screens read (docs/ai-shopping-plan.md, section 6): the numbers for a range, the change since
// the range before, product share by week, the brand ranking, and the Products, Prompts, Stores and Sources tables.

const DAY_MS = 86_400_000;
const dayAgo = (n: number) => new Date(Date.now() - n * DAY_MS).toISOString().slice(0, 10);

async function rowsBetween(db: SupabaseClient, brandId: string, from: string, to: string): Promise<DailyRow[]> {
  const out: DailyRow[] = [];
  for (let start = 0; start < 50_000; start += 1000) {
    const { data, error } = await db.from("shop_daily").select("day, engine, prompt_id, runs, card_runs, cards, stats").eq("brand_id", brandId).gte("day", from).lt("day", to).range(start, start + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as DailyRow[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const top = <T,>(m: Map<T, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

export type ShopReport = Awaited<ReturnType<typeof shopReport>>;

export async function shopReport(db: SupabaseClient, brand: { id: string; name: string }, days: number, engine: "all" | "gpt" | "aim" = "all") {
  const now = dayAgo(-1);
  const from = dayAgo(days);
  const before = dayAgo(days * 2);
  const pick = (rows: DailyRow[]) => (engine === "all" ? rows : rows.filter((r) => r.engine === engine));
  const [cur, prev] = await Promise.all([rowsBetween(db, brand.id, from, now).then(pick), rowsBetween(db, brand.id, before, from).then(pick)]);
  const t = total(cur);
  const p = total(prev);
  const n = numbers(t);
  const was = numbers(p);
  const shareChange = changed(p.you.runs, p.cardRuns, t.you.runs, t.cardRuns);

  // The brand ranking: you and the rivals with the most runs.
  const rivals = [...t.rivals.entries()].sort((a, b) => b[1].runs - a[1].runs).slice(0, 8);
  const brands = [
    { name: brand.name, you: true, ...entityNumbers(t.you, t.cardRuns), before: p.cardRuns ? p.you.runs / p.cardRuns : null, change: changed(p.you.runs, p.cardRuns, t.you.runs, t.cardRuns) },
    ...rivals.map(([name, e]) => {
      const pe = p.rivals.get(name);
      return { name, you: false, ...entityNumbers(e, t.cardRuns), before: p.cardRuns ? (pe?.runs ?? 0) / p.cardRuns : null, change: changed(pe?.runs ?? 0, p.cardRuns, e.runs, t.cardRuns) };
    }),
  ].sort((a, b) => (b.share?.p ?? -1) - (a.share?.p ?? -1));

  // Products: every catalog product, seen or not, with what the cards showed.
  const [{ data: catalog }, { data: cards }, { data: reasons }] = await Promise.all([
    db.from("shop_catalog").select("id, title, url, image, price_min, price_max, currency, in_stock").eq("brand_id", brand.id).limit(5000),
    db.from("shop_cards").select("product_id, price, store, flags, rival, engine").eq("brand_id", brand.id).gte("day", from).not("run_id", "is", null).limit(50_000),
    db.from("shop_reasons").select("product_id, reason").eq("brand_id", brand.id),
  ]);
  const promptsOf = new Map<string, Set<string>>();
  for (const r of cur) for (const id of Object.keys(r.stats.products)) promptsOf.set(id, (promptsOf.get(id) ?? new Set()).add(r.prompt_id));
  const shown = new Map<string, { prices: number[]; stores: Map<string, number>; flags: Map<string, number> }>();
  const storeGaps = new Map<string, number>();
  for (const c of (cards ?? []).filter((x) => engine === "all" || x.engine === engine)) {
    const flags = (c.flags as string[]) ?? [];
    if (c.store && flags.includes("price_gap")) storeGaps.set(c.store as string, (storeGaps.get(c.store as string) ?? 0) + 1);
    if (!c.product_id) continue;
    const s = shown.get(c.product_id as string) ?? { prices: [] as number[], stores: new Map<string, number>(), flags: new Map<string, number>() };
    if (c.price !== null) s.prices.push(Number(c.price));
    if (c.store) s.stores.set(c.store as string, (s.stores.get(c.store as string) ?? 0) + 1);
    for (const f of flags) s.flags.set(f, (s.flags.get(f) ?? 0) + 1);
    shown.set(c.product_id as string, s);
  }
  const reasonOf = new Map((reasons ?? []).map((r) => [r.product_id as string, r.reason as string]));
  const products = (catalog ?? [])
    .map((c) => {
      const e = t.products.get(c.id as string);
      const s = shown.get(c.id as string);
      return {
        id: c.id as string,
        title: c.title as string,
        url: c.url as string | null,
        image: c.image as string | null,
        price: c.price_min === null ? null : Number(c.price_min),
        priceMax: c.price_max === null ? null : Number(c.price_max),
        currency: c.currency as string | null,
        inStock: c.in_stock as boolean | null,
        ...(e ? entityNumbers(e, t.cardRuns) : { share: null as Rate | null, avgPosition: null as number | null, visibility: null as number | null }),
        runs: e?.runs ?? 0,
        prompts: promptsOf.get(c.id as string)?.size ?? 0,
        priceShown: median(s?.prices ?? []),
        store: s ? top(s.stores) : null,
        flags: s ? Object.fromEntries(s.flags) : {},
        reason: reasonOf.get(c.id as string) ?? null,
      };
    })
    .sort((a, b) => b.runs - a.runs || a.title.localeCompare(b.title));

  // Prompts, with each one's numbers and its last deep check.
  const { data: prompts } = await db.from("shop_prompts").select("id, prompt, category, active, created_at").eq("brand_id", brand.id).order("created_at");
  const { data: deepRuns } = await db.from("shop_runs").select("id, prompt_id, engine, cards, day").eq("brand_id", brand.id).eq("kind", "deep").eq("status", "done").gte("day", dayAgo(14));
  const deepIds = (deepRuns ?? []).map((r) => r.id as number);
  const { data: deepCards } = deepIds.length ? await db.from("shop_cards").select("run_id, verdict").in("run_id", deepIds).in("verdict", ["matched", "doubt", "brand"]) : { data: [] };
  const deepYou = new Set((deepCards ?? []).map((c) => c.run_id as number));
  const promptRows = (prompts ?? []).map((q) => {
    const s = t.prompts.get(q.id as string);
    const deep = (deepRuns ?? []).filter((r) => r.prompt_id === q.id);
    const withCards = deep.filter((r) => Number(r.cards) > 0);
    return {
      id: q.id as string,
      prompt: q.prompt as string,
      category: q.category as string | null,
      active: q.active as boolean,
      runs: s?.runs ?? 0,
      cardRate: s ? entityNumbers({ runs: s.cardRuns, cards: 0, pos: 0, vis: 0 }, s.runs).share : null,
      ...(s ? entityNumbers(s.you, s.cardRuns) : { share: null as Rate | null, avgPosition: null as number | null, visibility: null as number | null }),
      deep: deep.length ? { runs: deep.length, cardRuns: withCards.length, you: withCards.filter((r) => deepYou.has(r.id as number)).length } : null,
    };
  });

  // Stores: who the cards send shoppers to.
  const stores = [...t.stores.entries()]
    .map(([name, s]) => ({ name, cards: s.cards, you: s.you, own: s.own > 0, gaps: storeGaps.get(name) ?? 0 }))
    .sort((a, b) => b.you - a.you || b.cards - a.cards)
    .slice(0, 50);

  const sources = [...t.sources.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([url, runs]) => ({ url, runs, share: t.you.runs ? runs / t.you.runs : 0 }));

  return {
    days,
    engine,
    numbers: n,
    before: was,
    shareChange,
    totals: { runs: t.runs, cardRuns: t.cardRuns, cards: t.cards },
    weekly: weekly(cur, rivals.slice(0, 3).map(([name]) => name)),
    brands,
    products,
    prompts: promptRows,
    stores,
    sources,
    flags: Object.fromEntries(t.flags),
  };
}

export type { Numbers };
