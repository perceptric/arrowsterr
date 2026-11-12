import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { needsRefresh, pickBlog, refreshed, shopDomain, shopifyGid, shopifyHmacOk, webhookBody, webhookResult, webhookSignature } from "../src/lib/cmsOauth.ts";

test("store addresses become the shop's myshopify domain, and others are refused", () => {
  assert.equal(shopDomain("acme"), "acme.myshopify.com");
  assert.equal(shopDomain("https://Acme-Store.myshopify.com/admin"), "acme-store.myshopify.com");
  assert.equal(shopDomain("acme.com"), null);
  assert.equal(shopDomain("evil.myshopify.com.attacker.io"), null);
  assert.equal(shopDomain("-bad"), null);
});

test("Shopify's callback signature is checked over the sorted values, and a changed value fails", () => {
  const secret = "hush";
  const q = new URLSearchParams({ shop: "acme.myshopify.com", code: "abc", state: "s1", timestamp: "1700000000" });
  const msg = "code=abc&shop=acme.myshopify.com&state=s1&timestamp=1700000000";
  q.set("hmac", createHmac("sha256", secret).update(msg).digest("hex"));
  assert.equal(shopifyHmacOk(q, secret), true);
  q.set("shop", "evil.myshopify.com");
  assert.equal(shopifyHmacOk(q, secret), false);
  assert.equal(shopifyHmacOk(new URLSearchParams({ shop: "x" }), secret), false);
});

test("tokens are renewed before they end, and a rotated refresh token is kept", () => {
  const now = Date.parse("2026-11-12T10:00:00Z");
  assert.equal(needsRefresh({ token: "t" }, now), false, "a pasted token never refreshes");
  assert.equal(needsRefresh({ token: "t", refreshToken: "r", expiresAt: "2026-11-12T11:00:00Z" }, now), false);
  assert.equal(needsRefresh({ token: "t", refreshToken: "r", expiresAt: "2026-11-12T10:03:00Z" }, now), true);
  assert.equal(needsRefresh({ token: "t", refreshToken: "r" }, now), true);
  const next = refreshed({ token: "old", refreshToken: "r1", blogId: "b" }, { access_token: "new", expires_in: 3600, refresh_token: "r2" }, now);
  assert.deepEqual(next, { token: "new", refreshToken: "r2", blogId: "b", expiresAt: "2026-11-12T11:00:00.000Z" });
  assert.equal(refreshed({ token: "a", refreshToken: "keep" }, { access_token: "b" }, now).refreshToken, "keep");
});

test("ids and blogs", () => {
  assert.equal(shopifyGid("Article", "123"), "gid://shopify/Article/123");
  assert.equal(shopifyGid("Blog", "gid://shopify/Blog/9"), "gid://shopify/Blog/9");
  assert.equal(pickBlog([{ title: "Recipes" }, { title: "News" }])?.title, "News");
  assert.equal(pickBlog([{ title: "Recipes" }])?.title, "Recipes");
  assert.equal(pickBlog([]), null);
});

test("a webhook gets the article, signed, and updates keep the site's id", () => {
  const p = { title: "GEO vs SEO", html: "<p>Hi</p>", slug: "geo-vs-seo", description: "Short", image: "", schema: "", live: true };
  const body = webhookBody(p, undefined, new Date("2026-11-12T10:00:00Z"));
  const data = JSON.parse(body);
  assert.equal(data.event, "publish");
  assert.equal(data.status, "published");
  assert.equal(JSON.parse(webhookBody(p, "42", new Date())).event, "update");
  assert.equal(JSON.parse(webhookBody(p, undefined, new Date(), true)).event, "test");
  assert.equal(webhookSignature("k", body), `sha256=${createHmac("sha256", "k").update(body).digest("hex")}`);
  assert.deepEqual(webhookResult('{"id": 77, "url": "https://acme.com/blog/geo"}', undefined, "geo"), { id: "77", url: "https://acme.com/blog/geo" });
  assert.deepEqual(webhookResult("OK", "42", "geo"), { id: "42", url: null });
  assert.deepEqual(webhookResult('{"url": "javascript:alert(1)"}', undefined, "geo"), { id: "geo", url: null });
});
