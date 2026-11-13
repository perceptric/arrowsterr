import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { askClaude, askJson } from "./claude";
import { readPersonaSources } from "./writerPersonaRead";
import {
  cleanPersona,
  fixSamplePrompt,
  MIN_POSTS,
  PERSONA_SCHEMA,
  personaMarkdown,
  personaPageName,
  personaPrompt,
  personaVoice,
  sampleProblems,
  voiceStats,
  type SourceKind,
  type VoiceStats,
  type WriterPersona,
} from "./writerPersona";

// The writer persona at onboarding (docs/zippie-skills-plan.md, section 4): read the brand's own pages and posts,
// measure the posts in code, ask Claude once, check the sample paragraph, and save it all where the writer and
// Zippie read it. Nothing about the brand is invented: proof must quote the site (writerPersona.ts).

export type BuiltPersona = { persona: WriterPersona; stats: VoiceStats; sources: { url: string; kind: SourceKind; title: string }[]; noBlog: boolean; postText: string };

/** Build the persona: one Claude call, then one short call to fix the sample paragraph only if it breaks a rule. */
export async function buildPersona(brand: { name: string; domain: string }, added: { urls?: string[]; text?: string } = {}): Promise<BuiltPersona> {
  const domain = brand.domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
  const { sources, posts, postText } = await readPersonaSources(domain, added);
  if (!sources.length) throw new Error(`Could not read ${domain}. Check the site is online and does not block bots.`);
  const stats = voiceStats(posts);
  const out = await askJson<Record<string, unknown>>(personaPrompt({ name: brand.name, domain }, sources, stats), PERSONA_SCHEMA, { maxTokens: 4000 });
  const persona = cleanPersona(out, sources);
  const problems = sampleProblems(persona.sample, sources);
  if (problems.length) {
    const fixed = await askClaude(fixSamplePrompt(persona, problems), { maxTokens: 800 })
      .then((r) => r.text.trim())
      .catch(() => "");
    if (fixed && sampleProblems(fixed, sources).length < problems.length) persona.sample = fixed.slice(0, 1500);
  }
  return {
    persona,
    stats,
    sources: sources.map((s) => ({ url: s.url, kind: s.kind, title: s.title })),
    noBlog: stats.posts < MIN_POSTS,
    postText: stats.posts ? postText : "",
  };
}

/**
 * Save an approved persona: its voice and the persona on brand_voices, the brand's real writing as the voice sample
 * when it has none, and the Knowledge page "Persona: {Brand} writer" (replaced when it exists).
 * db is the person's own client, so their access applies to the voice. Knowledge pages are written only by the
 * server (admin), after the route has checked the person is an editor.
 */
export async function savePersona(
  db: SupabaseClient,
  admin: SupabaseClient,
  brand: { id: string; workspace_id: string; name: string },
  input: { persona: WriterPersona; stats: VoiceStats | null; postText?: string },
  userId: string | null,
): Promise<{ knowledgeId: string | null }> {
  const now = new Date().toISOString();
  const { data: old } = await db.from("brand_voices").select("sample_text").eq("brand_id", brand.id).maybeSingle();
  const keepSample = ((old as { sample_text?: string } | null)?.sample_text ?? "").trim().length >= 300;
  const row = {
    brand_id: brand.id,
    workspace_id: brand.workspace_id,
    voice: personaVoice(input.persona),
    persona: input.persona,
    persona_stats: input.stats,
    persona_at: now,
    distilled_at: now,
    updated_at: now,
    ...(!keepSample && (input.postText ?? "").trim().length >= 300 ? { sample_text: input.postText!.slice(0, 9000) } : {}),
  };
  const { error } = await db.from("brand_voices").upsert(row, { onConflict: "brand_id" });
  if (error) throw new Error(/persona/.test(error.message) ? "Run supabase/087_writer_persona.sql first." : error.message);

  const name = personaPageName(brand);
  const content = personaMarkdown(brand, input.persona, input.stats);
  const { data: page } = await admin.from("ask_knowledge").select("id").eq("workspace_id", brand.workspace_id).eq("name", name).is("project_id", null).limit(1).maybeSingle();
  const k = page
    ? await admin.from("ask_knowledge").update({ content, chars: content.length, updated_at: now }).eq("id", (page as { id: string }).id).select("id").single()
    : await admin.from("ask_knowledge").insert({ workspace_id: brand.workspace_id, kind: "note", name, source: "", content, chars: content.length, scope: "workspace", owner_id: userId, created_by: userId }).select("id").single();
  // Knowledge is a bonus: the voice is saved even when the Knowledge table isn't set up.
  return { knowledgeId: k.error ? null : ((k.data as { id: string } | null)?.id ?? null) };
}
