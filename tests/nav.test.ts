import { test } from "node:test";
import assert from "node:assert/strict";
import { ALIASES, pageFromPath, pathFor, routeFromPath, screenOf, SLUGS, SUBS, zippieFromPath, zippiePath, type Page } from "../src/lib/routes.ts";
import { SETTINGS_GROUPS, SETTINGS_TABS } from "../src/lib/settingsTabs.ts";

// The sidebar's pages (NAV in App.tsx) and Settings.
const SIDEBAR: Page[] = ["prompts", "competitors", "domains", "keywords", "domain", "gap", "calendar", "library", "brand", "summary"];

test("nav: every sidebar page and every settings page opens at its own address", () => {
  for (const p of [...SIDEBAR, ...SETTINGS_TABS.map((t) => t.id)]) {
    assert.equal(pageFromPath(SLUGS[p]), p, SLUGS[p]);
    assert.equal(pageFromPath(`${SLUGS[p]}/`), p, `${SLUGS[p]}/`);
    assert.equal(pathFor(p), SLUGS[p]);
  }
  assert.equal(pageFromPath("/"), "prompts");
  assert.equal(pageFromPath("/no-such-page"), "prompts");
});

test("nav: no two pages share an address", () => {
  const all = Object.values(SLUGS);
  assert.equal(new Set(all).size, all.length);
});

test("nav: each tab has its own address and back to it opens the same tab", () => {
  const cases: [string, Page, string | undefined][] = [
    ["/brand/voice", "brand", "voice"],
    ["/brand/kit", "brand", "kit"],
    ["/brand/guidelines", "brand", "guidelines"],
    ["/reports/schedules", "summary", "schedules"],
    ["/reports/links", "summary", "links"],
    ["/editorial-calendar/list", "calendar", "list"],
    ["/editorial-calendar/list/", "calendar", "list"],
    ["/sources/urls", "urls", undefined],
    ["/sources", "domains", undefined],
  ];
  for (const [path, page, sub] of cases) {
    assert.deepEqual(routeFromPath(path), sub ? { page, sub } : { page }, path);
    assert.equal(pathFor(page, sub), path.replace(/\/$/, ""), path);
  }
  for (const [page, subs] of Object.entries(SUBS)) for (const s of subs!) assert.equal(routeFromPath(pathFor(page as Page, s)).sub, s);
});

test("nav: an unknown tab opens its page, and a page without tabs ignores one", () => {
  assert.deepEqual(routeFromPath("/brand/nope"), { page: "brand" });
  assert.deepEqual(routeFromPath("/reports/nope"), { page: "summary" });
  assert.equal(pathFor("prompts", "voice"), "/prompts");
  assert.equal(pathFor("brand", "nope"), "/brand");
  assert.equal(pathFor("brand"), "/brand");
});

test("nav: old addresses keep working", () => {
  const old: Record<string, Page> = {
    "/overview": "prompts",
    "/traffic": "prompts",
    "/visitors": "prompts",
    "/analytics": "prompts",
    "/domains": "domains",
    "/urls": "urls",
    "/keyword-research": "keywords",
    "/keyword-gap": "gap",
    "/industry-research": "gap",
    "/ai-gap": "gap",
    "/content-plan": "calendar",
    "/calendar": "calendar",
    "/reports/content": "calendar",
    "/writer": "library",
    "/settings/brand-voice": "brand",
    "/plan": "billing",
    "/billing": "billing",
  };
  for (const [path, page] of Object.entries(old)) assert.equal(pageFromPath(path), page, path);
  for (const [path, page] of Object.entries(ALIASES)) assert.equal(pageFromPath(path), page, path);
});

test("nav: Zippie's addresses open the panel over Prompts, with its tabs", () => {
  for (const p of ["/zippie", "/ask", "/agent", "/zippie/"]) {
    assert.deepEqual(zippieFromPath(p), { open: true }, p);
    assert.equal(pageFromPath(p), "prompts", p);
  }
  assert.deepEqual(zippieFromPath("/zippie/knowledge"), { open: true, sub: "knowledge" });
  assert.deepEqual(zippieFromPath("/zippie/skills"), { open: true, sub: "skills" });
  assert.equal(pageFromPath("/zippie/skills"), "prompts");
  assert.deepEqual(zippieFromPath("/zippie/nope"), { open: false });
  assert.deepEqual(zippieFromPath("/prompts"), { open: false });
  assert.equal(zippiePath("knowledge"), "/zippie/knowledge");
  assert.equal(zippiePath(), "/zippie");
});

test("nav: settings groups stay at 4 tabs or fewer", () => {
  for (const g of SETTINGS_GROUPS) assert.ok(g.tabs.length <= 4, g.label);
  assert.deepEqual(
    SETTINGS_GROUPS.map((g) => g.label),
    ["Account", "Brand", "Workspace", "Tools", "Jobs"],
  );
});

test("nav: page timings name each screen by its address", () => {
  assert.equal(screenOf("/"), "prompts");
  assert.equal(screenOf("/brand/kit"), "brand/kit");
  assert.equal(screenOf("/settings/members/"), "settings/members");
  assert.equal(screenOf("/keyword-research"), "keywords");
  assert.equal(screenOf("/zippie/skills"), "zippie");
  assert.equal(screenOf("/r/abc123"), "share");
  assert.equal(screenOf("/pricing"), "pricing");
});
