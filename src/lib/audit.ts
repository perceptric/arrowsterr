import "server-only";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { entitlement } from "./entitlements";
import { enqueue, queueReady } from "./jobs";
import { emailAuditDrop } from "./notify";
import { crawlStep, pruneCrawlPages } from "./crawler";
import type { Area } from "./tech/checks";
import type { CrawlSettings } from "./tech/limits";
import type { Stats } from "./tech/summary";
import { cleanDomain, dropAlert, isStuck, previousFull, weeklyDue, type AuditRow } from "./siteAudit";

// The site audit: crawl a website the way a search engine or AI crawler does, then list what to fix.
// The crawler is src/lib/crawler.ts (crawler v2, docs/technical-seo-plan.md): a chain of "audit" jobs that read pages
// into crawl_pages and save the summary on site_audits.result. This file starts crawls, hands over between jobs, and
// sends the drop alert when a crawl finishes.

/** Shown in Zippie's tool description. The real limit is the plan's (src/lib/tech/limits.ts). */
export const MAX_PAGES = "your plan's page limit (100 to 50,000)";

export type AuditPage = {
  url: string;
  status: number;
  ms: number;
  final?: string;
  title?: string;
  description?: string;
  h1: number;
  canonical?: string;
  noindex?: boolean;
  words: number;
  images: number;
  noAlt: number;
  schema: string[];
  ogImage: boolean;
  links: number;
};

export type Severity = "high" | "medium" | "low";
export type AuditIssue = { id: string; severity: Severity; title: string; why: string; count: number; pages: string[]; play?: string; area?: Area; how?: string; siteWide?: boolean };
export type AuditResult = {
  pages: AuditPage[];
  issues: AuditIssue[];
  found: number;
  sitemap: string | null;
  blockedBots: string[];
  llmsTxt: boolean;
  brokenLinks: { url: string; status: number; from: string }[];
  /** Why this crawl got no score (most pages didn't load, or the crawl stopped early). Missing on a full crawl. */
  partial?: string;
  /** Crawler v2 only. */
  version?: 2;
  areas?: Record<string, number>;
  stats?: Stats;
  settings?: CrawlSettings;
  root?: string;
};

/** One job's share of a crawl; when the crawl is done, the drop alert and old page rows are handled here. */
export async function runAudit(db: SupabaseClient, auditId: string, domain: string, part = 0) {
  const next = await crawlStep(db, auditId);
  if (next === "more") {
    if (await queueReady()) await enqueue("audit", { auditId, domain, part: part + 1 }, { key: `audit:${auditId}:${part + 1}`, maxAttempts: 2 });
    else await runAudit(db, auditId, domain, part + 1);
    return;
  }
  const { data: row } = await db.from("site_audits").select("brand_id, status").eq("id", auditId).maybeSingle();
  if (row?.status === "done") await alertOnDrop(db, auditId).catch((e) => console.error("Site audit alert failed:", e instanceof Error ? e.message : e));
  if (row?.brand_id) await pruneCrawlPages(db, row.brand_id).catch((e) => console.error("Pruning crawl pages failed:", e instanceof Error ? e.message : e));
}

/** Email the brand's alert list when the score fell since the last full crawl. Once per crawl. */
async function alertOnDrop(db: SupabaseClient, auditId: string) {
  const { data: now } = await db.from("site_audits").select("id, workspace_id, brand_id, status, score, created_at, result").eq("id", auditId).maybeSingle();
  if (!now?.brand_id) return;
  const { data: list } = await db.from("site_audits").select("id, status, score, created_at, result").eq("brand_id", now.brand_id).order("created_at", { ascending: false }).limit(12);
  const rows = (list ?? []) as (AuditRow & { result: AuditResult })[];
  const current = rows.find((r) => r.id === auditId);
  if (!current) return;
  const prev = previousFull(rows, current) as (AuditRow & { result: AuditResult }) | null;
  const drop = dropAlert(prev, current);
  if (drop === null || !prev) return;
  const { data: brand } = await db.from("brands").select("id, name, domain").eq("id", now.brand_id).maybeSingle();
  if (!brand) return;
  const before = new Set((prev.result?.issues ?? []).map((i) => i.id));
  const fresh = (current.result?.issues ?? []).filter((i) => !before.has(i.id));
  await emailAuditDrop(db, now.workspace_id, brand, { auditId, score: current.score as number, before: prev.score as number, issues: (fresh.length ? fresh : current.result?.issues ?? []).slice(0, 5).map((i) => ({ title: i.title, count: i.count, isNew: before.size > 0 && !before.has(i.id) })) });
}

/** Start a crawl for a brand, or for a domain (Zippie). Returns the new audit's id. */
export async function startAudit(db: SupabaseClient, ws: string, userId: string | null, rawDomain: string, brandId?: string | null) {
  const domain = cleanDomain(rawDomain);
  if (!domain) throw new Error("That doesn't look like a website address.");
  let brand = brandId ?? null;
  if (!brand) {
    // Zippie names a domain: the crawl belongs to the workspace's brand with that domain, if there is one.
    const { data: brands } = await db.from("brands").select("id, domain").eq("workspace_id", ws);
    brand = (brands ?? []).find((b) => cleanDomain(String(b.domain)) === domain)?.id ?? null;
  }
  // The brand's crawl settings ride along on the audit, so a crawl in progress never changes under it.
  const { data: b } = brand ? await db.from("brands").select("audit_settings").eq("id", brand).maybeSingle() : { data: null };
  let { data, error } = await db.from("site_audits").insert({ workspace_id: ws, domain, created_by: userId, settings: b?.audit_settings ?? {}, heartbeat_at: new Date().toISOString(), ...(brand ? { brand_id: brand } : {}) }).select("id").single();
  // Before 067_crawler.sql runs (it lands a few minutes after a deploy), start the crawl without the new columns.
  if (error && /settings|heartbeat_at/.test(error.message)) ({ data, error } = await db.from("site_audits").insert({ workspace_id: ws, domain, created_by: userId, ...(brand ? { brand_id: brand } : {}) }).select("id").single());
  if (error || !data) throw new Error(error?.message ?? "Could not start the audit.");
  if (await queueReady()) await enqueue("audit", { auditId: data.id, domain }, { workspaceId: ws, key: `audit:${data.id}`, maxAttempts: 1 });
  else after(() => runAudit(db, data.id, domain));
  return { id: data.id as string, domain };
}

/** The daily tick: start each brand's weekly crawl when it's due. Brands start weekly crawls after their first crawl. */
export async function queueWeeklyAudits(db: SupabaseClient) {
  const { data: brands, error } = await db.from("brands").select("id, workspace_id, domain, audit_weekly").eq("audit_weekly", true);
  if (error) {
    if (/audit_weekly/.test(error.message)) return; // before 061_site_audits.sql
    throw new Error(error.message);
  }
  if (!brands?.length) return;
  const now = Date.now();
  const latest = new Map<string, { created_at: string; status: string; heartbeat_at?: string | null }>();
  for (let i = 0; i < brands.length; i += 200) {
    const ids = brands.slice(i, i + 200).map((b) => b.id);
    const { data } = await db.from("site_audits").select("brand_id, status, created_at, heartbeat_at").in("brand_id", ids).order("created_at", { ascending: false }).limit(2000);
    for (const a of data ?? []) if (!latest.has(a.brand_id)) latest.set(a.brand_id, a);
  }
  for (const b of brands) {
    const last = latest.get(b.id);
    const running = Boolean(last && last.status === "running" && !isStuck(last, now));
    if (!weeklyDue({ weekly: b.audit_weekly, lastStarted: last?.created_at ?? null, running, now })) continue;
    const e = await entitlement(b.workspace_id);
    if (e.readOnly || !e.open.seo) continue;
    await startAudit(db, b.workspace_id, null, String(b.domain), b.id).catch((err) => console.error(`Weekly audit for ${b.domain} failed to start:`, err instanceof Error ? err.message : err));
  }
}
