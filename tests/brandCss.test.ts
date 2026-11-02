import assert from "node:assert/strict";
import { test } from "node:test";
import { colorOf, cssEvidence, declsOf, evidenceText, fontFaces, parseCss, resolveVars, rootVars } from "../src/lib/brandCss.ts";
import { cleanKit, cleanShadow, DEFAULT_KIT, kitCss } from "../src/lib/brandKit.ts";

const SITE = `
@charset "utf-8";
@import url("/more.css");
/* a comment with { braces } */
:root { --brand: #FF5A1F; --ink: #111827; --radius: 12px; --btn-bg: var(--brand); --font-head: "Söhne", Inter, sans-serif; }
@font-face { font-family: "Söhne"; font-weight: 600; src: url(/fonts/sohne.woff2) format("woff2"); }
@font-face { font-family: 'Graphik'; src: url("data:font/woff2;base64,AAAA"); }
body { font-family: Graphik, sans-serif; color: var(--ink); background: #fff; font-size: 1rem; line-height: 1.6 }
h1, .h1 { font-family: var(--font-head); font-size: 64px; font-weight: 600; letter-spacing: -0.03em; }
h1::before { content: "x"; color: red; }
@media (min-width: 768px) { h2 { font-size: 40px; font-weight: 600 } }
@media (max-width: 600px) { h1 { font-size: 32px } }
a { color: var(--brand); text-decoration: none }
.btn-primary { background: var(--btn-bg); color: #fff; border-radius: 999px; padding: 14px 28px; }
.btn-primary:hover { background: #000 }
.btn--outline { background: transparent; border: 1px solid var(--ink); color: var(--ink) }
.card { background: url(a;b.png) #fafafa; box-shadow: 0 1px 2px rgba(0,0,0,.08); border-radius: var(--radius) }
@supports (display: grid) { @media (min-width: 1024px) { .hero { background: linear-gradient(90deg, #ff5a1f, #ffb020) } } }
@keyframes spin { from { transform: rotate(0) } to { transform: rotate(360deg) } }
`;

test("the parser reads nested rules, keeps their media text and skips keyframes", () => {
  const rules = parseCss(SITE);
  assert.ok(rules.some((r) => r.selector === "h2" && r.media === "(min-width: 768px)"));
  assert.ok(rules.some((r) => r.selector === ".hero" && r.media === "(min-width: 1024px)"));
  assert.ok(!rules.some((r) => /from|to|spin/.test(r.selector)));
  assert.equal(declsOf("background: url(a;b.png) #fafafa; color: red").background, "url(a;b.png) #fafafa");
});

test("variables resolve through other variables and fall back when missing", () => {
  const vars = rootVars(parseCss(SITE));
  assert.equal(resolveVars("var(--btn-bg)", vars), "#FF5A1F");
  assert.equal(resolveVars("var(--nope, 4px)", vars), "4px");
  assert.equal(resolveVars("1px solid var(--ink)", vars), "1px solid #111827");
});

test("colors come out as hex from hex, rgb and hsl; see-through colors are dropped", () => {
  assert.equal(colorOf("#ABC"), "#aabbcc");
  assert.equal(colorOf("rgb(255, 90, 31)"), "#ff5a1f");
  assert.equal(colorOf("rgba(0,0,0,.2)"), null);
  assert.equal(colorOf("hsl(0, 100%, 50%)"), "#ff0000");
  assert.equal(colorOf("transparent"), null);
  assert.equal(colorOf("#ff000000"), null);
});

test("font faces are read with their files, inline fonts are named but not copied", () => {
  const faces = fontFaces(parseCss(SITE), "https://acme.com/");
  assert.deepEqual(faces[0], { family: "Söhne", weight: "600", style: "normal", src: "https://acme.com/fonts/sohne.woff2" });
  assert.equal(faces[1].src, "inline");
});

test("the evidence shows how the site styles headings, links and buttons, desktop first", () => {
  const e = cssEvidence(SITE, { base: "https://acme.com/" });
  assert.equal(e.roles.h1["font-size"], "64px"); // the phone rule and ::before are skipped
  assert.equal(e.roles.h1["font-family"], `"Söhne", Inter, sans-serif`);
  assert.equal(e.roles.link.color, "#FF5A1F");
  assert.equal(e.roles.button.background, "#FF5A1F");
  assert.equal(e.roles.button["border-radius"], "999px");
  assert.equal(e.roles.buttonSecondary.border, "1px solid #111827");
  assert.equal(e.roles.card["box-shadow"], "0 1px 2px rgba(0,0,0,.08)");
  assert.ok(e.gradients.length === 1);
  assert.ok(e.vars.some(([k]) => k === "--brand"));
  const text = evidenceText(e);
  assert.match(text, /h1 style: .*font-size: 64px/);
  assert.match(text, /@font-face: Söhne 600, Graphik 400/);
});

test("a kit learned with type, buttons and a shadow keeps them, within safe limits", () => {
  const k = cleanKit({
    colors: { primary: "#ff5a1f", surface: "#ffffff", paper: "#ffffff" },
    siteFonts: { heading: "Söhne", body: "Graphik</style>" },
    type: { h1: { size: 640, weight: 650, lineHeight: 1.05, tracking: -0.03, upper: false } },
    buttons: { primary: { bg: "#ff5a1f", text: "#ff5a1f", border: "#ff5a1f", radius: 120, weight: 600, upper: true, padY: 14, padX: 28 } },
    link: { color: "#ffeeee", underline: false },
    shadow: "0 1px 2px rgba(0,0,0,.08)",
  });
  assert.equal(k.siteFonts.heading, "Söhne");
  assert.equal(k.siteFonts.body, DEFAULT_KIT.fonts.body); // a name with markup is dropped
  assert.equal(k.type.h1.size, 120);
  assert.equal(k.type.h1.weight, 700);
  assert.equal(k.buttons.primary.radius, 999);
  assert.notEqual(k.buttons.primary.text, "#ff5a1f"); // the label must read on its own button
  assert.notEqual(k.link.color, "#ffeeee"); // a link must read on the cards
  assert.equal(k.shadow, "0 1px 2px rgba(0,0,0,.08)");
});

test("a kit saved before buttons existed gets them from its own colors", () => {
  const old = cleanKit({ colors: { primary: "#0a7a3c" }, radius: 4 });
  assert.equal(old.buttons.primary.bg, "#0a7a3c");
  assert.equal(old.buttons.primary.radius, 4);
  assert.equal(old.link.color, "#0a7a3c");
});

test("shadows only hold lengths and colors", () => {
  assert.equal(cleanShadow("0 10px 30px -10px rgba(10, 20, 30, 0.2), inset 0 0 0 1px #eee"), "0 10px 30px -10px rgba(10, 20, 30, 0.2), inset 0 0 0 1px #eee");
  assert.equal(cleanShadow("0 0 1px red; background: url(x)"), "none");
  assert.equal(cleanShadow("url(javascript:1)"), "none");
  assert.equal(cleanShadow(42), "none");
});

test("the stylesheet uses the site's fonts first and the kit's values", () => {
  const k = cleanKit({ colors: { primary: "#ff5a1f" }, siteFonts: { heading: "Söhne", body: "Inter" }, fonts: { heading: "Inter", body: "Inter" } });
  const css = kitCss(k);
  assert.match(css, /--brand-primary: #ff5a1f;/);
  assert.match(css, /--brand-font-heading: 'Söhne', 'Inter', system-ui, sans-serif;/);
  assert.match(css, /--brand-font-body: 'Inter', system-ui, sans-serif;/);
  assert.match(css, /\.btn \{[^}]*background: #ff5a1f/);
  assert.ok(!css.includes("undefined"));
});
