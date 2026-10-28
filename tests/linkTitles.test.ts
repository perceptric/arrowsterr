import assert from "node:assert/strict";
import { test } from "node:test";
import { isGenericTitle, siteName, tidyTitle } from "../src/lib/linkTitles.ts";

test("engine labels that say nothing are spotted", () => {
  for (const [t, u] of [
    ["Official website", "https://www.evenuplaw.com/"],
    ["Official Website", "https://www.filevine.com/"],
    ["Supio website", "https://www.supio.com/"],
    ["EvenUp official site", "https://www.evenuplaw.com/"],
    ["Home", "https://eve.legal/"],
    ["Homepage", "https://eve.legal/"],
    ["", "https://eve.legal/"],
    [null, "https://eve.legal/"],
    ["eve.legal", "https://www.eve.legal/"],
    ["www.supio.com", "https://supio.com/"],
    ["https://supio.com/", "https://supio.com/"],
    // Just the brand name, spelled like the domain: the page's real title says more.
    ["Eve Legal", "https://www.eve.legal/"],
  ] as const) assert.equal(isGenericTitle(t, u), true, String(t));
});

test("real titles are kept", () => {
  for (const [t, u] of [
    ["Best AI Tools for Personal Injury Lawyers (2026)", "https://www.eve.legal/tort-report/best"],
    ["AI Demand Pro - Personal Injury Settlement Demands in Minutes", "https://demandpro.ai/"],
    ["How to choose a website builder", "https://example.com/blog/x"],
  ] as const) assert.equal(isGenericTitle(t, u), false, t);
});

// Real <title>s of the sites cited for "best AI demand letter software", read 28 October 2026.
test("home page titles put the brand first", () => {
  assert.equal(tidyTitle("Supio | Legal AI for Plaintiff &amp; Personal Injury Firms", "https://www.supio.com/"), "Supio: Legal AI for Plaintiff & Personal Injury Firms");
  assert.equal(tidyTitle("Leading AI for Personal Injury Lawyers - EvenUp Law", "https://www.evenuplaw.com/"), "EvenUp Law: Leading AI for Personal Injury Lawyers");
  assert.equal(tidyTitle("Legal AI Software for Plaintiff Law Firms | Eve", "https://www.eve.legal/"), "Eve: Legal AI Software for Plaintiff Law Firms");
  assert.equal(tidyTitle("AI Demand Pro - Personal Injury Settlement Demands in Minutes", "https://demandpro.ai/"), "AI Demand Pro: Personal Injury Settlement Demands in Minutes");
});

test("a home page whose title never names the domain uses the site's own name, or its first part", () => {
  assert.equal(tidyTitle("Legal AI Platform for Law Firms & Legal Teams | LOIS", "https://www.filevine.com/", "Filevine"), "Filevine: Legal AI Platform for Law Firms & Legal Teams");
  assert.equal(tidyTitle("Legal AI Platform for Law Firms & Legal Teams | LOIS", "https://www.filevine.com/"), "Legal AI Platform for Law Firms & Legal Teams");
});

test("other pages lose a trailing site name, and Home goes", () => {
  assert.equal(tidyTitle("Best AI Tools for Personal Injury Lawyers | Eve", "https://www.eve.legal/tort-report/best"), "Best AI Tools for Personal Injury Lawyers");
  assert.equal(tidyTitle("Home | Supio", "https://www.supio.com/"), "Supio");
  assert.equal(tidyTitle("   ", "https://www.supio.com/"), "");
});

test("the site name shown while a title loads", () => {
  assert.equal(siteName("https://www.Supio.com/x"), "supio.com");
  assert.equal(siteName("not a url"), "not a url");
});
