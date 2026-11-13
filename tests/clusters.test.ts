import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  buildClusters,
  chanceOf,
  CLUSTER_CAP,
  cleanLink,
  clusterName,
  edgesOf,
  findGaps,
  gapReason,
  gapStage,
  levelOf,
  matchClusters,
  median,
  nameOk,
  noisyLinks,
  samePlanKeyword,
  scoreOf,
  UPDATES_GROUP,
  wordsOf,
  type ClusterPage,
} from "../src/lib/clusters.ts";
import { groupBySerp } from "../src/lib/research.ts";
import type { AgentKeyword } from "../src/lib/research.ts";

type Recorded = { own: string; keywords: { keyword: string; theme: string; stage: "bofu" | "mofu" | "tofu"; volume: number; kd: number; serp: string[] }[] };
const SETS = ["running-shoes", "project-management", "bookkeeping"].map((n) => ({ name: n, ...(JSON.parse(readFileSync(new URL(`./fixtures/clusters/${n}.json`, import.meta.url), "utf8")) as Recorded) }));

const siteOf = (u: string) => {
  try {
    const h = new URL(u).hostname.toLowerCase().replace(/^www\./, "");
    return /(^|\.)google\./.test(h) ? "" : h;
  } catch {
    return "";
  }
};

/** The plan job's path on recorded results: clean links, drop noise, group keywords into pages, pages into clusters. */
function pagesOf(set: Recorded): ClusterPage[] {
  const cleaned = new Map(set.keywords.map((k) => [k.keyword, k.serp.map((u) => cleanLink(u, set.own)).filter((u): u is string => Boolean(u))]));
  const noise = noisyLinks([...cleaned.values()]);
  const serps = new Map([...cleaned].map(([k, l]) => [k, l.filter((u) => !noise.has(u))]));
  const list: AgentKeyword[] = set.keywords.map((k) => ({ keyword: k.keyword, volume: k.volume, kd: k.kd, cpc: null, intent: null, trend: [], serp: [], stage: k.stage, theme: k.theme, group: -1 }));
  const sites = new Map(set.keywords.map((k) => [k.keyword, k.serp.map(siteOf).filter(Boolean)]));
  return groupBySerp(list, serps).map((g) => ({ key: g.primary, keywords: g.keywords, theme: g.theme, volume: g.volume, links: [...new Set(g.keywords.flatMap((k) => serps.get(k) ?? []))], domains: [...new Set(g.keywords.flatMap((k) => sites.get(k) ?? []))] }));
}

test("links are cleaned so the same page always matches", () => {
  assert.equal(cleanLink("https://www.REI.com/learn/expert-advice/running-shoes.html?x=1#top"), "rei.com/learn/expert-advice/running-shoes.html");
  assert.equal(cleanLink("https://runnersworld.com/gear/best-running-shoes/"), "runnersworld.com/gear/best-running-shoes");
  assert.equal(cleanLink("https://runnersworld.com/"), null, "home pages link nothing");
  assert.equal(cleanLink("https://hive.com/blog"), null, "section pages link nothing");
  assert.equal(cleanLink("https://onclouder.com/best-beginner-running-shoes-to-..."), "onclouder.com/best-beginner-running-shoes-to-", "Google's shortened slugs keep their start");
  assert.equal(cleanLink("https://google.com/goto?url=CAES"), null);
  assert.equal(cleanLink("http://rei.com/learn/running-shoes"), cleanLink("https://www.rei.com/learn/running-shoes/"));
  assert.equal(cleanLink("https://shop.brooksrunning.com/x", "brooksrunning.com"), null, "the brand's own pages never link topics");
  assert.equal(cleanLink("not a url at all"), null);
});

test("links that show in most results are noise", () => {
  const lists = [["a", "wiki"], ["b", "wiki"], ["c", "wiki"], ["d", "wiki"], ["e", "f"], ["g", "h"]];
  assert.deepEqual([...noisyLinks(lists)], ["wiki"]);
  assert.equal(noisyLinks(lists.slice(0, 3)).size, 0, "too few lists to call anything noise");
});

test("words drop small words and a trailing s", () => {
  assert.deepEqual(wordsOf("Best Running Shoes for Beginners"), ["best", "running", "shoe", "beginner"]);
  assert.deepEqual(wordsOf("shoes for flat feet", true), ["shoe", "for", "flat", "feet"]);
  assert.deepEqual(wordsOf("glass"), ["glass"]);
});

for (const set of SETS) {
  test(`${set.name}: every page is in exactly one cluster, none over ${CLUSTER_CAP}, one pillar each`, () => {
    const pages = pagesOf(set);
    const clusters = buildClusters(pages);
    const seen = clusters.flatMap((c) => c.pages);
    assert.equal(seen.length, pages.length);
    assert.equal(new Set(seen).size, pages.length);
    for (const c of clusters) {
      assert.ok(c.pages.length <= CLUSTER_CAP, `${c.pillar} has ${c.pages.length}`);
      assert.ok(c.pages.includes(c.pillar));
      assert.equal(c.pages[0], c.pillar, "the pillar comes first");
    }
    // Real results join some pages: a plan where nothing clusters would mean the links never match.
    assert.ok(clusters.some((c) => c.pages.length > 1), "some pages share links");
  });

  test(`${set.name}: the same input gives the same clusters in 20 runs, in any order`, () => {
    const pages = pagesOf(set);
    const first = JSON.stringify(buildClusters(pages));
    for (let i = 0; i < 20; i++) {
      const shuffled = [...pages].sort(() => (((i * 7919) % 13) / 13 > 0.5 ? 1 : -1)).reverse();
      assert.equal(JSON.stringify(buildClusters(shuffled)), first);
    }
  });

  test(`${set.name}: noise links never join clusters`, () => {
    const all = set.keywords.map((k) => k.serp.map((u) => cleanLink(u, set.own)).filter((u): u is string => Boolean(u)));
    const noise = noisyLinks(all);
    for (const p of pagesOf(set)) for (const u of p.links) assert.ok(!noise.has(u), `${u} is noise`);
  });
}

test("recorded plans: related keywords end up together, with the broad page as pillar", () => {
  const find = (set: string, kw: string) => buildClusters(pagesOf(SETS.find((s) => s.name === set)!)).find((c) => c.pages.includes(kw))!;
  const trail = find("running-shoes", "best trail running shoes");
  for (const k of ["trail running shoes for beginners", "waterproof trail running shoes", "trail vs road running shoes"]) assert.ok(trail.pages.includes(k), k);
  assert.equal(trail.pillar, "best trail running shoes");
  const marathon = find("running-shoes", "marathon training plan");
  assert.ok(marathon.pages.includes("how many miles a week for a marathon"));
  assert.ok(!marathon.pages.includes("best trail running shoes"));
  const comp = find("project-management", "trello alternatives");
  assert.ok(comp.pages.includes("jira vs trello") && comp.pages.includes("clickup vs monday"));
  const soft = find("bookkeeping", "best accounting software for small business");
  assert.ok(soft.pages.includes("quickbooks alternatives") && soft.pages.includes("xero vs quickbooks"));
  assert.equal(soft.pillar, "best accounting software for small business");
});

test("the size cap keeps the strongest links together", () => {
  // 14 pages all sharing one link, and two tight pairs sharing 5.
  const pages: ClusterPage[] = Array.from({ length: 14 }, (_, i) => ({ key: `kw ${String(i).padStart(2, "0")}`, keywords: [`kw ${i}`], theme: "T", volume: 100 + i, links: ["shared.com/a"] }));
  pages[0].links.push(...["p.com/1", "p.com/2", "p.com/3", "p.com/4"]);
  pages[1].links.push(...["p.com/1", "p.com/2", "p.com/3", "p.com/4"]);
  const out = buildClusters(pages);
  assert.ok(out.every((c) => c.pages.length <= 12));
  const withZero = out.find((c) => c.pages.includes("kw 00"))!;
  assert.ok(withZero.pages.includes("kw 01"), "the pair with 5 shared links stays together");
});

test("a page with no shared links joins its theme by words, or stands alone; lone updates group together", () => {
  const pages: ClusterPage[] = [
    { key: "best trail running shoes", keywords: ["best trail running shoes"], theme: "Trail", volume: 1000, links: ["a.com/1", "a.com/2"] },
    { key: "trail running shoes for women", keywords: ["trail running shoes for women"], theme: "Trail", volume: 500, links: ["a.com/1"] },
    { key: "waterproof trail running shoes", keywords: ["waterproof trail running shoes"], theme: "Trail", volume: 300, links: ["z.com/9"] },
    { key: "marathon pace chart", keywords: ["marathon pace chart"], theme: "Marathon", volume: 200, links: ["m.com/1"] },
    { key: "glide 3 review", keywords: ["glide 3 review"], theme: "Reviews", volume: 90, links: ["r.com/1"], update: true },
    { key: "pacer 5 review", keywords: ["pacer 5 review"], theme: "Reviews", volume: 80, links: ["r.com/2"], update: true },
  ];
  const out = buildClusters(pages);
  const trail = out.find((c) => c.pages.includes("best trail running shoes"))!;
  assert.ok(trail.pages.includes("waterproof trail running shoes"), "joined by its words");
  assert.equal(trail.pillar, "best trail running shoes");
  assert.ok(out.some((c) => c.pages.length === 1 && c.pillar === "marathon pace chart"));
  const upd = out.find((c) => c.updates)!;
  assert.deepEqual(upd.pages.sort(), ["glide 3 review", "pacer 5 review"]);
  assert.equal(upd.theme, UPDATES_GROUP);
});

test("links: shared pages first; one shared page needs shared words; themes stay apart without a shared page", () => {
  const p = (key: string, theme: string, links: string[], domains?: string[]) => ({ key, keywords: [key], theme, volume: 0, links, ...(domains ? { domains } : {}) });
  const e = edgesOf([
    p("trail running shoes", "Trail", ["a.com/1", "a.com/2"]),
    p("trail shoes for women", "Trail", ["a.com/1", "a.com/2"]),
    p("marathon plan", "Marathon", ["a.com/1"]),
    p("waterproof trail shoes", "Trail", [], ["x.com", "y.com"]),
    p("trail shoe sizes", "Trail", [], ["x.com", "y.com"]),
    p("marathon shoe sizes", "Marathon", [], ["x.com", "y.com"]),
  ]);
  const has = (a: string, b: string) => e.some((x) => { const k = [x.a, x.b]; return k.length === 2 && [a, b].every((n) => k.some((i) => ["trail running shoes", "trail shoes for women", "marathon plan", "waterproof trail shoes", "trail shoe sizes", "marathon shoe sizes"][i] === n)); });
  assert.ok(has("trail running shoes", "trail shoes for women"), "2 shared pages");
  assert.ok(!has("trail running shoes", "marathon plan"), "1 shared page and no shared words");
  assert.ok(has("waterproof trail shoes", "trail shoe sizes"), "same theme, 2 shared sites and shared words");
  assert.ok(!has("trail shoe sizes", "marathon shoe sizes"), "different themes need a shared page");
  assert.ok(e[0].w >= e[e.length - 1].w, "strongest first");
});

test("cluster names must use the cluster's own words", () => {
  const kws = ["best running shoes for beginners", "beginner running shoes", "running shoes for flat feet"];
  assert.ok(nameOk("Running shoes for beginners", kws));
  assert.ok(!nameOk("Footwear for new runners", kws), "footwear is not in the keywords");
  assert.ok(!nameOk("Shoes", kws), "too short");
  assert.ok(!nameOk("best running shoes for flat beginners feet", kws), "too long");
  assert.equal(clusterName("Footwear guide", "best running shoes for beginners", kws), "Best running shoes for beginners");
  assert.equal(clusterName("Running shoes.", "x", kws), "Running shoes");
});

test("chance and score follow the plan's formula", () => {
  assert.equal(chanceOf(40), 0.6);
  assert.equal(chanceOf(40, 8), 0.9);
  assert.equal(chanceOf(40, 15), 0.75);
  assert.equal(chanceOf(0, 5), 0.95, "capped");
  assert.equal(scoreOf({ volume: 1000, stage: "bofu", kd: 40 }, 0), 1800);
  assert.equal(scoreOf({ volume: 1000, stage: "bofu", kd: 40, gap: true }, 0), 2700);
  assert.equal(scoreOf({ volume: 1000, stage: "tofu", kd: 40, update: true }, 0), 720);
  assert.equal(scoreOf({ volume: null, stage: "mofu", kd: 50 }, 2000), 2000, "AI-only rows use the median volume");
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([4, 1, 3, 2]), 3);
});

test("levels split the brand's own scores in thirds", () => {
  const all = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  assert.equal(levelOf(9, all, 0.1), "high");
  assert.equal(levelOf(5, all, 0.9), "medium");
  assert.equal(levelOf(1, all, 0.9), "low");
  assert.equal(levelOf(1, [1, 2], 0.7), "high", "few rows use the chance");
  assert.equal(levelOf(1, [1, 2], 0.2), "low");
});

test("clusters keep their ids between runs at 50% overlap, each id used once", () => {
  const old = [
    { id: "c1", keywords: ["a", "b", "c", "d"] },
    { id: "c2", keywords: ["x", "y"] },
  ];
  const fresh = [{ keywords: ["a", "b", "c", "e"] }, { keywords: ["a", "b"] }, { keywords: ["q"] }, { keywords: ["x", "y", "z"] }];
  const m = matchClusters(old, fresh);
  assert.equal(m.get(0), "c1");
  assert.equal(m.has(1), false, "c1 is already taken by the better match");
  assert.equal(m.has(2), false);
  assert.equal(m.get(3), "c2");
});

test("a second run with 20% of keywords changed keeps at least 80% of cluster ids", () => {
  const set = SETS[0];
  const before = buildClusters(pagesOf(set));
  const changed = { ...set, keywords: set.keywords.map((k, i) => (i % 5 === 4 ? { ...k, keyword: `${k.keyword} 2026` } : k)) };
  const after = buildClusters(pagesOf(changed));
  const old = before.map((c, i) => ({ id: `c${i}`, keywords: c.pages }));
  const m = matchClusters(old, after.map((c) => ({ keywords: c.pages.map((k) => k.replace(/ 2026$/, "")) })));
  assert.ok(m.size / before.length >= 0.8, `${m.size} of ${before.length} kept`);
});

test("AI gaps: a competitor in 2 or more runs and the brand in none", () => {
  const rows = [
    { engine: "ChatGPT", prompt: "best running shoes for beginners", names: ["Northpeak", "Velora"], brandNamed: false },
    { engine: "ChatGPT", prompt: "best running shoes for beginners", names: ["Northpeak"], brandNamed: false },
    { engine: "Gemini", prompt: "best running shoes for beginners", names: ["Velora"], brandNamed: false },
    { engine: "ChatGPT", prompt: "best trail shoes", names: ["Northpeak"], brandNamed: false },
    { engine: "ChatGPT", prompt: "best marathon shoes", names: ["Northpeak"], brandNamed: false },
    { engine: "Gemini", prompt: "best marathon shoes", names: ["Stride", "Northpeak"], brandNamed: true },
  ];
  const gaps = findGaps(rows, ["Northpeak", "Velora"]);
  assert.equal(gaps.length, 1, "one run is not enough, and a brand mention ends the gap");
  assert.equal(gaps[0].engine, "ChatGPT");
  assert.deepEqual(gaps[0].competitors, ["Northpeak", "Velora"]);
  assert.equal(gapReason(gaps[0].engine, gaps[0].competitors), "ChatGPT names Northpeak and Velora");
  assert.equal(gapReason("Gemini", ["A", "B", "C", "D"]), "Gemini names A, B and C");
});

test("a gap keyword already in the plan is dropped; gap stage reads the wording", () => {
  assert.ok(samePlanKeyword({ keyword: "best beginner running shoes", links: [] }, { keyword: "best running shoes for beginners", links: [] }));
  assert.ok(samePlanKeyword({ keyword: "x", links: ["1", "2", "3"] }, { keyword: "y", links: ["1", "2", "3", "4"] }));
  assert.ok(!samePlanKeyword({ keyword: "trail shoes", links: ["1"] }, { keyword: "marathon plan", links: ["1"] }));
  assert.equal(gapStage("best shoes for flat feet"), "bofu");
  assert.equal(gapStage("which running shoe brand is comfortable"), "mofu");
});
