"use client";

import { useEffect, useState } from "react";
import type { RunAuth } from "@/lib/runner";
import { type Proof, type VoiceStats, type WriterPersona } from "@/lib/writerPersona";
import { post } from "./research/shared";
import { Thinking } from "./ui";

// The writer persona card (docs/zippie-skills-plan.md, section 4): who writes, the reader, the voice, approved proof
// with its quotes, claims to never make, the CTA, open questions and a sample paragraph. Read it, or edit it.
// Onboarding's "Your writer" step and Brand > Tone of voice both show it.

export type Built = { persona: WriterPersona; stats: VoiceStats; noBlog: boolean; postText: string };

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
const terms = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-t border-rule-faint py-3.5 first:border-t-0 first:pt-0 last:pb-0 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-6">
      <span className="pt-0.5 text-[13px] text-muted">{label}</span>
      <div className="min-w-0 text-[14px] leading-relaxed text-ink wrap-break-word">{children}</div>
    </div>
  );
}

/** One group of the persona: a titled card. */
function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="aw-frame">
      <header className="aw-frame__head">
        <h2>{title}</h2>
        {note ? <span className="text-[13px] font-normal text-muted">{note}</span> : null}
      </header>
      <div className="aw-frame__body flex flex-col pt-1!">{children}</div>
    </section>
  );
}

function Tags({ list }: { list: string[] }) {
  return list.length ? (
    <span className="flex flex-wrap gap-1.5">
      {list.map((t) => (
        <span key={t} className="aw-tag">
          {t}
        </span>
      ))}
    </span>
  ) : (
    <span className="text-muted">None</span>
  );
}

const PERSON = [
  { key: "you", word: "you" },
  { key: "we", word: "we" },
  { key: "i", word: "I" },
] as const;

/** The numbers measured from the brand's posts, as tiles. */
function Measured({ stats }: { stats: VoiceStats }) {
  const person = [...PERSON].sort((a, b) => stats[b.key] - stats[a.key])[0];
  const tiles = [
    { label: "Words a sentence", num: stats.sentenceAvg, note: `Most between ${stats.sentenceLow} and ${stats.sentenceHigh}` },
    { label: "Sentences a paragraph", num: stats.paragraphAvg, note: "On average" },
    { label: `Says \u201c${person.word}\u201d`, num: stats[person.key], note: "Times per 1,000 words" },
    { label: "Contractions", num: stats.contractions, note: "Per 1,000 words" },
    { label: "Reading grade", num: stats.grade, note: "Flesch-Kincaid" },
    { label: "Headings a post", num: stats.headingsPerPost, note: `${stats.listsPerPost} lists a post` },
  ];
  return (
    <div className="aw-stats aw-stats--tight" style={{ ["--cols" as string]: 3 }}>
      {tiles.map((t) => (
        <div key={t.label} className="aw-stat">
          <div className="aw-stat__lab">{t.label}</div>
          <span className="aw-stat__num">{t.num}</span>
          <span className="block text-[12px] text-muted">{t.note}</span>
        </div>
      ))}
    </div>
  );
}

/** The persona, read or edited field by field, in groups: voice, measured style, words, facts and a sample. */
export function PersonaCard({ persona, stats, edit, onChange }: { persona: WriterPersona; stats: VoiceStats | null; edit: boolean; onChange: (p: WriterPersona) => void }) {
  const set = (patch: Partial<WriterPersona>) => onChange({ ...persona, ...patch });
  const text = (v: string, f: (s: string) => void, rows = 2) => <textarea value={v} rows={rows} onChange={(e) => f(e.target.value)} className="aw-textarea text-[13.5px]!" />;
  const removeProof = (p: Proof) => set({ proof: persona.proof.filter((x) => x !== p) });
  const none = <span className="text-muted">None</span>;
  return (
    <div className="flex flex-col gap-4">
      <Section title="Voice">
        <Row label="Who writes">{edit ? text(persona.writer, (v) => set({ writer: v })) : persona.writer || <span className="text-muted">Not on the site yet</span>}</Row>
        <Row label="Who reads">{edit ? text(persona.reader, (v) => set({ reader: v })) : persona.reader}</Row>
        <Row label="Point of view">{edit ? text(persona.pov, (v) => set({ pov: v })) : persona.pov || none}</Row>
        <Row label="Tone">{edit ? <input value={persona.tone.join(", ")} onChange={(e) => set({ tone: terms(e.target.value) })} className="aw-input py-2! text-[13.5px]!" /> : <Tags list={persona.tone} />}</Row>
        <Row label="Sentences">{edit ? text(persona.sentences, (v) => set({ sentences: v }), 1) : persona.sentences}</Row>
      </Section>

      {stats?.posts ? (
        <div className="flex flex-col gap-2">
          <span className="px-1 text-[13px] text-muted">Measured from {stats.posts} posts</span>
          <Measured stats={stats} />
        </div>
      ) : null}

      <Section title="Words">
        <Row label="Use">{edit ? text(persona.use.join(", "), (v) => set({ use: terms(v) })) : <Tags list={persona.use} />}</Row>
        <Row label="Avoid">{edit ? text(persona.avoid.join(", "), (v) => set({ avoid: terms(v) })) : <Tags list={persona.avoid} />}</Row>
        <Row label="Naming">{edit ? text(persona.naming, (v) => set({ naming: v }), 1) : persona.naming || none}</Row>
      </Section>

      <Section title="Facts">
        <Row label="Approved proof">
          {persona.proof.length ? (
            <ul className="flex flex-col gap-3">
              {persona.proof.map((p) => (
                <li key={p.quote || p.claim} className="flex items-start gap-2">
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="font-medium">{p.claim}</span>
                    {p.quote ? <span className="text-[13px] text-body">&ldquo;{p.quote}&rdquo;</span> : null}
                    {p.url && /^https?:/.test(p.url) ? (
                      <a href={p.url} target="_blank" rel="noreferrer" className="aw-text-link text-[12px] wrap-anywhere">
                        {p.url.replace(/^https?:\/\/(www\.)?/, "")}
                      </a>
                    ) : null}
                  </span>
                  {edit ? (
                    <button type="button" className="aw-iconbtn" aria-label={`Remove ${p.claim}`} title="Remove" onClick={() => removeProof(p)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-muted">None on the site. The writer uses no customer names, results or numbers about the brand.</span>
          )}
        </Row>
        <Row label="Never claim">{edit ? text(persona.never.join("\n"), (v) => set({ never: lines(v) }), 3) : persona.never.length ? <ul className="flex list-disc flex-col gap-1 pl-4">{persona.never.map((n) => <li key={n}>{n}</li>)}</ul> : none}</Row>
        <Row label="Call to action">{edit ? text(persona.cta, (v) => set({ cta: v }), 1) : persona.cta || none}</Row>
        {persona.questions.length || edit ? (
          <Row label="Open questions">{edit ? text(persona.questions.join("\n"), (v) => set({ questions: lines(v) }), 3) : <ul className="flex list-disc flex-col gap-1 pl-4">{persona.questions.map((q) => <li key={q}>{q}</li>)}</ul>}</Row>
        ) : null}
      </Section>

      <Section title="Sample paragraph" note="How an article will sound">
        {edit ? text(persona.sample, (v) => set({ sample: v }), 6) : <p className="border-l-2 border-brand pl-4 text-[15px] leading-[1.7] text-ink">{persona.sample}</p>}
      </Section>
    </div>
  );
}

/** Add 2 posts the team likes, then build again. Shown when the brand has no blog to learn from. */
export function SharperBox({ busy, onBuild }: { busy: boolean; onBuild: (urls: string[], text: string) => void }) {
  const [urls, setUrls] = useState("");
  const [text, setText] = useState("");
  const list = urls.split(/[\s,]+/).filter((u) => /^https?:\/\//i.test(u));
  return (
    <section className="aw-frame flex flex-col gap-3 p-5">
      <span className="text-[14px] font-medium text-ink">Add 2 posts you like to make it sharper</span>
      <textarea value={urls} rows={2} onChange={(e) => setUrls(e.target.value)} placeholder="https://" aria-label="Links to posts" className="aw-textarea text-[13px]!" />
      <textarea value={text} rows={3} onChange={(e) => setText(e.target.value)} placeholder="Or paste writing" aria-label="Pasted writing" className="aw-textarea text-[13px]!" />
      <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm self-start" disabled={busy || (!list.length && text.trim().split(/\s+/).length < 80)} onClick={() => onBuild(list.slice(0, 3), text)}>
        Build again
      </button>
    </section>
  );
}

/** Brand > Tone of voice: the saved persona, with Build, Edit and Save. */
export function WriterPersonaSettings({ auth, brand, canEdit }: { auth: RunAuth; brand: { id: string; name: string; domain?: string }; canEdit: boolean }) {
  const [persona, setPersona] = useState<WriterPersona | null | undefined>(undefined);
  const [stats, setStats] = useState<VoiceStats | null>(null);
  const [postText, setPostText] = useState("");
  const [noBlog, setNoBlog] = useState(false);
  const [edit, setEdit] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<"" | "build" | "save">("");
  const [error, setError] = useState("");
  const [setup, setSetup] = useState("");

  useEffect(() => {
    let live = true;
    post<{ persona: WriterPersona | null; stats: VoiceStats | null; setup?: string }>(auth, "/api/writer-persona", { action: "get", brandId: brand.id })
      .then((r) => {
        if (!live) return;
        setPersona(r.persona);
        setStats(r.stats);
        setSetup(r.setup ?? "");
      })
      .catch((e) => live && (setPersona(null), setError(e instanceof Error ? e.message : String(e))));
    return () => {
      live = false;
    };
  }, [auth, brand.id]);

  async function build(urls: string[] = [], text = "") {
    if (!brand.domain) return;
    setBusy("build");
    setError("");
    try {
      const r = await post<Built>(auth, "/api/writer-persona", { action: "build", domain: brand.domain, name: brand.name, urls, text });
      setPersona(r.persona);
      setStats(r.stats);
      setPostText(r.postText);
      setNoBlog(r.noBlog);
      setDirty(true);
      setEdit(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }
  async function save() {
    if (!persona) return;
    setBusy("save");
    setError("");
    try {
      await post(auth, "/api/writer-persona", { action: "save", brandId: brand.id, persona, stats, postText });
      setDirty(false);
      setEdit(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  if (persona === undefined) return <Thinking text="Loading..." />;
  return (
    <section className="flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="aw-h3 mb-0! flex-1">Writer persona</h2>
        {canEdit && persona ? (
          <>
            <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" disabled={Boolean(busy)} onClick={() => setEdit(!edit)}>
              {edit ? "Done" : "Edit"}
            </button>
            <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" disabled={Boolean(busy) || !brand.domain} onClick={() => void build()}>
              {busy === "build" ? "Reading your site..." : "Build again"}
            </button>
          </>
        ) : null}
        {canEdit && persona && dirty ? (
          <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" disabled={Boolean(busy)} onClick={() => void save()}>
            {busy === "save" ? "Saving..." : "Save"}
          </button>
        ) : null}
      </div>
      {setup ? <div className="aw-callout">{setup}</div> : null}
      {error ? <p className="aw-error">{error}</p> : null}
      {busy === "build" ? <Thinking text={`Reading ${brand.domain ?? "your site"} and its posts...`} /> : null}
      {persona ? (
        <PersonaCard
          persona={persona}
          stats={stats}
          edit={edit}
          onChange={(p) => {
            setPersona(p);
            setDirty(true);
          }}
        />
      ) : canEdit && !busy ? (
        <button type="button" className="aw-btn aw-btn--primary self-start" disabled={!brand.domain || Boolean(setup)} onClick={() => void build()}>
          Build the writer persona
        </button>
      ) : null}
      {persona && noBlog && canEdit ? <SharperBox busy={Boolean(busy)} onBuild={(u, t) => void build(u, t)} /> : null}
    </section>
  );
}
