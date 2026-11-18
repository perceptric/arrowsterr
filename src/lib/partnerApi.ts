import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hashKey, keyKind, keyOf, makeKey, rowProblem, type KeyRow } from "./apiKeys";
import { addBrand, deleteBrand, siteForBrand, type Brand } from "./db";
import { entitlement, type Entitlement } from "./entitlements";
import { adminClient } from "./serverAuth";
import { logoFor, normalizeSite } from "./site";

// The partner API (docs/API.md, "Partner API"). A partner key (aw_partner_…) belongs to a partner workspace
// (Extras.partner) and makes one brand per customer, then brand keys (aw_brand_…) that see only that brand.
// A partner key may touch any brand in its own workspace that a partner key made (created_by_key is set),
// so a new partner key keeps working with brands an old one made. Brands made in the app are refused.
// Errors are { error: { code, message } }.

type Ent = (ws: string) => Promise<Pick<Entitlement, "readOnly" | "limits">>;
export type PartnerDeps = { db: SupabaseClient; entitlement?: Ent };
export type Partner = { db: SupabaseClient; ws: string; keyId: string };
type OwnBrand = { id: string; workspace_id: string; name: string; domain: string; external_id: string | null; created_by_key: string | null; prompts: string[] | null };

/** An error in the partner API's shape. */
export const perr = (status: number, code: string, message: string, headers: Record<string, string> = {}) => Response.json({ error: { code, message } }, { status, headers });

const OWN_COLS = "id, workspace_id, name, domain, external_id, created_by_key, prompts";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BRAND_KEYS = 20; // live brand keys one brand may have at once
const out = (b: Pick<OwnBrand, "id" | "name" | "domain" | "external_id">) => ({ id: b.id, name: b.name, domain: b.domain, external_id: b.external_id });

// A fair-use limit per partner key, like the MCP server's.
const WINDOW = 60_000;
export const MAX_CALLS = 120;
const calls = new Map<string, number[]>();
function allowed(id: string) {
  const now = Date.now();
  const recent = (calls.get(id) ?? []).filter((t) => now - t < WINDOW);
  const ok = recent.length < MAX_CALLS;
  if (ok) recent.push(now);
  calls.set(id, recent);
  if (calls.size > 5000) calls.delete(calls.keys().next().value!);
  return ok;
}

/** The partner a request comes from, from its key. Returns a Response when the key is missing, wrong or not allowed. */
export async function partnerAuth(deps: PartnerDeps, request: Request): Promise<Partner | { denied: Response }> {
  const key = keyOf(request);
  if (!key) return { denied: perr(401, "missing_key", "Send your partner key as a Bearer token.") };
  if (keyKind(key) !== "partner") return { denied: perr(401, "wrong_key", "Use a partner key. It starts with aw_partner_.") };
  // "*" so an old database without the partner columns reads as "not a partner key" instead of failing.
  const { data } = await deps.db.from("api_keys").select("*").eq("hash", hashKey(key)).maybeSingle();
  const row = data as KeyRow | null;
  if (rowProblem("partner", row)) return { denied: perr(401, "invalid_key", "This partner key is not valid.") };
  const e = await (deps.entitlement ?? entitlement)(row!.workspace_id);
  if (!e.limits.partner) return { denied: perr(403, "not_partner", "This workspace does not have the partner API.") };
  if (e.readOnly) return { denied: perr(403, "read_only", "This workspace is read-only.") };
  if (!allowed(row!.id)) return { denied: perr(429, "rate_limited", `Up to ${MAX_CALLS} calls a minute. Wait a moment and try again.`, { "Retry-After": "60" }) };
  await deps.db.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", row!.id);
  return { db: deps.db, ws: row!.workspace_id, keyId: row!.id };
}

/** Run a partner call: check the key, then the handler. Anything unexpected is a 503 the partner can retry. */
export async function partnerRoute(request: Request, run: (p: Partner) => Promise<Response>, deps?: PartnerDeps): Promise<Response> {
  const db = deps?.db ?? adminClient();
  if (!db) return perr(503, "unavailable", "The partner API is not set up on the server.");
  try {
    const p = await partnerAuth({ ...deps, db }, request);
    if ("denied" in p) return p.denied;
    return await run(p);
  } catch (e) {
    console.error("Partner API failed:", e instanceof Error ? e.message : e);
    return perr(503, "unavailable", "Something went wrong on our side. Try again in a minute.");
  }
}

/** The brand a partner means, when it may touch it. 404 when it is not in the partner's workspace, 403 when the app made it. */
async function own(p: Partner, id: string): Promise<OwnBrand | Response> {
  const notFound = perr(404, "not_found", "No brand with this id.");
  if (!UUID.test(id)) return notFound;
  const { data, error } = await p.db.from("brands").select(OWN_COLS).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  const b = data as OwnBrand | null;
  if (!b || b.workspace_id !== p.ws) return notFound;
  if (!b.created_by_key) return perr(403, "not_your_brand", "This brand was not made through the partner API.");
  return b;
}

/** The new brand a partner sent, or a 422 saying what to fix. */
export function readNewBrand(body: unknown): { name: string; url: string; domain: string; external_id: string } | Response {
  const b = (body && typeof body === "object" ? body : null) as Record<string, unknown> | null;
  if (!b) return perr(422, "invalid", "Send JSON with name, domain and external_id.");
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 120) : "";
  const external = typeof b.external_id === "string" ? b.external_id.trim() : "";
  const site = typeof b.domain === "string" ? normalizeSite(b.domain) : null;
  if (!name) return perr(422, "invalid", "Send the brand's name.");
  if (!site) return perr(422, "invalid", "Send the brand's website domain, like acme.com.");
  if (!external || external.length > 200) return perr(422, "invalid", "Send external_id: your id for this customer, up to 200 characters.");
  return { name, url: site.url, domain: site.domain, external_id: external };
}

/** POST /api/partner/brands. The same external_id again answers 200 with the brand it made before. */
export async function createBrand(p: Partner, body: unknown): Promise<Response> {
  const input = readNewBrand(body);
  if (input instanceof Response) return input;
  const existing = async () => {
    const { data, error } = await p.db.from("brands").select(OWN_COLS).eq("workspace_id", p.ws).eq("external_id", input.external_id).maybeSingle();
    if (error) throw new Error(error.message);
    return data as OwnBrand | null;
  };
  const before = await existing();
  if (before) return before.created_by_key ? Response.json(out(before)) : perr(403, "not_your_brand", "This brand was not made through the partner API.");
  // Two brands on one domain would share one Content Plan, so a domain belongs to one brand per workspace.
  const { data: taken } = await p.db.from("brands").select("id").eq("workspace_id", p.ws).eq("domain", input.domain).limit(1);
  if (taken?.length) return perr(409, "domain_taken", `Another brand in this workspace already tracks ${input.domain}.`);
  let brand: Brand;
  try {
    // The app's own brand creation, with the defaults onboarding uses. Prompts start empty: the brand's agent adds them.
    brand = await addBrand(p.db, { workspace_id: p.ws, url: input.url, domain: input.domain, name: input.name, logo: logoFor(input.domain), category: "", prompts: [], external_id: input.external_id, created_by_key: p.keyId });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // A retry that raced the first call: answer with the brand the first one made.
    if (/brands_external_id|duplicate key/.test(message)) {
      const again = await existing();
      if (again) return Response.json(out(again));
    }
    if (/can track/.test(message)) return perr(409, "limit_reached", message);
    throw e;
  }
  // Make the brand's Content Plan site now, like onboarding does. A failure is fine: the app makes it on first open.
  await siteForBrand(p.db, brand, true).catch(() => null);
  return Response.json(out({ ...brand, external_id: input.external_id }), { status: 201 });
}

/** GET /api/partner/brands/:id */
export async function getBrand(p: Partner, id: string): Promise<Response> {
  const b = await own(p, id);
  if (b instanceof Response) return b;
  const { data: last } = await p.db.from("runs").select("at").eq("brand_id", b.id).order("at", { ascending: false }).limit(1);
  const prompts = b.prompts?.length ?? 0;
  return Response.json({ ...out(b), status: prompts ? "tracking" : "no_prompts", prompts, last_checked_at: (last?.[0] as { at?: string } | undefined)?.at ?? null });
}

/** Revoke every live brand key of a brand. */
async function revokeKeys(p: Partner, brandId: string) {
  const { error } = await p.db.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("workspace_id", p.ws).eq("brand_id", brandId).is("revoked_at", null);
  if (error) throw new Error(error.message);
}

/** DELETE /api/partner/brands/:id. Its brand keys are revoked first, then the brand and its data go. */
export async function removeBrand(p: Partner, id: string): Promise<Response> {
  const b = await own(p, id);
  if (b instanceof Response) return b;
  await revokeKeys(p, b.id);
  await deleteBrand(p.db, b.id);
  return new Response(null, { status: 204 });
}

/** POST /api/partner/brands/:id/keys. The key is shown once. */
export async function makeBrandKey(p: Partner, id: string): Promise<Response> {
  const b = await own(p, id);
  if (b instanceof Response) return b;
  const { count } = await p.db.from("api_keys").select("id", { count: "exact", head: true }).eq("brand_id", b.id).is("revoked_at", null);
  if ((count ?? 0) >= MAX_BRAND_KEYS) return perr(409, "too_many_keys", `A brand can have ${MAX_BRAND_KEYS} keys at once. Revoke its keys first.`);
  const k = makeKey("brand");
  const { error } = await p.db.from("api_keys").insert({ workspace_id: p.ws, name: `Brand key: ${b.name}`.slice(0, 60), prefix: k.prefix, hash: k.hash, brand_id: b.id, partner: false });
  if (error) throw new Error(error.message);
  return Response.json({ key: k.key, prefix: k.prefix }, { status: 201 });
}

/** DELETE /api/partner/brands/:id/keys */
export async function revokeBrandKeys(p: Partner, id: string): Promise<Response> {
  const b = await own(p, id);
  if (b instanceof Response) return b;
  await revokeKeys(p, b.id);
  return new Response(null, { status: 204 });
}

/** The calendar month "2026-11" as its first day and the next month's, in UTC. Null when it is not a month. */
export function monthRange(month: string): { from: string; to: string } | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  return { from: new Date(Date.UTC(y, mo - 1, 1)).toISOString(), to: new Date(Date.UTC(y, mo, 1)).toISOString() };
}

/**
 * GET /api/partner/brands/:id/usage?month=YYYY-MM (default this month, UTC).
 * tasks: tasks its brand keys used on the MCP server (brand_usage). checks: AI visibility checks run for it.
 * answers: AI answers those checks read. prompts: prompts it tracks now. Daily checks never cost tasks.
 */
export async function brandUsage(p: Partner, id: string, month: string | null): Promise<Response> {
  const b = await own(p, id);
  if (b instanceof Response) return b;
  const m = month || new Date().toISOString().slice(0, 7);
  const range = monthRange(m);
  if (!range) return perr(422, "invalid", "Send month as YYYY-MM, like 2026-11.");
  const [tasks, checks, answers] = await Promise.all([
    p.db.from("brand_usage").select("tasks").eq("brand_id", b.id).eq("period", m).maybeSingle(),
    p.db.from("runs").select("id", { count: "exact", head: true }).eq("brand_id", b.id).gte("at", range.from).lt("at", range.to),
    p.db.from("answers").select("id", { count: "exact", head: true }).eq("brand_id", b.id).gte("at", range.from).lt("at", range.to),
  ]);
  return Response.json({
    brand_id: b.id,
    external_id: b.external_id,
    month: m,
    tasks: Number((tasks.data as { tasks?: number } | null)?.tasks ?? 0),
    checks: checks.count ?? 0,
    answers: answers.count ?? 0,
    prompts: b.prompts?.length ?? 0,
  });
}
