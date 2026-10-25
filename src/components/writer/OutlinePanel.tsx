"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import { cleanVoice, type BrandVoice } from "@/lib/brandVoice";
import { DEFAULT_SAMPLE, HOUSE_RULES } from "@/lib/houseRules";
import type { RunAuth } from "@/lib/runner";
import { IMAGE_KIND_LABEL } from "@/lib/writerImageTypes";
import { getBrief, type FullBrief } from "@/lib/writerLibrary";
import { post } from "../research/shared";
import { Close } from "../Icons";
import { Seg, SidePanel } from "../ui";
import { BriefEditor } from "./BriefEditor";

// The outline in the right sidebar (docs/agentic-writing.md, section 2): the outline editor, the examples the article
// features, the images the draft will make and the voice it writes in. Once the outline is ready, Write draft sits on
// top as the panel's one primary action.

type Tab = "outline" | "examples" | "images" | "voice";

export function OutlinePanel({
  sb,
  auth,
  briefId,
  brandId,
  canEdit,
  onClose,
  onWriteDraft,
}: {
  sb: SupabaseClient;
  auth: RunAuth;
  briefId: string;
  brandId: string | null;
  canEdit: boolean;
  onClose: () => void;
  /** Start the draft. The panel saves the outline first. */
  onWriteDraft: () => Promise<boolean>;
}) {
  const [tab, setTab] = useState<Tab>("outline");
  const [row, setRow] = useState<FullBrief | null>(null);
  const [voice, setVoice] = useState<{ voice: BrandVoice | null; sample: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const flushRef = useRef<(() => Promise<boolean>) | null>(null);

  useEffect(() => {
    let live = true;
    getBrief(sb, briefId)
      .then((r) => live && setRow(r))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [sb, briefId, tab]);
  useEffect(() => {
    if (!brandId) return;
    let live = true;
    sb.from("brand_voices")
      .select("voice, sample_text")
      .eq("brand_id", brandId)
      .maybeSingle()
      .then(({ data }) => {
        if (!live) return;
        const v = data as { voice: unknown; sample_text: string | null } | null;
        setVoice({ voice: v?.voice ? cleanVoice(v.voice) : null, sample: v?.sample_text ?? "" });
      });
    return () => {
      live = false;
    };
  }, [sb, brandId]);

  async function writeDraft() {
    setBusy(true);
    try {
      if (flushRef.current && !(await flushRef.current())) return;
      if (await onWriteDraft()) onClose();
    } finally {
      setBusy(false);
    }
  }

  const b = row?.brief ?? null;
  const ready = row?.status === "ready" || row?.status === "approved";

  /** Take one image out of the plan. The outline saves it like any other edit. */
  async function removeImage(i: number) {
    if (!row?.brief) return;
    const brief = { ...row.brief, images: (row.brief.images ?? []).filter((_, k) => k !== i) };
    setRow({ ...row, brief });
    try {
      await post(auth, "/api/agentic-writer", { action: "save", briefId, brief });
    } catch {
      setRow(await getBrief(sb, briefId).catch(() => row));
    }
  }
  return (
    <SidePanel title={b?.h1 || row?.keyword || "Outline"} kicker="Outline" onClose={onClose}>
      <div className="flex min-h-full flex-col gap-4">
        {canEdit && ready ? (
          <button type="button" className="aw-btn aw-btn--primary self-start" disabled={busy} onClick={() => void writeDraft()}>
            {busy ? "Starting..." : "Write draft"}
          </button>
        ) : null}
        <Seg
          label="Outline"
          value={tab}
          onChange={setTab}
          options={[
            { id: "outline", label: "Outline" },
            { id: "examples", label: "Examples" },
            { id: "images", label: "Images" },
            { id: "voice", label: "Voice" },
          ]}
        />
        <div className="flex-1">
          <div className={tab === "outline" ? "" : "hidden"}>
            <BriefEditor sb={sb} auth={auth} id={briefId} canEdit={canEdit} compact flushRef={flushRef} onBack={onClose} onDraft={() => onClose()} />
          </div>
          {tab === "examples" ? <Examples brief={b} /> : null}
          {tab === "images" ? <Images brief={b} canEdit={canEdit && ready} onRemove={(i) => void removeImage(i)} /> : null}
          {tab === "voice" ? <Voice voice={voice} /> : null}
        </div>
      </div>
    </SidePanel>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="border border-dashed border-rule px-4 py-6 text-center text-[13px] text-muted">{text}</p>;
}

function Examples({ brief }: { brief: FullBrief["brief"] }) {
  const list = brief?.examples ?? [];
  if (!list.length) return <Empty text="No examples" />;
  return (
    <ul className="flex flex-col gap-3">
      {list.map((x, i) => (
        <li key={`${x.url}-${i}`} className="aw-frame flex flex-col gap-1.5 bg-white p-4">
          <span className="flex flex-wrap items-baseline gap-2">
            <span className="text-[14px] font-medium text-ink">{x.name}</span>
            {x.kind ? <span className="tw-tag">{x.kind}</span> : null}
          </span>
          {x.url ? (
            <a href={x.url} target="_blank" rel="noopener noreferrer" className="truncate text-[12px]">
              {x.url}
            </a>
          ) : null}
          {x.opener ? <p className="text-[13px] text-body">{x.opener}</p> : null}
          {x.facts.length ? (
            <ul className="list-disc pl-5 text-[13px] text-body">
              {x.facts.map((f, k) => (
                <li key={k}>{f}</li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function Images({ brief, canEdit, onRemove }: { brief: FullBrief["brief"]; canEdit: boolean; onRemove: (i: number) => void }) {
  const list = brief?.images ?? [];
  if (!list.length) return <Empty text="No images" />;
  return (
    <ul className="flex flex-col gap-3">
      {list.map((m, i) => (
        <li key={`${m.placement}-${m.kind ?? ""}-${m.url ?? ""}-${i}`} className="aw-frame flex flex-col gap-1 bg-white p-4">
          <span className="flex flex-wrap items-baseline gap-2">
            <span className="tw-tag">{m.kind ? IMAGE_KIND_LABEL[m.kind] : "Image"}</span>
            <span className="text-[12px] text-muted">{m.placement === "intro" ? "Intro" : m.placement}</span>
            {canEdit ? (
              <button type="button" className="aw-iconbtn ml-auto" title="Delete" aria-label="Delete" onClick={() => onRemove(i)}>
                <Close size={15} />
              </button>
            ) : null}
          </span>
          <p className="text-[13px] text-ink">{m.shows}</p>
          {m.url ? (
            <a href={m.url} target="_blank" rel="noopener noreferrer" className="truncate text-[12px]">
              {m.url}
            </a>
          ) : null}
          {m.alt ? <p className="text-[12px] text-muted">Alt: {m.alt}</p> : null}
        </li>
      ))}
    </ul>
  );
}

function Voice({ voice }: { voice: { voice: BrandVoice | null; sample: string } | null }) {
  const v = voice?.voice;
  return (
    <div className="flex flex-col gap-4">
      <section className="aw-frame flex flex-col gap-2 bg-white p-4 text-[13px]">
        <h3 className="aw-h4">Brand Voice</h3>
        {v ? (
          <>
            {v.tone.length ? <p className="text-body">Tone: {v.tone.join(", ")}</p> : null}
            {v.sentences ? <p className="text-body">Sentences: {v.sentences}</p> : null}
            {v.reader ? <p className="text-body">Reader: {v.reader}</p> : null}
          </>
        ) : (
          <p className="text-muted">Set with the first outline</p>
        )}
        <Sample text={(voice?.sample ?? "").trim().length >= 300 ? voice!.sample : DEFAULT_SAMPLE} />
      </section>
      <section className="aw-frame flex flex-col gap-2 bg-white p-4 text-[13px]">
        <h3 className="aw-h4">House rules</h3>
        <ul className="list-disc pl-5 text-body">
          {HOUSE_RULES.map((r) => (
            <li key={r.id}>{r.label}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Sample({ text }: { text: string }) {
  return (
    <p className="border-l-2 border-rule pl-3 whitespace-pre-line text-muted">
      {text.slice(0, 600)}
      {text.length > 600 ? "…" : ""}
    </p>
  );
}
