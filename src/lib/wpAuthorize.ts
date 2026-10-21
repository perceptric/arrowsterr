// One-click WordPress connect, with WordPress's own "Authorize Application" screen (WordPress 5.6 and later):
// the person types their site address, approves Arrowsterr in a WordPress window, and WordPress hands back an
// application password for their user. No copying keys. The window comes back to /connect/wordpress, which passes
// the answer to the screen that opened it. Pure, shared by the browser and the tests.

/** Arrowsterr's fixed app id, so WordPress lists every connection under one name. */
export const WP_APP_ID = "6d0c6c2e-5b39-4f7a-9a0b-6b3a2d8f1c41";
export const WP_CALLBACK = "/connect/wordpress";
/** Where the callback leaves the answer when it can't reach the window that opened it. Read once and cleared. */
export const WP_ANSWER_KEY = "arrowsterr.wp-answer";

/** A site address as https://host[/path], or "" when it isn't one. */
export function siteAddress(raw: string): string {
  const s = raw.trim().replace(/\/+$/, "").replace(/\/wp-admin.*$/i, "");
  if (!s) return "";
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    if (!/\./.test(u.hostname) && u.hostname !== "localhost") return "";
    return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return "";
  }
}

/** The WordPress screen where the person approves Arrowsterr. origin is this app's address. */
export function authorizeUrl(site: string, origin: string): string {
  const back = `${origin}${WP_CALLBACK}`;
  const q = new URLSearchParams({ app_name: "Arrowsterr", app_id: WP_APP_ID, success_url: back, reject_url: `${back}?rejected=1` });
  return `${site}/wp-admin/authorize-application.php?${q.toString()}`;
}

export type WpAnswer = { ok: true; siteUrl: string; username: string; appPassword: string } | { ok: false; error: string };

/** What WordPress sent back to the callback: the site, the user and the new password, or why not. */
export function readAnswer(params: URLSearchParams): WpAnswer {
  if (params.get("rejected")) return { ok: false, error: "The connection wasn't approved in WordPress." };
  const siteUrl = siteAddress(params.get("site_url") ?? "");
  const username = (params.get("user_login") ?? "").trim();
  const appPassword = (params.get("password") ?? "").trim();
  if (!siteUrl || !username || !appPassword) return { ok: false, error: "WordPress didn't send the connection back. Try again, or use an application password." };
  return { ok: true, siteUrl, username, appPassword };
}
