"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Editor } from "@tiptap/react";
import { useEffect, useState } from "react";
import { listRuns, type SavedRun } from "@/lib/db";
import type { PmNode } from "@/lib/docHtml";
import { citations, coverage, promptsFor } from "@/lib/promptCoverage";
import { Seg } from "../ui";

// The review panel beside a draft in Drafts, read from the live editor as it changes:
//   Checks: length against the brief, reading level, the keyword in the title and the opening, headings, image alt
//     text, links and the meta description.
//   Outline: the H2s and H3s with words per section; a click scrolls there.
//   AI: the prompts the brand tracks that are about this article, how much of each the text covers, and which AI
//     engines cited the brand's site or named the brand for it in the latest run (promptCoverage.ts).
//   Links: the internal links the brief planned, with a button that links the planned anchor text where it appears.

export type ReviewInput = { keyword?: string; wordTarget?: number; meta?: string; domain: string; links?: { url: string; anchor: string }[] };
type Check = { label: string; value: string; state: "ok" | "warn" | "info" };
type Head = { level: number; title: string; words: number; intro?: true };

const textOf = (n: PmNode): string => (n.text ?? "") + (n.content ?? []).map(textOf).join(n.type === "paragraph" || n.type === "heading" ? "" : " ");
const wordCount = (t: string) => t.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w)).length;

function walk(n: PmNode, fn: (n: PmNode) => void) {
  fn(n);
  for (const c of n.content ?? []) walk(c, fn);
}

function syllables(word: string) {
  let w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  return w.match(/[aeiouy]{1,2}/g)?.length ?? 1;
}

/** The Flesch-Kincaid grade of the article's paragraphs and list items. */
function grade(doc: PmNode) {
  const blocks: string[] = [];
  walk(doc, (n) => {
    if (n.type === "paragraph" || n.type === "heading") {
      const t = textOf(n).trim();
      if (t) blocks.push(/[.!?:]$/.test(t) ? t : `${t}.`);
    }
  });
  const text = blocks.join(" ");
  const words = text.match(/[A-Za-z]+/g) ?? [];
  if (!words.length) return 0;
  const sentences = (text.match(/[^.!?:]+[.!?:]+/g) ?? []).filter((s) => /[A-Za-z]/.test(s)).length || 1;
  const syl = words.reduce((n, w) => n + syllables(w), 0);
  return Math.max(1, Math.round(0.39 * (words.length / sentences) + 11.8 * (syl / words.length) - 15.59));
}

/** The H2s and H3s in order, with the words under each up to the next heading. */
function outlineOf(doc: PmNode): Head[] {
  const out: Head[] = [];
  let intro = 0;
  for (const n of doc.content ?? []) {
    const level = Number(n.attrs?.level);
    if (n.type === "heading" && level >= 2 && level <= 3) out.push({ level, title: textOf(n).trim() || "Untitled heading", words: 0 });
    else if (n.type !== "heading") {
      const w = wordCount(textOf(n));
      if (out.length) out[out.length - 1].words += w;
      else intro += w;
    }
  }
  return intro ? [{ level: 2, title: "Intro", words: intro, intro: true }, ...out] : out;
}

function checksOf(doc: PmNode, title: string, input: ReviewInput): Check[] {
  const all = textOf(doc);
  const words = wordCount(all);
  const g = grade(doc);
  const kw = input.keyword?.trim().toLowerCase() ?? "";
  const opening = all.split(/\s+/).slice(0, 100).join(" ").toLowerCase();
  let h2 = 0;
  let images = 0;
  let noAlt = 0;
  let links = 0;
  let internal = 0;
  const host = input.domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase();
  walk(doc, (n) => {
    if (n.type === "heading" && Number(n.attrs?.level) === 2) h2++;
    if (n.type === "image") {
      images++;
      if (!String(n.attrs?.alt ?? "").trim()) noAlt++;
    }
    for (const m of n.marks ?? []) {
      if (m.type !== "link") continue;
      links++;
      const href = String((m as { attrs?: Record<string, unknown> }).attrs?.href ?? "");
      if (href.startsWith("/") || (host && href.toLowerCase().includes(host))) internal++;
    }
  });
  const out: Check[] = [];
  if (input.wordTarget)
    out.push({ label: "Length", value: `${words.toLocaleString("en-US")} of about ${input.wordTarget.toLocaleString("en-US")} words`, state: Math.abs(words - input.wordTarget) / input.wordTarget <= 0.25 ? "ok" : "warn" });
  else out.push({ label: "Length", value: `${words.toLocaleString("en-US")} words`, state: "info" });
  out.push({ label: "Reading level", value: `Grade ${g}. Aim for 9 or lower.`, state: g <= 9 ? "ok" : "warn" });
  if (kw) {
    const inTitle = title.toLowerCase().includes(kw);
    out.push({ label: "Keyword in the title", value: inTitle ? `“${input.keyword}” is in the title` : `Add “${input.keyword}” to the title`, state: inTitle ? "ok" : "warn" });
    const early = opening.includes(kw);
    out.push({ label: "Keyword early", value: early ? "Used in the first 100 words" : "Use it in the first 100 words", state: early ? "ok" : "warn" });
  }
  out.push({ label: "Sections", value: `${h2} H2 heading${h2 === 1 ? "" : "s"}`, state: h2 >= 3 ? "ok" : "warn" });
  out.push({ label: "Image alt text", value: images ? (noAlt ? `${noAlt} of ${images} images have no alt text` : `All ${images} images have alt text`) : "No images", state: images ? (noAlt ? "warn" : "ok") : "info" });
  out.push({ label: "Links", value: links ? `${links} link${links === 1 ? "" : "s"}, ${internal} to your own site` : "No links yet", state: internal ? "ok" : "warn" });
  if (input.meta !== undefined) {
    const ml = input.meta.length;
    out.push({ label: "Meta description", value: `${ml} of 155 characters`, state: ml >= 120 && ml <= 155 ? "ok" : "warn" });
  }
  return out;
}

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
const MARK = { ok: icon("M20 6 9 17l-5-5"), warn: icon("M12 8v5M12 17h.01"), info: icon("M12 11v5M12 8h.01") };
const TONE = { ok: "bg-pos-bg text-pos", warn: "bg-warn-bg text-warn", info: "bg-[var(--bg-secondary)] text-muted" };

/** Reads the live editor and follows its changes a moment after typing stops. */
function useDoc(editor: Editor | null) {
  const [doc, setDoc] = useState<PmNode | null>(() => (editor ? (editor.getJSON() as PmNode) : null));
  useEffect(() => {
    if (!editor) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const read = () => setDoc(editor.getJSON() as PmNode);
    const later = () => {
      if (t) clearTimeout(t);
      t = setTimeout(read, 400);
    };
    read();
    editor.on("update", later);
    return () => {
      if (t) clearTimeout(t);
      editor.off("update", later);
    };
  }, [editor]);
  return doc;
}

export function ArticleReview({ sb, brandId, editor, title, input }: { sb: SupabaseClient; brandId: string; editor: Editor | null; title: string; input: ReviewInput }) {
  const [tab, setTab] = useState<"checks" | "outline" | "ai" | "links">("checks");
  const doc = useDoc(editor);
  if (!doc) return <p className="px-4 py-4 text-[13px] text-muted">Opening the article...</p>;
  const checks = checksOf(doc, title, input);
  const heads = outlineOf(doc);
  const pass = checks.filter((c) => c.state === "ok").length;
  const jump = (i: number) => {
    const dom = editor?.view.dom;
    if (!dom) return;
    if (heads[i]?.intro) {
      dom.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    dom.querySelectorAll("h2, h3")[heads[0]?.intro ? i - 1 : i]?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      <Seg
        label="Review"
        value={tab}
        onChange={setTab}
        options={[
          { id: "checks", label: `Checks ${pass}/${checks.length}` },
          { id: "outline", label: "Outline" },
          { id: "ai", label: "AI" },
          { id: "links", label: "Links" },
        ]}
      />
      {tab === "ai" ? (
        <AiAnswers sb={sb} brandId={brandId} topic={[input.keyword ?? "", title, ...heads.filter((h) => !h.intro).map((h) => h.title)].join(". ")} text={`${title} ${textOf(doc)}`} />
      ) : tab === "links" ? (
        <Links editor={editor} doc={doc} links={input.links ?? []} />
      ) : tab === "checks" ? (
        <ul className="flex flex-col">
          {checks.map((c, i) => (
            <li key={c.label} className={`grid grid-cols-[20px_minmax(0,1fr)] items-start gap-3 py-2.5 ${i ? "border-t border-rule-faint" : ""}`}>
              <span className={`mt-0.5 flex h-5 w-5 items-center justify-center ${TONE[c.state]}`} aria-label={c.state === "ok" ? "Passes" : c.state === "warn" ? "Needs work" : "Note"}>
                {MARK[c.state]}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-[13px] font-medium text-ink">{c.label}</span>
                <span className="text-[12px] text-muted [overflow-wrap:break-word]">{c.value}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : heads.length ? (
        <ol className="flex flex-col">
          {heads.map((h, i) => (
            <li key={`${i}-${h.title}`}>
              <button type="button" onClick={() => jump(i)} className={`flex w-full items-baseline gap-3 py-2 text-left hover:bg-[var(--bg-secondary)] ${h.level === 3 ? "pl-4" : ""}`}>
                <span className={`min-w-0 flex-1 truncate text-[13px] ${h.level === 3 ? "text-body" : "font-medium text-ink"}`}>{h.title}</span>
                <span className="aw-num shrink-0 text-[12px] text-muted">{h.words}</span>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-[13px] text-muted">Add H2 headings to see the outline here.</p>
      )}
      {tab === "checks" || tab === "outline" ? <p className="text-[12px] text-muted">Worked out from the text as you edit.</p> : null}
    </div>
  );
}

type BrandRow = { name: string; domain: string; prompts: string[] };

/** The brand's tracked prompts about this article: coverage from the text, citations from the latest run. */
function AiAnswers({ sb, brandId, topic, text }: { sb: SupabaseClient; brandId: string; topic: string; text: string }) {
  const [data, setData] = useState<{ brand: BrandRow | null; runs: SavedRun[] } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    Promise.all([sb.from("brands").select("name, domain, prompts").eq("id", brandId).maybeSingle(), listRuns(sb, brandId, 60)])
      .then(([b, runs]) => live && setData({ brand: (b.data as BrandRow | null) ?? null, runs }))
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [sb, brandId]);
  if (error) return <p className="aw-error text-[13px]">{error}</p>;
  if (!data) return <p className="text-[13px] text-muted">Reading your tracked prompts...</p>;
  const brand = data.brand;
  const tracked = brand?.prompts ?? [];
  if (!brand || !tracked.length) return <p className="text-[13px] text-muted">This brand tracks no prompts yet. Add them in Prompts to see which ones this article answers.</p>;
  const related = promptsFor(tracked, topic);
  if (!related.length)
    return (
      <p className="text-[13px] text-muted">
        None of the {tracked.length} prompts this brand tracks are about this article&apos;s topic. Add the questions buyers ask about it in Prompts.
      </p>
    );
  const rows = related.map((r) => ({ ...r, cov: coverage(r.prompt, text), cit: citations(data.runs, r.prompt, brand) }));
  const covered = rows.filter((r) => r.cov.state === "answered").length;
  const pill = { answered: ["aw-status--ranked", "Covered"], partly: ["aw-status--warn", "Partly"], missing: ["aw-status--missed", "Missing"] } as const;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-ink">
        <span className="aw-num font-medium">
          {covered} of {rows.length}
        </span>{" "}
        related prompts covered
      </p>
      <ul className="flex flex-col">
        {rows.map((r, i) => (
          <li key={r.prompt} className={`flex flex-col gap-1.5 py-2.5 ${i ? "border-t border-rule-faint" : ""}`}>
            <span className="flex items-start justify-between gap-2">
              <span className="min-w-0 text-[13px] font-medium text-ink [overflow-wrap:anywhere]">&ldquo;{r.prompt}&rdquo;</span>
              <span className={`aw-status ${pill[r.cov.state][0]} shrink-0`}>{pill[r.cov.state][1]}</span>
            </span>
            {r.cov.missing.length ? <span className="text-[12px] text-muted">Not in the text: {r.cov.missing.join(", ")}</span> : null}
            {r.cit.engines.length ? (
              <span className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="text-muted">Last run:</span>
                {r.cit.engines.map((e) => (
                  <span key={e.engine} className={`border px-1.5 ${e.cited ? "border-pos bg-pos-bg text-pos" : e.named ? "border-rule text-ink" : "border-rule-faint text-muted"}`} title={e.cited ? "Cited your site" : e.named ? "Named the brand, no link" : "Didn't name the brand"}>
                    {e.engine}
                    {e.cited ? " · cited" : e.named ? " · named" : ""}
                  </span>
                ))}
              </span>
            ) : (
              <span className="text-[11px] text-muted">Not in a run yet.</span>
            )}
          </li>
        ))}
      </ul>
      <p className="text-[12px] text-muted">Covered means the prompt&apos;s main words are in the article. It&apos;s a quick check of the text, not a forecast.</p>
    </div>
  );
}

/** Where a phrase first appears in plain (unlinked) text, as editor positions. */
function findText(editor: Editor, phrase: string): { from: number; to: number } | null {
  const want = phrase.trim().toLowerCase();
  if (!want) return null;
  let hit: { from: number; to: number } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (hit) return false;
    if (!node.isText || node.marks.some((m) => m.type.name === "link")) return;
    const i = (node.text ?? "").toLowerCase().indexOf(want);
    if (i >= 0) hit = { from: pos + i, to: pos + i + want.length };
  });
  return hit;
}

const sameUrl = (a: string, b: string) => a.replace(/\/+$/, "").toLowerCase() === b.replace(/\/+$/, "").toLowerCase();

/** The internal links the brief planned: linked already, ready to link where the anchor text appears, or not in the text. */
function Links({ editor, doc, links }: { editor: Editor | null; doc: PmNode; links: { url: string; anchor: string }[] }) {
  const [copied, setCopied] = useState("");
  const list = links.filter((l, i) => l.url && links.findIndex((x) => sameUrl(x.url, l.url)) === i);
  if (!list.length) return <p className="text-[13px] text-muted">The brief planned no internal links for this article.</p>;
  const hrefs: string[] = [];
  walk(doc, (n) => {
    for (const m of n.marks ?? []) if (m.type === "link") hrefs.push(String((m as { attrs?: Record<string, unknown> }).attrs?.href ?? ""));
  });
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-ink">
        <span className="aw-num font-medium">
          {list.filter((l) => hrefs.some((h) => sameUrl(h, l.url))).length} of {list.length}
        </span>{" "}
        planned links added
      </p>
      <ul className="flex flex-col">
        {list.map((l, i) => {
          const linked = hrefs.some((h) => sameUrl(h, l.url));
          const at = !linked && editor ? findText(editor, l.anchor) : null;
          return (
            <li key={l.url} className={`flex flex-col gap-1.5 py-2.5 ${i ? "border-t border-rule-faint" : ""}`}>
              <span className="text-[13px] text-ink [overflow-wrap:anywhere]">{l.anchor ? <>&ldquo;{l.anchor}&rdquo;</> : "No anchor text"}</span>
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="aw-text-link text-[12px] [overflow-wrap:anywhere]">
                {l.url.replace(/^https?:\/\//, "")}
              </a>
              <span className="flex flex-wrap items-center gap-2">
                {linked ? (
                  <span className="aw-status aw-status--ranked">Linked</span>
                ) : at && editor?.isEditable ? (
                  <button
                    type="button"
                    className="aw-btn aw-btn--secondary aw-btn--sm"
                    onClick={() => {
                      editor.chain().focus().setTextSelection(at).setLink({ href: l.url }).run();
                      editor.view.domAtPos(at.from).node.parentElement?.scrollIntoView({ behavior: "smooth", block: "center" });
                    }}
                  >
                    Add link
                  </button>
                ) : (
                  <>
                    <span className="text-[12px] text-muted">{at ? "Not linked yet." : "The anchor text isn't in the draft."}</span>
                    <button
                      type="button"
                      className="aw-text-link text-[12px]"
                      onClick={() =>
                        navigator.clipboard.writeText(l.url).then(
                          () => setCopied(l.url),
                          () => setCopied(""),
                        )
                      }
                    >
                      {copied === l.url ? "Copied" : "Copy link"}
                    </button>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
