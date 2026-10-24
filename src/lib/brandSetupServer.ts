import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { kitForBrand } from "./brandGuidelines";
import { cleanKit } from "./brandKit";
import { learnKit } from "./brandKitServer";
import { defaultVoice, fallbackGuidelines, guidelinesBody, guidelinesPrompt, GUIDELINES_SCHEMA } from "./brandSetup";
import { askJson } from "./claude";
import { readBrand } from "./guideline";

// Fills in a brand's Brand Kit, guidelines and voice the first time Agentic Writing needs them (brandSetup.ts).
// What a person already saved is never changed. Each part that can't be learned gets a plain default, so writing
// always starts.

const checked = new Map<string, number>(); // brand id -> when it was last found complete, in this process
const FRESH_MS = 10 * 60_000;

/** Make sure the brand has a kit, guidelines and a voice. Returns the parts it made. */
export async function ensureBrandSetup(db: SupabaseClient, brandId: string | null): Promise<string[]> {
  if (!brandId || Date.now() - (checked.get(brandId) ?? 0) < FRESH_MS) return [];
  const { data: brand } = await db.from("brands").select("id, workspace_id, name, domain").eq("id", brandId).maybeSingle();
  if (!brand) return [];
  const b = brand as { id: string; workspace_id: string; name: string; domain: string };
  const domain = b.domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const [voice, kits, count, guide] = await Promise.all([
    db.from("brand_voices").select("voice").eq("brand_id", b.id).maybeSingle(),
    db.from("brand_kits").select("key, website, kit").eq("workspace_id", b.workspace_id).in("key", [b.id, "workspace"]),
    db.from("brands").select("id", { count: "exact", head: true }).eq("workspace_id", b.workspace_id),
    db.from("brand_guidelines").select("body, links").eq("brand_id", b.id).maybeSingle(),
  ]);
  // A missing table means its migration hasn't run: leave that part alone.
  const made: string[] = [];
  const now = new Date().toISOString();

  if (!kits.error && !kitForBrand((kits.data ?? []) as { key: string; website: string | null; kit: unknown }[], { id: b.id, domain }, count.count ?? 1)) {
    const kit = await learnKit(domain, () => {})
      .then((r) => r.kit)
      .catch(() => cleanKit({ name: b.name }));
    const { error } = await db.from("brand_kits").upsert({ workspace_id: b.workspace_id, key: b.id, brand_id: b.id, website: domain, kit, learned_at: now, updated_by: null }, { onConflict: "workspace_id,key", ignoreDuplicates: true });
    if (!error) made.push("Brand Kit");
  }

  let reader = "";
  const g = guide.data as { body: string; links: string[] } | null;
  if (!guide.error && !(g && (g.body.trim() || g.links.length))) {
    let body = fallbackGuidelines({ name: b.name, domain });
    try {
      const page = await readBrand(domain);
      const out = await askJson<Record<string, unknown>>(guidelinesPrompt({ name: b.name, domain }, page), GUIDELINES_SCHEMA, { maxTokens: 1500 });
      ({ body, reader } = guidelinesBody({ name: b.name, domain }, out));
    } catch {
      // The homepage couldn't be read: the short default lets writing start, and a person can add more later.
    }
    const { error } = await db.from("brand_guidelines").upsert({ brand_id: b.id, workspace_id: b.workspace_id, body, updated_by: null, updated_at: now }, { onConflict: "brand_id", ignoreDuplicates: true });
    if (!error) made.push("Brand Guidelines");
  }

  if (!voice.error && !(voice.data as { voice: unknown } | null)?.voice) {
    const v = defaultVoice({ name: b.name }, reader);
    const { error } = voice.data
      ? await db.from("brand_voices").update({ voice: v, distilled_at: now, updated_by: null, updated_at: now }).eq("brand_id", b.id).is("voice", null)
      : await db.from("brand_voices").upsert({ brand_id: b.id, workspace_id: b.workspace_id, voice: v, distilled_at: now, updated_by: null, updated_at: now }, { onConflict: "brand_id", ignoreDuplicates: true });
    if (!error) made.push("Brand Voice");
  }

  checked.set(b.id, Date.now());
  return made;
}
