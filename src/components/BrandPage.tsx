"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";
import { kitRowForBrand } from "@/lib/brandGuidelines";
import { guidelinesSavedAt, kitSavedAt, savedLine, sectionOf, voiceSavedAt, type BrandSection } from "@/lib/brandStatus";
import type { VoiceRow } from "@/lib/brandVoice";
import type { RunAuth } from "@/lib/runner";
import { BrandGuidelines } from "./BrandGuidelines";
import { BrandKitPanel } from "./BrandKit";
import { BrandVoiceSettings } from "./BrandVoice";
import { post } from "./research/shared";

const SECTIONS: { id: BrandSection; label: string }[] = [
  { id: "voice", label: "Tone of voice" },
  { id: "kit", label: "Brand Kit" },
  { id: "guidelines", label: "Guidelines" },
];

/** When each section was saved: undefined while it loads, null when it isn't set. */
type Saved = Record<BrandSection, string | null | undefined>;

/**
 * Brand (docs/content-v2.md): everything the Agentic Writer writes from, for the brand on screen. Tone of voice,
 * the Brand Kit and written guidelines, one section at a time beside a sub-nav that says what each one holds.
 * Each section has its own address (/brand, /brand/kit, /brand/guidelines). The writer reads all three through
 * loadBrandContext in src/lib/brandContext.ts.
 */
export function BrandPage({ sb, auth, brand, brandCount, canEdit, sub, onSub }: { sb: SupabaseClient; auth: RunAuth; brand: { id: string; name: string; domain: string }; brandCount: number; canEdit: boolean; sub?: string; onSub?: (sub?: string) => void }) {
  // Without onSub the section stays local to this visit.
  const [own, setOwn] = useState<BrandSection>("voice");
  const section = onSub ? sectionOf(sub) : own;
  const setSection = (s: BrandSection) => {
    if (onSub) onSub(s === "voice" ? undefined : s);
    else setOwn(s);
  };
  const [saved, setSaved] = useState<Saved>({ voice: undefined, kit: undefined, guidelines: undefined });
  const mark = useCallback((s: BrandSection, at: string | null) => setSaved((x) => ({ ...x, [s]: at })), []);

  // Each section's saved date for the side list, read once per brand. A section reports its own saves.
  const { id: brandId, domain } = brand;
  useEffect(() => {
    let live = true;
    const b = { id: brandId, domain };
    post<{ row: VoiceRow | null }>(auth, "/api/brand-voice", { action: "get", brandId })
      .then((r) => live && mark("voice", voiceSavedAt(r.row)))
      .catch(() => live && mark("voice", null));
    sb.from("brand_kits")
      .select("key, website, learned_at, confirmed_at")
      .eq("workspace_id", auth.workspaceId)
      .then(({ data }) => live && mark("kit", kitSavedAt(kitRowForBrand((data ?? []) as { key: string; website: string | null; learned_at: string | null; confirmed_at: string | null }[], b, brandCount))));
    sb.from("brand_guidelines")
      .select("body, links, files, updated_at")
      .eq("brand_id", brandId)
      .maybeSingle()
      .then(({ data }) => {
        const r = data as { body: string | null; links: string[] | null; files: unknown[] | null; updated_at: string | null } | null;
        if (live) mark("guidelines", guidelinesSavedAt(r ? { body: r.body ?? "", links: r.links ?? [], files: r.files ?? [], updated_at: r.updated_at } : null));
      });
    return () => {
      live = false;
    };
  }, [sb, auth, brandId, domain, brandCount, mark]);

  return (
    <div className="flex flex-col gap-6 md:flex-row md:gap-10">
      <nav className="flex shrink-0 flex-col gap-4 md:sticky md:top-6 md:w-52 md:self-start" aria-label="Brand">
        <h1 className="aw-h2 mb-0!">Brand</h1>
        <div className="flex flex-col gap-0.5">
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" aria-current={section === s.id ? "page" : undefined} onClick={() => setSection(s.id)} className={`aw-mod__item flex flex-col items-start text-left ${section === s.id ? "is-on" : ""}`}>
              {s.label}
              <span className="aw-small">{savedLine(saved[s.id])}</span>
            </button>
          ))}
        </div>
      </nav>
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <h2 className="aw-h3 mb-0!">{SECTIONS.find((s) => s.id === section)?.label}</h2>
        {section === "voice" ? (
          <BrandVoiceSettings key={brand.id} auth={auth} brand={brand} canEdit={canEdit} onSaved={(at) => mark("voice", at)} />
        ) : section === "kit" ? (
          <BrandKitPanel key={brand.id} sb={sb} auth={auth} canEdit={canEdit} brand={brand} brandCount={brandCount} onSaved={(at) => mark("kit", at)} onVoice={() => setSection("voice")} />
        ) : (
          <BrandGuidelines key={brand.id} sb={sb} workspaceId={auth.workspaceId} brand={brand} canEdit={canEdit} onSaved={(at) => mark("guidelines", at)} />
        )}
      </div>
    </div>
  );
}
