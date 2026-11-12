// One-click CMS sign-ins and the webhook site (docs/drafts-plan.md, phase 3): the checks and shapes that have no
// network in them, so tests can cover them. The calls are in cmsTokens.ts and cms.ts.
import { createHmac, timingSafeEqual } from "node:crypto";

/** A store address people type, as Shopify's own domain, or null. Only *.myshopify.com is accepted for sign-in. */
export function shopDomain(input: string): string | null {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  const full = s.includes(".") ? s : `${s}.myshopify.com`;
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(full) ? full : null;
}

/**
 * Shopify signs its callback: every query value but hmac, sorted by name, joined as k=v with &, HMAC-SHA256 with
 * the app's secret, in hex. Compared in constant time.
 */
export function shopifyHmacOk(params: URLSearchParams, secret: string): boolean {
  const given = params.get("hmac") ?? "";
  const msg = [...params.entries()]
    .filter(([k]) => k !== "hmac" && k !== "signature")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const want = createHmac("sha256", secret).update(msg).digest("hex");
  return given.length === want.length && timingSafeEqual(Buffer.from(given), Buffer.from(want));
}

/** Signed-in sites keep a refresh token: the access token is renewed when it ends within five minutes. */
export function needsRefresh(config: Record<string, string>, now: number): boolean {
  if (!config.refreshToken) return false;
  const until = Date.parse(config.expiresAt ?? "");
  return !Number.isFinite(until) || until - now < 5 * 60_000;
}

/** The config after a refresh: the new access token, its end, and the new refresh token when the CMS rotates it. */
export function refreshed(config: Record<string, string>, out: { access_token: string; expires_in?: number; refresh_token?: string }, now: number) {
  return {
    ...config,
    token: out.access_token,
    refreshToken: out.refresh_token || config.refreshToken,
    expiresAt: new Date(now + (out.expires_in ?? 1800) * 1000).toISOString(),
  };
}

/** Shopify's GraphQL ids. Sites connected before kept plain numbers; both work. */
export const shopifyGid = (kind: "Blog" | "Article", id: string) => (id.startsWith("gid://") ? id : `gid://shopify/${kind}/${id}`);

/** The blog articles go to: one named like a blog or news, else the first. */
export function pickBlog<T extends { title: string }>(blogs: T[]): T | null {
  return blogs.find((b) => /\b(blog|news|articles?|journal|insights)\b/i.test(b.title)) ?? blogs[0] ?? null;
}

export type WebhookArticle = { title: string; html: string; slug: string; description: string; image: string; schema: string; live: boolean };

/** What a webhook site receives. id is the post's id from the site's last answer, so it can update the same post. */
export function webhookBody(p: WebhookArticle, id: string | undefined, sentAt: Date, test = false) {
  return JSON.stringify({
    event: test ? "test" : id ? "update" : "publish",
    id: id ?? null,
    status: p.live ? "published" : "draft",
    title: p.title,
    slug: p.slug,
    description: p.description,
    image: p.image || null,
    html: p.html,
    schema: p.schema || null,
    sent_at: sentAt.toISOString(),
  });
}

/** The X-Arrowsterr-Signature header: sha256= and the HMAC of the exact body with the site's secret. */
export const webhookSignature = (secret: string, body: string) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

/** The post's id and address from the site's answer, when it sends them back. A missing id keeps the old one or the slug. */
export function webhookResult(text: string, before: string | undefined, slug: string): { id: string; url: string | null } {
  let data: { id?: unknown; url?: unknown } = {};
  try {
    data = text ? (JSON.parse(text) as typeof data) : {};
  } catch {
    data = {};
  }
  const id = typeof data.id === "string" || typeof data.id === "number" ? String(data.id) : before || slug || `post-${Date.now()}`;
  const url = typeof data.url === "string" && /^https?:\/\//.test(data.url) ? data.url : null;
  return { id, url };
}
