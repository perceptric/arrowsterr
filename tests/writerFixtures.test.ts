// Draft and Write, Phase 0: the 20 recorded topics are complete, real and load with no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MIN_PAGES } from "../src/lib/articleResearch.ts";
import { isGoogleRedirect } from "../src/lib/serpUrl.ts";
import { contextOf, loadFixture, packOf, recorded, topics } from "./writerFixtures.ts";

test("20 topics, 4 for each kind of site, with a mix of stages", () => {
  const list = topics();
  assert.equal(list.length, 20);
  assert.equal(new Set(list.map((t) => t.slug)).size, 20);
  for (const kind of ["saas", "store", "agency", "local", "publisher"]) assert.equal(list.filter((t) => t.kind === kind).length, 4, kind);
  for (const stage of ["bofu", "mofu", "tofu"]) assert.ok(list.filter((t) => t.stage === stage).length >= 4, stage);
});

test("every topic is recorded with enough real pages read", () => {
  for (const t of topics()) {
    assert.ok(recorded(t.slug), `${t.slug} is not recorded: run scripts/writer-record.mjs ${t.slug}`);
    const f = loadFixture(t.slug);
    assert.equal(f.keyword, t.keyword);
    assert.ok(f.pages.length >= MIN_PAGES, `${t.slug}: only ${f.pages.length} pages read`);
    for (const p of f.pages) {
      assert.ok(!isGoogleRedirect(p.url), `${t.slug}: a Google redirect was read: ${p.url}`);
      assert.ok(!/(\.\.\.|…)$/.test(p.url), `${t.slug}: a cut-off address was read: ${p.url}`);
      assert.ok(p.word_count >= 150 && p.body.length > 500, `${t.slug}: ${p.url} has almost no text`);
    }
    assert.ok(f.serp.paa.length > 0 || f.answers.some((a) => a.answer), `${t.slug}: no questions and no AI answers`);
  }
});

test("a recorded topic becomes the same research pack and brand the writer reads in the app", () => {
  const f = loadFixture("running-shoes-beginners");
  const pack = packOf(f);
  assert.equal(pack.keyword, "best running shoes for beginners");
  assert.equal(pack.pages.length, f.pages.length);
  assert.ok(pack.pages.every((p) => p.domain && !p.domain.startsWith("www.") && p.headings.every((h) => typeof h === "string")));
  assert.equal(pack.questions.length, f.serp.paa.length);
  assert.equal(pack.answers.length, f.answers.filter((a) => a.answer).length);
  const ctx = contextOf(f);
  assert.equal(ctx.brand.domain, "striderunning.example");
  assert.equal(ctx.stage, "bofu");
  assert.ok(ctx.sitemap.length > 3 && ctx.sample && ctx.voice?.reader);
});

test("the recorder reads pages with the same code as the worker", () => {
  const body = (file: string) => {
    const s = readFileSync(new URL(`../scripts/${file}`, import.meta.url), "utf8");
    const start = s.indexOf("function extract() {");
    return s.slice(start, s.indexOf("\n}\n", start));
  };
  const worker = body("worker.mjs");
  assert.ok(worker.length > 500);
  assert.equal(body("writer-record.mjs"), worker);
});
