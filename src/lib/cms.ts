import "server-only";
import { createHmac, randomUUID } from "node:crypto";
import { cmsSlug, framerItem, mapFields, pickCollection } from "./cmsMap";
import {
  articlePairs,
  badFields,
  cfAllow,
  cfAssetBody,
  cfAssetId,
  cfHead,
  cfLink,
  cfMerge,
  cfPath,
  contentfulDoc,
  contentfulFields,
  contentfulMap,
  headlessNames,
  htmlBlocks,
  imageName,
  imageSources,
  imageType,
  portableText,
  postUrl,
  sanityDataset,
  sanityHtmlBody,
  sanityImage,
  sanityMutations,
  sanitySampleQuery,
  sanitySlug,
  sanityUrl,
  strapiBase,
  strapiBlocks,
  strapiBodyKind,
  strapiData,
  strapiEntry,
  strapiHead,
  strapiListUrl,
  strapiNames,
  strapiOneUrl,
  strapiPlural,
  strapiSaveUrl,
  strapiVersionOf,
  type CfField,
} from "./cmsHeadless";
import { shopifyGid, webhookBody, webhookResult, webhookSignature } from "./cmsOauth";
import { shopifyGql } from "./cmsTokens";
import { safeFetch, safePost } from "./safeFetch";
import type { CmsKind, PublishInput } from "./cmsTypes";
import { wpClient } from "./wpSyncServer";

type Config = Record<string, string>;
type Result = { id: string; url: string | null };

const base = (u: string) => (/^https?:\/\//i.test(u) ? u : `https://${u}`).replace(/\/+$/, "");

async function call(url: string, init: RequestInit & { json?: unknown } = {}) {
  const { json, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    headers: { Accept: "application/json", ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text.slice(0, 300) };
  }
  if (!res.ok) {
    // Strapi and Sanity answer with { error }; Contentful puts the field that failed in details.
    const e = (typeof data.error === "object" && data.error ? data.error : {}) as { message?: string; description?: string };
    const cf = (data.details as { errors?: { path?: unknown[]; details?: string; name?: string }[] } | undefined)?.errors?.[0];
    const msg =
      (data.message as string) || ((data.errors as { message?: string }[] | undefined)?.[0]?.message ?? "") || (typeof data.errors === "string" ? data.errors : "") || e.message || e.description || (typeof data.error === "string" ? data.error : "") || (data.raw as string) || res.statusText;
    const more = cf ? ` (${[Array.isArray(cf.path) ? cf.path.join(".") : "", cf.details || cf.name].filter(Boolean).join(": ")})` : "";
    throw Object.assign(new Error(`${res.status}: ${String(msg + more).slice(0, 300)}`), { status: res.status });
  }
  return data;
}

/** The FAQ schema as a script tag at the end of the post. */
const withSchema = (p: PublishInput) => (p.schema ? `${p.html}\n<script type="application/ld+json">\n${p.schema}\n</script>` : p.html);

// ─────────────── WordPress ───────────────

const wordpress = {
  test: async (c: Config) => {
    // The same client publishing uses, so a site without pretty links (?rest_route=) connects too.
    const r = await wpClient(c).req("GET", "/wp/v2/users/me?context=edit&_fields=name,capabilities");
    const me = r.data as { name?: string; message?: string; capabilities?: Record<string, boolean> };
    if (r.status >= 300) throw new Error(`${r.status}: ${String(me.message ?? "").replace(/<[^>]+>/g, "").slice(0, 300)}`);
    if (me.capabilities && !me.capabilities.publish_posts) throw new Error("This user can't publish posts. Use an Author, Editor or Administrator.");
    return `Signed in as ${me.name ?? c.username}`;
  },
  // WordPress publishes through wpSync.ts (one post per article, kept in sync), never through here.
  publish: async (): Promise<Result> => {
    throw new Error("WordPress publishes through wpSync.");
  },
};

// ─────────────── Webflow ───────────────

const wfHead = (c: Config) => ({ Authorization: `Bearer ${c.token}` });
const webflow = {
  test: async (c: Config) => {
    const col = await call(`https://api.webflow.com/v2/collections/${c.collectionId}`, { headers: wfHead(c) });
    return `Collection: ${col.displayName ?? c.collectionId}`;
  },
  publish: async (c: Config, p: PublishInput, id?: string): Promise<Result> => {
    const fieldData: Record<string, unknown> = { name: p.title, slug: p.slug || undefined, [c.bodyField || "post-body"]: withSchema(p) };
    if (p.description) fieldData[c.summaryField || "post-summary"] = p.description;
    if (p.image && c.imageField) fieldData[c.imageField] = { url: p.image };
    const path = `https://api.webflow.com/v2/collections/${c.collectionId}/items${p.live ? "/live" : ""}`;
    const item = id
      ? await call(`${path}/${id}`, { method: "PATCH", headers: wfHead(c), json: { isDraft: !p.live, fieldData } })
      : await call(path, { method: "POST", headers: wfHead(c), json: { isDraft: !p.live, fieldData } });
    return { id: String(item.id), url: null };
  },
};

// ─────────────── Shopify ───────────────
// The GraphQL Admin API (cmsTokens.ts SHOPIFY_API). A pasted Admin API token and a signed-in store work the same;
// sites connected before keep plain number ids, which shopifyGid turns into GraphQL ids.

const esc = (t: string) => t.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
type ArticleOut = { article: { id: string; handle: string; blog: { handle: string } | null } | null; userErrors: { field?: string[]; message: string }[] };
const shopify = {
  test: async (c: Config) => {
    const d = await shopifyGql<{ blog: { title: string } | null }>(c, "query Blog($id: ID!) { blog(id: $id) { title } }", { id: shopifyGid("Blog", c.blogId) });
    if (!d.blog) throw new Error("That blog isn't in this store.");
    return `Blog: ${d.blog.title}`;
  },
  publish: async (c: Config, p: PublishInput, id?: string): Promise<Result> => {
    const article: Record<string, unknown> = {
      title: p.title,
      body: withSchema(p),
      ...(p.slug ? { handle: p.slug } : {}),
      ...(p.description ? { summary: `<p>${esc(p.description)}</p>`, metafields: [{ namespace: "global", key: "description_tag", type: "single_line_text_field", value: p.description }] } : {}),
      ...(p.image ? { image: { url: p.image, altText: p.title } } : {}),
      isPublished: p.live,
    };
    const pick = "article { id handle blog { handle } } userErrors { field message }";
    const out = id
      ? (await shopifyGql<{ articleUpdate: ArticleOut }>(c, `mutation Update($id: ID!, $article: ArticleUpdateInput!) { articleUpdate(id: $id, article: $article) { ${pick} } }`, { id: shopifyGid("Article", id), article })).articleUpdate
      : (await shopifyGql<{ articleCreate: ArticleOut }>(c, `mutation Create($article: ArticleCreateInput!) { articleCreate(article: $article) { ${pick} } }`, { article: { ...article, blogId: shopifyGid("Blog", c.blogId), author: { name: c.shopName || "Editorial team" } } })).articleCreate;
    if (out.userErrors?.length || !out.article) throw new Error(out.userErrors.map((e) => e.message).join(" ") || "Shopify didn't save the article.");
    // The live address: the store's own domain, then /blogs/<blog>/<article>.
    let url: string | null = null;
    if (p.live && out.article.blog) {
      const d = await shopifyGql<{ shop: { primaryDomain: { url: string } } }>(c, "{ shop { primaryDomain { url } } }").catch(() => null);
      if (d?.shop.primaryDomain.url) url = `${d.shop.primaryDomain.url.replace(/\/+$/, "")}/blogs/${out.article.blog.handle}/${out.article.handle}`;
    }
    return { id: out.article.id, url };
  },
};

// ─────────────── HubSpot ───────────────

const hsHead = (c: Config) => ({ Authorization: `Bearer ${c.token}` });
const hubspot = {
  test: async (c: Config) => {
    await call("https://api.hubapi.com/cms/v3/blogs/posts?limit=1", { headers: hsHead(c) });
    return "Connected";
  },
  publish: async (c: Config, p: PublishInput, id?: string): Promise<Result> => {
    const body = {
      name: p.title,
      htmlTitle: p.title,
      slug: p.slug || undefined,
      postBody: withSchema(p),
      metaDescription: p.description,
      contentGroupId: c.blogId,
      ...(p.image ? { featuredImage: p.image, useFeaturedImage: true } : {}),
    };
    const post = id
      ? await call(`https://api.hubapi.com/cms/v3/blogs/posts/${id}/draft`, { method: "PATCH", headers: hsHead(c), json: body })
      : await call("https://api.hubapi.com/cms/v3/blogs/posts", { method: "POST", headers: hsHead(c), json: body });
    const postId = String(post.id ?? id);
    if (p.live) {
      if (id) await call(`https://api.hubapi.com/cms/v3/blogs/posts/${postId}/draft/push-live`, { method: "POST", headers: hsHead(c) });
      else await call("https://api.hubapi.com/cms/v3/blogs/posts/schedule", { method: "POST", headers: hsHead(c), json: { id: postId, publishDate: new Date(Date.now() + 60_000).toISOString() } });
    }
    return { id: postId, url: (post.url as string) ?? null };
  },
};

// ─────────────── Ghost ───────────────

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
/** Ghost's Admin API takes a short-lived token signed with the integration's secret. */
function ghostToken(adminKey: string) {
  const [kid, secret] = adminKey.split(":");
  if (!kid || !secret) throw new Error("The Admin API key looks like id:secret.");
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT", kid }));
  const body = b64url(JSON.stringify({ iat: now, exp: now + 300, aud: "/admin/" }));
  const sig = b64url(createHmac("sha256", Buffer.from(secret, "hex")).update(`${head}.${body}`).digest());
  return `${head}.${body}.${sig}`;
}
const ghHead = (c: Config) => ({ Authorization: `Ghost ${ghostToken(c.adminKey)}`, "Accept-Version": "v5.0" });
const ghost = {
  test: async (c: Config) => {
    const s = await call(`${base(c.siteUrl)}/ghost/api/admin/site/`, { headers: ghHead(c) });
    return `Site: ${(s.site as { title?: string })?.title ?? c.siteUrl}`;
  },
  publish: async (c: Config, p: PublishInput, id?: string): Promise<Result> => {
    const post: Record<string, unknown> = {
      title: p.title,
      html: p.html,
      slug: p.slug || undefined,
      status: p.live ? "published" : "draft",
      meta_title: p.title,
      meta_description: p.description || undefined,
      custom_excerpt: p.description ? p.description.slice(0, 300) : undefined,
      feature_image: p.image || undefined,
      codeinjection_foot: p.schema ? `<script type="application/ld+json">\n${p.schema}\n</script>` : undefined,
    };
    const root = `${base(c.siteUrl)}/ghost/api/admin/posts`;
    if (id) {
      const cur = await call(`${root}/${id}/`, { headers: ghHead(c) });
      post.updated_at = (cur.posts as { updated_at: string }[])[0].updated_at;
    }
    const out = await call(`${root}/${id ? `${id}/` : ""}?source=html`, { method: id ? "PUT" : "POST", headers: ghHead(c), json: { posts: [post] } });
    const g = (out.posts as { id: string; url?: string }[])[0];
    return { id: g.id, url: g.url ?? null };
  },
};

// ─────────────── Framer ───────────────
// The Framer Server API (framer-api): one connection per call, closed when done. Items go into the blog collection
// with their fields picked by cmsMap.ts; a live item publishes the site and deploys it to the custom domain.

type FramerConn = Awaited<ReturnType<typeof import("framer-api")["connect"]>>;
async function withFramer<T>(c: Config, fn: (f: FramerConn) => Promise<T>): Promise<T> {
  const { connect } = await import("framer-api");
  const f = await connect(c.projectUrl.trim(), c.apiKey.trim());
  try {
    return await fn(f);
  } finally {
    await f.disconnect().catch(() => {});
  }
}
async function framerCollection(f: FramerConn, c: Config) {
  const all = await f.getCollections();
  const col = pickCollection(all.map((x) => ({ id: x.id, name: x.name, x })), c.collection ?? "");
  if (!col) throw new Error(c.collection ? `No collection named ${c.collection} in this project.` : "This project has no CMS collection. Add a blog collection in Framer first.");
  const fields = (await col.x.getFields()).map((x) => ({ id: x.id, name: x.name, type: x.type }));
  const map = mapFields(fields);
  if (!map) throw new Error(`The ${col.name} collection needs a formatted text field for the article.`);
  return { col: col.x, name: col.name, map };
}
const framer = {
  test: (c: Config) =>
    withFramer(c, async (f) => {
      const { name, map } = await framerCollection(f, c);
      return `Collection: ${name}${map.title ? "" : " (no title field: the slug names each post)"}`;
    }),
  publish: (c: Config, p: PublishInput, id?: string): Promise<Result> =>
    withFramer(c, async (f) => {
      const { col, map } = await framerCollection(f, c);
      const item = framerItem(map, { ...p, html: withSchema(p) }, new Date(), id);
      // An item deleted in Framer is made again, so Update never fails on a missing id.
      const items = await col.getItems();
      const have = id ? items.find((x) => x.id === id) : undefined;
      await col.addItems([have ? item : { ...item, id: undefined }] as Parameters<typeof col.addItems>[0]);
      const saved = have ?? (await col.getItems()).find((x) => x.slug === item.slug);
      if (!saved) throw new Error("Framer didn't save the item. Try again.");
      if (p.live) {
        // Publish, then point the custom domain at it (nothing happens without one). The post's own address depends
        // on the site's collection page, which the API doesn't give, so no link is guessed.
        const out = await f.publish();
        await f.deploy(out.deployment.id).catch(() => []);
      }
      return { id: saved.id, url: null };
    }),
};

// ─────────────── Wix ───────────────
// An API key and the site's ID. Wix posts are rich content, not HTML, so the article is converted first; posts need
// a site member as their writer, so the first member writes them. Connecting tries both, so a change on Wix's side
// shows as a clear error then, before anything is published.

const WIX = "https://www.wixapis.com";
const wixHead = (c: Config) => ({ Authorization: c.apiKey.trim(), "wix-site-id": c.siteId.trim() });
async function wixRicos(c: Config, html: string) {
  const out = await call(`${WIX}/ricos/v1/ricos-document/convert/to-ricos`, { method: "POST", headers: wixHead(c), json: { html } });
  // The converted document; the name of its field isn't on Wix's pages we could read, so the likely ones are tried.
  const doc = out.document ?? out.ricosDocument ?? out.richContent;
  if (!doc || typeof doc !== "object") throw new Error("Wix didn't convert the article.");
  return doc;
}
async function wixWriter(c: Config) {
  const out = await call(`${WIX}/members/v1/members?paging.limit=1`, { headers: wixHead(c) });
  const id = (out.members as { id?: string }[] | undefined)?.[0]?.id;
  if (!id) throw new Error("The site needs at least one member to write posts. Add yourself as a member in Wix.");
  return id;
}
const wix = {
  test: async (c: Config) => {
    await wixWriter(c);
    await wixRicos(c, "<p>Arrowsterr</p>");
    return "Connected";
  },
  publish: async (c: Config, p: PublishInput, id?: string): Promise<Result> => {
    const richContent = await wixRicos(c, p.html);
    const draftPost: Record<string, unknown> = { title: p.title.slice(0, 200), richContent, ...(p.description ? { excerpt: p.description.slice(0, 500) } : {}) };
    let postId = id;
    if (id) {
      await call(`${WIX}/blog/v3/draft-posts/${id}`, { method: "PATCH", headers: wixHead(c), json: { draftPost: { ...draftPost, id }, action: p.live ? "UPDATE_PUBLISH" : "UPDATE" } });
    } else {
      const out = await call(`${WIX}/blog/v3/draft-posts`, { method: "POST", headers: wixHead(c), json: { draftPost: { ...draftPost, memberId: await wixWriter(c) }, publish: p.live } });
      postId = String((out.draftPost as { id?: string } | undefined)?.id ?? "");
      if (!postId) throw new Error("Wix didn't save the post.");
    }
    let url: string | null = null;
    if (p.live) {
      const got = await call(`${WIX}/blog/v3/posts/${postId}?fieldsets=URL`, { headers: wixHead(c) }).catch(() => null);
      const u = (got?.post as { url?: { base?: string; path?: string } } | undefined)?.url;
      if (u?.base && u.path) url = `${u.base.replace(/\/+$/, "")}${u.path}`;
    }
    return { id: postId!, url };
  },
};

// ─────────────── Headless CMSs ───────────────
// Contentful, Sanity and Strapi keep content apart from the site, so each post goes into a content type the person
// names, field by field. The shapes are in cmsHeadless.ts. None of them knows the post's address, so a live post
// gets a link only from the post address people can add.

const missing404 = (e: unknown) => ((e as { status?: number }).status === 404 ? null : Promise.reject(e));
const NAME_KEYS = ["titleField", "bodyField", "slugField", "descriptionField", "imageField"];
function checkNames(c: Config) {
  const bad = badFields(c, NAME_KEYS);
  if (bad.length) throw new Error(`${bad[0]} isn't a field name. Use letters, numbers and underscores, with a dot for a nested field.`);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** An image's bytes for an upload, from a public address only. Null when it can't be read. */
async function imageBytes(url: string) {
  const r = await safeFetch(url, { raw: true, accept: "image/*", maxBytes: 20_000_000, timeout: 20_000 });
  const type = r.headers.get("content-type")?.split(";")[0]?.trim() || imageType(url);
  if (!r.ok || !r.bytes?.length || !type.startsWith("image/")) return null;
  return { bytes: new Uint8Array(r.bytes), type };
}

/** Upload each image once, side by side. An image that fails is left out of the post. */
async function uploadAll<T>(urls: string[], up: (url: string) => Promise<T | null>) {
  const out: Record<string, T> = {};
  await Promise.all(
    urls.map(async (u) => {
      const v = await up(u).catch(() => null);
      if (v) out[u] = v;
    }),
  );
  return out;
}

// ─────────────── Contentful ───────────────
// The Content Management API with a personal access token. The content type is read on each publish, so empty field
// boxes pick fields by name. A Rich text body gets Contentful's rich text; a Long text body gets the HTML.

type Sys = { sys: { id: string; version: number; publishedVersion?: number }; fields?: Record<string, Record<string, unknown>> };
async function cfSetup(c: Config) {
  checkNames(c);
  const [ct, loc] = await Promise.all([
    call(cfPath(c, `/content_types/${encodeURIComponent(c.contentType.trim())}`), { headers: cfHead(c) }),
    call(cfPath(c, "/locales"), { headers: cfHead(c) }),
  ]);
  const map = contentfulMap((ct.fields as CfField[] | undefined) ?? [], c, ct.displayField as string | undefined);
  if (typeof map === "string") throw new Error(map);
  const locale = (loc.items as { code: string; default?: boolean }[] | undefined)?.find((l) => l.default)?.code ?? "en-US";
  return { name: String(ct.name ?? c.contentType), map, locale };
}
/** The image as a published asset. Contentful fetches the file itself; that takes a moment, so it's checked a few times. */
async function cfAsset(c: Config, locale: string, url: string, title: string): Promise<string | null> {
  const id = cfAssetId(url);
  const path = cfPath(c, `/assets/${id}`);
  let a = ((await call(path, { headers: cfHead(c) }).catch(missing404)) as Sys | null) ?? ((await call(path, { method: "PUT", headers: cfHead(c), json: cfAssetBody(url, title, locale) })) as Sys);
  const ready = () => Boolean((a.fields?.file?.[locale] as { url?: string } | undefined)?.url);
  if (!ready()) {
    await call(cfPath(c, `/assets/${id}/files/${encodeURIComponent(locale)}/process`), { method: "PUT", headers: cfHead(c, a.sys.version) });
    for (let i = 0; i < 10 && !ready(); i++) {
      await sleep(800);
      a = (await call(path, { headers: cfHead(c) })) as Sys;
    }
    if (!ready()) return null;
  }
  if (!a.sys.publishedVersion || a.sys.version > a.sys.publishedVersion + 1) await call(`${path}/published`, { method: "PUT", headers: cfHead(c, a.sys.version) });
  return id;
}
const contentful = {
  test: async (c: Config) => {
    const s = await cfSetup(c);
    return `Content type: ${s.name}. Articles go in ${s.map.body.id} as ${s.map.body.type === "RichText" ? "rich text" : "HTML"}.`;
  },
  publish: async (c: Config, p: PublishInput, id?: string): Promise<Result> => {
    const s = await cfSetup(c);
    let body: unknown = withSchema(p);
    if (s.map.body.type === "RichText") {
      const allow = cfAllow(s.map.body);
      const blocks = htmlBlocks(p.html);
      const assets = !allow.nodes || allow.nodes.includes("embedded-asset-block") ? await uploadAll(imageSources(blocks), (u) => cfAsset(c, s.locale, u, p.title)) : {};
      body = contentfulDoc(blocks, assets, allow);
    }
    let image: unknown = null;
    if (s.map.image && p.image) {
      if (s.map.image.type !== "Link") image = p.image;
      else {
        const asset = await cfAsset(c, s.locale, p.image, p.title).catch(() => null);
        image = asset ? cfLink(asset) : null;
      }
    }
    const fields = contentfulFields(s.map, p, s.locale, body, image);
    // An entry deleted in Contentful is made again, so an update never fails on a missing id.
    const cur = id ? ((await call(cfPath(c, `/entries/${encodeURIComponent(id)}`), { headers: cfHead(c) }).catch(missing404)) as Sys | null) : null;
    let entry = (
      cur
        ? await call(cfPath(c, `/entries/${encodeURIComponent(cur.sys.id)}`), { method: "PUT", headers: cfHead(c, cur.sys.version), json: { fields: cfMerge(cur.fields, fields) } })
        : await call(cfPath(c, "/entries"), { method: "POST", headers: cfHead(c, undefined, c.contentType.trim()), json: { fields } })
    ) as Sys;
    if (p.live) entry = (await call(cfPath(c, `/entries/${encodeURIComponent(entry.sys.id)}/published`), { method: "PUT", headers: cfHead(c, entry.sys.version) })) as Sys;
    return { id: entry.sys.id, url: p.live ? postUrl(c.postUrl, cmsSlug(p)) : null };
  },
};

// ─────────────── Sanity ───────────────
// The HTTP API with a token that can write. Sanity keeps no schema on its servers, so one post of the type shows how
// the body is kept: a string gets HTML, anything else (or no post yet) gets Portable Text. Images upload as Sanity
// assets, which Sanity names by their content, so the same image is stored once.

const sanHead = (c: Config) => ({ Authorization: `Bearer ${c.token.trim()}` });
async function sanSample(c: Config) {
  checkNames(c);
  if (!/^[a-z0-9-]+$/i.test(c.projectId.trim())) throw new Error("The project ID is letters and numbers, like a1b2c3d4.");
  const n = headlessNames(c, "body");
  const out = await call(sanitySampleQuery(c, n), { headers: sanHead(c) });
  const r = (out.result ?? {}) as { count?: number; sample?: { body?: unknown; image?: unknown } | null };
  return { n, count: r.count ?? 0, sample: r.sample ?? null };
}
async function sanAsset(c: Config, url: string): Promise<string | null> {
  const img = await imageBytes(url);
  if (!img) return null;
  const out = await call(sanityUrl(c, `/assets/images/${sanityDataset(c)}?${new URLSearchParams({ filename: imageName(url) })}`), { method: "POST", headers: { ...sanHead(c), "Content-Type": img.type }, body: img.bytes });
  return (out.document as { _id?: string } | undefined)?._id ?? null;
}
const sanity = {
  test: async (c: Config) => {
    const s = await sanSample(c);
    const how = s.sample && sanityHtmlBody(s.sample.body) ? "HTML" : "Portable Text";
    return `${s.count} published ${c.docType.trim()} ${s.count === 1 ? "post" : "posts"}. Articles go in ${s.n.body} as ${how}.`;
  },
  publish: async (c: Config, p: PublishInput, id?: string): Promise<Result> => {
    const { n, sample } = await sanSample(c);
    let body: unknown = withSchema(p);
    if (!sanityHtmlBody(sample?.body)) {
      const blocks = htmlBlocks(p.html);
      body = portableText(blocks, await uploadAll(imageSources(blocks), (u) => sanAsset(c, u)));
    }
    let image: unknown = null;
    if (n.image && p.image) {
      if (typeof sample?.image === "string") image = p.image;
      else {
        const asset = await sanAsset(c, p.image).catch(() => null);
        image = asset ? sanityImage(asset) : null;
      }
    }
    const docId = id || randomUUID();
    const ds = sanityDataset(c);
    let cur = { published: null as Record<string, unknown> | null, draft: null as Record<string, unknown> | null };
    if (id) {
      const got = await call(sanityUrl(c, `/data/doc/${ds}/${encodeURIComponent(docId)},${encodeURIComponent(`drafts.${docId}`)}`), { headers: sanHead(c) });
      const docs = (got.documents ?? []) as Record<string, unknown>[];
      cur = { published: docs.find((d) => d._id === docId) ?? null, draft: docs.find((d) => d._id === `drafts.${docId}`) ?? null };
    }
    const pairs = articlePairs(n, p, { body, slug: sanitySlug(p), image });
    await call(sanityUrl(c, `/data/mutate/${ds}?returnIds=true&visibility=sync`), { method: "POST", headers: sanHead(c), json: { mutations: sanityMutations(docId, c.docType.trim(), p.live, cur, pairs) } });
    return { id: docId, url: p.live ? postUrl(c.postUrl, cmsSlug(p)) : null };
  },
};

// ─────────────── Strapi ───────────────
// The REST API of Strapi 4 or 5 with an API token. One entry of the collection shows the version and how the body is
// kept: a list is Rich text (Blocks), a string is Markdown or text and gets HTML. With no entry yet, HTML goes first,
// then blocks when Strapi says the field needs them. Images go to the media library, once each by file name.

type StrapiFile = Record<string, unknown> & { id?: number };
async function stSample(c: Config) {
  checkNames(c);
  const out = await call(strapiListUrl(c), { headers: strapiHead(c) });
  const list = (out.data ?? []) as unknown[];
  const total = (out.meta as { pagination?: { total?: number } } | undefined)?.pagination?.total ?? list.length;
  return { entry: strapiEntry(list[0]), total };
}
async function stFile(c: Config, url: string, alt: string): Promise<StrapiFile | null> {
  const b = strapiBase(c.baseUrl);
  const name = imageName(url);
  const found = await call(`${b}/api/upload/files?${new URLSearchParams({ "filters[name][$eq]": name })}`, { headers: strapiHead(c) }).catch(() => null);
  if (Array.isArray(found) && found[0]) return found[0] as StrapiFile;
  const img = await imageBytes(url);
  if (!img) return null;
  const form = new FormData();
  form.append("files", new Blob([img.bytes], { type: img.type }), name);
  form.append("fileInfo", JSON.stringify({ name, alternativeText: alt }));
  const out = await call(`${b}/api/upload`, { method: "POST", headers: strapiHead(c), body: form });
  return Array.isArray(out) ? ((out[0] as StrapiFile | undefined) ?? null) : null;
}
/** Strapi turned down the body field's type, so the other kind of body is worth a try. */
const bodyRefused = (e: unknown, field: string) => (e as { status?: number }).status === 400 && new RegExp(`\\b${field.split(".")[0]}\\b`).test(String((e as Error).message));
const strapi = {
  test: async (c: Config) => {
    const s = await stSample(c);
    const n = strapiNames(c, s.entry?.fields ?? null);
    if (typeof n === "string") throw new Error(n);
    if (!s.entry) return `Collection: ${strapiPlural(c)}, with no entries yet.`;
    const kind = strapiBodyKind(s.entry.fields, n.body);
    return `Collection: ${strapiPlural(c)} (Strapi ${s.entry.version}). Articles go in ${n.body}${kind ? ` as ${kind === "blocks" ? "blocks" : "HTML"}` : ""}.`;
  },
  publish: async (c: Config, p: PublishInput, id?: string): Promise<Result> => {
    const s = await stSample(c);
    const n = strapiNames(c, s.entry?.fields ?? null);
    if (typeof n === "string") throw new Error(n);
    let version: 4 | 5 | null = id ? strapiVersionOf(id) : (s.entry?.version ?? null);
    const known = strapiBodyKind(s.entry?.fields ?? null, n.body);
    const body = async (kind: "blocks" | "html") => {
      if (kind === "html") return withSchema(p);
      const blocks = htmlBlocks(p.html);
      return strapiBlocks(blocks, await uploadAll(imageSources(blocks), (u) => stFile(c, u, p.title)));
    };
    let image: unknown = null;
    if (n.image && p.image) {
      const now = s.entry?.fields[n.image];
      image = typeof now === "string" ? p.image : ((await stFile(c, p.image, p.title).catch(() => null))?.id ?? null);
    }
    // An entry deleted in Strapi is made again, so an update never fails on a missing id.
    const cur = id && version ? strapiEntry(((await call(strapiOneUrl(c, version, id), { headers: strapiHead(c) }).catch(missing404)) as { data?: unknown } | null)?.data) : null;
    const send = async (kind: "blocks" | "html", v: 4 | 5) => {
      const data = strapiData(v, articlePairs(n, p, { body: await body(kind), slug: cmsSlug(p), image }), p.live, cur?.publishedAt ?? null, new Date());
      return call(strapiSaveUrl(c, v, p.live, cur?.id), { method: cur ? "PUT" : "POST", headers: strapiHead(c), json: { data } });
    };
    const kind = known ?? "html";
    let out: Record<string, unknown>;
    try {
      out = await send(kind, version ?? 5);
    } catch (e) {
      if (!version && (e as { status?: number }).status === 400 && /\bstatus\b/i.test(String((e as Error).message))) {
        // A Strapi 4 that turns down ?status.
        version = 4;
        out = await send(kind, 4);
      } else if (!known && bodyRefused(e, n.body)) out = await send("blocks", version ?? 5);
      else throw e;
    }
    const saved = strapiEntry(out.data);
    if (!saved) throw new Error("Strapi didn't save the entry.");
    // Strapi 4 skips ?status and publishes a new entry, so a draft is set back to draft.
    if (saved.version === 4 && !version && !p.live && saved.publishedAt) {
      await call(strapiSaveUrl(c, 4, false, saved.id), { method: "PUT", headers: strapiHead(c), json: { data: { publishedAt: null } } });
    }
    return { id: saved.id, url: p.live ? postUrl(c.postUrl, cmsSlug(p)) : null };
  },
};

// ─────────────── Webhook ───────────────
// Any other site: the article goes to the site's address as JSON, signed with its secret when it has one. The site
// may answer with { id, url }; the id comes back on every update so it can change the same post.

const webhook = {
  test: async (c: Config) => {
    const body = webhookBody({ title: "Test", html: "<p>Test</p>", slug: "test", description: "", image: "", schema: "", live: false }, undefined, new Date(), true);
    const r = await safePost(c.url, body, c.secret ? { "X-Arrowsterr-Signature": webhookSignature(c.secret, body) } : {});
    if (!r.ok) throw new Error(r.error ?? `The site answered ${r.status}.`);
    return "The site answered the test";
  },
  publish: async (c: Config, p: PublishInput, id?: string): Promise<Result> => {
    const body = webhookBody(p, id, new Date());
    const r = await safePost(c.url, body, c.secret ? { "X-Arrowsterr-Signature": webhookSignature(c.secret, body) } : {});
    if (!r.ok) throw new Error(r.error ?? `The site answered ${r.status}: ${r.body.slice(0, 200)}`);
    return webhookResult(r.body, id, p.slug);
  },
};

export const CMS_API: Record<CmsKind, { test: (c: Config) => Promise<string>; publish: (c: Config, p: PublishInput, id?: string) => Promise<Result> }> = { wordpress, webflow, framer, shopify, hubspot, ghost, wix, contentful, sanity, strapi, webhook };
