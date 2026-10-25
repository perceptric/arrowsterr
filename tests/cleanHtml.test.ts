import { test } from "node:test";
import assert from "node:assert/strict";
import { ALLOWED_TAGS, cleanWith, keepHref, PURIFY_CONFIG, SAFE_HREF } from "../src/lib/cleanHtml.ts";

// DOMPurify needs a real DOM, and the tests have none (no jsdom). These check the rules it is given;
// the cleaning itself runs in the browser. The bypass that mattered: <span><img onerror></span> kept the img.

test("only the article's tags pass, and no tag that can run code or load anything", () => {
  assert.deepEqual(PURIFY_CONFIG.ALLOWED_TAGS, ALLOWED_TAGS);
  for (const t of ["p", "h3", "h4", "ul", "ol", "li", "strong", "em", "b", "i", "a", "blockquote", "table", "thead", "tbody", "tr", "th", "td", "br"]) assert.ok(ALLOWED_TAGS.includes(t), t);
  for (const t of ["img", "span", "div", "script", "style", "iframe", "svg", "math", "object", "embed", "form", "input", "video", "audio", "link", "meta", "base"]) assert.ok(!ALLOWED_TAGS.includes(t), t);
});

test("no attribute but href, and no data or aria attributes", () => {
  assert.deepEqual(PURIFY_CONFIG.ALLOWED_ATTR, ["href"]);
  assert.equal(PURIFY_CONFIG.ALLOW_DATA_ATTR, false);
  assert.equal(PURIFY_CONFIG.ALLOW_ARIA_ATTR, false);
  assert.equal(PURIFY_CONFIG.ALLOW_UNKNOWN_PROTOCOLS, false);
  assert.equal(PURIFY_CONFIG.KEEP_CONTENT, true);
  assert.equal(PURIFY_CONFIG.ADD_TAGS, undefined);
  assert.equal(PURIFY_CONFIG.ADD_ATTR, undefined);
});

test("links keep only http and https addresses", () => {
  assert.ok(SAFE_HREF.test("https://example.com"));
  assert.ok(SAFE_HREF.test("http://example.com/a"));
  for (const bad of ["javascript:alert(1)", " javascript:alert(1)", "data:text/html,x", "vbscript:x", "/relative", "//evil.com"]) assert.ok(!SAFE_HREF.test(bad), bad);
});

test("href stays on links only", () => {
  const run = (nodeName: string, attrName: string, attrValue: string) => {
    const data = { attrName, attrValue, keepAttr: true, forceKeepAttr: undefined, attrNameIs: undefined } as unknown as Parameters<typeof keepHref>[1];
    keepHref.call({} as never, { nodeName } as Element, data, PURIFY_CONFIG);
    return data.keepAttr;
  };
  assert.equal(run("A", "href", "https://example.com"), true);
  assert.equal(run("A", "href", "javascript:alert(1)"), false);
  assert.equal(run("P", "href", "https://example.com"), false);
});

test("the cleaner hands DOMPurify these rules and removes its hook after", () => {
  const calls: string[] = [];
  const fake = {
    addHook: (name: string) => void calls.push(`add ${name}`),
    removeHook: (name: string) => (calls.push(`remove ${name}`), undefined),
    sanitize: (html: string, cfg: unknown) => {
      assert.equal(cfg, PURIFY_CONFIG);
      calls.push("sanitize");
      return html.replace(/<img[^>]*>/g, "").replace(/<\/?span>/g, "");
    },
  };
  const out = cleanWith(fake as never, '<p><span><img src=x onerror="alert(1)"></span>Hi</p>');
  assert.equal(out, "<p>Hi</p>");
  assert.deepEqual(calls, ["add uponSanitizeAttribute", "sanitize", "remove uponSanitizeAttribute"]);
});
