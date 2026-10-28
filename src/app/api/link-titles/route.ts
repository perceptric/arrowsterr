import { cached, DAY } from "@/lib/cache";
import { tidyTitle } from "@/lib/linkTitles";
import { pageMeta } from "@/lib/pageMeta";
import { safeFetch } from "@/lib/safeFetch";
import { requireRole } from "@/lib/serverAuth";

// Real titles for cited links whose engine label says nothing ("Official website"). Each page is read once,
// then shared from the cache for 30 days. A page that can't be read is saved as "" so it isn't asked for again.
//   { workspaceId, urls: string[] }  ->  { titles: { [url]: string } }

const MAX = 30;
const AT_ONCE = 6;

async function titleOf(url: string): Promise<string> {
  const { data } = await cached(`title:${url}`, 30 * DAY, async () => {
    const page = await safeFetch(url, { timeout: 5000, maxBytes: 600_000, accept: "text/html" }).catch(() => null);
    if (!page?.ok || !page.body) return "";
    const meta = pageMeta(page.body, page.url || url);
    return tidyTitle(meta.title || meta.siteName || meta.h1, url, meta.siteName);
  });
  return typeof data === "string" ? data : "";
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
