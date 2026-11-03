import { DAY, readCache, writeCache } from "@/lib/cache";
import { tidyTitle } from "@/lib/linkTitles";
import { pageMeta } from "@/lib/pageMeta";
import { safeFetch } from "@/lib/safeFetch";
import { requireRole } from "@/lib/serverAuth";

// Real titles for cited links whose engine label says nothing ("Official website"). Each page is read once,
// then shared from the cache for 30 days. A page that can't be read is asked again after a day.
//   { workspaceId, urls: string[] }  ->  { titles: { [url]: string } }

const MAX = 30;
const AT_ONCE = 6;

// Some sites are slow or turn away bots, so a page gets 10 seconds, then one more try as a browser.
const BROWSER = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

async function readTitle(url: string): Promise<string> {
  for (const ua of [undefined, BROWSER]) {
    const page = await safeFetch(url, { timeout: 10_000, maxBytes: 300_000, accept: "text/html", ua }).catch(() => null);
    if (!page?.ok || !page.body) continue;
    const meta = pageMeta(page.body, page.url || url);
    const title = tidyTitle(meta.title || meta.siteName || meta.h1, url, meta.siteName);
    if (title) return title;
  }
  return "";
}

/** A title is kept 30 days. A page that couldn't be read is asked again after a day, not a month. */
async function titleOf(url: string): Promise<string> {
  const hit = await readCache<string>(`title:${url}`, 30 * DAY);
  if (typeof hit === "string" && hit) return hit;
  if ((await readCache<string>(`title-miss:${url}`, DAY)) !== undefined) return "";
  const title = await readTitle(url);
  await writeCache(title ? `title:${url}` : `title-miss:${url}`, title);
  return title;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const auth = await requireRole(request, body.workspaceId, "viewer");
  if ("denied" in auth) return auth.denied;
  const asked: unknown[] = Array.isArray(body.urls) ? body.urls : [];
  const urls = [...new Set(asked.filter((u): u is string => typeof u === "string" && /^https?:\/\//i.test(u) && u.length < 2000))].slice(0, MAX);
  const titles: Record<string, string> = {};
  for (let i = 0; i < urls.length; i += AT_ONCE) {
    const batch = urls.slice(i, i + AT_ONCE);
    const found = await Promise.all(batch.map((u) => titleOf(u).catch(() => "")));
    batch.forEach((u, j) => (titles[u] = found[j]));
  }
  return Response.json({ titles });
}
