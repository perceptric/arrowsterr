import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { askClaude, askJson } from "./claude";
import { call } from "./dataforseo";
import type { Profile } from "./db";
import { enqueue, enqueueMany } from "./jobs";
import { aiProspects, bare, emailsIn, findLink, nextCheck, unlinkedMention, type ChatLite, type Prospect } from "./linkBuilding";
import { safeFetch } from "./safeFetch";

// Link Building (docs/link-building.md): the brand's "Link building" outreach list, prospect finders, contact emails,
// pitch drafts and the weekly check that won links are still there.

const BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
export type Brand = { id: string; name: string; domain: string; profile: Profile | null };
export const CARD_COLS = "id, name, domain, url, email, email_status, stage, source, note, authority, stage_at, link_page, link_live, link_follow, link_misses, link_checked_at, draft_subject, draft_body, status, created_at";

/** The brand's "Link building" list id, made on first use. Null before 040_outreach.sql. */
export async function linkList(db: SupabaseClient, ws: string, brandId: string, make = false): Promise<string | null> {
  const { data, error } = await db.from("outreach_lists").select("id").eq("workspace_id", ws).eq("brand_id", brandId).eq("name", "Link building").limit(1).maybeSingle();
  if (error) return null;
  if (data) return data.id as string;
  if (!make) return null;
  const { data: made } = await db.from("outreach_lists").insert({ workspace_id: ws, brand_id: brandId, name: "Link building" }).select("id").single();
  return (made?.id as string | undefined) ?? null;
}

/** Every address and domain on the workspace's do-not-contact list, lower case. */
export async function suppression(db: SupabaseClient, ws: string): Promise<Set<string>> {
  const { data } = await db.from("outreach_suppression").select("value").eq("workspace_id", ws);
  return new Set((data ?? []).map((r) => String(r.value).toLowerCase()));
}

/** Put prospects on the list. A site already on it stays as it is. Returns how many were new. */
export async function addProspects(db: SupabaseClient, ws: string, listId: string, list: (Prospect & { authority?: number | null })[]): Promise<number> {
  if (!list.length) return 0;
  const { data: have } = await db.from("outreach_targets").select("domain").eq("list_id", listId);
  const known = new Set((have ?? []).map((r) => bare(String(r.domain ?? ""))));
  const fresh = list.filter((p) => p.domain && !known.has(bare(p.domain)));
  const seen = new Set<string>();
  const rows = fresh
    .filter((p) => (seen.has(p.domain) ? false : (seen.add(p.domain), true)))
    .map((p) => ({ list_id: listId, workspace_id: ws, kind: "website", name: p.domain, domain: p.domain, url: p.url, source: p.source, note: p.note.slice(0, 300), authority: p.authority ?? null, added_from: p.source }));
  if (!rows.length) return 0;
  const { error } = await db.from("outreach_targets").upsert(rows, { onConflict: "list_id,kind,name", ignoreDuplicates: true });
  if (error) throw new Error(/stage|source|note|authority/.test(error.message) ? "Run supabase/064_link_building.sql in Supabase." : error.message);
  return rows.length;
}

const rivalsOf = (b: Brand) => (b.profile?.competitors ?? []).filter((c) => c.domain).map((c) => ({ name: c.name, domain: bare(c.domain) }));

/** Sites the brand's AI answers of the last 30 days cite when they name a rival and not the brand. Free. */
export async function findAiCites(db: SupabaseClient, b: Brand): Promise<Prospect[]> {
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const { data } = await db.from("runs").select("chats").eq("brand_id", b.id).gte("at", since).limit(400);
  const chats = ((data ?? []) as { chats: ChatLite[] }[]).flatMap((r) => r.chats ?? []);
  return aiProspects(chats, { name: b.name, domain: b.domain }, rivalsOf(b));
}

/** Sites that link to a dead page on a rival's site: offer the brand's page instead. One DataForSEO request per rival. */
export async function findBroken(b: Brand): Promise<(Prospect & { authority: number })[]> {
  const out: (Prospect & { authority: number })[] = [];
  for (const r of rivalsOf(b).slice(0, 3)) {
    const [t] = await call("backlinks/backlinks/live", [
      { target: r.domain, include_subdomains: true, mode: "one_per_domain", filters: ["is_broken", "=", true], order_by: ["domain_from_rank,desc"], limit: 50, rank_scale: "one_hundred", backlinks_status_type: "live" },
    ]);
    if (t?.status_code !== 20000) throw new Error(`DataForSEO: ${t?.status_message ?? "no result"}`);
    for (const i of (t.result?.[0]?.items ?? []) as Record<string, unknown>[]) {
      const from = String(i.url_from ?? "");
      const domain = bare(String(i.domain_from ?? from));
      if (!from || !domain || domain === bare(b.domain)) continue;
      out.push({ domain, url: from, source: "broken_page", note: `Links to a dead ${r.name} page: ${String(i.url_to ?? "").slice(0, 160)}`, score: Number(i.domain_from_rank ?? 0), authority: Math.round(Number(i.domain_from_rank ?? 0)) });
    }
  }
  return out.sort((a, b2) => b2.score - a.score);
}

/** Pages that name the brand without linking to it: Claude searches the web, then each page is read and checked. */
export async function findMentions(b: Brand): Promise<Prospect[]> {
  const { sources } = await askClaude(
    `Search the web for articles, lists, reviews and directories that mention "${b.name}" (${b.domain}). Leave out ${b.domain} itself and social networks. List the pages you found, one per line.`,
    { searches: 4, maxTokens: 800, effort: "low" },
  );
  const pages = [...new Map(sources.map((s) => [s.url, s])).values()].filter((s) => !bare(s.url).endsWith(bare(b.domain))).slice(0, 15);
  const out: Prospect[] = [];
  await Promise.all(
    pages.map(async (s) => {
      const r = await safeFetch(s.url, { ua: BROWSER, timeout: 12_000, maxBytes: 3_000_000, accept: "text/html" });
      if (r.ok && unlinkedMention(r.body, r.url, b)) out.push({ domain: bare(r.url), url: r.url, source: "unlinked_mention", note: `Mentions ${b.name} without a link`, score: 1 });
    }),
  );
  return out;
}

/** A contact email from the site's homepage, contact and about pages. Free. */
export async function findContact(domain: string): Promise<{ email: string | null; source: "contact_page" | "site" | null }> {
  const d = bare(domain);
  for (const [path, source] of [["/contact", "contact_page"], ["/contact-us", "contact_page"], ["/write-for-us", "contact_page"], ["/about", "site"], ["/", "site"]] as const) {
    const r = await safeFetch(`https://${d}${path}`, { ua: BROWSER, timeout: 8_000, maxBytes: 1_500_000, accept: "text/html" });
    if (!r.ok) continue;
    const found = emailsIn(r.body, d);
    if (found.length) return { email: found[0], source };
  }
  return { email: null, source: null };
}

const PITCH = { type: "object", properties: { subject: { type: "string" }, body: { type: "string" } }, required: ["subject", "body"], additionalProperties: false };

/** A short pitch the person edits and sends from their own email. */
export async function draftPitch(b: Brand, card: { domain: string; url: string | null; note: string | null; source: string }) {
  const p = b.profile ?? {};
  const about = [p.products && `Sells: ${p.products}`, p.customers && `For: ${p.customers}`, p.card?.howTo?.length && `How: ${p.card.howTo.join("; ")}`, p.knowledge && `Facts: ${p.knowledge.slice(0, 800)}`].filter(Boolean).join("\n");
  const ask =
    card.source === "broken_page" ? "Their page links to a dead page. Point it out kindly and offer the brand's page as the replacement."
    : card.source === "unlinked_mention" ? "They already mention the brand. Thank them and ask if they'd add a link so readers can find it."
    : card.source === "ai_cites" ? "AI tools quote their page on this topic. Offer something that makes their page more useful: data, a quote, a correction or an example from the brand."
    : "They link to the brand's rivals. Offer something that makes their page more useful to their readers.";
  const out = await askJson<{ subject: string; body: string }>(
    `Write a short outreach email from ${b.name} (${b.domain}) to the editor of ${card.domain}.
Their page: ${card.url ?? `https://${card.domain}`}
Why them: ${card.note ?? ""}
${ask}

What ${b.name} is:
${about || "(no profile yet)"}

Rules: under 120 words. A plain subject under 8 words. Open with what helps their readers. One clear ask. No flattery, no "I hope this finds you well", no em dashes, no made-up facts or numbers. Sign off as "The ${b.name} team". 9th grade words.
Return JSON with subject and body.`,
    PITCH,
    { maxTokens: 600, effort: "low" },
  );
  return { subject: out.subject.replace(/\s+/g, " ").trim().slice(0, 140), body: out.body.trim().slice(0, 2500) };
}

/** Check one won link: the page loads with a link to the brand. One retry on an error before it counts as a miss. */
export async function checkLink(db: SupabaseClient, id: string) {
  const { data: c } = await db.from("outreach_targets").select("id, list_id, link_page, link_live, link_misses, stage").eq("id", id).maybeSingle();
  if (!c?.link_page || c.stage !== "won") return;
  const { data: list } = await db.from("outreach_lists").select("brand_id").eq("id", c.list_id).maybeSingle();
  const { data: brand } = list?.brand_id ? await db.from("brands").select("domain").eq("id", list.brand_id).maybeSingle() : { data: null };
  if (!brand) return;
  let result: "found" | "missing" | "error" = "error";
  let follow: boolean | null = null;
  for (let attempt = 0; attempt < 2 && result === "error"; attempt++) {
    const r = await safeFetch(String(c.link_page), { ua: BROWSER, timeout: 15_000, maxBytes: 3_000_000, accept: "text/html" });
    if (r.ok) {
      const f = findLink(r.body, r.url, String(brand.domain));
      result = f.found ? "found" : "missing";
      follow = f.found ? f.follow : null;
    } else if (r.status === 404 || r.status === 410) result = "missing";
  }
  const next = nextCheck({ live: c.link_live as boolean | null, misses: Number(c.link_misses ?? 0) }, result);
  await db
    .from("outreach_targets")
    .update({ link_live: next.live, link_misses: next.misses, link_checked_at: new Date().toISOString(), ...(follow !== null ? { link_follow: follow } : {}), updated_at: new Date().toISOString() })
    .eq("id", id);
}

/** The daily tick: queue checks for won links not checked in a week. */
export async function queueLinkChecks(db: SupabaseClient) {
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
  const { data, error } = await db.from("outreach_targets").select("id, workspace_id, link_checked_at").eq("stage", "won").not("link_page", "is", null).or(`link_checked_at.is.null,link_checked_at.lt.${weekAgo}`).limit(500);
  if (error) return; // before 064_link_building.sql
  const week = Math.floor(Date.now() / (7 * 864e5));
  await enqueueMany((data ?? []).map((c) => ({ kind: "link_check" as const, workspace_id: c.workspace_id, key: `link_check:${c.id}:${week}`, payload: { id: c.id } })));
}

/** Check one link soon, on the queue (after a card moves to Won, or Check now). */
export const queueCheck = (ws: string, id: string) => enqueue("link_check", { id }, { workspaceId: ws, key: `link_check:${id}:now:${Date.now()}`, maxAttempts: 2 });
