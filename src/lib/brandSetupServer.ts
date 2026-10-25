import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { kitForBrand } from "./brandGuidelines";
import { cleanKit, type BrandKit } from "./brandKit";
import { learnKit } from "./brandKitServer";
import { BRAND_SYSTEM, defaultVoice, fallbackGuidelines, guidelinesBody, guidelinesPrompt, GUIDELINES_SCHEMA, voicePages, voiceSample, type GuideInput } from "./brandSetup";
import { cleanVoice, distillPrompt, VOICE_SCHEMA, type BrandVoice } from "./brandVoice";
import { readSample } from "./brandVoiceServer";
import { askJson } from "./claude";
import { readBrand } from "./guideline";
import { findPages } from "./sitemap";

// Learns a brand's Brand Kit, voice and guidelines from its own site (brandSetup.ts). The onboarding job runs it as
// soon as a brand is added, and Agentic Writing runs it again before writing in case that job hasn't finished.
// What a person already saved is never changed. Each part that can't be learned gets a plain default, so writing
// always starts.

const checked = new Map<string, number>(); // brand id -> when it was last found complete, in this process
const FRESH_MS = 10 * 60_000;

const within = <T>(p: Promise<T>, ms: number, fallback: T) => Promise.race([p.catch(() => fallback), new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);

/** The voice made by the old setup (the default voice with the brand's name), which nobody has edited. */
function untouchedDefault(v: BrandVoice, name: string) {
  const d = defaultVoice({ name });
  return JSON.stringify([v.tone, v.sentences, v.use, v.avoid]) === JSON.stringify([d.tone, d.sentences, d.use, d.avoid]);
}

/** Read the brand's homepage, about page and articles, and learn its voice from them. Null when nothing could be read. */
async function learnVoice(brand: { name: string; domain: string }, kit: BrandKit | null, urls: string[]) {
  const list = urls.length ? urls.map((url) => ({ url, article: true })) : (await within(findPages(brand.domain), 30_000, { source: null, pages: [] })).pages;
  const picked = urls.length ? urls : voicePages(list, brand.domain);
  const articles = new Set(list.filter((p) => p.article).map((p) => p.url));
  const read = (await Promise.all(picked.map(readSample))).filter((r) => r.text).map((r) => ({ url: r.url, text: r.text.slice(0, 6000), article: articles.has(r.url) }));
  if (!read.length) return null;
  const out = await askJson<Record<string, unknown>>(distillPrompt(brand, read.map((r) => ({ source: r.url, text: r.text })), kit), VOICE_SCHEMA, { system: BRAND_SYSTEM, maxTokens: 1500 });
  const voice = cleanVoice(out);
  if (!voice.tone.length) return null;
  return { voice, urls: read.map((r) => r.url), sample: voiceSample(read), read };
}

/** Make sure the brand has a kit, a voice and guidelines. Returns the parts it made. */
export async function ensureBrandSetup(db: SupabaseClient, brandId: string | null): Promise<string[]> {
  if (!brandId || Date.now() - (checked.get(brandId) ?? 0) < FRESH_MS) return [];
  const { data: brand } = await db.from("brands").select("id, workspace_id, name, domain").eq("id", brandId).maybeSingle();
  if (!brand) return [];
  const b = brand as { id: string; workspace_id: string; name: string; domain: string };
  const domain = b.domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const [voiceRow, kits, count, guide] = await Promise.all([
    db.from("brand_voices").select("voice, sample_urls, sample_text").eq("brand_id", b.id).maybeSingle(),
    db.from("brand_kits").select("key, website, kit").eq("workspace_id", b.workspace_id).in("key", [b.id, "workspace"]),
    db.from("brands").select("id", { count: "exact", head: true }).eq("workspace_id", b.workspace_id),
    db.from("brand_guidelines").select("body, links").eq("brand_id", b.id).maybeSingle(),
  ]);
  // A missing table means its migration hasn't run: leave that part alone.
  const made: string[] = [];
  const now = new Date().toISOString();

  // 1. Brand Kit: colors, fonts and logo from the site's CSS.
  const rows = (kits.data ?? []) as { key: string; website: string | null; kit: unknown }[];
  const had = kitForBrand(rows, { id: b.id, domain }, count.count ?? 1);
  let kit: BrandKit | null = had;
  if (!kits.error && !had) {
    kit = await learnKit(domain, () => {})
      .then((r) => r.kit)
      .catch(() => cleanKit({ name: b.name }));
    const { error } = await db.from("brand_kits").upsert({ workspace_id: b.workspace_id, key: b.id, brand_id: b.id, website: domain, kit, learned_at: now, updated_by: null }, { onConflict: "workspace_id,key", ignoreDuplicates: true });
    if (!error) made.push("Brand Kit");
  }

  // 2. Brand Voice: learned from the brand's own pages. Its best article becomes the sample the writer copies.
  const vr = voiceRow.data as { voice: BrandVoice | null; sample_urls: string[] | null; sample_text: string | null } | null;
  const sampleUrls = vr?.sample_urls ?? [];
  let voice = vr?.voice ? cleanVoice(vr.voice) : null;
  let read: GuideInput["samples"] = [];
  const relearn = Boolean(voice && !sampleUrls.length && !vr?.sample_text?.trim() && untouchedDefault(voice, b.name));
  if (!voiceRow.error && (!voice || relearn)) {
    const learned = await learnVoice({ name: b.name, domain }, kit, sampleUrls).catch((e) => {
      console.error(`Brand voice for ${domain} failed:`, e instanceof Error ? e.message : e);
      return null;
    });
    const v = learned?.voice ?? voice ?? defaultVoice({ name: b.name });
    read = learned?.read ?? [];
    const fields = { voice: v, distilled_at: now, updated_at: now, ...(learned ? { sample_urls: learned.urls, sample_text: learned.sample } : {}) };
    // Only fill a row nobody filled: an empty voice, or the old default nobody edited.
    const same = db.from("brand_voices").update(fields).eq("brand_id", b.id);
    const { error } = vr
      ? await (vr.voice ? same.eq("voice", JSON.stringify(vr.voice)) : same.is("voice", null))
      : await db.from("brand_voices").upsert({ brand_id: b.id, workspace_id: b.workspace_id, updated_by: null, ...fields }, { onConflict: "brand_id", ignoreDuplicates: true });
    if (!error && (learned || !voice)) made.push("Brand Voice");
    voice = v;
  }

  // 3. Brand Guidelines: written from the homepage, the pages read for the voice, the voice and the kit.
  const g = guide.data as { body: string; links: string[] } | null;
  const blank = !(g && (g.body.trim() || g.links.length)) || g.body.trim() === fallbackGuidelines({ name: b.name, domain });
  if (!guide.error && blank) {
    const more: GuideInput = { voice, kit, samples: read.filter((r) => !/^https?:\/\/[^/]+\/?$/.test(r.url)) };
    let body = fallbackGuidelines({ name: b.name, domain });
    try {
      const page = await readBrand(domain);
      const out = await askJson<Record<string, unknown>>(guidelinesPrompt({ name: b.name, domain }, page, more), GUIDELINES_SCHEMA, { system: BRAND_SYSTEM, maxTokens: 2500 });
      ({ body } = guidelinesBody({ name: b.name, domain }, out, more, `Written by Zippie from ${domain} on ${now.slice(0, 10)}. Edit anything that's off.`));
    } catch {
      // The homepage couldn't be read: the short default lets writing start, and a person can add more later.
    }
    const row = { brand_id: b.id, workspace_id: b.workspace_id, body, updated_at: now };
    const { error } = g
      ? await db.from("brand_guidelines").update(row).eq("brand_id", b.id).eq("body", g.body)
      : await db.from("brand_guidelines").upsert({ ...row, updated_by: null }, { onConflict: "brand_id", ignoreDuplicates: true });
    if (!error) made.push("Brand Guidelines");
  }

  checked.set(b.id, Date.now());
  return made;
}
