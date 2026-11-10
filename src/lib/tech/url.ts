// Address rules for the crawler (docs/technical-seo-plan.md, section 11): one way to clean a URL everywhere, so the
// same page is never counted twice and duplicates are found the same way in every check. Pure.

/** Query parameters that only track a visit and never change the page. */
const TRACKING = /^(utm_[a-z]+|gclid|gbraid|wbraid|fbclid|msclkid|dclid|yclid|mc_cid|mc_eid|_hsenc|_hsmi|hsa_[a-z]+|ref_src|igshid|si)$/i;

/**
 * The crawler's form of a URL: lowercase scheme and host, no default port, no fragment, tracking parameters dropped,
 * the rest sorted. The path keeps its case and its trailing slash, since those can be different pages.
 * dropQuery removes every parameter (a crawl setting). Returns null for anything that isn't http(s).
 */
export function normUrl(raw: string, base?: string, dropQuery = false): string | null {
  let u: URL;
  try {
    u = base ? new URL(raw, base) : new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  u.hash = "";
  u.hostname = u.hostname.toLowerCase().replace(/\.$/, "");
  if ((u.protocol === "http:" && u.port === "80") || (u.protocol === "https:" && u.port === "443")) u.port = "";
  const params = [...u.searchParams.entries()].filter(([k]) => !dropQuery && !TRACKING.test(k)).sort(([a, x], [b, y]) => a.localeCompare(b) || x.localeCompare(y));
  u.search = params.length ? `?${new URLSearchParams(params)}` : "";
  if (!u.pathname) u.pathname = "/";
  return u.toString();
}

/** The host without www, for telling one site from another. */
export const siteHost = (url: string) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};

/** True when a URL belongs to the crawled site: the same host with or without www, or any subdomain when allowed. */
export function isInternal(url: string, root: string, subdomains = false): boolean {
  const h = siteHost(url);
  const r = siteHost(root);
  return Boolean(h) && (h === r || (subdomains && h.endsWith(`.${r}`)));
}

/** Files the crawler never fetches as pages. */
export const NOT_A_PAGE = /\.(pdf|jpe?g|png|gif|webp|avif|svg|ico|bmp|tiff?|zip|rar|7z|gz|tar|mp[34]|m4a|mov|avi|wmv|webm|ogg|wav|docx?|xlsx?|pptx?|csv|json|xml|txt|js|css|woff2?|ttf|eot|exe|dmg|apk)$/i;

/** The path with every query parameter dropped, for counting endless parameter combinations. */
export const pathOnly = (url: string) => {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url;
  }
};

/** The same page with and without its trailing slash, and with the other case: for the duplicate checks. */
export function slashTwin(url: string): string {
  const u = new URL(url);
  if (u.pathname === "/") return url;
  u.pathname = u.pathname.endsWith("/") ? u.pathname.slice(0, -1) : `${u.pathname}/`;
  return u.toString();
}

/** A path part that names one item rather than a section: ids, dates, hashes and long slugs. */
function isItem(part: string): boolean {
  return /^\d+$/.test(part) || /^\d{4}(-\d{2}){0,2}$/.test(part) || /^[0-9a-f]{8,}$/i.test(part) || /^[0-9a-f-]{20,}$/i.test(part) || part.split("-").length >= 3 || part.length > 32;
}

/**
 * Group pages into templates by URL shape: item-like path parts become *, the last part of a path with siblings
 * becomes * too. /blog/how-to-x and /blog/how-to-y are both /blog/*. The home page is its own template.
 */
export function templates(urls: string[], minGroup = 3): Map<string, string> {
  const shape = (url: string) => {
    let path = "/";
    try {
      path = new URL(url).pathname;
    } catch {
      /* keep / */
    }
    const parts = path.split("/").filter(Boolean);
    if (!parts.length) return "/";
    return "/" + parts.map((p) => (isItem(p) ? "*" : p)).join("/");
  };
  const first = new Map<string, string>();
  for (const u of urls) first.set(u, shape(u));
  // A parent with several different children (items or plain words) is a section: its children share a template.
  const lastOf = (u: string) => {
    try {
      return new URL(u).pathname.split("/").filter(Boolean).pop() ?? "";
    } catch {
      return "";
    }
  };
  const parentOf = (s: string) => s.slice(0, s.lastIndexOf("/")) || "/";
  const byParent = new Map<string, Set<string>>();
  for (const [u, s] of first) {
    if (s === "/") continue;
    const set = byParent.get(parentOf(s)) ?? new Set<string>();
    set.add(lastOf(u));
    byParent.set(parentOf(s), set);
  }
  const out = new Map<string, string>();
  for (const [u, s] of first) {
    if (s === "/") {
      out.set(u, "/");
      continue;
    }
    const parent = parentOf(s);
    const siblings = byParent.get(parent)?.size ?? 0;
    out.set(u, siblings >= minGroup ? `${parent === "/" ? "" : parent}/*` : s);
  }
  return out;
}

/** A readable name for a template pattern: /blog/* is "Blog", / is "Home". */
export function templateName(pattern: string): string {
  if (pattern === "/") return "Home";
  const word = pattern.split("/").filter((p) => p && p !== "*").pop();
  if (!word) return "Pages";
  const w = word.replace(/[-_]+/g, " ");
  return w.charAt(0).toUpperCase() + w.slice(1);
}
