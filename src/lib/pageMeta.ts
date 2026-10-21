// What a page already says about itself: its title and description, Open Graph tags, dates, author, logo, social
// profiles, contact details and FAQ pairs. Read with cheerio, at no cost, before any AI is asked to fill the rest.
// Pure, so tests can run it on sample pages. Used by the Schema and Meta generators (docs/free-tools.md).
import * as cheerio from "cheerio";
import type { Faq } from "./schemaGen.ts";

export type PageMeta = {
  url: string;
  lang: string;
  title: string;
  description: string;
  h1: string;
  canonical: string;
  siteName: string;
  image: string;
  logo: string;
  published: string;
  modified: string;
  author: string;
  sameAs: string[];
  phone: string;
  email: string;
  faqs: Faq[];
};

const SOCIAL = /^(www\.)?(linkedin\.com|x\.com|twitter\.com|facebook\.com|instagram\.com|youtube\.com|tiktok\.com|github\.com|pinterest\.com|threads\.net|wikipedia\.org|[a-z]{2}\.wikipedia\.org|crunchbase\.com|g2\.com|trustpilot\.com)$/i;
const clean = (s: string | undefined, max = 400) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

function absolute(href: string | undefined, base: string): string {
  if (!href) return "";
  try {
    const u = new URL(href, base);
    return /^https?:$/.test(u.protocol) ? u.toString() : "";
  } catch {
    return "";
  }
}

/** A date as YYYY-MM-DD, or "" when it isn't one. */
function day(s: string | undefined): string {
  const m = (s ?? "").match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

/** Question and answer pairs the page shows: headings or summaries that end in "?", and definition lists. */
export function faqPairs(html: string): Faq[] {
  const $ = cheerio.load(html);
  $("script, style, noscript, nav, footer").remove();
  const out: Faq[] = [];
  const add = (q: string, a: string) => {
    const question = clean(q, 300);
    const answer = clean(a, 1200);
    if (question.endsWith("?") && answer.split(" ").length >= 3 && !out.some((f) => f.q === question)) out.push({ q: question, a: answer });
  };
  $("details").each((_, el) => {
    const summary = $(el).children("summary").first();
    add(summary.text(), $(el).clone().children("summary").remove().end().text());
  });
  $("dt").each((_, el) => add($(el).text(), $(el).nextAll("dd").first().text()));
  $("h2, h3, h4, h5").each((_, el) => {
    const q = $(el).text();
    if (!clean(q).endsWith("?")) return;
    // The answer is everything up to the next heading.
    const parts: string[] = [];
    let next = $(el).next();
    while (next.length && !/^h[1-6]$/i.test(next.prop("tagName") ?? "") && parts.join(" ").length < 1200) {
      parts.push(next.text());
      next = next.next();
    }
    add(q, parts.join(" "));
  });
  return out.slice(0, 20);
}

export function pageMeta(html: string, url: string): PageMeta {
  const $ = cheerio.load(html.slice(0, 3_000_000));
  const meta = (sel: string) => clean($(sel).first().attr("content"));
  const sameAs = new Set<string>();
  let phone = "";
  let email = "";
  $("a[href]").each((_, a) => {
    const href = $(a).attr("href") ?? "";
    if (/^tel:/i.test(href) && !phone) phone = clean(decodeURIComponent(href.slice(4)), 40);
    else if (/^mailto:/i.test(href) && !email) email = clean(href.slice(7).split("?")[0], 120);
    else {
      const abs = absolute(href, url);
      try {
        if (abs && SOCIAL.test(new URL(abs).hostname) && new URL(abs).pathname.length > 1) sameAs.add(abs.replace(/\/$/, ""));
      } catch {
        // Not a link.
      }
    }
  });
  const logoImg = $('img[src*="logo" i], img[alt*="logo" i], img[class*="logo" i]').first().attr("src");
  return {
    url,
    lang: clean($("html").attr("lang"), 12),
    title: clean($("title").first().text(), 300),
    description: meta('meta[name="description" i]') || meta('meta[property="og:description"]'),
    h1: clean($("h1").first().text(), 300),
    canonical: absolute($('link[rel="canonical"]').attr("href"), url),
    siteName: meta('meta[property="og:site_name"]'),
    image: absolute(meta('meta[property="og:image"]') || meta('meta[name="twitter:image"]'), url),
    logo: absolute(logoImg, url) || absolute($('link[rel="apple-touch-icon"]').attr("href"), url),
    published: day(meta('meta[property="article:published_time"]') || $("time[datetime]").first().attr("datetime")),
    modified: day(meta('meta[property="article:modified_time"]') || meta('meta[property="og:updated_time"]')),
    author: meta('meta[name="author"]') || clean($('[rel="author"]').first().text(), 120),
    sameAs: [...sameAs].slice(0, 10),
    phone,
    email,
    faqs: faqPairs(html),
  };
}

const DAY_NAMES: Record<string, string> = { mo: "Monday", tu: "Tuesday", we: "Wednesday", th: "Thursday", fr: "Friday", sa: "Saturday", su: "Sunday" };
const ORDER = Object.values(DAY_NAMES);

/** "Mon-Fri 09:00-17:00, Sat 10:00-14:00" as opening hours. Lines it can't read are left out. */
export function readHours(text: string) {
  const out: { days: string[]; opens: string; closes: string }[] = [];
  for (const part of text.split(/[;,\n]/)) {
    const m = part.match(/([a-z]{2})[a-z]*\.?\s*(?:[-–to]+\s*([a-z]{2})[a-z]*\.?)?\s*:?\s*(\d{1,2})[:.]?(\d{2})?\s*(am|pm)?\s*[-–to]+\s*(\d{1,2})[:.]?(\d{2})?\s*(am|pm)?/i);
    if (!m) continue;
    const from = DAY_NAMES[m[1].toLowerCase()];
    const to = m[2] ? DAY_NAMES[m[2].toLowerCase()] : from;
    if (!from || !to) continue;
    const time = (h: string, min: string | undefined, ap: string | undefined) => {
      let hour = Number(h) % 24;
      if (ap?.toLowerCase() === "pm" && hour < 12) hour += 12;
      if (ap?.toLowerCase() === "am" && hour === 12) hour = 0;
      return `${String(hour).padStart(2, "0")}:${min ?? "00"}`;
    };
    const a = ORDER.indexOf(from);
    const b = ORDER.indexOf(to);
    out.push({ days: ORDER.slice(a, b >= a ? b + 1 : a + 1), opens: time(m[3], m[4], m[5]), closes: time(m[6], m[7], m[8]) });
  }
  return out;
}
