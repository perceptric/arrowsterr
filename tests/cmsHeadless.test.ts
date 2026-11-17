import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  articlePairs,
  badFields,
  cfAllow,
  cfAssetBody,
  cfAssetId,
  cfHead,
  cfMerge,
  cfPath,
  contentfulDoc,
  contentfulFields,
  contentfulMap,
  fieldList,
  headlessNames,
  htmlBlocks,
  imageName,
  imageSources,
  portableText,
  postUrl,
  sanityMutations,
  sanitySampleQuery,
  sanitySlug,
  sanityUrl,
  strapiBase,
  strapiBlocks,
  strapiBodyKind,
  strapiData,
  strapiEntry,
  strapiListUrl,
  strapiNames,
  strapiOneUrl,
  strapiSaveUrl,
  strapiVersionOf,
  type CfField,
} from "../src/lib/cmsHeadless.ts";
import { CMS, CMS_LOGO } from "../src/lib/cmsTypes.ts";
import { CMS_GUIDE } from "../src/lib/cmsGuide.ts";

const HTML = [
  "<h2>Why GEO</h2>",
  '<p>AI answers <strong>name brands</strong>. See <a href="https://acme.com/geo">our guide</a>.</p>',
  "<ul><li><p>First</p><ul><li>Nested <em>one</em></li></ul></li><li>Second</li></ul>",
  "<ol><li>Step</li></ol>",
  "<blockquote><p>Quoted</p></blockquote>",
  "<pre><code>npm run geo\nnpm test</code></pre>",
  "<hr>",
  '<figure><img src="https://cdn.acme.com/a.png" alt="Chart"><figcaption>Our chart</figcaption></figure>',
  "<table><tr><th>Engine</th><th>Share</th></tr><tr><td>ChatGPT</td><td>41%</td></tr></table>",
  '<div data-aw-module="m1" data-aw-src="eA=="></div>',
  '<div class="arrowsterr-module"><iframe srcdoc="x"></iframe></div>',
  "<aside data-note>Private note</aside>",
  "<script>alert(1)</script>",
].join("");

const article = { title: "GEO vs SEO: what changes", html: HTML, slug: "", description: "How AI answers pick brands.", image: "https://cdn.acme.com/cover.jpg", live: true };

test("the article's HTML becomes plain blocks, and modules, notes and scripts are left out", () => {
  const b = htmlBlocks(HTML);
  assert.deepEqual(
    b.map((x) => x.type),
    ["h", "p", "li", "li", "li", "li", "quote", "code", "hr", "img", "p", "table"],
  );
  assert.deepEqual(b[0], { type: "h", level: 2, spans: [{ text: "Why GEO", marks: [] }] });
  assert.deepEqual(b[1], {
    type: "p",
    spans: [
      { text: "AI answers ", marks: [] },
      { text: "name brands", marks: ["bold"] },
      { text: ". See ", marks: [] },
      { text: "our guide", marks: [], href: "https://acme.com/geo" },
      { text: ".", marks: [] },
    ],
  });
  assert.deepEqual(
    b.filter((x) => x.type === "li").map((x) => x.type === "li" && [x.list, x.level, x.spans.map((s) => s.text).join("")]),
    [
      ["bullet", 1, "First"],
      ["bullet", 2, "Nested one"],
      ["bullet", 1, "Second"],
      ["number", 1, "Step"],
    ],
  );
  assert.equal(b[7].type === "code" && b[7].spans[0].text, "npm run geo\nnpm test");
  assert.deepEqual(b[9], { type: "img", src: "https://cdn.acme.com/a.png", alt: "Chart" });
  const text = JSON.stringify(b);
  for (const gone of ["Private note", "alert", "srcdoc", "eA=="]) assert.equal(text.includes(gone), false, gone);
  assert.deepEqual(imageSources(b), ["https://cdn.acme.com/a.png"]);
  assert.deepEqual(htmlBlocks('<p><a href="javascript:alert(1)">x</a></p>'), [{ type: "p", spans: [{ text: "x", marks: [] }] }]);
  assert.deepEqual(htmlBlocks(""), []);
});

test("Contentful rich text: nodes, nested lists, links with text on each side, and only what the field allows", () => {
  const blocks = htmlBlocks(HTML);
  const doc = contentfulDoc(blocks, { "https://cdn.acme.com/a.png": "asset1" });
  assert.equal(doc.nodeType, "document");
  assert.deepEqual(
    doc.content.map((n) => n.nodeType),
    ["heading-2", "paragraph", "unordered-list", "ordered-list", "blockquote", "paragraph", "hr", "embedded-asset-block", "paragraph", "table"],
  );
  const p = doc.content[1].content!;
  assert.deepEqual(p[1], { nodeType: "text", value: "name brands", marks: [{ type: "bold" }], data: {} });
  assert.deepEqual(p[3], { nodeType: "hyperlink", data: { uri: "https://acme.com/geo" }, content: [{ nodeType: "text", value: "our guide", marks: [], data: {} }] });
  assert.equal(p[4].nodeType, "text");
  const ul = doc.content[2];
  assert.equal(ul.content!.length, 2);
  assert.deepEqual(
    ul.content![0].content!.map((n) => n.nodeType),
    ["paragraph", "unordered-list"],
  );
  assert.equal(doc.content[5].content![0].marks![0].type, "code");
  assert.deepEqual(doc.content[7].data, { target: { sys: { type: "Link", linkType: "Asset", id: "asset1" } } });
  assert.deepEqual(
    doc.content[9].content![0].content!.map((n) => n.nodeType),
    ["table-header-cell", "table-header-cell"],
  );

  // A field that turns off images, tables and bold: no asset, the table as lines, no bold mark.
  const allow = cfAllow({ id: "body", name: "Body", type: "RichText", validations: [{ enabledNodeTypes: ["heading-2", "unordered-list", "ordered-list", "hyperlink", "blockquote"] }, { enabledMarks: ["italic", "code"] }] });
  const tight = contentfulDoc(blocks, { "https://cdn.acme.com/a.png": "asset1" }, allow);
  const types = tight.content.map((n) => n.nodeType);
  assert.equal(types.includes("embedded-asset-block"), false);
  assert.equal(types.includes("table"), false);
  assert.equal(types.includes("hr"), false);
  assert.deepEqual(tight.content[1].content![1].marks, []);
  assert.match(JSON.stringify(tight), /Engine \| Share/);
  assert.deepEqual(contentfulDoc([], {}).content, [{ nodeType: "paragraph", data: {}, content: [{ nodeType: "text", value: "", marks: [], data: {} }] }]);
});

test("Sanity Portable Text: styles, list levels, link marks and image references", () => {
  const pt = portableText(htmlBlocks(HTML), { "https://cdn.acme.com/a.png": "image-abc-800x600-png" });
  const keys = pt.map((b) => b._key);
  assert.equal(new Set(keys).size, keys.length, "keys are unique");
  assert.equal(pt[0].style, "h2");
  const para = pt[1] as { markDefs: { _key: string; href: string }[]; children: { text: string; marks: string[] }[] };
  assert.equal(para.markDefs.length, 1);
  assert.equal(para.markDefs[0].href, "https://acme.com/geo");
  assert.deepEqual(para.children[1].marks, ["strong"]);
  assert.deepEqual(para.children[3].marks, [para.markDefs[0]._key]);
  assert.deepEqual(
    pt.slice(2, 6).map((b) => [b.listItem, b.level]),
    [
      ["bullet", 1],
      ["bullet", 2],
      ["bullet", 1],
      ["number", 1],
    ],
  );
  assert.equal(pt[6].style, "blockquote");
  const img = pt.find((b) => b._type === "image");
  assert.deepEqual(img && { asset: img.asset, alt: img.alt }, { asset: { _type: "reference", _ref: "image-abc-800x600-png" }, alt: "Chart" });
  assert.equal(portableText(htmlBlocks('<img src="https://x.com/a.png">'), {}).length, 0, "an image that didn't upload is left out");
});

test("Strapi blocks: lists hold their items and nested lists, marks sit on the text", () => {
  const out = strapiBlocks(htmlBlocks(HTML), { "https://cdn.acme.com/a.png": { id: 7, url: "/uploads/a.png", name: "a.png" } });
  assert.deepEqual(out[0], { type: "heading", level: 2, children: [{ type: "text", text: "Why GEO" }] });
  const p = out[1].children as Record<string, unknown>[];
  assert.deepEqual(p[1], { type: "text", text: "name brands", bold: true });
  assert.deepEqual(p[3], { type: "link", url: "https://acme.com/geo", children: [{ type: "text", text: "our guide" }] });
  assert.deepEqual(out[2], {
    type: "list",
    format: "unordered",
    children: [
      { type: "list-item", children: [{ type: "text", text: "First" }] },
      { type: "list", format: "unordered", children: [{ type: "list-item", children: [{ type: "text", text: "Nested " }, { type: "text", text: "one", italic: true }] }] },
      { type: "list-item", children: [{ type: "text", text: "Second" }] },
    ],
  });
  assert.equal(out[3].format, "ordered");
  assert.deepEqual(out[5], { type: "code", children: [{ type: "text", text: "npm run geo\nnpm test" }] });
  assert.deepEqual(out[6], { type: "image", image: { id: 7, url: "/uploads/a.png", name: "a.png" }, children: [{ type: "text", text: "" }] });
});

const CT: CfField[] = [
  { id: "internalName", name: "Internal name", type: "Symbol" },
  { id: "title", name: "Title", type: "Symbol" },
  { id: "slug", name: "Slug", type: "Symbol" },
  { id: "summary", name: "Summary", type: "Text" },
  { id: "body", name: "Body", type: "RichText" },
  { id: "heroImage", name: "Hero image", type: "Link", linkType: "Asset" },
  { id: "seoTitle", name: "SEO title", type: "Symbol" },
];

test("Contentful fields: empty boxes pick by name, typed IDs must fit, and values go under the main language", () => {
  const map = contentfulMap(CT, {}, "title");
  assert.ok(typeof map !== "string");
  assert.deepEqual(
    [map.title.map((f) => f.id), map.body.id, map.slug?.id, map.description.map((f) => f.id), map.image?.id],
    [["title"], "body", "slug", ["summary"], "heroImage"],
  );
  const typed = contentfulMap(CT, { titleField: "title, seoTitle", bodyField: "body", descriptionField: "summary" });
  assert.ok(typeof typed !== "string");
  assert.deepEqual(
    typed.title.map((f) => f.id),
    ["title", "seoTitle"],
  );
  assert.match(String(contentfulMap(CT, { bodyField: "content" })), /no field content/);
  assert.match(String(contentfulMap(CT, { bodyField: "title" })), /can't hold the article/);
  assert.match(String(contentfulMap([{ id: "title", name: "Title", type: "Symbol" }], {})), /Rich text or Long text/);

  const long = { ...article, title: "x".repeat(300) };
  const fields = contentfulFields(typed, long, "en-GB", { nodeType: "document" }, { sys: { type: "Link", linkType: "Asset", id: "a1" } });
  assert.equal((fields.title["en-GB"] as string).length, 255, "Short text is cut to 255");
  assert.equal(fields.slug["en-GB"], "x".repeat(100));
  assert.equal(fields.summary["en-GB"], "How AI answers pick brands.");
  assert.deepEqual(fields.body, { "en-GB": { nodeType: "document" } });
  assert.deepEqual(fields.heroImage, { "en-GB": { sys: { type: "Link", linkType: "Asset", id: "a1" } } }, "the media field named like an image is picked");
  assert.equal(fields.seoTitle["en-GB"], "x".repeat(255));
  assert.equal(fields.internalName, undefined);
  assert.deepEqual(cfMerge({ author: { "en-GB": "Ann" }, title: { "en-GB": "Old", de: "Alt" } }, { title: { "en-GB": "New" } }), { author: { "en-GB": "Ann" }, title: { "en-GB": "New", de: "Alt" } });
});

test("Contentful requests: the space and environment in the path, the version and content type in headers", () => {
  const c = { spaceId: " sp1 ", token: "CFPAT-x", contentType: "blogPost" };
  assert.equal(cfPath(c, "/entries"), "https://api.contentful.com/spaces/sp1/environments/master/entries");
  assert.equal(cfPath({ ...c, environment: "staging" }, "/locales"), "https://api.contentful.com/spaces/sp1/environments/staging/locales");
  assert.deepEqual(cfHead(c, 4, "blogPost"), {
    Authorization: "Bearer CFPAT-x",
    "Content-Type": "application/vnd.contentful.management.v1+json",
    "X-Contentful-Version": "4",
    "X-Contentful-Content-Type": "blogPost",
  });
  assert.deepEqual(Object.keys(cfHead(c)), ["Authorization", "Content-Type"]);
  const url = "https://cdn.acme.com/cover.png?w=1200";
  assert.equal(cfAssetId(url), cfAssetId(url), "the same image is the same asset");
  assert.match(cfAssetId(url), /^arw[0-9a-f]{32}$/);
  assert.deepEqual(cfAssetBody(url, "Cover", "en-US").fields.file["en-US"], { contentType: "image/png", fileName: imageName(url), upload: url });
});

test("Sanity requests: the sample query, and drafts or live posts that keep the fields people added", () => {
  const c = { projectId: "abc123", dataset: "production", token: "sk", docType: "post", descriptionField: "excerpt, seo.description", imageField: "mainImage" };
  const n = headlessNames(c, "body");
  assert.deepEqual(n, { title: ["title"], body: "body", slug: "slug", description: ["excerpt", "seo.description"], image: "mainImage" });
  assert.equal(sanityUrl(c, "/data/mutate/production"), "https://abc123.api.sanity.io/v2025-02-19/data/mutate/production");
  const q = new URL(sanitySampleQuery(c, n));
  assert.equal(q.pathname, "/v2025-02-19/data/query/production");
  assert.equal(q.searchParams.get("$type"), '"post"');
  assert.equal(q.searchParams.get("perspective"), "raw");
  assert.match(q.searchParams.get("query")!, /\*\[_type == \$type && defined\(body\)\]\[0\]\{"body": body, "image": mainImage\}/);

  const pairs = articlePairs(n, article, { body: [{ _type: "block" }], slug: sanitySlug(article), image: { _type: "image", asset: { _type: "reference", _ref: "image-1" } } });
  const published = { _id: "p1", _rev: "r1", _type: "post", _updatedAt: "x", author: { _ref: "a1" }, seo: { keywords: "geo" } };
  const draft = sanityMutations("p1", "post", false, { published, draft: null }, pairs);
  assert.equal(draft.length, 1);
  const d = (draft[0] as { createOrReplace: Record<string, unknown> }).createOrReplace;
  assert.equal(d._id, "drafts.p1");
  assert.equal(d._rev, undefined);
  assert.deepEqual(d.author, { _ref: "a1" }, "fields added in Sanity stay");
  assert.deepEqual(d.seo, { keywords: "geo", description: "How AI answers pick brands." });
  assert.deepEqual(d.slug, { _type: "slug", current: "geo-vs-seo-what-changes" });
  assert.equal(d.excerpt, "How AI answers pick brands.");
  const live = sanityMutations("p1", "post", true, { published, draft: { ...published, _id: "drafts.p1", author: { _ref: "a2" } } }, pairs);
  assert.equal((live[0] as { createOrReplace: Record<string, unknown> }).createOrReplace._id, "p1");
  assert.deepEqual((live[0] as { createOrReplace: Record<string, unknown> }).createOrReplace.author, { _ref: "a2" }, "the draft wins over the live post");
  assert.deepEqual(live[1], { delete: { id: "drafts.p1" } });
});

test("Strapi requests: version 4 and 5 entries, draft and live saves, and field checks", () => {
  const c = { baseUrl: "cms.acme.com/api/", token: "t0k", collection: "/api/articles/" };
  assert.equal(strapiBase(c.baseUrl), "https://cms.acme.com");
  assert.equal(strapiBase("https://cms.acme.com/admin/settings/api-tokens"), "https://cms.acme.com");
  assert.equal(decodeURIComponent(strapiListUrl(c)), "https://cms.acme.com/api/articles?pagination[pageSize]=1&populate=*");
  assert.equal(strapiSaveUrl(c, 5, false), "https://cms.acme.com/api/articles?status=draft");
  assert.equal(strapiSaveUrl(c, 5, true, "abc123def456"), "https://cms.acme.com/api/articles/abc123def456?status=published");
  assert.equal(strapiSaveUrl(c, 4, true, "12"), "https://cms.acme.com/api/articles/12");
  assert.equal(strapiOneUrl(c, 5, "abc"), "https://cms.acme.com/api/articles/abc?status=draft");
  assert.equal(strapiOneUrl(c, 4, "12"), "https://cms.acme.com/api/articles/12?publicationState=preview");
  assert.equal(strapiVersionOf("12"), 4);
  assert.equal(strapiVersionOf("znrlzntu9ei5onjvwfaalu2v"), 5);

  const v5 = strapiEntry({ id: 3, documentId: "znrl", title: "Hi", content: [], publishedAt: null });
  assert.deepEqual(v5 && [v5.version, v5.id, v5.publishedAt], [5, "znrl", null]);
  const v4 = strapiEntry({ id: 12, attributes: { title: "Hi", content: "<p>x</p>", publishedAt: "2026-01-01T00:00:00.000Z" } });
  assert.deepEqual(v4 && [v4.version, v4.id, v4.publishedAt], [4, "12", "2026-01-01T00:00:00.000Z"]);
  assert.equal(strapiEntry(null), null);
  assert.equal(strapiBodyKind(v5!.fields, "content"), "blocks");
  assert.equal(strapiBodyKind(v4!.fields, "content"), "html");
  assert.equal(strapiBodyKind(null, "content"), null);

  // Defaults, a slug the collection lacks, and a typed field that isn't there.
  const n = strapiNames({ descriptionField: "seo.metaDescription" }, { title: "", content: "", seo: null });
  assert.ok(typeof n !== "string");
  assert.equal(n.slug, null);
  assert.match(String(strapiNames({ bodyField: "body" }, { title: "", content: "" })), /no field body/);
  assert.match(String(strapiNames({ slugField: "handle" }, { title: "", content: "" })), /no field handle/);
  assert.equal((strapiNames({}, null) as { slug: string }).slug, "slug", "with no entry yet the usual names are used");

  const pairs = articlePairs(n, article, { body: "<p>x</p>", slug: "geo", image: 7 });
  const now = new Date("2026-11-17T10:00:00Z");
  assert.deepEqual(strapiData(5, pairs, true, null, now), { title: article.title, content: "<p>x</p>", seo: { metaDescription: article.description } });
  assert.equal(strapiData(4, pairs, true, null, now).publishedAt, "2026-11-17T10:00:00.000Z");
  assert.equal(strapiData(4, pairs, true, "2026-01-01T00:00:00.000Z", now).publishedAt, "2026-01-01T00:00:00.000Z", "a live post keeps its first date");
  assert.equal(strapiData(4, pairs, false, "2026-01-01T00:00:00.000Z", now).publishedAt, null);
});

test("field names, post addresses and image names", () => {
  assert.deepEqual(fieldList(" excerpt,  seo.description ,excerpt "), ["excerpt", "seo.description"]);
  assert.deepEqual(fieldList("", ["title"]), ["title"]);
  assert.deepEqual(badFields({ titleField: "title", bodyField: "post-body", slugField: "x]{" }, ["titleField", "bodyField", "slugField"]), ["post-body", "x]{"]);
  assert.equal(postUrl("https://acme.com/blog/{slug}", "geo"), "https://acme.com/blog/geo");
  assert.equal(postUrl("https://acme.com/blog/", "geo"), "https://acme.com/blog/geo");
  assert.equal(postUrl("", "geo"), null);
  assert.equal(postUrl("javascript:alert(1)", "geo"), null);
  assert.match(imageName("https://x.com/a.webp"), /^arrowsterr-[0-9a-f]{16}\.webp$/);
  assert.match(imageName("https://x.com/image?id=4"), /\.jpg$/);
});

test("each new CMS is listed with its fields, logo and guide, and the migration allows every kind", () => {
  const sql = readFileSync(new URL("../supabase/092_more_cms.sql", import.meta.url), "utf8");
  for (const c of CMS) {
    assert.ok(sql.includes(`'${c.id}'`), `092_more_cms.sql allows ${c.id}`);
    assert.ok(CMS_GUIDE[c.id], `${c.id} has a guide`);
    assert.ok(c.id in CMS_LOGO);
  }
  for (const id of ["contentful", "sanity", "strapi"] as const) {
    const spec = CMS.find((c) => c.id === id)!;
    assert.ok(spec.fields.some((f) => f.secret), `${id} keeps its token secret`);
    assert.equal(new Set(spec.fields.map((f) => f.id)).size, spec.fields.length);
  }
  assert.deepEqual(CMS_GUIDE.strapi.open({ baseUrl: "cms.acme.com/api" }), { label: "Open Strapi", href: "https://cms.acme.com/admin/settings/api-tokens" });
  assert.equal(CMS_GUIDE.strapi.open({}), null);
});
