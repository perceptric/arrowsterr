import type { PageFacts } from "./parse.ts";
import { slashTwin, pathOnly } from "./url.ts";

// The Site Audit's checks (docs/technical-seo-plan.md, section 7): each one with its area, severity, why it matters and
// how to fix it, run over every crawled page plus what the crawl learned about the whole site. Pure.
// Severities keep the old names: high shows as Error, medium as Warning, low as Notice.

export type Severity = "high" | "medium" | "low";
export type Area = "crawl" | "index" | "render" | "links" | "content" | "speed" | "schema" | "intl" | "security" | "ai";
export const AREAS: { id: Area; label: string }[] = [
  { id: "crawl", label: "Crawlability" },
  { id: "index", label: "Indexability" },
  { id: "render", label: "Rendering" },
  { id: "links", label: "Links" },
  { id: "content", label: "Content" },
  { id: "speed", label: "Speed" },
  { id: "schema", label: "Structured data" },
  { id: "intl", label: "International" },
  { id: "security", label: "Security" },
  { id: "ai", label: "AI access" },
];
export const SEVERITY_NAME = { high: "Errors", medium: "Warnings", low: "Notices" } as const;

export type Issue = { id: string; severity: Severity; area: Area; title: string; why: string; how?: string; count: number; pages: string[]; play?: string; siteWide?: boolean; /** Search clicks in 28 days on the pages it hits. */ clicks?: number; /** Every page it hits, kept off the saved summary. */ all?: string[] };

/** What Search Console and the Chrome UX Report add to a crawl, when the brand has them (phase 2). */
export type GoogleFacts = {
  clicks: Record<string, number>;
  inspections: Record<string, { coverage: string; otherCanonical: boolean; richErrors: number }>;
  gscSitemaps: string[] | null;
  gscSitemapErrors: string[];
  originPass: boolean | null;
  vitals: Record<string, { lcp?: number; inp?: number; cls?: number }>;
};

/** A crawled page as the checks see it: the parsed facts without the full link lists. */
export type CheckPage = {
  url: string;
  final: string;
  status: number;
  hops: number;
  loop: boolean;
  chainEnd: number;
  ms: number;
  bytes: number;
  compressed: boolean;
  depth: number | null;
  inSitemap: boolean;
  linksIn: number;
  facts: Omit<PageFacts, "internal" | "external"> | null;
};

export type SiteFacts = {
  home: string;
  robots: { status: number; sitemaps: number; blockedSearch: string[]; blockedTraining: string[]; disallowedSitemapUrls: string[] };
  sitemaps: { found: number; urls: number; bad: string[]; tooBig: string[]; paths?: string[] };
  hosts: { httpLive: boolean; otherHostLive: boolean; hsts: boolean };
  llmsTxt: boolean;
  infinite: string[];
  links: { broken: { from: string; to: string; status: number }[]; brokenCount: number; external: { from: string; to: string; status: number }[]; externalCount: number; toRedirect: { from: string; to: string }[]; toRedirectCount: number };
  /** Every crawled or checked URL's status, for canonical and hreflang targets. */
  statusOf: Record<string, number>;
  /** The sitemaps the crawl read, for comparing with Search Console. */
  sitemapPaths?: string[];
  google?: GoogleFacts | null;
};

/** A value by URL, matching with or without a trailing slash and www, since Google and the crawl may differ. */
export function byUrl<T>(map: Record<string, T>, url: string): T | undefined {
  if (url in map) return map[url];
  const alt = url.endsWith("/") ? url.slice(0, -1) : `${url}/`;
  if (alt in map) return map[alt];
  const www = url.replace(/^(https?:\/\/)(www\.)?/, (_, p, w) => (w ? p : `${p}www.`));
  return map[www] ?? map[www.endsWith("/") ? www.slice(0, -1) : `${www}/`];
}

type Def = { severity: Severity; area: Area; title: string; why: string; how?: string; play?: string };

/** Every check's words. Old ids from the first Site Audit are kept, so the change since the last crawl still lines up. */
export const CHECKS: Record<string, Def> = {
  robots_error: { severity: "high", area: "crawl", title: "robots.txt returns a server error", why: "When robots.txt fails, Google stops crawling the whole site until it answers again.", how: "Make /robots.txt return 200 (or 404 if you don't want one)." },
  robots_missing: { severity: "low", area: "crawl", title: "No robots.txt file", why: "Not a problem on its own, but it's where you point crawlers to your sitemap.", how: "Add a robots.txt with a Sitemap line." },
  robots_no_sitemap: { severity: "low", area: "crawl", title: "robots.txt doesn't list a sitemap", why: "Crawlers find your pages faster when robots.txt points to the sitemap.", how: "Add a line like: Sitemap: https://yoursite.com/sitemap.xml" },
  robots_blocks_important: { severity: "high", area: "crawl", title: "robots.txt blocks pages in your sitemap", why: "You ask Google to index these pages and block it from reading them at the same time.", how: "Remove the Disallow rule that matches them, or take them out of the sitemap." },
  broken_pages: { severity: "high", area: "crawl", title: "Pages that return an error", why: "Search engines and AI crawlers drop pages that fail to load.", how: "Bring the page back, or redirect it to the closest live page." },
  timeout: { severity: "high", area: "crawl", title: "Pages that didn't answer", why: "A page that times out can't be crawled or indexed.", how: "Check the server for slow queries or limits on bots. We tried each page three times." },
  broken_links: { severity: "high", area: "crawl", title: "Links to pages that don't exist", why: "Broken links waste crawl time and send readers to dead ends.", how: "Point each link to a live page, or redirect the dead page." },
  broken_external: { severity: "medium", area: "links", title: "Links to other sites that are broken", why: "Dead outbound links make a page look neglected.", how: "Update the link or remove it." },
  redirect_loop: { severity: "high", area: "crawl", title: "Redirect loops", why: "The redirects never reach a page, so nobody can load it.", how: "Fix the redirect rules so the chain ends at a live page." },
  redirect_to_error: { severity: "high", area: "crawl", title: "Redirects that end at an error", why: "Visitors and crawlers follow the redirect into a dead end.", how: "Point the redirect at a live page." },
  redirect_chain: { severity: "medium", area: "crawl", title: "Redirect chains", why: "Each extra hop wastes crawl time and loses some link value.", how: "Point the first URL straight at the final page." },
  link_to_redirect: { severity: "low", area: "links", title: "Internal links that point to a redirect", why: "Crawlers take an extra hop for every one of these links.", how: "Update the links to the final URL." },
  meta_refresh: { severity: "medium", area: "crawl", title: "Pages that redirect with a meta refresh", why: "Search engines treat these less reliably than server redirects.", how: "Use a 301 redirect on the server." },
  orphan: { severity: "medium", area: "links", title: "Pages in your sitemap with no links to them", why: "Pages nobody links to get crawled less and rank worse.", how: "Link to them from related pages, or remove them from the sitemap." },
  deep_page: { severity: "low", area: "links", title: "Pages 4 or more clicks from the home page", why: "Deep pages get crawled less often and look less important.", how: "Link to them from pages closer to the home page." },
  infinite_space: { severity: "medium", area: "crawl", title: "Addresses that go on without end", why: "Filters, sorting or calendars make endless URL versions that waste crawl time.", how: "Block the parameters in robots.txt, or point their canonical at the clean page." },
  slow: { severity: "medium", area: "speed", title: "Pages slower than 1 second to respond", why: "Slow responses get crawled less and lose readers.", how: "Add page caching, or check slow database queries on these templates." },
  big_html: { severity: "low", area: "speed", title: "Pages with more than 2 MB of HTML", why: "Big pages load slowly, and some crawlers stop reading before the end.", how: "Move inline data and scripts into separate files." },
  no_compression: { severity: "medium", area: "speed", title: "Pages sent without compression", why: "Uncompressed HTML is several times bigger, so pages load slower.", how: "Turn on gzip or brotli on the server or CDN." },
  sitemap_missing: { severity: "medium", area: "crawl", title: "No sitemap found", why: "A sitemap tells search engines which pages you want indexed.", how: "Add /sitemap.xml (most CMS tools make one) and list it in robots.txt." },
  sitemap_bad_xml: { severity: "high", area: "crawl", title: "Sitemaps that can't be read", why: "A broken sitemap is ignored completely.", how: "Fix the XML so it validates." },
  sitemap_too_big: { severity: "high", area: "crawl", title: "Sitemaps over 50,000 URLs", why: "Search engines stop reading a sitemap past 50,000 URLs or 50 MB.", how: "Split it into several files under a sitemap index." },
  sitemap_error_urls: { severity: "medium", area: "crawl", title: "Sitemap URLs that aren't live, indexable pages", why: "Sitemaps should only list pages you want indexed. Bad URLs make Google trust the sitemap less.", how: "Take out URLs that redirect, fail, are noindex or point their canonical elsewhere." },
  sitemap_missing_pages: { severity: "low", area: "crawl", title: "Indexable pages missing from your sitemaps", why: "Google finds these pages more slowly.", how: "Add them to the sitemap, or set them to noindex if they shouldn't rank." },
  noindex_important: { severity: "high", area: "index", title: "Important pages set to noindex", why: "These pages are in your sitemap or have many links to them, but tell Google not to index them.", how: "Remove the noindex tag, or take the page out of the sitemap if hiding it is on purpose." },
  noindex: { severity: "low", area: "index", title: "Pages hidden from search (noindex)", why: "These pages can't show up on Google. Check that this is on purpose." },
  canonical_to_error: { severity: "high", area: "index", title: "Canonicals that point to a broken or hidden page", why: "Google can't use a canonical that redirects, fails or is noindex, so it picks a page itself.", how: "Point the canonical at the live, indexable version." },
  canonical_multiple: { severity: "medium", area: "index", title: "Pages with more than one canonical", why: "Google ignores canonicals that disagree.", how: "Keep one canonical, in the HTML or the header, not both." },
  canonical_missing: { severity: "low", area: "index", title: "Indexable pages without a canonical", why: "A self canonical tells Google which version of the URL to index.", how: "Add a canonical that points at the page itself." },
  canonical_relative: { severity: "low", area: "index", title: "Canonicals written as relative URLs", why: "Relative canonicals break easily when pages move.", how: "Use the full URL with https://." },
  canonical_elsewhere: { severity: "low", area: "index", title: "Pages that point their canonical to another URL", why: "Google may index the other URL instead. Check that this is on purpose." },
  duplicate_content: { severity: "medium", area: "index", title: "Pages with the same main text", why: "Duplicates split ranking signals and Google picks one on its own.", how: "Redirect the copies, or point their canonical at the main version." },
  soft_404: { severity: "medium", area: "index", title: "Pages that look like errors but return 200", why: "Google treats them as soft 404s and drops them, and they waste crawl time.", how: "Return a real 404, or add content to the page." },
  thin: { severity: "low", area: "content", title: "Pages with under 200 words", why: "Thin pages rarely rank or get cited." },
  http_and_https: { severity: "high", area: "security", title: "The http:// version of the site still loads", why: "Two versions of every page split ranking signals and aren't secure.", how: "Redirect every http:// URL to https:// with a 301." },
  www_and_bare: { severity: "high", area: "index", title: "Both www and non-www load", why: "Two copies of the whole site compete with each other.", how: "Redirect one version to the other with a 301." },
  trailing_slash_dupes: { severity: "medium", area: "index", title: "Pages that load with and without a trailing slash", why: "Each page exists twice.", how: "Redirect one form to the other, or set a canonical." },
  parameter_dupes: { severity: "medium", area: "index", title: "Pages indexable under extra parameters", why: "The same page under ?sort= or ?page= variants splits signals.", how: "Point their canonical at the clean URL." },
  empty_shell: { severity: "high", area: "render", title: "Pages with no text until JavaScript runs", why: "AI crawlers don't run JavaScript, and Google renders it later, so these pages look empty.", how: "Render the main content on the server." },
  few_links_in: { severity: "low", area: "links", title: "Pages with only one internal link to them", why: "Pages with few links in look unimportant.", how: "Link to them from related pages." },
  many_links_out: { severity: "low", area: "links", title: "Pages with more than 300 links", why: "Very long link lists spread link value thin.", how: "Trim menus and footers, or split the page." },
  empty_anchor: { severity: "low", area: "links", title: "Internal links without text", why: "Link text tells Google what the target page is about.", how: "Add text, or alt text on linked images." },
  nofollow_internal: { severity: "low", area: "links", title: "Internal links marked nofollow", why: "nofollow on your own links stops value flowing to your pages.", how: "Remove rel=nofollow from internal links." },
  image_link_no_alt: { severity: "low", area: "links", title: "Linked images without alt text", why: "The alt text is the link's text for these links.", how: "Add alt text that names the target page." },
  link_to_http: { severity: "low", area: "security", title: "Internal links to http:// pages", why: "Each one goes through a redirect, or loads an insecure page.", how: "Change the links to https://." },
  missing_title: { severity: "high", area: "content", title: "Pages without a title", why: "The title is the first thing Google and AI read about a page.", play: "meta" },
  duplicate_title: { severity: "medium", area: "content", title: "Pages that share a title", why: "Pages with the same title compete with each other.", play: "meta" },
  long_title: { severity: "low", area: "content", title: "Titles longer than 60 characters", why: "Long titles get cut off in search results.", play: "meta" },
  short_title: { severity: "low", area: "content", title: "Titles shorter than 20 characters", why: "Short titles waste space that could name the topic.", play: "meta" },
  missing_description: { severity: "medium", area: "content", title: "Pages without a meta description", why: "Search results and AI tools fall back to random text from the page.", play: "meta" },
  duplicate_description: { severity: "low", area: "content", title: "Pages that share a meta description", why: "Each page should describe itself.", play: "meta" },
  long_description: { severity: "low", area: "content", title: "Meta descriptions longer than 160 characters", why: "Long descriptions get cut off in search results.", play: "meta" },
  missing_h1: { severity: "medium", area: "content", title: "Pages without a main heading (H1)", why: "The H1 tells readers and crawlers what the page is about." },
  multiple_h1: { severity: "low", area: "content", title: "Pages with more than one H1", why: "One main heading per page is clearer for crawlers." },
  heading_skips: { severity: "low", area: "content", title: "Headings that skip a level", why: "Jumping from H2 to H4 makes the outline harder to follow.", how: "Use the next level down for each sub-section." },
  missing_alt: { severity: "medium", area: "content", title: "Images without alt text", why: "Alt text tells Google Images, screen readers and AI tools what an image shows.", play: "alt" },
  no_share_image: { severity: "low", area: "content", title: "Pages without a share image", why: "Without og:image, links shared on LinkedIn or Slack show no picture." },
  lang_missing: { severity: "low", area: "content", title: "Pages without a language", why: "The html lang attribute tells search engines and screen readers the page's language.", how: "Add lang=\"en\" (or your language) to the html tag." },
  viewport_missing: { severity: "medium", area: "content", title: "Pages without a mobile viewport", why: "Without it, phones show the desktop page shrunk down. Google indexes the mobile page.", how: "Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">." },
  schema_invalid_json: { severity: "high", area: "schema", title: "Structured data that doesn't parse", why: "Broken JSON-LD is ignored, so the page loses its rich results.", how: "Fix the JSON (a missing comma or quote is the usual cause)." },
  no_schema: { severity: "low", area: "schema", title: "Pages without structured data", why: "Schema helps Google and AI tools understand what a page is and who wrote it.", play: "schema" },
  org_missing: { severity: "low", area: "schema", title: "Home page without Organization markup", why: "Organization markup ties your name, logo and profiles together for Google and AI answers.", play: "schema" },
  hreflang_bad_code: { severity: "high", area: "intl", title: "hreflang with invalid language codes", why: "Google ignores hreflang it can't read.", how: "Use codes like en, en-GB or de-DE, and x-default." },
  hreflang_no_return: { severity: "high", area: "intl", title: "hreflang without a return link", why: "Google only trusts hreflang when both pages point at each other.", how: "Add the matching hreflang on the other page." },
  hreflang_no_self: { severity: "medium", area: "intl", title: "hreflang sets that don't include the page itself", why: "Each page should list itself in its own hreflang set." },
  hreflang_no_xdefault: { severity: "low", area: "intl", title: "hreflang sets without x-default", why: "x-default tells Google which version to show everyone else." },
  mixed_content: { severity: "high", area: "security", title: "Secure pages that load insecure files", why: "Browsers block or warn about http:// images and scripts on https:// pages.", how: "Load every file over https://." },
  no_hsts: { severity: "low", area: "security", title: "No HSTS header", why: "HSTS makes browsers always use https:// for your site.", how: "Send Strict-Transport-Security from the server or CDN." },
  not_indexed_valuable: { severity: "high", area: "index", title: "Pages Google crawled or found but didn't index", why: "Search Console says \"currently not indexed\" for pages you want in Google. They can't get clicks.", how: "Improve the page (more useful content, fewer near copies) and link to it from strong pages, then request indexing in Search Console." },
  google_other_canonical: { severity: "medium", area: "index", title: "Google chose a different canonical", why: "Google ignores your canonical on these pages and indexes another URL.", how: "Make internal links, the sitemap and the canonical all point at the same URL." },
  rich_result_errors: { severity: "medium", area: "schema", title: "Structured data errors Google reports", why: "Pages with rich result errors lose stars, prices or FAQs in Google results.", how: "Fix the errors Search Console lists for each page." },
  sitemap_not_submitted: { severity: "low", area: "crawl", title: "Sitemaps not submitted in Search Console", why: "Submitting a sitemap lets you see how many of its pages Google indexed.", how: "Add it under Sitemaps in Search Console." },
  sitemap_google_errors: { severity: "medium", area: "crawl", title: "Sitemaps with errors in Search Console", why: "Google couldn't read part of these sitemaps.", how: "Open the sitemap in Search Console to see each error." },
  cwv_fail_origin: { severity: "high", area: "speed", title: "The site fails Core Web Vitals on phones", why: "Real visitors on phones get a slow or jumpy page. Google uses this as a ranking signal.", how: "Open Speed to see which metric fails and the slowest pages." },
  lcp_poor: { severity: "medium", area: "speed", title: "Pages whose main content takes over 4 seconds", why: "Visitors on phones wait over 4 seconds for the biggest image or text block.", how: "Make the hero image smaller, preload it, and cut render-blocking scripts." },
  inp_poor: { severity: "medium", area: "speed", title: "Pages slow to respond to taps", why: "The page takes over half a second to react when visitors tap or type.", how: "Break up long scripts and remove heavy third-party widgets." },
  cls_poor: { severity: "medium", area: "speed", title: "Pages that jump while loading", why: "Content moves as the page loads, so visitors tap the wrong thing.", how: "Give images, ads and embeds a fixed size." },
  ai_bots_blocked: { severity: "high", area: "ai", title: "robots.txt blocks AI search crawlers", why: "These crawlers fetch pages for ChatGPT, Claude and Perplexity answers, so blocked pages can't be cited.", how: "Remove the Disallow rule for these bots." },
  ai_training_blocked: { severity: "low", area: "ai", title: "robots.txt blocks AI training crawlers", why: "Blocking training is a fair choice and doesn't stop AI search. Listed so it's on purpose." },
  no_llms_txt: { severity: "low", area: "ai", title: "No llms.txt file", why: "llms.txt gives AI tools a short map of your most useful pages. It's optional, but cheap to add." },
};

/** Valid hreflang: a language (2 or 3 letters), an optional script and region, or x-default. */
export const validHreflang = (code: string) => /^x-default$/i.test(code) || /^[a-z]{2,3}(-[A-Za-z]{4})?(-([A-Za-z]{2}|\d{3}))?$/i.test(code);
const ERRORISH = /\b(page not found|not found|404|no results found|nothing found|page doesn'?t exist|page does not exist|no longer available)\b/i;

const ok = (p: CheckPage) => p.status >= 200 && p.status < 300;
const indexable = (p: CheckPage) => ok(p) && Boolean(p.facts) && !p.facts!.noindex && (!p.facts!.canonical || p.facts!.canonical === p.final || p.facts!.canonical === p.url);

/** Is this page meant to rank? The checks only hold indexable pages to page-level rules. */
export const isIndexable = indexable;

/** Why a page isn't indexable, or null when it is. */
export function indexReason(p: CheckPage): string | null {
  if (p.status === 0) return "No answer";
  if (p.status >= 300 && p.status < 400) return "Redirect";
  if (p.status >= 400) return `Error ${p.status}`;
  if (!p.facts) return "Not HTML";
  if (p.facts.noindex) return "noindex";
  if (p.facts.canonical && p.facts.canonical !== p.final && p.facts.canonical !== p.url) return "Canonical elsewhere";
  return null;
}

export function runChecks(pages: CheckPage[], site: SiteFacts): Issue[] {
  const out: Issue[] = [];
  const add = (id: string, hit: string[], count?: number) => {
    const d = CHECKS[id];
    if (!d || !hit.length) return;
    out.push({ id, ...d, count: count ?? hit.length, pages: hit.slice(0, 100), all: hit });
  };
  const siteWide = (id: string, count = 1, extra: Partial<Issue> = {}) => {
    const d = CHECKS[id];
    if (d) out.push({ id, ...d, count, pages: [], siteWide: true, ...extra });
  };
  const html = pages.filter((p) => ok(p) && p.facts);
  const idx = html.filter(indexable);
  const where = (list: CheckPage[], f: (p: CheckPage, x: NonNullable<CheckPage["facts"]>) => boolean) => list.filter((p) => f(p, p.facts!)).map((p) => p.url);
  const dupes = (key: (x: NonNullable<CheckPage["facts"]>) => string) => {
    const by = new Map<string, string[]>();
    for (const p of idx) {
      const k = key(p.facts!).toLowerCase().trim();
      if (!k) continue;
      by.set(k, [...(by.get(k) ?? []), p.url]);
    }
    return [...by.values()].filter((v) => v.length > 1).flat();
  };

  // Crawlability
  if (site.robots.status >= 500 || site.robots.status === 0) siteWide("robots_error");
  else if (site.robots.status === 404) siteWide("robots_missing");
  else if (site.robots.status === 200 && !site.robots.sitemaps) siteWide("robots_no_sitemap");
  add("robots_blocks_important", site.robots.disallowedSitemapUrls);
  add("broken_pages", pages.filter((p) => p.status >= 400).map((p) => p.url));
  add("timeout", pages.filter((p) => p.status === 0).map((p) => p.url));
  if (site.links.brokenCount) out.push({ id: "broken_links", ...CHECKS.broken_links, count: site.links.brokenCount, pages: [...new Set(site.links.broken.map((b) => b.from))].slice(0, 100), all: [...new Set(site.links.broken.map((b) => b.from))] });
  if (site.links.externalCount) out.push({ id: "broken_external", ...CHECKS.broken_external, count: site.links.externalCount, pages: [...new Set(site.links.external.map((b) => b.from))].slice(0, 100), all: [...new Set(site.links.external.map((b) => b.from))] });
  add("redirect_loop", pages.filter((p) => p.loop).map((p) => p.url));
  add("redirect_to_error", pages.filter((p) => p.hops > 0 && !p.loop && (p.chainEnd >= 400 || p.chainEnd === 0)).map((p) => p.url));
  add("redirect_chain", pages.filter((p) => p.hops >= 2 && !p.loop).map((p) => p.url));
  if (site.links.toRedirectCount) out.push({ id: "link_to_redirect", ...CHECKS.link_to_redirect, count: site.links.toRedirectCount, pages: [...new Set(site.links.toRedirect.map((b) => b.from))].slice(0, 100), all: [...new Set(site.links.toRedirect.map((b) => b.from))] });
  add("meta_refresh", where(html, (_, x) => Boolean(x.metaRefresh && /url\s*=/i.test(x.metaRefresh))));
  add("orphan", idx.filter((p) => p.inSitemap && p.linksIn === 0 && p.url !== site.home).map((p) => p.url));
  add("deep_page", idx.filter((p) => (p.depth ?? 0) >= 4).map((p) => p.url));
  if (site.infinite.length) out.push({ id: "infinite_space", ...CHECKS.infinite_space, count: site.infinite.length, pages: site.infinite.slice(0, 100) });
  if (!site.sitemaps.found) siteWide("sitemap_missing");
  if (site.sitemaps.bad.length) siteWide("sitemap_bad_xml", site.sitemaps.bad.length, { pages: site.sitemaps.bad.slice(0, 100) });
  if (site.sitemaps.tooBig.length) siteWide("sitemap_too_big", site.sitemaps.tooBig.length, { pages: site.sitemaps.tooBig.slice(0, 100) });
  add("sitemap_error_urls", pages.filter((p) => p.inSitemap && !indexable(p)).map((p) => p.url));
  if (site.sitemaps.found) add("sitemap_missing_pages", idx.filter((p) => !p.inSitemap).map((p) => p.url));

  // Speed
  add("slow", pages.filter((p) => p.ms > 1000 && p.status > 0).map((p) => p.url));
  add("big_html", where(html, (p) => p.bytes > 2_000_000));
  add("no_compression", html.filter((p) => !p.compressed && p.bytes > 1500).map((p) => p.url));

  // Indexability
  add("noindex_important", where(html, (p, x) => x.noindex && (p.inSitemap || p.linksIn >= 5)));
  add("noindex", where(html, (p, x) => x.noindex && !p.inSitemap && p.linksIn < 5));
  add("canonical_to_error", where(html, (p, x) => {
    if (!x.canonical || x.canonical === p.final || x.canonical === p.url) return false;
    const s = site.statusOf[x.canonical];
    return s !== undefined && (s === 0 || s >= 300);
  }));
  add("canonical_multiple", where(html, (_, x) => x.canonicals > 1));
  add("canonical_missing", where(idx, (_, x) => !x.canonical));
  add("canonical_relative", where(html, (_, x) => Boolean(x.canonicalRaw && !/^https?:\/\//i.test(x.canonicalRaw))));
  add("canonical_elsewhere", where(html, (p, x) => !x.noindex && Boolean(x.canonical && x.canonical !== p.final && x.canonical !== p.url)));
  const byText = new Map<string, string[]>();
  for (const p of idx) if (p.facts!.textHash) byText.set(p.facts!.textHash, [...(byText.get(p.facts!.textHash) ?? []), p.url]);
  add("duplicate_content", [...byText.values()].filter((v) => v.length > 1).flat());
  add("soft_404", where(idx, (_, x) => x.words < 150 && (ERRORISH.test(x.title) || x.h1.some((h) => ERRORISH.test(h)))));
  add("thin", where(idx, (p, x) => x.words < 200 && p.url !== site.home));
  if (site.hosts.httpLive) siteWide("http_and_https");
  if (site.hosts.otherHostLive) siteWide("www_and_bare");
  const okSet = new Set(idx.map((p) => p.url));
  add("trailing_slash_dupes", idx.filter((p) => {
    try {
      const twin = slashTwin(p.url);
      return twin !== p.url && okSet.has(twin);
    } catch {
      return false;
    }
  }).map((p) => p.url));
  // The same page under extra parameters: a parameter URL whose text matches its clean page, or another variant's.
  const textAt = new Map(idx.map((p) => [p.url, p.facts!.textHash]));
  const byPath = new Map<string, CheckPage[]>();
  for (const p of idx) if (p.url.includes("?")) byPath.set(pathOnly(p.url), [...(byPath.get(pathOnly(p.url)) ?? []), p]);
  add("parameter_dupes", [...byPath.entries()].flatMap(([path, list]) =>
    list
      .filter((p) => {
        const h = p.facts!.textHash;
        if (!h) return false;
        return textAt.get(path) === h || textAt.get(`${path}/`) === h || list.some((o) => o !== p && o.facts!.textHash === h);
      })
      .map((p) => p.url),
  ));

  // Rendering
  add("empty_shell", where(html, (_, x) => x.shell));

  // Links
  add("few_links_in", idx.filter((p) => p.linksIn === 1 && p.url !== site.home).map((p) => p.url));
  add("many_links_out", where(html, (_, x) => x.linksOut > 300));
  add("empty_anchor", where(html, (_, x) => x.emptyAnchors > 0));
  add("nofollow_internal", where(html, (_, x) => x.nofollowInternal > 0));
  add("image_link_no_alt", where(html, (_, x) => x.imageLinksNoAlt > 0));
  add("link_to_http", where(html, (_, x) => x.httpLinks > 0));

  // Content
  add("missing_title", where(html, (_, x) => !x.title));
  add("duplicate_title", dupes((x) => x.title));
  add("long_title", where(idx, (_, x) => x.title.length > 60));
  add("short_title", where(idx, (_, x) => x.title.length > 0 && x.title.length < 20));
  add("missing_description", where(idx, (_, x) => !x.description));
  add("duplicate_description", dupes((x) => x.description));
  add("long_description", where(idx, (_, x) => x.description.length > 160));
  add("missing_h1", where(idx, (_, x) => x.h1.length === 0));
  add("multiple_h1", where(idx, (_, x) => x.h1.length > 1));
  add("heading_skips", where(idx, (_, x) => x.headingSkip));
  add("missing_alt", where(html, (_, x) => x.imagesNoAlt > 0));
  add("no_share_image", where(idx, (_, x) => !x.ogImage));
  add("lang_missing", where(html, (_, x) => !x.lang));
  add("viewport_missing", where(html, (_, x) => !x.viewport));

  // Structured data
  add("schema_invalid_json", where(html, (_, x) => x.schemaInvalid > 0));
  add("no_schema", where(idx, (_, x) => !x.schema.length));
  const home = pages.find((p) => p.url === site.home && ok(p) && p.facts);
  if (home && !home.facts!.schema.some((t) => /^(Organization|Corporation|LocalBusiness|NGO|EducationalOrganization|OnlineBusiness|OnlineStore)$/.test(t))) add("org_missing", [home.url]);

  // International
  const pageAt = new Map(html.map((p) => [p.url, p]));
  add("hreflang_bad_code", where(html, (_, x) => x.hreflang.some((h) => !validHreflang(h.lang))));
  add("hreflang_no_self", where(html, (p, x) => x.hreflang.length > 0 && !x.hreflang.some((h) => h.url === p.url || h.url === p.final)));
  add("hreflang_no_xdefault", where(html, (_, x) => x.hreflang.length > 1 && !x.hreflang.some((h) => h.lang.toLowerCase() === "x-default")));
  add("hreflang_no_return", where(html, (p, x) => x.hreflang.some((h) => {
    if (h.url === p.url || h.url === p.final) return false;
    const other = pageAt.get(h.url);
    return Boolean(other?.facts) && !other!.facts!.hreflang.some((b) => b.url === p.url || b.url === p.final);
  })));

  // Security
  add("mixed_content", where(html, (_, x) => x.mixedContent > 0));
  if (!site.hosts.hsts && site.home.startsWith("https://")) siteWide("no_hsts");

  // AI access
  if (site.robots.blockedSearch.length) siteWide("ai_bots_blocked", site.robots.blockedSearch.length, { title: `robots.txt blocks ${site.robots.blockedSearch.join(", ")}` });
  if (site.robots.blockedTraining.length) siteWide("ai_training_blocked", site.robots.blockedTraining.length, { title: `robots.txt blocks ${site.robots.blockedTraining.join(", ")} (AI training)` });
  if (!site.llmsTxt) siteWide("no_llms_txt");

  // Search Console and Chrome UX Report, when the brand has them.
  const g = site.google;
  if (g) {
    const insp = (p: CheckPage) => byUrl(g.inspections, p.url) ?? byUrl(g.inspections, p.final);
    add("not_indexed_valuable", idx.filter((p) => /currently not indexed/i.test(insp(p)?.coverage ?? "")).map((p) => p.url));
    add("google_other_canonical", idx.filter((p) => insp(p)?.otherCanonical).map((p) => p.url));
    add("rich_result_errors", html.filter((p) => (insp(p)?.richErrors ?? 0) > 0).map((p) => p.url));
    if (g.gscSitemaps) {
      const inGsc = new Set(g.gscSitemaps.map((x) => x.replace(/\/+$/, "")));
      const missing = (site.sitemapPaths ?? []).filter((x) => !inGsc.has(x.replace(/\/+$/, "")));
      if (missing.length) siteWide("sitemap_not_submitted", missing.length, { pages: missing.slice(0, 100) });
    }
    if (g.gscSitemapErrors.length) siteWide("sitemap_google_errors", g.gscSitemapErrors.length, { pages: g.gscSitemapErrors.slice(0, 100) });
    if (g.originPass === false) siteWide("cwv_fail_origin");
    const v = (p: CheckPage) => byUrl(g.vitals, p.url);
    add("lcp_poor", idx.filter((p) => (v(p)?.lcp ?? 0) > 4000).map((p) => p.url));
    add("inp_poor", idx.filter((p) => (v(p)?.inp ?? 0) > 500).map((p) => p.url));
    add("cls_poor", idx.filter((p) => (v(p)?.cls ?? 0) > 0.25).map((p) => p.url));
    for (const i of out) i.clicks = (i.all ?? i.pages).reduce((a, u) => a + (byUrl(g.clicks, u) ?? 0), 0);
  }

  const rank = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || b.count - a.count);
}

const WEIGHT = { high: 15, medium: 7, low: 2 };

/** 0 to 100: each issue takes off its weight times the share of pages it hits; site-wide issues take their full weight. */
export function score(issues: Issue[], pages: number): number {
  const penalty = issues.reduce((n, i) => n + WEIGHT[i.severity] * (i.siteWide ? 1 : Math.min(1, i.count / Math.max(1, pages))), 0);
  return Math.max(0, Math.round(100 - penalty));
}

/** The same score for each area, from that area's issues only. */
export function areaScores(issues: Issue[], pages: number): Record<Area, number> {
  return Object.fromEntries(AREAS.map((a) => [a.id, score(issues.filter((i) => i.area === a.id), pages)])) as Record<Area, number>;
}

/** Each page's issue ids, for the Pages table. Site-wide issues stay off the pages. */
export function issuesByPage(issues: Issue[], all: Map<string, string[]> = new Map()): Map<string, string[]> {
  for (const i of issues) if (!i.siteWide) for (const u of i.all ?? i.pages) all.set(u, [...(all.get(u) ?? []), i.id]);
  return all;
}

/**
 * Shortest click depth from the start pages, from each page's internal links. Pages nothing links to keep null.
 * links maps a page to the pages it links to.
 */
export function depths(starts: string[], links: Map<string, string[]>): Map<string, number> {
  const out = new Map<string, number>();
  let level = [...new Set(starts)];
  for (const s of level) out.set(s, 0);
  let d = 0;
  while (level.length) {
    d++;
    const next: string[] = [];
    for (const u of level) for (const t of links.get(u) ?? []) if (!out.has(t)) {
      out.set(t, d);
      next.push(t);
    }
    level = next;
  }
  return out;
}
