// Titles for cited links. The engines often label a source "Official website" or "Supio website";
// these helpers spot such labels and turn a page's real <title> into a short, readable one.
// Pure, so the browser, the server and tests can all use it.

const SEP = /\s+[|–—·•:-]\s+/;

/** A host without www, lower case. "" when the URL can't be read. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

const isHome = (url: string) => {
  try {
    return new URL(url).pathname.replace(/\/+$/, "") === "";
  } catch {
    return false;
  }
};

/** The name part of a domain: "evenuplaw.com" gives "evenuplaw". */
const rootOf = (host: string) => host.split(".").slice(0, -1).join(".").split(".").pop() ?? host;
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** True when a cited link's label says nothing about the page: blank, "Official website", "Supio website", "Home", or just the domain. */
export function isGenericTitle(title: string | null | undefined, url: string): boolean {
  const t = (title ?? "").replace(/\s+/g, " ").trim();
  if (!t) return true;
  if (/^(?:the\s+)?(?:official\s+)?(?:web\s*site|site|home\s*page|home|main page|landing page|official page)$/i.test(t)) return true;
  if (/^official\s+(?:web\s*)?site\b/i.test(t)) return true;
  if (/^[^|–—:]{1,40}?\s+(?:official\s+)?(?:web\s*site|site|home\s*page)$/i.test(t)) return true;
  const host = hostOf(url);
  if (host && (squash(t) === squash(host) || squash(t) === squash(`www.${host}`))) return true;
  if (/^https?:\/\//i.test(t)) return true;
  return false;
}

/**
 * A page's <title> made short and readable:
 * - "Home | Supio" and "Home - Supio" lose "Home"
 * - on a home page, the brand goes first: "Legal AI Software | Eve" becomes "Eve: Legal AI Software".
 *   The brand is the part that matches the domain, or else the site's own name (og:site_name) when given;
 *   with neither, the first part is kept, since the domain shows under the title anyway
 * - on other pages, a trailing " | Site name" goes
 * Returns "" when there is nothing useful left.
 */
export function tidyTitle(raw: string, url: string, site = ""): string {
  let t = raw.replace(/\s+/g, " ").replace(/&amp;/g, "&").trim();
  t = t.replace(/^home\s*[|–—·•:-]\s*/i, "").replace(/\s*[|–—·•:-]\s*home$/i, "").trim();
  if (!t) return "";
  const parts = t.split(SEP).map((p) => p.trim()).filter(Boolean);
  const root = squash(rootOf(hostOf(url)));
  const names = [root, squash(site)].filter((x) => x.length >= 3);
  const brandAt = parts.findIndex((p) => {
    const q = squash(p);
    return q.length >= 3 && names.some((n) => q === n || n.startsWith(q) || q.startsWith(n) || (n.length >= 4 && q.includes(n)));
  });
  if (parts.length > 1 && isHome(url)) {
    if (brandAt >= 0) return `${parts[brandAt]}: ${parts.filter((_, i) => i !== brandAt).join(" ")}`.slice(0, 140);
    const name = site.trim();
    return (name && name.length <= 40 ? `${name}: ${parts[0]}` : parts[0]).slice(0, 140);
  }
  if (parts.length > 1 && brandAt === parts.length - 1) return parts.slice(0, -1).join(" | ").slice(0, 140);
  return t.slice(0, 140);
}

/** The site name to show while a title loads, or when a page can't be read: "supio.com". */
export const siteName = (url: string) => hostOf(url) || url;
