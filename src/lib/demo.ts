// Example data for the six SEO tools (Site Audit, On-page Audit, Backlinks, Link Building, Content Map, Local
// Research). Each screen shows it, marked "Example data", until the brand has real results, so every part of the
// screen can be tried at once. Built with the same code the real tools use, so the numbers hold together. Pure.

import type { AuditResult } from "./audit";
import type { GapRow, LinkRow, Overview } from "./backlinks";
import type { ContentMap, Topic } from "./contentMap";
import type { ListingCheck, Location, ScanResult } from "./local";
import { GRID } from "./local.ts";
import { audit, type OnpageResult, type PageRead } from "./onpage.ts";

export type DemoBrand = { name: string; domain: string };
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString();
const host = (b: DemoBrand) => b.domain.replace(/^www\./, "");

// ─────────────── Site Audit ───────────────

export function demoSiteAudit(b: DemoBrand) {
  const d = host(b);
  const p = (path: string) => `https://${d}${path}`;
  const result: AuditResult = {
    pages: [],
    found: 212,
    sitemap: `https://${d}/sitemap.xml`,
    blockedBots: [],
    llmsTxt: false,
    brokenLinks: [
      { url: p("/blog/old-pricing-guide"), status: 404, from: p("/blog/how-to-choose") },
      { url: p("/case-studies/acme"), status: 404, from: p("/customers") },
    ],
    issues: [
      { id: "broken_links", severity: "high", title: "Links to pages that don't exist", why: "Broken links waste crawl time and send readers to dead ends.", count: 2, pages: [p("/blog/how-to-choose"), p("/customers")] },
      { id: "missing_description", severity: "medium", title: "Pages without a meta description", why: "Search results and AI tools fall back to random text from the page.", count: 14, pages: [p("/blog/ai-search-guide"), p("/features"), p("/integrations"), p("/blog/seo-checklist")], play: "meta" },
      { id: "missing_alt", severity: "medium", title: "Images without alt text", why: "Alt text tells Google Images, screen readers and AI tools what an image shows.", count: 23, pages: [p("/"), p("/features"), p("/blog/ai-search-guide")], play: "alt" },
      { id: "no_schema", severity: "medium", title: "Pages without structured data", why: "Schema helps Google and AI tools understand what a page is and who wrote it.", count: 31, pages: [p("/pricing"), p("/about"), p("/contact")], play: "schema" },
      { id: "long_title", severity: "low", title: "Titles longer than 60 characters", why: "Long titles get cut off in search results.", count: 9, pages: [p("/blog/seo-checklist"), p("/blog/content-audit")], play: "meta" },
      { id: "thin", severity: "low", title: "Pages with under 300 words", why: "Thin pages rarely rank or get cited.", count: 6, pages: [p("/contact"), p("/careers")] },
      { id: "no_llms_txt", severity: "low", title: "No llms.txt file", why: "llms.txt gives AI tools a short map of your most useful pages.", count: 1, pages: [] },
    ],
  };
  const row = { id: "demo-now", status: "done" as const, score: 78, pages: 184, step: "Done", error: null, created_at: daysAgo(1), finished_at: daysAgo(1), result };
  const before = { ...result, issues: result.issues.filter((i) => i.id !== "broken_links").concat([{ id: "slow", severity: "low", title: "Pages slower than 3 seconds to respond", why: "Slow pages get crawled less and lose readers.", count: 4, pages: [] }]) };
  const history = [62, 66, 71, 72, 74].map((s, i) => ({ id: `demo-${i}`, status: "done" as const, score: s, pages: 180, step: "Done", error: null, created_at: daysAgo(8 + (4 - i) * 7), finished_at: daysAgo(8 + (4 - i) * 7), result: i === 4 ? before : null }));
  return [row, ...history.reverse()];
}

// ─────────────── On-page Audit ───────────────

function page(url: string, o: Partial<PageRead>): PageRead {
  const base: PageRead = {
    title: "", description: "", h1: 1, subheadings: 8, questionHeadings: 3, firstParagraph: "", paragraphWords: [40, 52, 38, 61, 45], lists: 3, tables: 1,
    schemaTypes: ["Article"], faq: true, words: 2200, text: "", dated: true, author: true, aiBlocked: [],
    url, path: new URL(url).pathname, h1Text: "", images: 6, noAlt: 0, internalLinks: 9, externalLinks: 4, canonical: null, noindex: false,
  };
  return { ...base, ...o };
}
const TOPIC_TEXT = "pricing plans free trial integrations reporting dashboards automation workflows customer support onboarding templates analytics comparison alternatives reviews security";

export function demoOnpage(b: DemoBrand): { id: string; url: string; keyword: string; status: "done"; step: string; score: number; top_score: number | null; error: null; created_at: string; result: OnpageResult }[] {
  const d = host(b);
  const kw = "ai search optimization";
  const mine = page(`https://${d}/ai-search-optimization`, {
    title: `AI Search | ${b.name}`, description: "", h1Text: "AI search optimization", firstParagraph: `${b.name} helps teams show up in AI answers with tracking, content and fixes.`,
    words: 980, subheadings: 4, tables: 0, faq: false, schemaTypes: [], noAlt: 3, internalLinks: 2, externalLinks: 0, text: `ai search optimization chatgpt answers ${TOPIC_TEXT.split(" ").slice(0, 6).join(" ")}`,
  });
  const rivals = ["searchengineland.com", "semrush.com", "ahrefs.com", "hubspot.com", "backlinko.com", "moz.com", "neilpatel.com"].map((r, i) =>
    page(`https://www.${r}/ai-search-optimization`, { title: `AI Search Optimization: The Complete Guide (${2026 - (i % 2)})`, description: "How to get your brand cited by ChatGPT, Perplexity and Google AI Overviews, step by step with examples and a checklist.", h1Text: "AI search optimization guide", firstParagraph: "AI search optimization is the work of getting your brand named and cited in answers from ChatGPT, Perplexity and Google AI Overviews.", words: 2100 + i * 180, text: `ai search optimization chatgpt perplexity ai overviews answer engine optimization structured data entity seo brand mentions citation sources llms.txt ${TOPIC_TEXT}` }),
  );
  const serp = [
    ...rivals.slice(0, 5).map((r, i) => ({ rank: i + 1, url: r.url, domain: new URL(r.url).hostname.replace(/^www\./, ""), title: r.title, read: r })),
    { rank: 6, url: `https://www.reddit.com/r/SEO/ai_search`, domain: "reddit.com", title: "AI search optimization, worth it?", read: null },
    ...rivals.slice(5).map((r, i) => ({ rank: 7 + i, url: r.url, domain: new URL(r.url).hostname.replace(/^www\./, ""), title: r.title, read: r })),
    { rank: 9, url: mine.url, domain: d, title: mine.title, read: mine },
  ];
  const r = audit(kw, mine, serp, { lcpMs: 3100, score: 61 });
  const result: OnpageResult = {
    ...r,
    suggest: { title: `AI Search Optimization for B2B Teams | ${b.name}`.slice(0, 62), description: `Get your brand named in ChatGPT, Perplexity and AI Overviews. See how ${b.name} tracks AI answers and fixes the pages they skip.`.slice(0, 158), answer: `AI search optimization is the work of getting your brand named in answers from ChatGPT, Perplexity and Google AI Overviews. ${b.name} tracks those answers daily, shows which pages AI cites, and fixes the pages it skips.` },
  };
  const others = [
    { url: `https://${d}/pricing`, keyword: `${b.name.toLowerCase()} pricing`, score: 84, top: 79 },
    { url: `https://${d}/blog/seo-checklist`, keyword: "seo checklist", score: 71, top: 82 },
  ].map((o, i) => ({ id: `demo-op-${i}`, url: o.url, keyword: o.keyword, status: "done" as const, step: "Done", score: o.score, top_score: o.top, error: null, created_at: daysAgo(3 + i), result: { ...result, url: o.url, keyword: o.keyword, score: o.score, topScore: o.top } }));
  return [{ id: "demo-op", url: mine.url, keyword: kw, status: "done", step: "Done", score: result.score, top_score: result.topScore, error: null, created_at: daysAgo(1), result }, ...others];
}

// ─────────────── Backlinks ───────────────

const REF = ["searchengineland.com", "g2.com", "clutch.co", "hubspot.com", "producthunt.com", "medium.com", "saastr.com", "marketingprofs.com", "contentmarketinginstitute.com", "builtin.com", "growth.design", "indiehackers.com"];

export function demoBacklinks(b: DemoBrand): { overview: Overview & { at: string }; before: { domains: number; backlinks: number }; links: LinkRow[]; gap: GapRow[]; rivals: string[] } {
  const d = host(b);
  const weeks = Array.from({ length: 12 }, (_, i) => ({ date: daysAgo((11 - i) * 7).slice(0, 10), newDomains: [6, 4, 9, 7, 5, 11, 8, 6, 12, 9, 7, 10][i], lostDomains: [2, 3, 1, 4, 2, 1, 3, 5, 2, 1, 2, 3][i] }));
  const overview = {
    target: d,
    at: daysAgo(1),
    summary: { rank: 41, backlinks: 3960, domains: 412, nofollowDomains: 96, spam: 4, broken: 7 },
    weeks,
    anchors: [
      { anchor: b.name, domains: 156, backlinks: 1480, share: 38 },
      { anchor: d, domains: 87, backlinks: 640, share: 21 },
      { anchor: "AI visibility tool", domains: 25, backlinks: 120, share: 6 },
      { anchor: "click here", domains: 16, backlinks: 44, share: 4 },
      { anchor: "this guide", domains: 12, backlinks: 30, share: 3 },
      { anchor: "No anchor text", domains: 9, backlinks: 52, share: 2 },
    ],
    pages: [`https://${d}/`, `https://${d}/blog/ai-search-guide`, `https://${d}/pricing`, `https://${d}/blog/seo-checklist`].map((url, i) => ({ url, domains: [188, 64, 31, 22][i], backlinks: [2100, 410, 160, 90][i] })),
  };
  const links: LinkRow[] = REF.map((dom, i) => ({
    from: `https://www.${dom}/${["best-tools", "reviews", "list", "blog/ai-seo", "posts/launch", "@writer/ai-seo", "blog/stack", "articles/geo", "blog/tools-2026", "companies", "notes", "stories"][i]}`,
    domain: dom,
    to: `https://${d}/${i % 3 ? "" : "blog/ai-search-guide"}`,
    anchor: [b.name, "AI visibility tool", d, b.name, b.name, "this guide", b.name, "AI search tracking", d, b.name, "click here", b.name][i],
    follow: i % 4 !== 3,
    type: "anchor",
    firstSeen: daysAgo(3 + i * 9).slice(0, 10),
    isNew: i < 3,
    isLost: i === 10,
    spam: i === 11 ? 72 : 3 + i,
    rank: 88 - i * 5,
  }));
  const rivals = ["rival-one.com", "rival-two.io"];
  const gap: GapRow[] = [
    { domain: "techradar.com", rank: 86, rivals, aiCited: 14 },
    { domain: "zapier.com", rank: 82, rivals, aiCited: 6 },
    { domain: "capterra.com", rank: 84, rivals: [rivals[0]], aiCited: 9 },
    { domain: "martech.org", rank: 71, rivals, aiCited: 0 },
    { domain: "demandcurve.com", rank: 58, rivals: [rivals[1]], aiCited: 3 },
    { domain: "saasworthy.com", rank: 52, rivals: [rivals[0]], aiCited: 0 },
  ];
  return { overview, before: { domains: 394, backlinks: 3740 }, links, gap, rivals };
}

// ─────────────── Link Building ───────────────

export function demoCards(b: DemoBrand) {
  const c = (id: string, domain: string, stage: string, source: string, note: string, authority: number, extra: Record<string, unknown> = {}) => ({
    id: `demo-${id}`, name: domain, domain, url: `https://${domain}/`, email: null as string | null, email_status: "pending", stage, source, note, authority, stage_at: daysAgo(Number(id) * 3),
    link_page: null as string | null, link_live: null as boolean | null, link_follow: null as boolean | null, link_checked_at: null as string | null, draft_subject: null as string | null, draft_body: null as string | null, status: "new", ...extra,
  });
  const pitch = (domain: string) => ({
    email: `editor@${domain}`,
    email_status: "found",
    draft_subject: "A source for your AI search guide",
    draft_body: `Hi there,\n\nYour guide is one of the pages ChatGPT quotes when people ask about AI search tools. It lists two of our rivals, and ${b.name} could help your readers too.\n\nWe have current pricing and setup times for the main tools in one table. Happy to send it over if it's useful for an update.\n\nThanks,\nThe ${b.name} team`,
  });
  return [
    c("1", "techradar.com", "prospect", "ai_cites", `AI cited it 14× in answers that name rival-one.com and not ${b.name}`, 86, pitch("techradar.com")),
    c("2", "zapier.com", "prospect", "link_gap", "Links to your rivals and not to you", 82),
    c("3", "martech.org", "prospect", "broken_page", "Links to a dead rival-two.io page: https://rival-two.io/old-guide", 71),
    c("4", "builtin.com", "contacted", "unlinked_mention", `Mentions ${b.name} without a link`, 74, { status: "sent", email: "editors@builtin.com" }),
    c("5", "capterra.com", "contacted", "ai_cites", "AI cited it 9× in answers that name rival-one.com", 84, { status: "sent" }),
    c("6", "demandcurve.com", "replied", "link_gap", "Asked for a quote from your team", 58),
    c("7", "saastr.com", "won", "ai_cites", "Link added to their tools list", 77, { link_page: "https://saastr.com/blog/ai-tools", link_live: true, link_follow: true, link_checked_at: daysAgo(2) }),
    c("8", "growth.design", "won", "unlinked_mention", "Link added to the case study", 63, { link_page: "https://growth.design/notes/ai-search", link_live: false, link_follow: true, link_checked_at: daysAgo(1) }),
    c("9", "seo-digest.net", "lost", "link_gap", "No reply after 2 follow-ups", 41),
  ];
}

// ─────────────── Content Map ───────────────

export function demoMap(b: DemoBrand): ContentMap {
  const d = host(b);
  let n = 0;
  const t = (pillar: string, name: string, volume: number, status: Topic["status"], o: Partial<Topic> = {}): Topic => ({
    id: `t${++n}`, name, keywords: [name, `${name} guide`, `best ${name}`], volume, traffic: status === "covered" || status === "overlap" ? Math.round(volume / 9) : 0, status,
    urls: status === "covered" ? [`https://${d}/${name.replace(/\s+/g, "-")}`] : status === "overlap" ? [`https://${d}/${name.replace(/\s+/g, "-")}`, `https://${d}/blog/${name.replace(/\s+/g, "-")}-guide`] : [],
    rivals: status === "missing" ? ["rival-one.com"] : [], planned: status === "progress", ai: false, pillar, linked: status === "covered" || status === "overlap" ? true : null, ...o,
  });
  const topics = [
    t("AI Search", "ai search optimization", 2400, "covered", { ai: true }),
    t("AI Search", "chatgpt seo", 3600, "missing"),
    t("AI Search", "ai overviews", 2900, "covered", { linked: false }),
    t("AI Search", "llms.txt", 1300, "missing"),
    t("AI Search", "ai visibility", 1600, "progress", { ai: true }),
    t("AI Search", "perplexity seo", 880, "missing"),
    t("SEO Basics", "seo checklist", 4400, "covered", { ai: true }),
    t("SEO Basics", "keyword research", 6600, "overlap"),
    t("SEO Basics", "technical seo audit", 2400, "covered", { linked: false }),
    t("SEO Basics", "internal linking", 1900, "missing"),
    t("SEO Basics", "schema markup", 1600, "missing"),
    t("Content", "content audit", 2900, "covered"),
    t("Content", "pillar pages", 1000, "missing"),
    t("Content", "content refresh", 720, "covered"),
    t("Content", "editorial calendar", 1600, "progress"),
    t("Content", "topic clusters", 1300, "missing"),
    t("Links", "link building", 5400, "missing"),
    t("Links", "digital pr", 2400, "missing"),
    t("Links", "guest posting", 1900, "overlap"),
    t("Links", "broken link building", 590, "covered"),
  ];
  return { pillars: ["AI Search", "SEO Basics", "Content", "Links"].map((name) => ({ name, hub: topics.find((x) => x.pillar === name && x.urls.length)?.urls[0] ?? null })), topics, rivals: ["rival-one.com", "rival-two.io"], at: daysAgo(2) };
}

// ─────────────── Local Research ───────────────

export function demoLocal(b: DemoBrand): { loc: Location; scans: { id: string; keyword: string; status: "done"; step: string; error: null; created_at: string; result: ScanResult & { listing: ListingCheck[] } }[] } {
  const loc: Location = { title: b.name, cid: "demo", placeId: null, address: "1200 Lamar Blvd, Austin, TX 78703", phone: "(512) 555-0124", category: "Marketing agency", categories: [], lat: 30.2785, lng: -97.7531, city: "Austin", keywords: ["marketing agency", "seo agency", "seo company near me"], spacing: 1, weekly: true };
  const scan = (keyword: string, k: number, at: number, shift: number) => {
    const points = Array.from({ length: GRID * GRID }, (_, i) => {
      const r = Math.floor(i / GRID) - 3;
      const c = (i % GRID) - 3;
      const dist = Math.hypot(r + 0.4, c - 0.6);
      const raw = Math.round(dist * (1.4 + k * 0.8) + shift + ((i * 7) % 5) * 0.4 + (c > 1 && r > 0 ? 6 : 0));
      const rank = raw > 20 ? null : Math.max(1, raw);
      const top = [b.name, "Northpeak Digital", "Lakeline Marketing", "Riverside SEO"].filter((x) => x !== b.name || (rank !== null && rank <= 3)).slice(0, 3).map((title) => ({ title, cid: title === b.name ? "demo" : title }));
      return { i, rank, top: rank !== null && rank <= 3 ? [{ title: b.name, cid: "demo" }, ...top.filter((x) => x.title !== b.name)].slice(0, 3) : top.filter((x) => x.title !== b.name) };
    });
    const read = points.length;
    const found = points.filter((p) => p.rank !== null).length;
    const top3 = points.filter((p) => p.rank !== null && p.rank <= 3).length;
    const avg = Math.round((points.reduce((s, p) => s + (p.rank ?? 21), 0) / read) * 10) / 10;
    const rivals = [
      { title: "Northpeak Digital", cid: "n", domain: "northpeak.digital", category: "Internet marketing service", rating: 4.7, reviews: 318 + at, top3: 21, seen: 49 },
      { title: "Lakeline Marketing", cid: "l", domain: "lakelinemarketing.com", category: "Marketing agency", rating: 4.9, reviews: 142 + at, top3: 14, seen: 47 },
      { title: "Riverside SEO", cid: "r", domain: "riversideseo.com", category: "Internet marketing service", rating: 4.5, reviews: 96, top3: 9, seen: 44 },
    ];
    const listing: ListingCheck[] = [
      { id: "name", label: "Name matches", status: "pass", detail: `Google: ${b.name}` },
      { id: "phone", label: "Phone differs", status: "fail", detail: "Google (512) 555-0124, website 5125550142" },
      { id: "address", label: "Address matches", status: "pass", detail: loc.address! },
      { id: "schema", label: "LocalBusiness schema", status: "fail", detail: "No LocalBusiness schema on the homepage." },
      { id: "category", label: "Rivals use Internet marketing service", status: "warn", detail: "Your main category is Marketing agency. The rivals holding the top 3 most use Internet marketing service." },
    ];
    return { id: `demo-${keyword}-${at}`, keyword, status: "done" as const, step: "Done", error: null, created_at: daysAgo(at), result: { keyword, size: GRID, spacing: 1, points, rivals, you: { rating: 4.8, reviews: 61 - Math.floor(at / 7) * 3 }, avg, top3, found, read, listing } };
  };
  const scans = loc.keywords.flatMap((kw, k) => [scan(kw, k, 1, 0), scan(kw, k, 8, 1), scan(kw, k, 15, 2), scan(kw, k, 22, 2)]);
  return { loc, scans };
}
