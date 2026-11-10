// AI access (docs/technical-seo-plan.md, phase 4): which crawlers may fetch the site and whether the firewall lets them,
// per-bot robots meta and headers, llms.txt, and how competitor pages AI cites are built. Pure, so the crawler, the
// screen and the tests read it the same way.

export type BotKind = "search" | "user" | "training" | "google" | "bing";
export type Bot = {
  /** The robots.txt token. */
  id: string;
  owner: string;
  kind: BotKind;
  /** What it fetches for. */
  use: string;
  /** The user agent it sends, or null for a robots.txt token with no crawler of its own. */
  ua: string | null;
  /** Firewalls check this crawler's IP address, so a fetch from us with its user agent says nothing. */
  ipChecked: boolean;
};

const WEBKIT = "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible;";
export const BOTS: Bot[] = [
  { id: "Googlebot", owner: "Google", kind: "google", use: "Google Search and AI Overviews", ua: "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", ipChecked: true },
  { id: "Google-Extended", owner: "Google", kind: "training", use: "Gemini training (robots.txt token only)", ua: null, ipChecked: false },
  { id: "Bingbot", owner: "Microsoft", kind: "bing", use: "Bing, which feeds ChatGPT search and Copilot", ua: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/131.0.0.0 Safari/537.36", ipChecked: true },
  { id: "OAI-SearchBot", owner: "OpenAI", kind: "search", use: "ChatGPT search", ua: `${WEBKIT} OAI-SearchBot/1.0; +https://openai.com/searchbot)`, ipChecked: false },
  { id: "ChatGPT-User", owner: "OpenAI", kind: "user", use: "Pages ChatGPT opens for a user", ua: `${WEBKIT} ChatGPT-User/1.0; +https://openai.com/bot)`, ipChecked: false },
  { id: "GPTBot", owner: "OpenAI", kind: "training", use: "OpenAI training", ua: `${WEBKIT} GPTBot/1.2; +https://openai.com/gptbot)`, ipChecked: false },
  { id: "Claude-SearchBot", owner: "Anthropic", kind: "search", use: "Claude search", ua: `${WEBKIT} Claude-SearchBot/1.0; +https://www.anthropic.com)`, ipChecked: false },
  { id: "Claude-User", owner: "Anthropic", kind: "user", use: "Pages Claude opens for a user", ua: `${WEBKIT} Claude-User/1.0; +https://www.anthropic.com)`, ipChecked: false },
  { id: "ClaudeBot", owner: "Anthropic", kind: "training", use: "Anthropic training", ua: `${WEBKIT} ClaudeBot/1.0; +claudebot@anthropic.com)`, ipChecked: false },
  { id: "PerplexityBot", owner: "Perplexity", kind: "search", use: "Perplexity search", ua: `${WEBKIT} PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)`, ipChecked: false },
  { id: "Perplexity-User", owner: "Perplexity", kind: "user", use: "Pages Perplexity opens for a user", ua: `${WEBKIT} Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)`, ipChecked: false },
  { id: "Applebot", owner: "Apple", kind: "search", use: "Siri and Spotlight", ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)", ipChecked: true },
  { id: "Applebot-Extended", owner: "Apple", kind: "training", use: "Apple Intelligence training (robots.txt token only)", ua: null, ipChecked: false },
  { id: "CCBot", owner: "Common Crawl", kind: "training", use: "Common Crawl, used to train many models", ua: "CCBot/2.0 (https://commoncrawl.org/faq/)", ipChecked: false },
  { id: "Meta-ExternalAgent", owner: "Meta", kind: "training", use: "Meta AI training", ua: "meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)", ipChecked: false },
  { id: "Bytespider", owner: "ByteDance", kind: "training", use: "ByteDance training", ua: "Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Bytespider; spider-feedback@bytedance.com)", ipChecked: false },
];
/** The bots a fetch with their user agent can test: not tokens, not bots firewalls check by IP. */
export const PROBED = BOTS.filter((b) => b.ua && !b.ipChecked);
/** A normal browser, to compare with. */
export const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** What one fetch of a page saw. */
export type Probe = { status: number; final: string; bytes: number; title: string; challenge: boolean };
export type Verdict = "ok" | "blocked" | "challenged" | "different" | "unknown";

const CHALLENGE = /just a moment\.\.\.|attention required!? \| cloudflare|cf-chl-|challenge-platform|_incapsula_resource|px-captcha|captcha-delivery\.com|pardon our interruption|verify you are (a )?human|checking your browser|ddos protection by|access denied<\/title>|request unsuccessful\. incapsula/i;

/** A firewall or CDN page instead of the site. Big 200 pages that only mention a captcha don't count. */
export function isChallengePage(status: number, body: string): boolean {
  if (status >= 200 && status < 300 && body.length > 40_000) return false;
  return CHALLENGE.test(body.slice(0, 40_000));
}

export function titleOf(html: string): string {
  return (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html.slice(0, 200_000))?.[1] ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
}

const pathOf = (u: string) => {
  try {
    const x = new URL(u);
    return x.pathname.replace(/\/+$/, "").toLowerCase() + x.search;
  } catch {
    return u;
  }
};

/**
 * One page fetched as a browser and as a bot. Unknown when the browser fetch itself failed: then nothing can be said.
 * A dropped connection, an error status, a challenge page, a redirect elsewhere or a body under a third of the
 * browser's all count against the bot.
 */
export function probeVerdict(normal: Probe, bot: Probe): Verdict {
  if (!(normal.status >= 200 && normal.status < 300) || normal.challenge) return "unknown";
  if (bot.challenge) return "challenged";
  if (bot.status === 0 || bot.status >= 400) return "blocked";
  if (bot.status >= 300) return "different";
  if (pathOf(bot.final) !== pathOf(normal.final)) return "different";
  if (normal.bytes > 5000 && bot.bytes < normal.bytes * 0.3) return "different";
  return "ok";
}

const BAD: string[] = ["blocked", "challenged", "different"];
export const isBad = (v: string | undefined) => Boolean(v && BAD.includes(v));

/**
 * The firewall's answer for one bot over its sample pages, with two strikes: a page counts against the bot only when
 * both passes (a minute apart) failed for the bot and worked for the browser. Unknown when no page could be judged.
 */
export function firewallOf(first: Record<string, Verdict>, second: Record<string, Verdict> | null): Verdict {
  const pages = Object.keys(first);
  const judged = pages.filter((p) => first[p] !== "unknown");
  if (!judged.length) return "unknown";
  const failed = judged.filter((p) => isBad(first[p]) && isBad(second?.[p]));
  if (!failed.length) return judged.some((p) => first[p] === "ok" || second?.[p] === "ok") ? "ok" : "unknown";
  // The worst answer: a challenge says the most, then a block.
  const all = failed.map((p) => second![p]);
  return all.includes("challenged") ? "challenged" : all.includes("blocked") ? "blocked" : "different";
}

const DIRECTIVES = /\b(noindex|none|noai|noimageai|nosnippet)\b/g;
const FIELD_KEYS = /^(unavailable_after|max-snippet|max-image-preview|max-video-preview)$/i;

/** The robots directives one bot gets from X-Robots-Tag and robots meta tags (general ones and its own). */
export function botDirectives(html: string, xRobots: string, token: string): string[] {
  const t = token.toLowerCase();
  const out = new Set<string>();
  // X-Robots-Tag: "noindex" for every bot, or "gptbot: noindex" for one.
  let cur: string | null = null;
  for (const part of xRobots.toLowerCase().split(",").map((s) => s.trim()).filter(Boolean)) {
    const m = /^([a-z0-9_-]+)\s*:\s*(.*)$/.exec(part);
    let value = part;
    if (m && !FIELD_KEYS.test(m[1])) {
      cur = m[1];
      value = m[2];
    }
    if (cur === null || cur === t) for (const d of value.match(DIRECTIVES) ?? []) out.add(d);
  }
  for (const tag of html.slice(0, 300_000).match(/<meta\s[^>]*>/gi) ?? []) {
    const name = (/\bname\s*=\s*["']?([^"'\s>]+)/i.exec(tag)?.[1] ?? "").toLowerCase();
    if (name !== "robots" && name !== t) continue;
    const content = (/\bcontent\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? "").toLowerCase();
    for (const d of content.match(DIRECTIVES) ?? []) out.add(d);
  }
  return [...out];
}

/** What the crawl knows about one bot. */
export type BotAccess = {
  id: string;
  /** robots.txt: allowed, and the line that decides it. Null when the site has no robots.txt (everything allowed). */
  robots: { allowed: boolean; rule: string | null } | null;
  /** "token": robots.txt only. "ip": firewalls check its IP, so we can't test it. */
  firewall: Verdict | "token" | "ip";
  /** The status the bot got on the home page (second pass when there was one). */
  status: number | null;
  /** noindex, noai and the like that this bot gets on the home page. */
  meta: string[];
};

export const botById = (id: string) => BOTS.find((b) => b.id === id);
export const isAiAnswerBot = (b: Bot | undefined) => b?.kind === "search" || b?.kind === "user";

// ─────────────── llms.txt ───────────────

/** llms.txt read the way the proposal (llmstxt.org) writes it: an H1 first, then Markdown links. */
export function parseLlms(text: string, base: string): { valid: boolean; links: string[] } {
  const first = text.split(/\r?\n/).find((l) => l.trim());
  const links: string[] = [];
  for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)[^)]*\)/g)) {
    try {
      const u = new URL(m[1], base);
      if (/^https?:$/.test(u.protocol)) links.push(u.toString().split("#")[0]);
    } catch {
      /* not a link */
    }
  }
  return { valid: Boolean(first && /^#\s+\S/.test(first.trim())), links: [...new Set(links)].slice(0, 200) };
}

export type LlmsPage = { url: string; title: string; description: string; group: string };

/** An llms.txt from the site's best pages: the name, one line about the site, then the pages by section. */
export function buildLlms(site: { name: string; summary: string }, pages: LlmsPage[]): string {
  const clean = (s: string) => s.replace(/\s+/g, " ").replace(/[[\]]/g, "").trim();
  const groups = new Map<string, LlmsPage[]>();
  for (const p of pages.slice(0, 80)) groups.set(p.group, [...(groups.get(p.group) ?? []), p]);
  const parts = [`# ${clean(site.name)}`, ""];
  if (site.summary.trim()) parts.push(`> ${clean(site.summary).slice(0, 300)}`, "");
  for (const [group, list] of groups) {
    parts.push(`## ${clean(group)}`, "");
    for (const p of list) parts.push(`- [${clean(p.title).slice(0, 120) || p.url}](${p.url})${p.description ? `: ${clean(p.description).slice(0, 200)}` : ""}`);
    parts.push("");
  }
  return parts.join("\n").trim() + "\n";
}

// ─────────────── How pages are built ───────────────

/** How one page is built, for comparing the pages AI cites. */
export type Build = { url: string; words: number; schema: string[]; questions: number; firstWords: number; headings: number };

const ANSWER_SCHEMA = /^(FAQPage|QAPage|HowTo)$/;
const FEATURES: { label: string; has: (b: Build) => boolean }[] = [
  { label: "Text in the raw HTML (no JavaScript needed)", has: (b) => b.words >= 150 },
  { label: "An answer in the first paragraph (15 to 90 words)", has: (b) => b.firstWords >= 15 && b.firstWords <= 90 },
  { label: "Question headings", has: (b) => b.questions >= 2 },
  { label: "FAQ, Q&A or HowTo markup", has: (b) => b.schema.some((t) => ANSWER_SCHEMA.test(t)) },
  { label: "Any structured data", has: (b) => b.schema.length > 0 },
  { label: "Over 1,000 words", has: (b) => b.words > 1000 },
  { label: "8 or more headings", has: (b) => b.headings >= 8 },
];

/** Each feature's share on their pages and yours. A gap is a feature most of theirs have and clearly fewer of yours. */
export function compareBuilds(theirs: Build[], yours: Build[]): { label: string; theirs: number; yours: number; gap: boolean }[] {
  const share = (list: Build[], f: (b: Build) => boolean) => (list.length ? Math.round((list.filter(f).length / list.length) * 100) : 0);
  return FEATURES.map((f) => {
    const t = share(theirs, f.has);
    const y = share(yours, f.has);
    return { label: f.label, theirs: t, yours: y, gap: theirs.length >= 2 && t >= 50 && y <= t - 25 };
  });
}

/** True when a page is ready for AI answers: an answer up top, and FAQ markup where it asks questions. */
export function answerGaps(f: { firstWords?: number; questions?: number; schema: string[] }): string[] {
  const out: string[] = [];
  if (f.firstWords !== undefined && (f.firstWords < 15 || f.firstWords > 90)) out.push("answer");
  if ((f.questions ?? 0) >= 2 && !f.schema.some((t) => ANSWER_SCHEMA.test(t))) out.push("faq");
  return out;
}
