import "server-only";
import { createHmac } from "node:crypto";
import { framerItem, mapFields, pickCollection } from "./cmsMap";
import { shopifyGid, webhookBody, webhookResult, webhookSignature } from "./cmsOauth";
import { shopifyGql } from "./cmsTokens";
import { safePost } from "./safeFetch";
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
    const msg = (data.message as string) || ((data.errors as { message?: string }[] | undefined)?.[0]?.message ?? "") || (typeof data.errors === "string" ? data.errors : "") || (data.raw as string) || res.statusText;
    throw new Error(`${res.status}: ${String(msg).slice(0, 300)}`);
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

export const CMS_API: Record<CmsKind, { test: (c: Config) => Promise<string>; publish: (c: Config, p: PublishInput, id?: string) => Promise<Result> }> = { wordpress, webflow, framer, shopify, hubspot, ghost, wix, webhook };
