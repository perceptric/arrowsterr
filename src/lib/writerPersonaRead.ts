import "server-only";
import { pageText } from "./pageText";
import { postShape } from "./postShape";
import { safeFetch } from "./safeFetch";
import { findPages } from "./sitemap";
import { pickPages, type PersonaSource, type PostShape, type SourceKind } from "./writerPersona";

// Reading a brand's own pages and posts for the writer persona (writerPersona.ts): the homepage, the about page,
// up to 5 product or service pages, up to 8 posts (newest first) and anything the team added. No AI calls here.

const FEEDS = ["/feed", "/rss.xml", "/blog/feed", "/blog/rss.xml", "/feed.xml", "/atom.xml"];
const PAGE_CHARS = 3500;
const POST_CHARS = 4500;
/** The real writing kept as the voice sample, when the brand has posts and no sample of its own. */
export const SAMPLE_CHARS = 9000;

type Read = { url: string; kind: SourceKind; html: string; title: string; text: string };

async function read(url: string, kind: SourceKind, max: number): Promise<Read | null> {
  const r = await safeFetch(url, { timeout: 15_000, maxBytes: 3_000_000 }).catch(() => null);
  if (!r?.ok || !r.body) return null;
  const { title, text, words } = pageText(r.body, max);
  if (words < 40) return null;
  return { url: r.url || url, kind, html: r.body, title, text };
}

/** The newest posts from the site's feed, when it has one. */
async function feedPosts(domain: string): Promise<string[]> {
  for (const f of FEEDS) {
    const r = await safeFetch(`https://${domain}${f}`, { timeout: 8000, maxBytes: 2_000_000 }).catch(() => null);
    if (!r?.ok || !/<(rss|feed)[\s>]/i.test(r.body)) continue;
    const links = [...r.body.matchAll(/<item[\s\S]*?<link>\s*([^<]+?)\s*<\/link>/gi), ...r.body.matchAll(/<entry[\s\S]*?<link[^>]+href="([^"]+)"/gi)].map((m) => m[1].trim());
    if (links.length) return links;
  }
  return [];
}

/** Everything the persona is built from: the homepage, about and product pages, up to 8 posts, and what the person added. */
export async function readPersonaSources(domain: string, added: { urls?: string[]; text?: string } = {}): Promise<{ sources: PersonaSource[]; posts: PostShape[]; postText: string }> {
  const [found, feed] = await Promise.all([findPages(domain).catch(() => ({ source: null, pages: [] })), feedPosts(domain)]);
  const pick = pickPages(found.pages, feed);
  const jobs: Promise<Read | null>[] = [
    read(`https://${domain}/`, "home", PAGE_CHARS),
    // No about page in the sitemap: the usual address often has one anyway.
    read(pick.about ?? `https://${domain}/about`, "about", PAGE_CHARS),
    ...pick.products.map((u) => read(u, "product", PAGE_CHARS)),
    ...pick.posts.map((u) => read(u, "post", POST_CHARS)),
    ...(added.urls ?? []).slice(0, 3).map((u) => read(u, "added", POST_CHARS)),
  ];
  const pages = (await Promise.all(jobs)).filter((p): p is Read => Boolean(p));
  // The same page reached twice (a redirect, www and not) counts once.
  const seen = new Set<string>();
  const unique = pages.filter((p) => {
    const k = p.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const sources: PersonaSource[] = unique.map((p) => ({ url: p.url, kind: p.kind, title: p.title, text: p.text }));
  const text = (added.text ?? "").trim();
  if (text) sources.push({ url: "pasted by the team", kind: "added", title: "", text: text.slice(0, POST_CHARS) });
  // Posts and samples the person added are the brand's writing too, so they count in the stats.
  const written = unique.filter((p) => p.kind === "post" || p.kind === "added");
  const posts = written.map((p) => postShape(p.html)).filter((s) => s.words >= 150);
  if (text) posts.push({ title: "", paragraphs: text.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter((p) => p.split(" ").length >= 8), lists: 0, headings: 0, words: text.split(/\s+/).length });
  const postText = written
    .map((p) => p.text)
    .join("\n\n")
    .slice(0, SAMPLE_CHARS);
  return { sources, posts, postText };
}
