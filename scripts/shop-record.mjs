// AI Shopping phase 1: record real ChatGPT and Google AI Mode answers as test fixtures.
// Runs every prompt in tests/fixtures/shop/prompts.json on both engines (live queue) and saves each
// task's result untouched, so the parsers in src/lib/shopParse.ts are written and tested against real data.
//
//   node scripts/shop-record.mjs            records prompts that have no fixture yet
//   node scripts/shop-record.mjs --again    records every prompt again
//
// Needs DFS_LOGIN and DFS_PASSWORD (or a proxy that adds the login). About $0.004 a task (DataForSEO reported $0.32 for all 80).
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { join } from "node:path";

const API = process.env.DFS_API_URL?.trim() || "https://api.dataforseo.com/v3";
const DIR = new URL("../tests/fixtures/shop/", import.meta.url).pathname;
const ENGINES = {
  gpt: { path: "ai_optimization/chat_gpt/llm_scraper/live/advanced", body: { force_web_search: true } },
  aim: { path: "serp/google/ai_mode/live/advanced", body: { device: "desktop" } },
};
const again = process.argv.includes("--again");
const only = process.argv.find((a) => a.startsWith("--engine="))?.split("=")[1];

const auth = process.env.DFS_LOGIN ? `Basic ${Buffer.from(`${process.env.DFS_LOGIN}:${process.env.DFS_PASSWORD}`).toString("base64")}` : null;
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
const exists = (p) => access(p).then(() => true, () => false);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(path, task) {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(`${API}/${path}`, {
        method: "POST",
        headers: { ...(auth ? { Authorization: auth } : {}), "Content-Type": "application/json" },
        body: JSON.stringify([task]),
        signal: AbortSignal.timeout(240_000),
      });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { final: true });
      const data = await res.json();
      const t = data.tasks?.[0];
      if (t?.status_code !== 20000) throw Object.assign(new Error(`${t?.status_code} ${t?.status_message}`), { final: t?.status_code < 50000 });
      return t;
    } catch (e) {
      if (e.final || i >= 3) throw e;
      await wait(2000 * 2 ** i);
    }
  }
}

const prompts = JSON.parse(await readFile(join(DIR, "prompts.json"), "utf8"));
const jobs = [];
for (const [i, p] of prompts.entries()) {
  for (const [eng, cfg] of Object.entries(ENGINES)) {
    if (only && only !== eng) continue;
    const file = join(DIR, eng, `${String(i + 1).padStart(2, "0")}-${slug(p.q)}.json`);
    if (!again && (await exists(file))) continue;
    jobs.push({ p, eng, cfg, file });
  }
}
await mkdir(join(DIR, "gpt"), { recursive: true });
await mkdir(join(DIR, "aim"), { recursive: true });

let cost = 0, done = 0, failed = 0;
async function worker() {
  for (let job = jobs.shift(); job; job = jobs.shift()) {
    const { p, eng, cfg, file } = job;
    try {
      const t = await post(cfg.path, { keyword: p.q, location_code: 2840, language_code: "en", ...cfg.body });
      cost += Number(t.cost ?? 0);
      const out = { prompt: p.q, kind: p.kind, engine: eng, recorded_at: new Date().toISOString(), result: t.result?.[0] ?? null };
      await writeFile(file, JSON.stringify(out, null, 1) + "\n");
      done++;
      console.log(`ok   ${eng} ${p.q}`);
    } catch (e) {
      failed++;
      console.log(`fail ${eng} ${p.q}: ${e.message}`);
    }
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
console.log(`\n${done} saved, ${failed} failed, cost $${cost.toFixed(4)}`);
