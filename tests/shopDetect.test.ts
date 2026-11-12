import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { readCards } from "../src/lib/shopParse.ts";
import { cardNamesBrand, decide, hasCart, pricedProduct, probeFacts, productLinks, shopOn, siteFacts, slimPage, type SlimPage } from "../src/lib/shopDetect.ts";

// 30 hand-labeled brands (15 sell online, 15 don't), recorded from the real web: their sites as slim pages
// (scripts/shop-detect-record.ts), their "buy <brand>" answers on AI Mode and ChatGPT (scripts/shop-probe-record.mjs),
// and the cards that name them in the 80 answers of phase 1 (scripts/shop-record.mjs).
const DIR = join(import.meta.dirname, "fixtures/shop");
type Site = { domain: string; label: "sells" | "none"; status: number; pages: SlimPage[]; shopifyProducts: number };
const sites: Site[] = JSON.parse(readFileSync(join(DIR, "detect.json"), "utf8")).sites;
const probe = (domain: string, gpt = false) => {
  const f = join(DIR, "probe", `${domain}${gpt ? ".gpt" : ""}.json`);
  return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as { name: string; result: unknown }) : null;
};
const tracked = (["gpt", "aim"] as const).flatMap((e) => readdirSync(join(DIR, e)).flatMap((f) => readCards(e, JSON.parse(readFileSync(join(DIR, e, f), "utf8")).result).cards));

function signals(s: Site) {
  const aim = probe(s.domain)!;
  const gpt = probe(s.domain, true);
  return {
    site: siteFacts(s.pages, s.shopifyProducts),
    probe: probeFacts(aim.result, gpt?.result ?? null, s.domain),
    brandCards: tracked.filter((c) => cardNamesBrand(c, aim.name, s.domain)).length,
  };
}

test("the 30 labeled brands are all recorded", () => {
  assert.equal(sites.filter((s) => s.label === "sells").length, 15);
  assert.equal(sites.filter((s) => s.label === "none").length, 15);
  for (const s of sites) assert.ok(probe(s.domain), `${s.domain} has an AI Mode answer`);
});

test("detection turns on every brand that sells and none that don't", () => {
  const wrong: string[] = [];
  for (const s of sites) {
    const d = decide({ sources: 0, ...signals(s) });
    if (d.on !== (s.label === "sells")) wrong.push(`${s.domain}: ${d.on ? `on (${d.reason})` : "off"}`);
  }
  assert.deepEqual(wrong, []);
});

test("no signal at all fires for a brand that doesn't sell", () => {
  for (const s of sites.filter((x) => x.label === "none")) {
    const g = signals(s);
    assert.deepEqual({ productPages: g.site.productPages, cart: g.site.cart, shopify: g.site.shopifyProducts }, { productPages: 0, cart: false, shopify: 0 }, s.domain);
    assert.deepEqual(g.probe, { googleProducts: 0, merchantLinks: 0, ownCards: 0 }, s.domain);
    assert.equal(g.brandCards, 0, s.domain);
  }
});

test("shops that block our reader are still found from the answers", () => {
  const blocked = sites.filter((s) => s.label === "sells" && !s.pages.length);
  assert.ok(blocked.length >= 5, "several real shops block bots");
  for (const s of blocked) assert.ok(decide({ sources: 0, ...signals(s), site: null }).on, s.domain);
});

test("a connected store turns it on whatever else says", () => {
  assert.deepEqual(decide({ sources: 1, site: null, probe: null, brandCards: 0 }), { on: true, reason: "store" });
  assert.deepEqual(decide({ sources: 0, site: null, probe: null, brandCards: 2 }), { on: false, reason: null });
  assert.deepEqual(decide({ sources: 0, site: null, probe: null, brandCards: 3 }), { on: true, reason: "cards" });
});

test("a switch set by hand beats Auto", () => {
  assert.equal(shopOn("on", false), true);
  assert.equal(shopOn("off", true), false);
  assert.equal(shopOn("auto", true), true);
  assert.equal(shopOn(null, null), false);
});

const ld = (o: unknown) => [JSON.stringify(o)];
test("a priced Product counts; software, services and unpriced products don't", () => {
  assert.equal(pricedProduct(ld({ "@type": "Product", name: "Ghost 18", offers: { "@type": "Offer", price: "150.00" } })), true);
  assert.equal(pricedProduct(ld({ "@graph": [{ "@type": "WebPage" }, { "@type": "ProductGroup", hasVariant: [{ "@type": "Product", offers: { price: 98 } }] }] })), true);
  assert.equal(pricedProduct(ld({ "@type": "Product", offers: { "@type": "AggregateOffer", lowPrice: "12.5" } })), true);
  assert.equal(pricedProduct(ld({ "@type": ["Product", "SoftwareApplication"], offers: { price: 20 } })), false);
  assert.equal(pricedProduct(ld({ "@type": "SoftwareApplication", offers: { price: 20 } })), false);
  assert.equal(pricedProduct(ld({ "@type": "Product", name: "Platform" })), false);
  assert.equal(pricedProduct(ld({ "@type": "Product", offers: { price: "0" } })), false);
  assert.equal(pricedProduct(["{ broken"]), false);
});

test("slim pages keep JSON-LD, own-site paths, forms and add-to-cart buttons", () => {
  const html = `<html><head><script type="application/ld+json">{"@type":"Product","offers":{"price":"10"}}</script></head><body>
    <a href="/products/tee">Tee</a><a href="https://www.shop.com/cart">Cart</a><a href="https://other.com/x">x</a><a href="mailto:a@b.c">m</a>
    <form action="/cart/add"><button>Add to bag</button></form></body></html>`;
  const p = slimPage(html, "https://shop.com/");
  assert.equal(p.ld.length, 1);
  assert.deepEqual(p.links.sort(), ["/cart", "/products/tee", "other.com/x"]);
  assert.deepEqual(p.forms, ["/cart/add"]);
  assert.equal(p.buttons, 1);
  assert.equal(hasCart(p), true);
  assert.equal(hasCart({ ...p, links: ["/pricing", "/checkout"], forms: [], buttons: 0 }), false, "a SaaS /checkout alone is not a cart");
  assert.deepEqual(productLinks(p), ["/products/tee"]);
});

test("a brand is named by a whole word, its store name or its own site", () => {
  assert.equal(cardNamesBrand({ title: "HOKA Bondi 9" }, "HOKA", "hoka.com"), true);
  assert.equal(cardNamesBrand({ title: "Bondi 9", domain: "shop.hoka.com" }, "HOKA", "hoka.com"), true);
  assert.equal(cardNamesBrand({ title: "Rain jacket", seller: "REI" }, "REI", "rei.com"), true);
  assert.equal(cardNamesBrand({ title: "Reinforced jacket" }, "REI", "rei.com"), false);
  assert.equal(cardNamesBrand({ title: "Kestrel" }, "", ""), false);
});
