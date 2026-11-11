// Which CMS collection a draft goes into, and which of its fields get the title, body, summary, image and date
// (docs/drafts-plan.md, 3.3). Pure, so tests can cover it. Used by Framer (framer-api) and Webflow sign-in.

export type CmsField = { id: string; name: string; type: string };
export type FieldMap = { title: string | null; body: string; summary: string | null; image: string | null; date: string | null };

const BLOG = /\b(blog|posts?|articles?|news|insights|resources|guides?)\b/i;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * The collection a person named, or the one that looks like a blog, or the first. Null when there's none. A named
 * collection that isn't there is null too, so a typo never sends articles into the wrong collection.
 */
export function pickCollection<T extends { id: string; name: string }>(list: T[], want = ""): T | null {
  const w = norm(want);
  if (w) return list.find((c) => norm(c.name) === w || c.id === want.trim()) ?? null;
  return list.find((c) => BLOG.test(c.name)) ?? list[0] ?? null;
}

/** The best field of one type, by name: the first name that matches, then the first of that type. */
function best(fields: CmsField[], types: string[], names: RegExp, fallback = true): string | null {
  const of = fields.filter((f) => types.includes(f.type));
  return (of.find((f) => names.test(f.name)) ?? (fallback ? of[0] : undefined))?.id ?? null;
}

/**
 * Where each part of the article goes. Types are Framer's ("string", "formattedText", "image", "date") or Webflow's
 * ("PlainText", "RichText", "Image", "DateTime"). Returns null when the collection has no rich text field: an article
 * needs one, so connecting says so instead of publishing empty posts.
 */
export function mapFields(fields: CmsField[]): FieldMap | null {
  const body = best(fields, ["formattedText", "RichText"], /\b(content|body|post|article|text)\b/i);
  if (!body) return null;
  const rest = fields.filter((f) => f.id !== body);
  const title = best(rest, ["string", "PlainText"], /\b(title|name|headline)\b/i, false);
  const summary = best(
    rest.filter((f) => f.id !== title),
    ["string", "PlainText"],
    /\b(summary|excerpt|description|intro|subtitle|teaser)\b/i,
    false,
  );
  const image = best(rest, ["image", "Image"], /\b(image|cover|thumbnail|hero|featured|main)\b/i);
  const date = best(rest, ["date", "DateTime"], /\b(date|published|publish)\b/i, false);
  return { title, body, summary, image, date };
}

export type ArticleInput = { title: string; html: string; slug: string; description: string; image: string; live: boolean };

/** A slug every CMS takes: lowercase letters, numbers and hyphens, from the slug or else the title. */
export const cmsSlug = (p: Pick<ArticleInput, "slug" | "title">) =>
  (p.slug || p.title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100) || "post";

/** One Framer CMS item, created or updated (id), in Framer's field data shape. */
export function framerItem(map: FieldMap, p: ArticleInput, now: Date, id?: string) {
  const fieldData: Record<string, { type: string; value: string | null; contentType?: "html" }> = {
    [map.body]: { type: "formattedText", value: p.html, contentType: "html" },
  };
  if (map.title) fieldData[map.title] = { type: "string", value: p.title };
  if (map.summary && p.description) fieldData[map.summary] = { type: "string", value: p.description };
  if (map.image && p.image) fieldData[map.image] = { type: "image", value: p.image };
  if (map.date && !id) fieldData[map.date] = { type: "date", value: now.toISOString() };
  return { ...(id ? { id } : {}), slug: cmsSlug(p), draft: !p.live, fieldData };
}
