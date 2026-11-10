// Google results that point at google.com/goto?url=... (or /url?q=...) instead of the site. Google uses these redirect
// links for some results, and the `url` value is often an encoded token, so it can't be read directly. Each one is
// followed once to its real address; when that fails, the address comes from the result's breadcrumb, so the domain
// and "AI cited" are still right. Pure, apart from the resolver passed in.

const GOOGLE = /(^|\.)google\.[a-z.]+$/i;
const REDIRECT_PATHS = /^\/(goto|url|interstitial)\/?$/i;

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};

/** A Google redirect link, like https://google.com/goto?url=CAES... or https://www.google.com/url?q=https://... */
export function isGoogleRedirect(u: string | null | undefined): boolean {
  if (!u) return false;
  try {
    const x = new URL(u);
    return GOOGLE.test(x.hostname) && REDIRECT_PATHS.test(x.pathname);
  } catch {
    return false;
  }
}

/** The target when the redirect carries it in plain sight (url= or q= holding an http address). */
export function plainTarget(u: string): string | null {
  try {
    const x = new URL(u);
    for (const k of ["url", "q", "u"]) {
      const v = x.searchParams.get(k);
      if (v && /^https?:\/\//i.test(v) && !GOOGLE.test(hostOf(v))) return v;
    }
  } catch {
    /* not a URL */
  }
  return null;
}

/**
 * An address from Google's breadcrumb, like "https://www.base44.com › blog › ai-app-builder". The site is exact; the
 * path is Google's display of it, which matches the real path on most sites.
 */
export function breadcrumbUrl(b: string | null | undefined): string | null {
  const parts = (b ?? "").split(/\s*›\s*/).map((p) => p.trim()).filter(Boolean);
  if (!parts.length || !/^https?:\/\/[^\s/]+/i.test(parts[0])) return null;
  const origin = parts[0].replace(/\/+$/, "");
  const path = parts.slice(1).filter((p) => /^[\w.~%+-]+$/.test(p));
  if (GOOGLE.test(hostOf(origin))) return null;
  return path.length === parts.length - 1 ? `${origin}/${path.join("/")}` : `${origin}/`;
}

type Item = { type?: string; url?: string | null; domain?: string | null; breadcrumb?: string | null };

/**
 * Swap Google redirect links in organic results for the real address, in place. `resolve` follows one redirect and
 * returns where it lands (or null). Results that can't be resolved keep the redirect link, with the breadcrumb's domain.
 */
export async function fixSerpItems<T extends Item>(items: T[], resolve: (u: string) => Promise<string | null>): Promise<T[]> {
  const todo = items.filter((i) => i.type === "organic" && isGoogleRedirect(i.url));
  await Promise.all(
    todo.map(async (i) => {
      const from = i.url!;
      const real = plainTarget(from) ?? (await resolve(from).catch(() => null));
      const target = real && !GOOGLE.test(hostOf(real)) && !isGoogleRedirect(real) ? real : breadcrumbUrl(i.breadcrumb);
      if (target) {
        i.url = target;
        i.domain = hostOf(target);
      }
    }),
  );
  return items;
}
