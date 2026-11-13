import { take } from "@/lib/entitlements";
import { meteredRoute } from "@/lib/meter";
import { TASK_COST } from "@/lib/plans";
import { adminClient, requireRole, takeAnswer } from "@/lib/serverAuth";
import { cleanPersona, cleanStats } from "@/lib/writerPersona";
import { buildPersona, savePersona } from "@/lib/writerPersonaServer";

const err = (error: string, status = 400) => Response.json({ error }, { status });
const SETUP = "Run supabase/087_writer_persona.sql first.";

// The writer persona (docs/zippie-skills-plan.md, section 4).
//   build: { domain, name, urls?, text? }            editors: read the site and build the persona. Nothing is saved yet,
//                                                    so onboarding can start it before the brand exists.
//   save: { brandId, persona, stats?, postText? }    editors: save what the person approved, and its Knowledge page.
//   get: { brandId }                                 viewers: the saved persona, or null.
async function handle(request: Request) {
  const body = await request.json().catch(() => ({}));
  const auth = await requireRole(request, body.workspaceId, body.action === "get" ? "viewer" : "editor");
  if ("denied" in auth) return auth.denied;
  const ws = String(body.workspaceId);

  if (body.action === "build") {
    const domain = String(body.domain ?? "")
      .trim()
      .replace(/^https?:\/\//i, "")
      .replace(/\/.*$/, "")
      .toLowerCase();
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) return err("Add the brand's website.");
    const name = String(body.name ?? "").trim().slice(0, 120) || domain;
    if (!process.env.ANTHROPIC_API_KEY) return err("ANTHROPIC_API_KEY is not set on the server.", 500);
    const limited = await takeAnswer(auth.sb, ws);
    if (limited) return limited;
    const took = await take(ws, "tasks", TASK_COST.guideline);
    if (!took.ok) return took.response;
    const urls = (Array.isArray(body.urls) ? body.urls : []).map((u: unknown) => String(u).trim()).filter((u: string) => /^https?:\/\/[^\s]+$/i.test(u)).slice(0, 3);
    const text = String(body.text ?? "").slice(0, 12_000);
    try {
      return Response.json(await buildPersona({ name, domain }, { urls, text }));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("Writer persona failed:", message);
      return err(message, 502);
    }
  }

  const { data: brand } = await auth.sb.from("brands").select("id, workspace_id, name").eq("id", String(body.brandId ?? "")).eq("workspace_id", ws).maybeSingle();
  if (!brand) return err("That brand is not in this workspace.", 404);

  if (body.action === "get") {
    const { data, error } = await auth.sb.from("brand_voices").select("persona, persona_stats, persona_at").eq("brand_id", brand.id).maybeSingle();
    if (error && /persona/.test(error.message)) return Response.json({ persona: null, setup: SETUP });
    if (error) return err(error.message, 500);
    const row = data as { persona: unknown; persona_stats: unknown; persona_at: string | null } | null;
    return Response.json({ persona: row?.persona ? cleanPersona(row.persona, null) : null, stats: cleanStats(row?.persona_stats), at: row?.persona_at ?? null });
  }

  if (body.action === "save") {
    const persona = cleanPersona(body.persona, null);
    if (!persona.tone.length || !persona.reader) return err("Add the tone and the reader.");
    const admin = adminClient();
    if (!admin) return err("SUPABASE_SECRET_KEY is not set on the server.", 500);
    const { data: who } = await auth.sb.auth.getUser();
    try {
      const out = await savePersona(auth.sb, admin, brand as { id: string; workspace_id: string; name: string }, { persona, stats: cleanStats(body.stats), postText: String(body.postText ?? "") }, who.user?.id ?? null);
      return Response.json({ ok: true, ...out });
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e), 500);
    }
  }

  return err("Unknown action.");
}

export const POST = meteredRoute("writer persona", handle);
