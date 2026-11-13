// Content v3 phase 1: record Google's top 10 for 3 real keyword sets, so tests/clusters.test.ts can check
// clusters on real results (docs/content-v3-backend.md, section 11).
//   NODE_USE_ENV_PROXY=1 node scripts/cluster-record.mjs        (about $0.002 a keyword, 72 keywords)
import { mkdir, writeFile } from "node:fs/promises";
import { fixSerpItems } from "../src/lib/serpUrl.ts";

// [keyword, theme, stage, volume, difficulty]
const SETS = {
  "running-shoes": {
    own: "brooksrunning.com",
    keywords: [
      ["best running shoes for beginners", "Running shoes", "bofu", 18100, 42],
      ["beginner running shoes", "Running shoes", "bofu", 2900, 38],
      ["running shoes for flat feet", "Running shoes", "mofu", 9900, 38],
      ["best running shoes for flat feet", "Running shoes", "bofu", 8100, 40],
      ["best cushioned running shoes", "Running shoes", "bofu", 8100, 47],
      ["most cushioned running shoes", "Running shoes", "bofu", 3600, 44],
      ["how to choose running shoes", "Running shoes", "tofu", 6600, 31],
      ["running shoes vs walking shoes", "Running shoes", "tofu", 3600, 24],
      ["best trail running shoes", "Trail running", "bofu", 22200, 55],
      ["trail running shoes for beginners", "Trail running", "bofu", 4400, 33],
      ["trail vs road running shoes", "Trail running", "tofu", 5400, 29],
      ["waterproof trail running shoes", "Trail running", "mofu", 2900, 36],
      ["marathon training plan", "Marathon", "tofu", 33100, 61],
      ["beginner marathon training plan", "Marathon", "tofu", 6600, 48],
      ["best shoes for marathon training", "Marathon", "bofu", 6600, 44],
      ["best marathon running shoes", "Marathon", "bofu", 5400, 46],
      ["how many miles a week for a marathon", "Marathon", "tofu", 2400, 22],
      ["how often to replace running shoes", "Running shoes", "tofu", 5400, 27],
      ["when to replace running shoes", "Running shoes", "tofu", 2400, 25],
      ["best running socks", "Gear", "bofu", 4400, 30],
      ["best running shorts", "Gear", "bofu", 3600, 33],
      ["running shoes for wide feet", "Running shoes", "mofu", 6600, 35],
      ["best stability running shoes", "Running shoes", "bofu", 5400, 43],
      ["neutral vs stability running shoes", "Running shoes", "tofu", 1900, 21],
    ],
  },
  "project-management": {
    own: "asana.com",
    keywords: [
      ["best project management software", "Project management", "bofu", 22200, 78],
      ["project management software for small business", "Project management", "bofu", 2900, 61],
      ["free project management software", "Project management", "bofu", 9900, 70],
      ["project management tools", "Project management", "mofu", 18100, 75],
      ["what is project management", "Project management", "tofu", 12100, 72],
      ["project management methodologies", "Project management", "tofu", 6600, 58],
      ["agile vs waterfall", "Methods", "tofu", 8100, 52],
      ["what is agile methodology", "Methods", "tofu", 9900, 66],
      ["scrum vs kanban", "Methods", "tofu", 6600, 47],
      ["kanban board software", "Methods", "bofu", 2400, 55],
      ["best kanban app", "Methods", "bofu", 1600, 49],
      ["gantt chart software", "Planning", "bofu", 6600, 60],
      ["free gantt chart maker", "Planning", "bofu", 3600, 54],
      ["how to make a gantt chart", "Planning", "tofu", 4400, 41],
      ["project timeline template", "Planning", "mofu", 5400, 39],
      ["project plan template", "Planning", "mofu", 6600, 44],
      ["trello alternatives", "Comparisons", "bofu", 2900, 45],
      ["monday.com alternatives", "Comparisons", "bofu", 1900, 40],
      ["jira vs trello", "Comparisons", "bofu", 2400, 42],
      ["clickup vs monday", "Comparisons", "bofu", 1600, 37],
      ["resource management software", "Planning", "bofu", 2900, 52],
      ["task management app", "Project management", "bofu", 6600, 63],
      ["team collaboration tools", "Project management", "mofu", 3600, 59],
      ["how to manage multiple projects", "Project management", "tofu", 1300, 28],
    ],
  },
  "bookkeeping": {
    own: "bench.co",
    keywords: [
      ["bookkeeping services for small business", "Bookkeeping", "bofu", 4400, 46],
      ["online bookkeeping services", "Bookkeeping", "bofu", 2900, 50],
      ["outsourced bookkeeping", "Bookkeeping", "bofu", 1600, 38],
      ["bookkeeping cost", "Bookkeeping", "bofu", 1300, 31],
      ["how much does a bookkeeper cost", "Bookkeeping", "bofu", 1900, 28],
      ["bookkeeper vs accountant", "Bookkeeping", "mofu", 2400, 26],
      ["what does a bookkeeper do", "Bookkeeping", "tofu", 6600, 35],
      ["how to do bookkeeping for small business", "Bookkeeping", "tofu", 2900, 33],
      ["small business tax deductions", "Taxes", "tofu", 8100, 55],
      ["self employed tax deductions", "Taxes", "tofu", 6600, 52],
      ["quarterly estimated taxes", "Taxes", "tofu", 4400, 49],
      ["how to file taxes for llc", "Taxes", "tofu", 3600, 44],
      ["tax preparation services for small business", "Taxes", "bofu", 1900, 41],
      ["best accounting software for small business", "Software", "bofu", 9900, 74],
      ["quickbooks alternatives", "Software", "bofu", 3600, 47],
      ["xero vs quickbooks", "Software", "bofu", 4400, 51],
      ["free accounting software", "Software", "bofu", 6600, 68],
      ["cash flow statement", "Finance basics", "tofu", 9900, 58],
      ["profit and loss statement template", "Finance basics", "mofu", 5400, 40],
      ["balance sheet example", "Finance basics", "tofu", 4400, 46],
      ["accrual vs cash accounting", "Finance basics", "tofu", 2900, 34],
      ["chart of accounts", "Finance basics", "tofu", 6600, 50],
      ["catch up bookkeeping", "Bookkeeping", "bofu", 1000, 22],
      ["bookkeeping for startups", "Bookkeeping", "bofu", 880, 30],
    ],
  },
};

const API = process.env.DFS_API_URL?.trim() || "https://api.dataforseo.com/v3";
const auth = process.env.DFS_LOGIN ? { Authorization: `Basic ${Buffer.from(`${process.env.DFS_LOGIN}:${process.env.DFS_PASSWORD}`).toString("base64")}` } : {};

// Google redirect links (google.com/goto?url=...) are followed one step, as the app does (src/lib/serpResolve.ts).
async function resolve(u) {
  const r = await fetch(u, { redirect: "manual", signal: AbortSignal.timeout(6000) });
  const loc = r.headers.get("location");
  if (r.status >= 300 && r.status < 400 && loc) return new URL(loc, u).toString();
  const m = /href="(https?:\/\/(?!(?:www\.)?google\.)[^"]+)"/i.exec(await r.text());
  return m ? m[1].replace(/&amp;/g, "&") : null;
}

async function top10(keyword) {
  for (let tries = 0; tries < 4; tries++) {
    try {
      const res = await fetch(`${API}/serp/google/organic/live/regular`, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify([{ keyword, location_code: 2840, language_code: "en", depth: 10 }]),
      });
      const json = await res.json();
      const items = await fixSerpItems(json.tasks?.[0]?.result?.[0]?.items ?? [], resolve);
      return items.filter((i) => i.type === "organic" && i.url).slice(0, 10).map((i) => i.url);
    } catch (e) {
      if (tries === 3) throw e;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** tries));
    }
  }
}

await mkdir("tests/fixtures/clusters", { recursive: true });
for (const [name, set] of Object.entries(SETS)) {
  const rows = [];
  for (let i = 0; i < set.keywords.length; i += 6) {
    const batch = set.keywords.slice(i, i + 6);
    const got = await Promise.all(batch.map(async ([keyword, theme, stage, volume, kd]) => ({ keyword, theme, stage, volume, kd, serp: await top10(keyword) })));
    rows.push(...got);
  }
  await writeFile(`tests/fixtures/clusters/${name}.json`, JSON.stringify({ own: set.own, recorded: new Date().toISOString().slice(0, 10), keywords: rows }, null, 1) + "\n");
  console.log(name, rows.length, "keywords,", rows.filter((r) => r.serp.length).length, "with results");
}
