// The Robots.txt Tester's rules (docs/free-tools.md), read the way Google reads robots.txt (RFC 9309 plus
// Google's own choices). Pure and free of imports, so the same file can run in the visitor's browser and every edit
// re-tests with no server call.

export type RobotsRule = { allow: boolean; path: string; line: number; text: string };
export type RobotsGroup = { agents: string[]; rules: RobotsRule[]; line: number };
export type RobotsWarning = { line: number | null; level: "high" | "warn" | "info"; message: string };
export type ParsedRobots = { groups: RobotsGroup[]; sitemaps: { url: string; line: number }[]; warnings: RobotsWarning[]; bytes: number };

/** Google reads the first 500 KiB and ignores the rest. */
export const ROBOTS_MAX_BYTES = 500 * 1024;

/** Crawlers the tester answers for at once. AI crawlers follow, from the AI Crawler Checker's list. */
export const SEARCH_CRAWLERS: { bot: string; owner: string }[] = [
  { bot: "Googlebot", owner: "Google" },
  { bot: "Googlebot-Image", owner: "Google" },
  { bot: "Bingbot", owner: "Microsoft" },
];

/** Google's special crawlers use Googlebot's group when they have none of their own. */
const FALLBACK: Record<string, string> = {
  "googlebot-image": "googlebot",
  "googlebot-video": "googlebot",
  "googlebot-news": "googlebot",
  "storebot-google": "googlebot",
};

/** Spellings Google accepts for each line it reads. */
const KEYS: Record<string, "user-agent" | "allow" | "disallow" | "sitemap"> = {
  "user-agent": "user-agent",
  useragent: "user-agent",
  "user agent": "user-agent",
  allow: "allow",
  disallow: "disallow",
  dissallow: "disallow",
  dissalow: "disallow",
  disalow: "disallow",
  sitemap: "sitemap",
  "site-map": "sitemap",
};

const IGNORED: Record<string, string> = {
  "crawl-delay": "Google ignores crawl-delay. Bing and some other crawlers read it.",
  noindex: "Google stopped reading noindex in robots.txt in 2019. Use a robots meta tag or an X-Robots-Tag header.",
  nofollow: "Google doesn't read nofollow in robots.txt. Use a robots meta tag.",
  host: "Only Yandex reads host. Google ignores it.",
  "clean-param": "Only Yandex reads clean-param. Google ignores it.",
  "request-rate": "Google ignores request-rate.",
  "visit-time": "Google ignores visit-time.",
};

/** A user-agent line's name: the product token, lowercased, without a version. */
const agentName = (value: string) => value.trim().split(/[\s/]/)[0].toLowerCase();

/** Percent-encode the same way on both sides, so /café and /caf%C3%A9 match. */
function normalize(path: string) {
  try {
    return encodeURI(decodeURI(path));
  } catch {
    return encodeURI(path);
  }
}

/** robots.txt as groups, sitemaps and warnings, with the line number of each. */
export function parseRobots(text: string): ParsedRobots {
  const bytes = new TextEncoder().encode(text).length;
  const warnings: RobotsWarning[] = [];
  if (bytes > ROBOTS_MAX_BYTES) warnings.push({ line: null, level: "high", message: `The file is ${Math.round(bytes / 1024)} KiB. Google reads only the first 500 KiB, so rules after that are ignored.` });
  const groups: RobotsGroup[] = [];
  const sitemaps: { url: string; line: number }[] = [];
  let cur: RobotsGroup | null = null;
  let read = 0;
  text.replace(/^﻿/, "").split(/\r\n|\r|\n/).forEach((raw, i) => {
    const line = i + 1;
    read += new TextEncoder().encode(raw).length + 1;
    if (read > ROBOTS_MAX_BYTES + 1) return;
    const clean = raw.replace(/#.*/, "").trim();
    if (!clean) return;
    const m = clean.match(/^([a-z][a-z -]*?)\s*:\s*(.*)$/i);
    if (!m) {
      warnings.push({ line, level: "warn", message: "This line has no colon, so crawlers skip it." });
      return;
    }
    const key = KEYS[m[1].toLowerCase()];
    const value = m[2].trim();
    if (!key) {
      const note = IGNORED[m[1].toLowerCase()];
      warnings.push({ line, level: note ? "info" : "warn", message: note ?? `Crawlers don't know "${m[1]}", so they skip this line.` });
      return;
    }
    if (key === "sitemap") {
      if (!/^https?:\/\//i.test(value)) warnings.push({ line, level: "warn", message: "A sitemap needs a full address that starts with https://." });
      else sitemaps.push({ url: value, line });
      return;
    }
    if (key === "user-agent") {
      if (!value) {
        warnings.push({ line, level: "warn", message: "This user-agent line is empty." });
        return;
      }
      if (!cur || cur.rules.length) groups.push((cur = { agents: [], rules: [], line }));
      cur.agents.push(agentName(value));
      return;
    }
    if (!cur) {
      warnings.push({ line, level: "warn", message: "This rule comes before any user-agent line, so no crawler follows it." });
      return;
    }
    // An empty Allow or Disallow is no rule at all.
    if (!value) {
      if (key === "allow") warnings.push({ line, level: "info", message: "An empty Allow does nothing." });
      // A group with only an empty Disallow still ends its user-agent list.
      cur.rules.push({ allow: true, path: "", line, text: clean });
      return;
    }
    if (!value.startsWith("/") && !value.startsWith("*")) warnings.push({ line, level: "warn", message: "A path should start with / or *. Google reads it as if it starts with /." });
    cur.rules.push({ allow: key === "allow", path: value.startsWith("/") || value.startsWith("*") ? value : `/${value}`, line, text: clean });
  });
  const all = groups.find((g) => g.agents.includes("*"));
  if (all?.rules.some((r) => !r.allow && r.path === "/") && !all.rules.some((r) => r.allow && r.path === "/")) {
    const line = all.rules.find((r) => !r.allow && r.path === "/")!.line;
    warnings.push({ line, level: "high", message: "Every crawler without its own group is blocked from the whole site." });
  }
  if (!groups.length && text.trim()) warnings.push({ line: null, level: "warn", message: "No user-agent lines, so the file has no rules." });
  return { groups, sitemaps, warnings, bytes };
}

/** Does a robots.txt path pattern (with * and $) match this path? */
export function patternMatches(pattern: string, path: string): boolean {
  const end = pattern.endsWith("$");
  const body = normalize(end ? pattern.slice(0, -1) : pattern)
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${end ? "$" : ""}`).test(normalize(path));
}

export type RobotsAnswer = { allowed: boolean; rule: RobotsRule | null; group: string };

/** The groups a crawler follows: its own, then its fallback (Googlebot for Google's special crawlers), then *. */
function groupsFor(parsed: ParsedRobots, agent: string): { groups: RobotsGroup[]; name: string } {
  const name = agent.toLowerCase();
  for (const n of [name, FALLBACK[name], "*"].filter(Boolean) as string[]) {
    const own = parsed.groups.filter((g) => g.agents.includes(n));
    if (own.length) return { groups: own, name: n };
  }
  return { groups: [], name: "none" };
}

/** Whether a crawler may fetch a path (with its query string): the longest matching rule wins, and Allow wins a tie. */
export function robotsAllows(parsed: ParsedRobots, agent: string, path: string): RobotsAnswer {
  const p = path.startsWith("/") ? path : `/${path}`;
  const { groups, name } = groupsFor(parsed, agent);
  if (p === "/robots.txt") return { allowed: true, rule: null, group: name };
  const hits = groups
    .flatMap((g) => g.rules)
    .filter((r) => r.path && patternMatches(r.path, p))
    .sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow));
  const top = hits[0] ?? null;
  return { allowed: !top || top.allow, rule: top, group: name };
}

/**
 * What a robots.txt fetch means before any rule is read: 2xx uses the rules, 4xx means crawl everything,
 * and 5xx or no answer means Google treats the whole site as blocked until it can read the file.
 */
export function robotsStatus(status: number): "rules" | "allow-all" | "block-all" {
  if (status >= 200 && status < 300) return "rules";
  if (status >= 400 && status < 500) return "allow-all";
  return "block-all";
}

/** The path and query of what someone typed: a full address, a path, or nothing (the homepage). */
export function pathOf(input: string): string {
  const s = input.trim();
  if (!s) return "/";
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      return u.pathname + u.search;
    } catch {
      return "/";
    }
  }
  return s.startsWith("/") ? s : `/${s}`;
}
