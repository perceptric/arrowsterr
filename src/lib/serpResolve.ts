import "server-only";
import { safeFetch } from "./safeFetch";
import { fixSerpItems } from "./serpUrl";

// Follows a Google redirect link (google.com/goto?url=...) one step to read where it points, without loading the site.
// Google answers with a redirect, or with a short "Redirect notice" page that holds the link.

export async function resolveRedirect(u: string): Promise<string | null> {
  const r = await safeFetch(u, { hops: 0, timeout: 6000, maxBytes: 200_000, ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36" });
  const loc = r.headers.get("location");
  if (r.status >= 300 && r.status < 400 && loc) return new URL(loc, u).toString();
  const m = /href="(https?:\/\/(?!(?:www\.)?google\.)[^"]+)"/i.exec(r.body);
  return m ? m[1].replace(/&amp;/g, "&") : null;
}

/** Real addresses for Google redirect links in a list of SERP items, in place. */
export const fixSerp = <T extends { type?: string; url?: string | null; domain?: string | null; breadcrumb?: string | null }>(items: T[]) => fixSerpItems(items, resolveRedirect);
