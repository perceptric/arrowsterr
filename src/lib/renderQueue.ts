import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { renderedFacts, type BrowserNotes } from "./tech/render";

// The queue of crawled pages for the worker's Chromium (docs/technical-seo-plan.md, phase 3). The crawl marks pages
// render_state = queued; a renderer leases one for 3 minutes, renders it and sends back the HTML and its notes.

const LEASE_MS = 3 * 60_000;
const MAX_SHOT = 400_000;

/** The next page to render, leased to this worker, or null. Leases older than 3 minutes go back in the queue. */
export async function leaseRender(db: SupabaseClient, worker: string) {
  const stale = new Date(Date.now() - LEASE_MS).toISOString();
  await db.from("crawl_pages").update({ render_state: "queued" }).eq("render_state", "leased").lt("render_lease", stale);
  const { data } = await db.from("crawl_pages").select("audit_id, url, render_shot").eq("render_state", "queued").order("audit_id").limit(8);
  for (const c of data ?? []) {
    // Only the worker that flips queued to leased gets the page.
    const { data: got } = await db.from("crawl_pages").update({ render_state: "leased", render_lease: new Date().toISOString() }).eq("audit_id", c.audit_id).eq("url", c.url).eq("render_state", "queued").select("url");
    if (got?.length) return { auditId: c.audit_id as string, url: c.url as string, shot: Boolean(c.render_shot), worker };
  }
  return null;
}

export type RenderResult = BrowserNotes & { auditId: string; url: string; ok: boolean; html?: string; shot?: string; error?: string };

/** Save what Chromium saw. A failed render is kept as failed, never counted as an empty page. */
export async function saveRender(db: SupabaseClient, r: RenderResult) {
  const { data: row } = await db.from("crawl_pages").select("facts->links, render_state").eq("audit_id", r.auditId).eq("url", r.url).maybeSingle();
  if (!row || row.render_state !== "leased") return false;
  if (!r.ok || !r.html) {
    await db.from("crawl_pages").update({ render_state: "failed", rendered: { status: r.status || 0, error: (r.error ?? "Couldn't render").slice(0, 300) } }).eq("audit_id", r.auditId).eq("url", r.url);
    return true;
  }
  const { data: audit } = await db.from("site_audits").select("crawl").eq("id", r.auditId).maybeSingle();
  const crawl = (audit?.crawl ?? {}) as { root?: string; settings?: { subdomains?: boolean; dropQuery?: boolean } };
  const raw = (((row as unknown as { links?: { u: string }[] }).links) ?? []).map((l) => l.u);
  const facts = renderedFacts(r.url, r.html.slice(0, 3_000_000), raw, { status: r.status, final: r.final, timeout: r.timeout, errors: r.errors ?? [], failed: r.failed ?? [], resources: r.resources ?? [] }, { root: crawl.root ?? r.url, subdomains: crawl.settings?.subdomains, dropQuery: crawl.settings?.dropQuery });
  await db
    .from("crawl_pages")
    .update({ render_state: "done", rendered: facts, rendered_words: facts.words, ...(r.shot && r.shot.length < MAX_SHOT ? { shot: r.shot } : {}) })
    .eq("audit_id", r.auditId)
    .eq("url", r.url);
  return true;
}
