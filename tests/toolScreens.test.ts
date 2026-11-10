import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";

const PAGES = ["SiteAuditPage", "OnpageAuditPage", "BacklinksPage", "LinkBuildingPage", "ContentMapPage", "LocalResearchPage"];
// Backlinks keeps its tabs in src/components/backlinks/, so its screen is the page plus that folder.
const read = (f: string) => {
  const page = readFileSync(new URL(`../src/components/${f}.tsx`, import.meta.url), "utf8");
  if (f !== "BacklinksPage") return page;
  const dir = new URL("../src/components/backlinks/", import.meta.url);
  return [page, ...readdirSync(dir).filter((x) => x.endsWith(".tsx")).map((x) => readFileSync(new URL(x, dir), "utf8"))].join("\n");
};

test("tool screens show their numbers in a stat strip, never a row of equal boxes", () => {
  for (const f of ["BacklinksPage", "LinkBuildingPage", "ContentMapPage"]) {
    const src = read(f);
    assert.match(src, /<StatStrip/, `${f} uses StatStrip`);
    assert.doesNotMatch(src, /function (Kpi|Stat)\(/, `${f} has no local stat box`);
  }
});

test("before a tool has data, its screen is the title, a search bar and what the tool shows, with no example data", () => {
  assert.ok(!existsSync(new URL("../src/lib/demo.ts", import.meta.url)), "no example data file");
  for (const f of PAGES) {
    const src = read(f);
    assert.match(src, /<SearchBar/, `${f} has a search bar`);
    assert.match(src, /<[A-Za-z]+Intro \/>/, `${f} shows what the tool does`);
    assert.doesNotMatch(src, /ToolStart|lib\/demo|isDemo|Example data/, `${f} has no start page or example data`);
  }
});
