import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import * as cheerio from "cheerio";
import { homeLogo, isHomeHref, namedImage } from "../src/lib/logoPick.ts";

const BASE = "https://www.momos.com/";

test("home links: the root, ./, the site's own address and a language home; never other pages or anchors", () => {
  for (const h of ["/", "./", "#", "https://www.momos.com", "https://momos.com/", "/en", "/en-us/"]) assert.ok(isHomeHref(h, BASE), h);
  for (const h of ["/ai", "/pricing", "#main", "/?ref=x", "https://other.com/", "mailto:a@b.co"]) assert.ok(!isHomeHref(h, BASE), h);
});

test("momos.com (Framer): the logo's SVG parts point at shapes elsewhere; they are joined into one SVG", () => {
  const $ = cheerio.load(readFileSync(new URL("./fixtures/logos/momos.html", import.meta.url), "utf8"));
  const logo = homeLogo($, BASE);
  assert.ok(logo?.startsWith("data:image/svg+xml"), "an SVG logo");
  const svg = decodeURIComponent(logo!.split(",")[1]);
  assert.ok(!svg.includes("<use"), "every <use> is replaced by its shape");
  assert.equal((svg.match(/<path/g) ?? []).length >= 6, true, "the mark and the word are both there");
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 [\d.]+ 32"/);
  assert.match(svg, /fill="rgba\(0,0,0,1\)"/, "drawn in the link's own color");
});

test("an image in the home link wins; a plain header image is no logo unless named", () => {
  const $ = cheerio.load(`<header><img id="hero" src="/hero.png"><a href="/" class="site-logo"><img src="/img/brand.png"></a></header>`);
  assert.equal(homeLogo($, "https://acme.com/"), "https://acme.com/img/brand.png");
  assert.equal(namedImage($, $("#hero").get(0)!), false);
  assert.equal(namedImage($, $(".site-logo img").get(0)!), true);
});

test("a footer home link and small icons are skipped; no picture means no logo", () => {
  const $ = cheerio.load(`<header><a href="/"><svg viewBox="0 0 12 12"><path d="M0 0h12"/></svg>Acme</a></header><footer><a href="/"><img src="/f.png"></a></footer>`);
  assert.equal(homeLogo($, "https://acme.com/"), null);
});
