import "server-only";
import { askJson } from "./claude";
import { reach } from "./freeRunners";
import { measured } from "./freeResearch";
import { pickOptions, TITLE, DESCRIPTION } from "./metaRules";
import { pageMeta, readHours } from "./pageMeta";
import { schemaTypes } from "./pageFacts";
import { pageText } from "./pageText";
import { buildSchema, checkSchema, SCHEMA_FIELDS, type SchemaType, type SchemaValues } from "./schemaGen";

// The on-page tools that ask Claude (docs/free-tools.md): "Fill from my page" in the Schema Markup Generator, and the
// Meta Title and Description Generator. The page is read for free first; Haiku only writes or fills what's left.

const HAIKU = "claude-haiku-5-5";
const bad = (message: string) => Object.assign(new Error(message), { visitor: true });

async function openPage(url: string) {
  const r = await reach(url, { timeout: 15_000 });
  if (!r.ok) throw bad(`That page answered with an error (${r.status}). Check the address.`);
  if (!/<html|<body|<p[\s>]/i.test(r.body.slice(0, 20000))) throw bad("That address isn't a web page.");
  return r;
}

// ─────────────── Schema Markup Generator: Fill from my page ───────────────

/** The fields Haiku may fill for each type, and what each one means. Never the ones the page states in its tags. */
const ASK: Partial<Record<SchemaType, Record<string, string>>> = {
  Article: { headline: "the article's headline", authorName: "the author's name", publisherName: "the publisher or site name" },
  Product: { name: "product name", description: "one-sentence description", brand: "brand", sku: "SKU", gtin: "GTIN or barcode digits", price: "price as a number", priceCurrency: "3-letter currency code", availability: "one of InStock, OutOfStock, PreOrder, BackOrder" },
  Organization: { name: "organization name", legalName: "legal name", description: "one or two sentence description", street: "street address", city: "city", region: "state or region", postalCode: "postal code", country: "2-letter country code" },
  LocalBusiness: { name: "business name", street: "street address", city: "city", region: "state or region", postalCode: "postal code", country: "2-letter country code", priceRange: "price range like $$", hoursText: "opening hours as written, like Mon-Fri 09:00-17:00" },
};

export function schemaFill(url: string, type: SchemaType) {
  return measured(async () => {
    const r = await openPage(url);
    const p = pageMeta(r.body, r.url);
    const page = p.canonical || r.url;
    const origin = new URL(r.url).origin;
    // What the page's own tags say. These are facts, so the AI never overwrites them.
    const found: Record<SchemaType, SchemaValues> = {
      FAQPage: { faqs: p.faqs },
      Article: { headline: p.h1 || p.title, description: p.description, url: page, image: p.image ? [p.image] : [], datePublished: p.published, dateModified: p.modified, authorName: p.author, publisherName: p.siteName, publisherLogo: p.logo },
      Product: { name: p.h1, description: p.description, image: p.image ? [p.image] : [], url: page },
      Organization: { name: p.siteName, url: origin, logo: p.logo, description: p.description, email: p.email, telephone: p.phone, sameAs: p.sameAs },
      LocalBusiness: { name: p.siteName, url: origin, telephone: p.phone, image: p.image ? [p.image] : [], sameAs: p.sameAs },
    };
    const values: SchemaValues = { ...found[type] };
    const ask = ASK[type] ?? {};
    const missing = Object.keys(ask).filter((k) => k === "hoursText" ? true : !values[k] || (Array.isArray(values[k]) && !(values[k] as unknown[]).length));
    const needFaq = type === "FAQPage" && !p.faqs.length;
    const text = pageText(r.body, 8000).text;
    if ((missing.length || needFaq) && text.split(/\s+/).length > 30) {
      const props: Record<string, unknown> = Object.fromEntries(missing.map((k) => [k, { type: "string", description: ask[k] }]));
      if (needFaq) props.faqs = { type: "array", items: { type: "object", properties: { q: { type: "string" }, a: { type: "string" } }, required: ["q", "a"], additionalProperties: false } };
      const filled = await askJson<Record<string, unknown>>(
        `Read this web page and fill in the fields for ${type} structured data. Use only what the page says. When the page doesn't say it, return an empty string${needFaq ? ". For faqs, return up to 8 questions the page itself answers, each with a short answer taken from the page, or an empty list" : ""}. Never guess or invent.\n\nPage: ${r.url}\nTitle: ${p.title}\n\n${text}`,
        { type: "object", properties: props, required: Object.keys(props), additionalProperties: false },
        { model: HAIKU, maxTokens: 2000 },
      ).catch(() => ({}) as Record<string, unknown>);
      for (const k of missing) if (typeof filled[k] === "string" && (filled[k] as string).trim()) values[k] = (filled[k] as string).trim().slice(0, 500);
      if (needFaq && Array.isArray(filled.faqs)) values.faqs = (filled.faqs as { q?: unknown; a?: unknown }[]).filter((f) => typeof f.q === "string" && typeof f.a === "string").slice(0, 8).map((f) => ({ q: String(f.q).slice(0, 300), a: String(f.a).slice(0, 1200) }));
    }
    if (typeof values.hoursText === "string") {
      values.hours = readHours(values.hoursText);
      delete values.hoursText;
    }
    // Only fields the form has go back.
    const keys = new Set(SCHEMA_FIELDS[type].map((f) => f.key));
    const clean = Object.fromEntries(Object.entries(values).filter(([k, v]) => keys.has(k) && v !== "" && v !== undefined));
    return { url: r.url, type, values: clean, existing: schemaTypes(r.body), jsonld: buildSchema(type, clean), issues: checkSchema(type, clean) };
  });
}

// ─────────────── Meta Title and Description Generator ───────────────

type Written = { titles: { text: string; angle: string }[]; descriptions: { text: string; angle: string }[] };

const SCHEMA = {
  type: "object",
  properties: {
    titles: { type: "array", items: { type: "object", properties: { text: { type: "string" }, angle: { type: "string" } }, required: ["text", "angle"], additionalProperties: false } },
    descriptions: { type: "array", items: { type: "object", properties: { text: { type: "string" }, angle: { type: "string" } }, required: ["text", "angle"], additionalProperties: false } },
  },
  required: ["titles", "descriptions"],
  additionalProperties: false,
};

/** A page address, or a topic and its main keyword. */
export function meta(input: { url: string } | { topic: string; keyword: string | null }) {
  return measured(async () => {
    let about: string;
    let current: { title: string; description: string; h1: string } | null = null;
    let lang = "";
    let brand = "";
    const keyword = "keyword" in input ? input.keyword : null;
    let url: string | null = null;
    if ("url" in input) {
      const r = await openPage(input.url);
      const p = pageMeta(r.body, r.url);
      url = r.url;
      current = { title: p.title, description: p.description, h1: p.h1 };
      lang = p.lang;
      brand = p.siteName;
      about = `Page: ${r.url}\nTitle now: ${p.title}\nDescription now: ${p.description}\nH1: ${p.h1}\n\n${pageText(r.body, 4000).text}`;
    } else {
      about = `Topic: ${input.topic}`;
    }
    const rules = `Rules:
- 8 titles, ${TITLE.min} to ${TITLE.max} characters each${keyword ? `, with "${keyword}" near the start` : ", with the main search phrase near the start"}${brand ? `, ending with " | ${brand}" when it fits` : ""}.
- 8 descriptions, ${DESCRIPTION.min} to ${DESCRIPTION.max} characters each: one clear promise and one concrete detail (a number, a feature or a result).
- Match what the page is about. Never promise what it doesn't deliver. No clickbait, no ALL CAPS, no emoji, no quotes around the text.
- Each option takes a different angle; name it in 1 to 3 words (like "Benefit", "Number", "Question", "How-to", "Brand first").
- Write in the page's language${lang ? ` (${lang})` : ""}.`;
    const ask = (extra = "") => askJson<Written>(`Write SEO title tags and meta descriptions.\n\n${rules}${extra}\n\n${about}`, SCHEMA, { model: HAIKU, maxTokens: 2000 });
    const pick = (w: Written) => ({
      titles: pickOptions(w.titles.map((t) => t.text), "title").map((text) => ({ text, angle: w.titles.find((t) => t.text.includes(text) || text.includes(t.text))?.angle ?? "" })),
      descriptions: pickOptions(w.descriptions.map((t) => t.text), "description").map((text) => ({ text, angle: w.descriptions.find((t) => t.text.includes(text) || text.includes(t.text))?.angle ?? "" })),
    });
    let out = pick(await ask());
    // Lines outside the rules are dropped. When too few are left, ask once more and keep the best of both.
    if (out.titles.length < 3 || out.descriptions.length < 3) {
      const again = pick(await ask("\n- Count characters carefully. The last answer had options outside these lengths."));
      const merge = (a: { text: string; angle: string }[], b: { text: string; angle: string }[]) => [...a, ...b.filter((x) => !a.some((y) => y.text.toLowerCase() === x.text.toLowerCase()))].slice(0, 5);
      out = { titles: merge(out.titles, again.titles), descriptions: merge(out.descriptions, again.descriptions) };
    }
    if (!out.titles.length && !out.descriptions.length) throw new Error("Meta generator: no option passed the rules");
    return { url, topic: "topic" in input ? input.topic : null, keyword, brand: brand || null, current, ...out };
  });
}
