// Draft and Write, Phase 0 (docs/draft-and-write-build.md): record the research for 20 topics, so every later
// step of the writer is tested offline on real pages. One file per topic in tests/fixtures/writer/<slug>.json.gz.
//
//   NODE_USE_ENV_PROXY=1 DFS_LOGIN=x DFS_PASSWORD=x node scripts/writer-record.mjs [slug ...]
//
// It does what the app's research does (src/lib/articleResearch.ts): Google's top 10 with People Also Ask and the
// AI Overview, the keyword asked as a question to ChatGPT, Gemini and AI Mode, then every page read in Chromium the
// way the worker reads it (scripts/worker.mjs, extract()). robots.txt is respected. A topic already recorded is
// skipped, so a stopped run picks up where it left off and never pays twice. About $0.02 a topic (check).
import { mkdir, writeFile, access } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { createRequire } from "node:module";
import { asQuestion, citedToRead, cleanRead, MAX_CITED, MIN_PAGES, pageUrlOk, readSerp, robotsAllows } from "../src/lib/articleResearch.ts";
import { fixSerpItems } from "../src/lib/serpUrl.ts";
import { cleanSources, linksInText } from "../src/lib/sources.ts";
import { TOPICS } from "../tests/fixtures/writer/topics.mjs";

// Playwright comes from the dev machine (it is not one of the app's packages), so it is loaded with require.
const { chromium } = createRequire(import.meta.url)("playwright");
const OUT = "tests/fixtures/writer";
const API = process.env.DFS_API_URL?.trim() || "https://api.dataforseo.com/v3";
const AUTH = { Authorization: `Basic ${Buffer.from(`${process.env.DFS_LOGIN ?? ""}:${process.env.DFS_PASSWORD ?? ""}`).toString("base64")}` };
const BODY_KEEP = 15_000; // characters of each page kept: enough for fact notes, small enough for the repo
const CITED = 5; // cited pages read per topic, on top of the top 10 (up to MAX_CITED when fewer than MIN_PAGES were read)
const READ_MS = 20_000; // the worker's limit per page
const ENGINES = {
  ChatGPT: { path: "ai_optimization/chat_gpt/llm_scraper", extra: { force_web_search: true } },
  Gemini: { path: "ai_optimization/gemini/llm_scraper", extra: {} },
  "AI Mode": { path: "serp/google/ai_mode", extra: { device: "desktop" } },
};
const READER_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 ArrowsterrBot/1.0 (+https://arrowsterr.com/)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function dfs(path, body) {
  for (let tries = 0; ; tries++) {
    try {
      const res = await fetch(`${API}/${path}`, { method: "POST", headers: { ...AUTH, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(120_000) });
      const json = await res.json();
      const task = json.tasks?.[0];
      if (task?.status_code !== 20000) throw new Error(`DataForSEO ${path}: ${task?.status_message ?? json.status_message}`);
      return task.result?.[0];
    } catch (e) {
      if (tries >= 3) throw e;
      await sleep(1000 * 2 ** tries);
    }
  }
}

// Google redirect links are followed one step, as the app does (src/lib/serpResolve.ts).
async function resolve(u) {
  try {
    const r = await fetch(u, { redirect: "manual", signal: AbortSignal.timeout(6000) });
    const loc = r.headers.get("location");
    if (r.status >= 300 && r.status < 400 && loc) return new URL(loc, u).toString();
    const m = /href="(https?:\/\/(?!(?:www\.)?google\.)[^"]+)"/i.exec(await r.text());
    return m ? m[1].replace(/&amp;/g, "&") : null;
  } catch {
    return null;
  }
}

async function serp(keyword) {
  const result = await dfs("serp/google/organic/live/advanced", [
    { keyword, location_code: 2840, language_code: "en", device: "desktop", depth: 10, load_async_ai_overview: true, expand_ai_overview: true },
  ]);
  if (result?.items) result.items = await fixSerpItems(result.items, resolve);
  return readSerp(result);
}

// The same reading of an answer as src/lib/dataforseo.ts (readAnswerParts), for the three engines asked here.
async function ask(engine, question) {
  const { path, extra } = ENGINES[engine];
  try {
    const result = await dfs(`${path}/live/advanced`, [{ keyword: question.slice(0, 700), location_code: 2840, language_code: "en", ...extra }]);
    const items = result?.items ?? [];
    const toSources = (list) => (list ?? []).filter((s) => s?.url).map((s) => ({ url: s.url, title: s.title ?? null, domain: s.domain ?? "" }));
    if (engine === "AI Mode") {
      const ai = items.find((i) => i.type === "ai_overview") ?? items[0];
      const text = ai?.markdown || (ai?.items ?? []).map((i) => i.markdown || i.text || "").join("\n\n");
      const refs = [...(ai?.references ?? []), ...(ai?.items ?? []).flatMap((i) => i.references ?? [])];
      return { engine, question, answer: text || null, cited: cleanSources(toSources(refs)), error: text ? null : "No answer." };
    }
    const text = (result?.markdown || items.map((i) => i.markdown ?? "").filter(Boolean).join("\n\n")).replace(/\[\d+\]/g, "");
    const cited = cleanSources([...toSources(result?.sources), ...items.flatMap((i) => toSources(i.sources)), ...linksInText(text)]);
    return { engine, question, answer: text || null, cited, error: text ? null : "No answer." };
  } catch (e) {
    return { engine, question, answer: null, cited: [], error: String(e.message ?? e).slice(0, 300) };
  }
}

// ───── Copied from scripts/worker.mjs so the pages read here match the app's. tests/writerFixtures.test.ts checks
// the two copies stay the same. ─────
// Runs inside the page: headings, the main text, tables and the published date.
function extract() {
  const text = (el) => (el?.innerText ?? el?.textContent ?? "").replace(/\s+/g, " ").trim();
  const headings = [...document.querySelectorAll("h1, h2, h3, h4")]
    .filter((h) => h.getClientRects().length > 0)
    .map((h) => ({ level: Number(h.tagName[1]), text: text(h) }))
    .filter((h) => h.text)
    .slice(0, 200);
  const meta = (sel) => document.querySelector(sel)?.getAttribute("content") || null;
  let published =
    meta('meta[property="article:published_time"]') || meta('meta[itemprop="datePublished"]') || meta('meta[name="date"]') || meta('meta[name="publish-date"]') || meta('meta[name="pubdate"]');
  const inLd = (x) => {
    if (!x || typeof x !== "object") return null;
    if (Array.isArray(x)) {
      for (const y of x) {
        const found = inLd(y);
        if (found) return found;
      }
      return null;
    }
    return typeof x.datePublished === "string" ? x.datePublished : inLd(x["@graph"]);
  };
  for (const s of published ? [] : document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      published = inLd(JSON.parse(s.textContent || ""));
    } catch {}
    if (published) break;
  }
  published ||= document.querySelector("[itemprop=datePublished]")?.getAttribute("datetime") || document.querySelector("article time[datetime], time[datetime]")?.getAttribute("datetime") || null;
  const main = document.querySelector("article") || document.querySelector("main, [role=main]") || document.body;
  for (const el of main.querySelectorAll("script, style, noscript, svg, nav, footer, aside, form, iframe, [aria-hidden=true]")) el.remove();
  const tables = [...main.querySelectorAll("table")]
    .slice(0, 10)
    .map((t) => [...t.rows].slice(0, 50).map((r) => [...r.cells].slice(0, 12).map((c) => text(c).slice(0, 300))))
    .filter((t) => t.length > 1);
  let body = (main.innerText || "").trim();
  if (main !== document.body && body.split(/\s+/).length < 150) body = (document.body.innerText || "").trim();
  return {
    title: document.querySelector('meta[property="og:title"]')?.getAttribute("content") || document.title || null,
    headings,
    body: body.slice(0, 60_000),
    word_count: body.split(/\s+/).filter(Boolean).length,
    tables,
    published_at: published,
    login: Boolean(document.querySelector('input[type="password"]')),
  };
}
// ───── end of the copy ─────

const robots = new Map();
async function allowed(url) {
  const u = new URL(url);
  if (!robots.has(u.origin)) {
    robots.set(
      u.origin,
      fetch(`${u.origin}/robots.txt`, { headers: { "User-Agent": READER_UA }, signal: AbortSignal.timeout(8000) })
        .then((r) => (r.ok ? r.text() : ""))
        .catch(() => ""),
    );
  }
  return robotsAllows(await robots.get(u.origin), u.pathname + u.search);
}

async function read(browser, url) {
  const ok = pageUrlOk(url);
  if (!ok.ok) return { ok: false, reason: ok.reason, error: ok.error };
  if (!(await allowed(url))) return { ok: false, reason: "robots", error: "robots.txt asks us not to read this page." };
  const context = await browser.newContext({ userAgent: READER_UA, viewport: { width: 1280, height: 1600 }, acceptDownloads: false, serviceWorkers: "block" });
  try {
    await context.route("**/*", (route) => (["image", "media", "font"].includes(route.request().resourceType()) ? route.abort() : route.continue()));
    const page = await context.newPage();
    page.on("dialog", (d) => d.dismiss().catch(() => {}));
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: READ_MS });
    const status = res?.status() ?? 0;
    if (status === 401 || status === 403 || status === 407) return { ok: false, reason: "blocked", error: `The page answered ${status}.` };
    if (!res || status >= 400) return { ok: false, reason: "failed", error: `The page answered ${status || "nothing"}.` };
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    const raw = await Promise.race([page.evaluate(extract), sleep(5000).then(() => Promise.reject(new Error("Timeout: reading the page took too long.")))]);
    if (raw.login && raw.word_count < 300) return { ok: false, reason: "blocked", error: "The page asks for a login." };
    if (raw.word_count < 150) return { ok: false, reason: "empty", error: `Only ${raw.word_count} words.` };
    const r = cleanRead(raw);
    return { ok: true, final_url: page.url(), ...r, body: r.body.slice(0, BODY_KEEP), tables: r.tables.slice(0, 3) };
  } catch (e) {
    return { ok: false, reason: /timeout/i.test(String(e)) ? "timeout" : "failed", error: String(e.message ?? e).split("\n")[0].slice(0, 300) };
  } finally {
    await context.close().catch(() => {});
  }
}

async function readAll(browser, list) {
  const out = new Array(list.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (next < list.length) {
        const i = next++;
        out[i] = await read(browser, list[i].url);
      }
    }),
  );
  return out;
}

const exists = (p) => access(p).then(() => true, () => false);

async function record(browser, t) {
  const file = `${OUT}/${t.slug}.json.gz`;
  if (await exists(file)) return console.log(`${t.slug}: already recorded`);
  const started = Date.now();
  const s = await serp(t.keyword);
  const question = asQuestion(t.keyword);
  const answers = await Promise.all(Object.keys(ENGINES).map((e) => ask(e, question)));
  const allCited = citedToRead(answers.filter((a) => a.answer), s.organic.map((o) => o.url), MAX_CITED);
  const list = [...s.organic.map((o) => ({ url: o.url, source: "serp", position: o.position })), ...allCited.slice(0, CITED).map((url) => ({ url, source: "ai", position: null }))];
  const reads = await readAll(browser, list);
  // Like the app, a topic with too few pages read takes more of the cited pages.
  if (reads.filter((r) => r.ok).length < MIN_PAGES && allCited.length > CITED) {
    const more = allCited.slice(CITED).map((url) => ({ url, source: "ai", position: null }));
    list.push(...more);
    reads.push(...(await readAll(browser, more)));
  }
  const pages = [];
  const skipped = [];
  list.forEach((p, i) => {
    const r = reads[i];
    if (r.ok) pages.push({ url: p.url, final_url: r.final_url, source: p.source, position: p.position, title: r.title, headings: r.headings, body: r.body, word_count: r.word_count, tables: r.tables, published_at: r.published_at });
    else skipped.push({ url: p.url, source: p.source, reason: r.reason, error: r.error });
  });
  const fixture = { v: 1, slug: t.slug, keyword: t.keyword, kind: t.kind, stage: t.stage, volume: t.volume, recorded: new Date().toISOString().slice(0, 10), brand: t.brand, serp: s, answers, pages, skipped };
  await writeFile(file, gzipSync(JSON.stringify(fixture)));
  console.log(`${t.slug}: ${pages.length} pages read (${pages.filter((p) => p.source === "ai").length} cited), ${skipped.length} skipped, ${s.paa.length} questions, AI Overview ${s.aiOverview.shown ? "shown" : "none"}, ${answers.filter((a) => a.answer).length} of ${answers.length} answers, ${Math.round((Date.now() - started) / 1000)}s`);
}

const only = process.argv.slice(2);
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  for (const t of TOPICS.filter((x) => !only.length || only.includes(x.slug))) {
    try {
      await record(browser, t);
    } catch (e) {
      console.log(`${t.slug}: failed, ${String(e.message ?? e).slice(0, 300)}`);
    }
  }
} finally {
  await browser.close();
}
