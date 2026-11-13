import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import * as cheerio from "cheerio";
import { skillsOf } from "@/lib/ask";
import { filesProblems, MAIN } from "@/lib/skills/format";
import { SYSTEM_SKILLS } from "@/lib/skills/system";
import { adminClient, requireRole } from "@/lib/serverAuth";

export const maxDuration = 60;

const str = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const err = (error: string, status = 400) => Response.json({ error }, { status });
const MAX_CHARS = 400_000;
const SETUP = "Run supabase/037_zippie.sql and 086_zippie_skills.sql in Supabase to turn on Knowledge and skills.";

/** Block addresses inside private networks, so a pasted link can't reach the server's own network. */
function privateIp(ip: string): boolean {
  if (isIP(ip) === 6) return ip === "::1" || /^f[cd]/i.test(ip) || /^fe80/i.test(ip) || (ip.startsWith("::ffff:") && privateIp(ip.slice(7)));
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

async function readUrl(raw: string): Promise<{ name: string; text: string }> {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new Error("That doesn't look like a link.");
  }
  // Follow redirects by hand, checking each address.
  let res: Response | null = null;
  for (let hop = 0; hop < 4; hop++) {
    if (!/^https?:$/.test(url.protocol)) throw new Error("Only web links work here.");
    const { address } = await lookup(url.hostname).catch(() => ({ address: "" }));
    if (!address || privateIp(address)) throw new Error("Can't read that address.");
    res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; ArrowsterrBot/1.0; +https://arrowsterr.com/)" }, redirect: "manual", signal: AbortSignal.timeout(15_000) });
    const next = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!next) break;
    url = new URL(next, url);
  }
  if (!res || !res.ok) throw new Error(`That page answered ${res?.status ?? "nothing"}.`);
  const html = (await res.text()).slice(0, 3_000_000);
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, nav, footer, header, form, iframe").remove();
  const name = $("title").first().text().trim() || url.hostname + url.pathname;
  const text = ($("main").text() || $("body").text()).replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();
  return { name, text };
}

async function readPdf(base64: string): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(Buffer.from(base64, "base64")));
  const { text } = await extractText(pdf, { mergePages: true });
  return String(text).replace(/[ \t]+/g, " ").trim();
}

// Zippie's library: Knowledge that teaches him and skills that tell him how to do a job (docs/zippie-skills-plan.md).
// Both come in Workspace (the team's) and Personal (only yours) scope. System skills live in code.
//   list: {}                                                                viewers
//   knowledge_get: { id }                                                   viewers
//   knowledge_add: { kind: file|url|note, name, content?, pdf?, url?, scope? }   editors
//   knowledge_save: { id?, name, content, scope? }   knowledge_delete: { id }    editors
//   skill_save: { id?, files, scope? }   skill_delete: { id }                    editors
//   project_save: { id?, name, instructions }   project_delete: { id }           editors (older chats)
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const auth = await requireRole(request, body.workspaceId, body.action === "list" || body.action === "knowledge_get" ? "viewer" : "editor");
  if ("denied" in auth) return auth.denied;
  const db = adminClient();
  if (!db) return err("Add SUPABASE_SECRET_KEY to the server's settings.", 500);
  const ws = String(body.workspaceId);
  const { data: who } = await auth.sb.auth.getUser();
  const userId = who.user?.id ?? null;
  const missing = (e: { message: string } | null) => e && /ask_projects|ask_knowledge|ask_skills|project_id|scope|owner_id|files/.test(e.message);
  const me = userId ?? "";
  const scopeOf = (v: unknown) => (v === "personal" ? "personal" : "workspace");
  const KN = "id, kind, name, source, chars, project_id, scope, owner_id, created_at, updated_at";
  /** A Knowledge row this person may change: their own Personal one, or any Workspace one. */
  const ownKnowledge = async (id: unknown) => {
    const { data } = await db.from("ask_knowledge").select("id, scope, owner_id").eq("id", str(id, 60)).eq("workspace_id", ws).maybeSingle();
    return data && (data.scope !== "personal" || data.owner_id === me) ? data : null;
  };

  if (body.action === "list") {
    const knowledge = await db.from("ask_knowledge").select(KN).eq("workspace_id", ws).is("project_id", null).order("updated_at", { ascending: false });
    if (missing(knowledge.error)) return Response.json({ knowledge: [], skills: SYSTEM_SKILLS, me, setup: SETUP });
    if (knowledge.error) return err(knowledge.error.message, 500);
    const visible = (knowledge.data ?? []).filter((k) => k.scope !== "personal" || k.owner_id === me);
    return Response.json({ knowledge: visible, skills: await skillsOf(db, ws, me), me });
  }

  if (body.action === "knowledge_get") {
    const { data } = await db.from("ask_knowledge").select(`${KN}, content`).eq("id", str(body.id, 60)).eq("workspace_id", ws).maybeSingle();
    if (!data || (data.scope === "personal" && data.owner_id !== me)) return err("Page not found.", 404);
    return Response.json({ item: data });
  }

  if (body.action === "knowledge_save") {
    const name = str(body.name, 200) || "Untitled";
    const content = String(body.content ?? "").replace(/\u0000/g, "").slice(0, MAX_CHARS);
    const now = new Date().toISOString();
    if (body.id) {
      if (!(await ownKnowledge(body.id))) return err("Page not found.", 404);
      const { data, error } = await db.from("ask_knowledge").update({ name, content, chars: content.length, updated_at: now, ...(body.scope ? { scope: scopeOf(body.scope) } : {}) }).eq("id", str(body.id, 60)).select(KN).single();
      if (error) return err(error.message, 500);
      return Response.json({ item: data });
    }
    // replaces: a page from a chat card that takes the place of an older one with that title.
    if (body.replaces) {
      const { data: old } = await db.from("ask_knowledge").select("id, scope, owner_id").eq("workspace_id", ws).eq("name", str(body.replaces, 200)).limit(1).maybeSingle();
      if (old && (old.scope !== "personal" || old.owner_id === me)) {
        const { data, error } = await db.from("ask_knowledge").update({ name, content, chars: content.length, updated_at: now }).eq("id", old.id).select(KN).single();
        if (error) return err(error.message, 500);
        return Response.json({ item: data, replaced: true });
      }
    }
    const { data, error } = await db.from("ask_knowledge").insert({ workspace_id: ws, kind: "note", name, source: "", content, chars: content.length, scope: scopeOf(body.scope), owner_id: me || null, created_by: userId }).select(KN).single();
    if (missing(error)) return err(SETUP, 500);
    if (error) return err(error.message, 500);
    return Response.json({ item: data });
  }

  if (body.action === "project_save") {
    const name = str(body.name, 80);
    if (!name) return err("Name the project.");
    const row = { name, instructions: str(body.instructions, 8000), updated_at: new Date().toISOString() };
    const q = body.id
      ? db.from("ask_projects").update(row).eq("id", str(body.id, 60)).eq("workspace_id", ws)
      : db.from("ask_projects").insert({ ...row, workspace_id: ws, created_by: userId });
    const { data, error } = await q.select("id, name, instructions, updated_at").single();
    if (missing(error)) return err(SETUP, 500);
    if (error) return err(error.message, 500);
    return Response.json({ project: data });
  }

  if (body.action === "project_delete") {
    // Its chats stay, outside any project. Its knowledge goes with it.
    const { error } = await db.from("ask_projects").delete().eq("id", str(body.id, 60)).eq("workspace_id", ws);
    if (error) return err(error.message, 500);
    return Response.json({ ok: true });
  }

  if (body.action === "knowledge_add") {
    const kind = body.kind === "url" ? "url" : body.kind === "note" ? "note" : "file";
    let name = str(body.name, 200);
    let content = "";
    let source = "";
    try {
      if (kind === "url") {
        source = str(body.url, 2000);
        const page = await readUrl(source);
        name = name || page.name;
        content = page.text;
      } else if (kind === "file" && body.pdf) {
        if (String(body.pdf).length > 14_000_000) return err("That PDF is too big. Keep files under 10 MB.");
        content = await readPdf(String(body.pdf));
        source = name;
      } else {
        content = String(body.content ?? "");
        source = kind === "file" ? name : "";
      }
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
    content = content.replace(/\u0000/g, "").trim();
    if (!content) return err(kind === "file" ? "Couldn't find any text in that file." : "Add some text first.");
    if (!name) name = content.slice(0, 50);
    let projectId: string | null = null;
    if (body.projectId) {
      const { data: p } = await db.from("ask_projects").select("id").eq("id", str(body.projectId, 60)).eq("workspace_id", ws).maybeSingle();
      if (!p) return err("Project not found.", 404);
      projectId = p.id;
    }
    const { data, error } = await db
      .from("ask_knowledge")
      .insert({ workspace_id: ws, project_id: projectId, kind, name, source, content: content.slice(0, MAX_CHARS), chars: Math.min(content.length, MAX_CHARS), created_by: userId, scope: scopeOf(body.scope), owner_id: me || null })
      .select(KN)
      .single();
    if (missing(error)) return err(SETUP, 500);
    if (error) return err(error.message, 500);
    return Response.json({ item: data, cut: content.length > MAX_CHARS });
  }

  if (body.action === "knowledge_delete") {
    const ids = (Array.isArray(body.ids) ? body.ids : [body.id]).map((x: unknown) => str(x, 60)).filter(Boolean).slice(0, 200);
    const mine: string[] = [];
    for (const id of ids) if (await ownKnowledge(id)) mine.push(id);
    if (!mine.length) return err("Page not found.", 404);
    const { error } = await db.from("ask_knowledge").delete().in("id", mine).eq("workspace_id", ws);
    if (error) return err(error.message, 500);
    return Response.json({ ok: true });
  }

  if (body.action === "skill_save") {
    const raw = body.files && typeof body.files === "object" ? (body.files as Record<string, unknown>) : {};
    const files = Object.fromEntries(Object.entries(raw).filter(([k, v]) => typeof v === "string" && k.trim()).map(([k, v]) => [k.trim(), v as string]));
    const problems = filesProblems(files);
    if (problems.length) return err(problems[0]);
    const now = new Date().toISOString();
    if (body.id) {
      const { data: old } = await db.from("ask_skills").select("id, scope, owner_id").eq("id", str(body.id, 60)).eq("workspace_id", ws).is("builtin", null).maybeSingle();
      if (!old || (old.scope === "personal" && old.owner_id !== me)) return err("Skill not found.", 404);
      const { data, error } = await db.from("ask_skills").update({ files, updated_at: now, ...(body.scope ? { scope: scopeOf(body.scope) } : {}) }).eq("id", old.id).select("id").single();
      if (error) return err(error.message, 500);
      return Response.json({ id: data.id, skills: await skillsOf(db, ws, me) });
    }
    const { data, error } = await db.from("ask_skills").insert({ workspace_id: ws, scope: scopeOf(body.scope), owner_id: me || null, files, name: files[MAIN].match(/^# (.+)$/m)?.[1]?.slice(0, 80) ?? "", created_by: userId }).select("id").single();
    if (missing(error)) return err(SETUP, 500);
    if (error) return err(error.message, 500);
    return Response.json({ id: data.id, skills: await skillsOf(db, ws, me) });
  }

  if (body.action === "skill_delete") {
    const { data: old } = await db.from("ask_skills").select("id, scope, owner_id").eq("id", str(body.id, 60)).eq("workspace_id", ws).is("builtin", null).maybeSingle();
    if (!old || (old.scope === "personal" && old.owner_id !== me)) return err("Skill not found.", 404);
    const { error } = await db.from("ask_skills").delete().eq("id", old.id);
    if (error) return err(error.message, 500);
    return Response.json({ skills: await skillsOf(db, ws, me) });
  }

  return err("Unknown action.");
}
