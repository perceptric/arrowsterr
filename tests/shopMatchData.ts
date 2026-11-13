// Loads the matching test data: 7 real store catalogs, their AI answers and the hand labels (tests/fixtures/shop/match).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readCards, type ShopCard } from "../src/lib/shopParse.ts";
import type { MatchProduct } from "../src/lib/shopMatch.ts";

const DIR = join(import.meta.dirname, "fixtures/shop");
export type Labels = { brands: Record<string, { name: string; aliases?: string[] }>; cards: Record<string, string | null> };
export const labels: Labels = JSON.parse(readFileSync(join(DIR, "match/labels.json"), "utf8"));

type RawProduct = { id: string; title: string; handle: string; vendor: string; variants: { price: string | number | null }[] };
export function catalog(domain: string): MatchProduct[] {
  const raw = JSON.parse(readFileSync(join(DIR, "match/catalogs", `${domain}.json`), "utf8")).products as RawProduct[];
  return raw.map((p) => {
    const prices = p.variants.map((v) => Number(v.price)).filter((n) => Number.isFinite(n));
    return { id: p.id, title: p.title, handle: p.handle, brand: p.vendor, price_min: prices.length ? Math.min(...prices) : null, price_max: prices.length ? Math.max(...prices) : null };
  });
}

export type LabeledCard = { key: string; domain: string; card: ShopCard; label: string | null | undefined };
/** Every card in the brands' answers and "buy <brand>" answers, with its label (undefined: another brand's card). */
export function cards(): LabeledCard[] {
  const out: LabeledCard[] = [];
  const add = (file: string, domain: string, engine: "gpt" | "aim", result: unknown) => {
    for (const card of readCards(engine, result).cards) {
      const key = `${file}#${card.block}.${card.position}`;
      out.push({ key, domain, card, label: key in labels.cards ? labels.cards[key] : undefined });
    }
  };
  for (const f of readdirSync(join(DIR, "match/answers")).sort()) {
    const fx = JSON.parse(readFileSync(join(DIR, "match/answers", f), "utf8"));
    add(`match/answers/${f}`, fx.domain, fx.engine, fx.result);
  }
  for (const domain of Object.keys(labels.brands)) {
    for (const [suffix, engine] of [["", "aim"], [".gpt", "gpt"]] as const) {
      const f = join(DIR, "probe", `${domain}${suffix}.json`);
      if (existsSync(f)) add(`probe/${domain}${suffix}.json`, domain, engine, JSON.parse(readFileSync(f, "utf8")).result);
    }
  }
  return out;
}
