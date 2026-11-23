import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

// The app has one stylesheet (docs/brand.md). These checks fail when a second look gets stacked on top again.
const dir = new URL("../src/app/", import.meta.url);
const css = readFileSync(new URL("globals.css", dir), "utf8");

test("src/app holds one stylesheet", () => {
  const sheets = readdirSync(dir, { recursive: true }).filter((f) => String(f).endsWith(".css"));
  assert.deepEqual(sheets, ["globals.css"]);
});

test("globals.css imports Tailwind and nothing else", () => {
  const imports = [...css.matchAll(/@import\s+[^;]+;/g)].map((m) => m[0]);
  assert.deepEqual(imports, ['@import "tailwindcss";']);
});

test("no specificity tricks", () => {
  assert.equal(css.includes("#calm"), false, "an id added to a selector only to win");
  assert.equal(/:root\s+(:is\()?\.aw/.test(css), false, ":root added to a selector only to win");
});

test("!important stays rare", () => {
  const count = css.match(/!important/g)?.length ?? 0;
  assert.ok(count <= 30, `${count} uses of !important. It is for print, reduced motion and beating an inline style.`);
});

test("each selector has one rule", () => {
  // Outside @media and @supports blocks, a selector list opens a rule once.
  // The Defaults section is the exception: its :where() rules are read in order.
  let depth = 0;
  const seen = new Map<string, number>();
  for (const line of css.split("\n")) {
    const opens = line.match(/\{/g)?.length ?? 0;
    const closes = line.match(/\}/g)?.length ?? 0;
    if (depth === 0 && /^[.:\[a-z*]/i.test(line) && line.includes("{") && !line.startsWith("@") && !line.startsWith(":where(")) {
      const selector = line.slice(0, line.indexOf("{")).trim();
      seen.set(selector, (seen.get(selector) ?? 0) + 1);
    }
    depth += opens - closes;
  }
  const twice = [...seen].filter(([, n]) => n > 1).map(([s]) => s);
  assert.deepEqual(twice, []);
});
