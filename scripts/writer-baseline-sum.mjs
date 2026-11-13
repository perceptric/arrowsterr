// Draft and Write, Phase 0: totals for the 20 baseline articles in tests/fixtures/writer/baseline (summary.json).
//   node scripts/writer-baseline-sum.mjs
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { sumScores } from "../src/lib/writerScore.ts";
const dir = new URL("../tests/fixtures/writer/baseline", import.meta.url).pathname;
const done = readdirSync(dir).filter((x) => x.endsWith(".json") && x !== "summary.json").map((x) => JSON.parse(readFileSync(`${dir}/${x}`, "utf8")));
const u = done.reduce((a, d) => { for (const k of Object.keys(d.usage)) a[k] = (a[k] ?? 0) + d.usage[k]; return a; }, {});
// Sonnet 5.5 at $2 in, $10 out a million (check); cache reads a tenth, cache writes 1.25x
const cost = (u.input * 2 + u.cacheRead * 0.2 + u.cacheWrite * 2.5 + u.output * 10) / 1e6;
const lintRules = {};
for (const d of done) for (const [r, n] of Object.entries(d.score.lintRules)) lintRules[r] = (lintRules[r] ?? 0) + n;
const summary = { model: done[0].model, at: new Date().toISOString().slice(0, 10), ...sumScores(done.map((d) => d.score)), lintRules, modulesPlanned: done.reduce((a, d) => a + d.brief.modules.length, 0), modulesBuilt: done.reduce((a, d) => a + d.modules.filter((m) => m.status === "ok").length, 0), imagesPlannedAvg: Math.round(done.reduce((a, d) => a + d.score.images, 0) / done.length * 10) / 10, usage: u, costTotal: Math.round(cost * 100) / 100, costPerArticle: Math.round((cost / done.length) * 100) / 100, secondsAvg: Math.round(done.reduce((a, d) => a + d.seconds, 0) / done.length), byKind: Object.fromEntries(["saas", "store", "agency", "local", "publisher"].map((k) => [k, sumScores(done.filter((d) => d.kind === k).map((d) => d.score))])) };
writeFileSync(`${dir}/summary.json`, JSON.stringify(summary, null, 1) + "\n");
console.log(JSON.stringify(summary, null, 1));
