// Draft and Write, Phase 0: today's writer on the 20 recorded topics (scripts/writer-baseline.mjs). These saved
// articles are the baseline every later phase is measured against, so the scorer must give them the same numbers
// every time, offline.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { scoreArticle, sumScores } from "../src/lib/writerScore.ts";
import { contextOf, loadFixture, packOf, topics } from "./writerFixtures.ts";

const DIR = new URL("./fixtures/writer/baseline/", import.meta.url);
const load = (slug: string) => JSON.parse(readFileSync(new URL(`${slug}.json`, DIR), "utf8"));

test("every topic has a baseline article, and the scorer gives it the same numbers it was saved with (lint aside)", () => {
  for (const t of topics()) {
    assert.ok(existsSync(new URL(`${t.slug}.json`, DIR)), `${t.slug} has no baseline: run scripts/writer-baseline.mjs ${t.slug}`);
    const b = load(t.slug);
    assert.equal(b.keyword, t.keyword);
    assert.ok(b.sections.length >= 3, `${t.slug}: only ${b.sections.length} sections`);
    const f = loadFixture(t.slug);
    const ctx = contextOf(f);
    const again = scoreArticle(b.sections, packOf(f), {
      sitemap: ctx.sitemap,
      brandDomain: ctx.brand.domain,
      examples: b.brief.examples ?? [],
      images: (b.brief.images ?? []).length,
      modules: b.modules.filter((m: { status: string }) => m.status === "ok").length,
    });
    // The lint changes as its rules do (the Perceptric port, the abbreviation-aware splitter), so only the rest must match.
    const { lint: _lint, lintRules: _rules, ...rest } = again;
    const { lint: _savedLint, lintRules: _savedRules, ...savedRest } = b.score;
    assert.deepEqual(rest, savedRest, t.slug);
  }
});

test("the summary matches the 20 articles", () => {
  const all = topics().map((t) => load(t.slug));
  const s = JSON.parse(readFileSync(new URL("summary.json", DIR), "utf8"));
  const sum = sumScores(all.map((b) => b.score));
  for (const k of Object.keys(sum) as (keyof typeof sum)[]) assert.equal(s[k], sum[k], k);
  assert.equal(s.modulesPlanned, all.reduce((a, b) => a + b.brief.modules.length, 0));
});

test("the Phase 2 run on the 20 topics changed no facts and every article has a proof", () => {
  const s = JSON.parse(readFileSync(new URL("../phase2/summary.json", DIR), "utf8"));
  assert.equal(s.articles, 20);
  assert.equal(s.factChanges, 0);
  assert.equal(s.ship + s.hold, 20);
  assert.equal(s.articlesDetail.length, 20);
  for (const a of s.articlesDetail) assert.equal(a.proof === "Hold", a.holdReasons.length > 0, a.slug);
});
