"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Chat } from "@/lib/chats";
import { answered, brandStats } from "@/lib/metrics";
import {
  enough,
  headlineGap,
  MIN_ANSWERS,
  radarOrder,
  scoresFromSummary,
  topBad,
  unknownInSummary,
  verdict,
  type PerceptionSetup,
  type PerceptionWord,
  type Scores,
  type SummaryRow,
  type WordHit,
} from "@/lib/perception";
import type { RunAuth } from "@/lib/runner";
import type { View } from "@/lib/view";
import { BrandLogo } from "./BrandLogo";
import { ENGINE_LOGOS } from "./Engines";
import { SampleChips, ToolIntro } from "./ToolIntro";
import { favicon, guessDomain, SidePanel, Thinking, YOU_COLOR } from "./ui";

// Perception (docs/perception.md): the words AI uses for a brand, on one radar. Logos stand in for names, and the
// only sentence on the page is the verdict.

type Source = "buyer" | "direct";
const RIVAL_LINES = ["var(--aw-ink)", "var(--aw-muted)"];
const pct = (v: number | null | undefined) => (v === null || v === undefined ? "–" : `${Math.round(v * 100)}%`);

export function PerceptionPage({ view, sb, auth, canEdit }: { view: View; sb: SupabaseClient; auth: RunAuth; canEdit: boolean }) {
  const brand = view.brand;
  const [words, setWords] = useState<PerceptionWord[] | null | undefined>(undefined);
  const [data, setData] = useState<{ rows: SummaryRow[]; since: string; days: number } | null>(null);
  const [error, setError] = useState("");
  const [src, setSrc] = useState<Source>("buyer");
  const [engine, setEngine] = useState("All");
  const [rivals, setRivals] = useState<string[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  // The word list: saved on the brand, or made once by Haiku when an editor first opens the page.
  useEffect(() => {
    let live = true;
    (async () => {
      const { data, error: err } = await sb.from("brands").select("perception").eq("id", brand.id).maybeSingle();
      if (err) return live && setError(/perception/.test(err.message) ? "Run supabase/059_perception.sql in Supabase." : err.message);
      const saved = (data?.perception as PerceptionSetup | null)?.words;
      if (saved?.length || !canEdit) return live && setWords(saved?.length ? saved : null);
      const res = await fetch("/api/perception", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await auth.token()}` }, body: JSON.stringify({ workspaceId: auth.workspaceId, brandId: brand.id }) });
      const body = await res.json().catch(() => ({}));
      if (!live) return;
      if (!res.ok) setError(body.error ?? `Couldn't pick words (${res.status}).`);
      setWords(body.words ?? null);
    })();
    return () => void (live = false);
  }, [sb, auth, brand.id, canEdit]);

  useEffect(() => {
    let live = true;
    const days = view.days;
    const since = new Date(Date.now() - days * 864e5).toISOString();
    sb.rpc("perception_summary", { p_brand: brand.id, p_since: since }).then(({ data: rows, error: err }) => {
      if (!live) return;
      if (err) return setError(/perception_summary/.test(err.message) ? "Run supabase/059_perception.sql in Supabase." : err.message);
      setData({ rows: (rows ?? []) as SummaryRow[], since, days });
    });
    return () => void (live = false);
  }, [sb, brand.id, view.days]);

  // The page follows the shared filters: the chosen topic for buyer answers, and the chosen model for both.
  const inView = (r: { source: Source; engine: string; prompt: string }) =>
    r.source === src && view.engines.includes(r.engine) && (engine === "All" || r.engine === engine) && (r.source === "direct" || view.filter({ engine: r.engine, prompt: r.prompt } as Chat));

  const { current } = view;
  const domains = useMemo(() => new Map(brandStats(answered(current, () => true), brand).map((s) => [s.name, s.domain] as const)), [current, brand]);
  const logoOf = (name: string) => (name === brand.name ? brand.logo || favicon(brand.domain) : favicon(domains.get(name) || guessDomain(name)));

  if (error) return <div className="aw-callout aw-callout--warn max-w-xl">{error}</div>;
  if (words === undefined || data === null || data.days !== view.days) return <Thinking text={words === undefined && canEdit ? "Picking the words for this brand" : "Loading"} />;
  if (!words) return <Intro brand={brand.name} />;
  const { rows, since } = data;

  const names = [...new Set(rows.filter((r) => r.source === "buyer" && r.word === null && r.named !== brand.name).map((r) => r.named))];
  const reach = (n: string) => rows.filter((r) => r.named === n && r.word === null && r.source === "buyer").reduce((s, r) => s + r.n, 0);
  const rivalList = names.sort((a, b) => reach(b) - reach(a)).slice(0, 8);
  const shown = (rivals ?? rivalList.slice(0, 2)).filter((n) => rivalList.includes(n));
  if (!rows.some((r) => r.named === brand.name) && !rivalList.length) return <Intro brand={brand.name} />;

  const scoreOf = (n: string, e = engine) => scoresFromSummary(rows, n, words, (r) => inView(r) && (e === "All" || r.engine === e));
  const you = scoreOf(brand.name);
  const rv = shown.map((n) => ({ brand: n, scores: scoreOf(n) }));
  const unknown = unknownInSummary(rows, brand.name);
  const [first, second] = verdict(brand.name, you, rv, words, unknown);
  const gap = headlineGap(you, rv, words);
  const concern = topBad(you, words);
  const weak = rv.map((r) => ({ brand: r.brand, bad: topBad(r.scores, words) })).filter((r) => r.bad).sort((a, b) => b.bad!.share - a.bad!.share)[0];
  const engines = [...new Set(rows.filter((r) => r.source === src && view.engines.includes(r.engine)).map((r) => r.engine))];
  const toggle = (n: string) => setRivals(shown.includes(n) ? shown.filter((x) => x !== n) : [...shown, n].slice(-2));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <BrandLogo src={logoOf(brand.name)} name={brand.name} size={32} />
          <h2 className="aw-h4 text-[18px]">{brand.name}</h2>
          {brand.category ? <span className="aw-tag">{brand.category}</span> : null}
          {unknown ? <span className="aw-tag text-neg">Not known when asked</span> : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="aw-micro mr-1">vs</span>
          {rivalList.map((n) => (
            <LogoToggle key={n} on={shown.includes(n)} title={n} line={shown.includes(n) ? RIVAL_LINES[shown.indexOf(n)] : undefined} onClick={() => toggle(n)}>
              <BrandLogo src={logoOf(n)} name={n} size={20} />
            </LogoToggle>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" aria-pressed={engine === "All"} onClick={() => setEngine("All")} className="aw-chip aw-chip--btn aria-pressed:!bg-surface-2">
            All
          </button>
          {engines.map((e) => (
            <LogoToggle key={e} on={engine === e} title={e} onClick={() => setEngine(engine === e ? "All" : e)}>
              <EngineLogo engine={e} size={18} />
            </LogoToggle>
          ))}
        </div>
        <div className="aw-seg" role="tablist" aria-label="Source">
          {(["buyer", "direct"] as Source[]).map((s) => (
            <button key={s} type="button" role="tab" aria-selected={src === s} onClick={() => { setSrc(s); setEngine("All"); }}>
              {s === "buyer" ? "Buyer answers" : "Asked directly"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <section className="aw-frame p-2">
          <Radar words={words} you={{ name: brand.name, scores: you }} rivals={rv} onWord={setOpen} />
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 px-2 pb-2 text-[12px]">
            {enough(you) ? <Legend color={YOU_COLOR} logo={logoOf(brand.name)} name={brand.name} /> : null}
            {rv.map((r, i) => <Legend key={r.brand} color={RIVAL_LINES[i]} dashed={i === 1} logo={logoOf(r.brand)} name={r.brand} faded={!enough(r.scores)} />)}
          </div>
        </section>
        <div className="flex flex-col gap-4">
          <section className="aw-frame flex flex-col gap-2 p-5">
            <p className="text-[22px] font-semibold leading-[30px] text-ink [text-wrap:balance]">
              {first} <span className="text-faint">{second}</span>
            </p>
            <span className="aw-num text-[12px] text-muted">{you.n} {you.n === 1 ? "answer" : "answers"}</span>
          </section>
          <StatCard label="Biggest gap" word={gap?.word} onOpen={setOpen} rows={gap ? [{ key: gap.brand, icon: <BrandLogo src={logoOf(gap.brand)} name={gap.brand} size={20} />, v: gap.them, color: RIVAL_LINES[Math.max(0, shown.indexOf(gap.brand))] }, { key: brand.name, icon: <BrandLogo src={logoOf(brand.name)} name={brand.name} size={20} />, v: enough(you) ? gap.you : null, color: YOU_COLOR }] : []} />
          <StatCard label="Your concern" word={concern?.word} bad onOpen={setOpen} rows={concern ? engines.map((e) => ({ key: e, icon: <EngineLogo engine={e} size={20} />, v: perEngine(scoreOf(brand.name, e), concern.word, src), color: "var(--aw-neg)" })).filter((r) => r.v) : []} />
          <StatCard label="Their weak spot" word={weak?.bad?.word} bad onOpen={setOpen} rows={weak?.bad ? [{ key: weak.brand, icon: <BrandLogo src={logoOf(weak.brand)} name={weak.brand} size={20} />, v: weak.bad.share, color: "var(--aw-neg)" }, { key: brand.name, icon: <BrandLogo src={logoOf(brand.name)} name={brand.name} size={20} />, v: enough(you) ? you.share[weak.bad.word] : null, color: "var(--aw-neg)" }] : []} />
        </div>
      </div>

      {open ? (
        <WordPanel
          sb={sb}
          word={words.find((w) => w.word === open)!}
          brands={[brand.name, ...shown]}
          start={enough(you) ? brand.name : (shown.find((n) => (scoreOf(n).share[open] ?? 0) > 0) ?? brand.name)}
          brandId={brand.id}
          since={since}
          src={src}
          engines={engines}
          logoOf={logoOf}
          scoreOf={scoreOf}
          inView={inView}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </div>
  );
}

/** Direct questions run once a week per engine, so a single answer is enough to show there. */
const perEngine = (s: Scores, word: string, src: Source) => (s.n >= (src === "buyer" ? MIN_ANSWERS : 1) ? s.share[word] || null : null);

function Intro({ brand }: { brand: string }) {
  return (
    <ToolIntro
      title="See the words AI uses for you"
      lead={`Arrowsterr reads every answer that names ${brand} and scores it on 10 words. The first numbers show after the next check.`}
      features={[{ title: "Words, with proof", text: "Every score links to the quotes behind it.", visual: <SampleChips items={[["Affordable", "48%"], ["Simple", "30%"], ["Expensive", "18%"]]} /> }]}
    />
  );
}

/** An engine's logo. AI Mode shares Google's logo with AI Overview, so it gets a small black corner. */
function EngineLogo({ engine, size }: { engine: string; size: number }) {
  return (
    <span className="relative inline-flex shrink-0">
      <BrandLogo src={ENGINE_LOGOS[engine] ?? ""} name={engine} size={size} />
      {engine === "AI Mode" ? <span className="absolute -bottom-0.5 -right-0.5 h-[42%] w-[42%] border border-paper bg-ink" /> : null}
    </span>
  );
}

function LogoToggle({ on, title, line, onClick, children }: { on: boolean; title: string; line?: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={title} aria-label={title} aria-pressed={on} onClick={onClick} className={`relative inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors ${on ? "border-ink bg-surface-2" : "border-rule hover:border-muted"}`}>
      {children}
      {line ? <span className="absolute inset-x-1 -bottom-px h-0.5" style={{ background: line }} /> : null}
    </button>
  );
}

function Legend({ color, dashed, logo, name, faded }: { color: string; dashed?: boolean; logo: string; name: string; faded?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${faded ? "text-faint" : "text-body"}`} title={faded ? `Fewer than ${MIN_ANSWERS} answers` : name}>
      <i className="inline-block w-[18px] border-t-2" style={{ borderColor: color, borderTopStyle: dashed ? "dashed" : "solid" }} />
      <BrandLogo src={logo} name={name} size={16} />
      {name}
    </span>
  );
}

function StatCard({ label, word, bad, rows, onOpen }: { label: string; word?: string; bad?: boolean; rows: { key: string; icon: React.ReactNode; v: number | null; color: string }[]; onOpen: (w: string) => void }) {
  return (
    <section className="aw-frame flex flex-col gap-2.5 px-5 py-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="aw-micro">{label}</span>
        {word ? <button type="button" className="text-[12px] text-muted underline underline-offset-2" onClick={() => onOpen(word)}>Quotes</button> : null}
      </div>
      <div className={`text-[18px] font-semibold ${!word ? "text-faint" : bad ? "text-neg" : "text-ink"}`}>{word ?? "None yet"}</div>
      {rows.length ? (
        <div className="flex flex-col gap-2">
          {rows.map((r) => (
            <div key={r.key} className="grid grid-cols-[20px_minmax(0,1fr)_44px] items-center gap-2.5" title={r.key}>
              {r.icon}
              <span className="h-2 bg-surface-2"><span className="block h-full" style={{ width: `${(r.v ?? 0) * 100}%`, background: r.color }} /></span>
              <span className={`aw-num text-right text-[13px] ${r.v === null ? "text-faint" : "text-ink"}`}>{pct(r.v)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

// ─────────────── the radar ───────────────

const W = 720, H = 600, CX = 360, CY = 300;

function Radar({ words, you, rivals, onWord }: { words: PerceptionWord[]; you: { name: string; scores: Scores }; rivals: { brand: string; scores: Scores }[]; onWord: (w: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [small, setSmall] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSmall(el.clientWidth < 560));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const R = small ? 148 : 185, LR = small ? 176 : 212, FW = small ? 31 : 19, FS = small ? 25 : 15;
  const axes = radarOrder(words), n = axes.length, step = 360 / n;
  const ang = (i: number) => ((-90 + step * i) * Math.PI) / 180;
  const at = (i: number, r: number) => [CX + r * Math.cos(ang(i)), CY + r * Math.sin(ang(i))] as const;
  const plotted = [...rivals.filter((r) => enough(r.scores)).map((r, i) => ({ key: r.brand, s: r.scores, color: RIVAL_LINES[i], you: false, dashed: i === 1 })), ...(enough(you.scores) ? [{ key: you.name, s: you.scores, color: YOU_COLOR, you: true, dashed: false }] : [])];
  const top = Math.max(0.25, ...plotted.flatMap((p) => Object.values(p.s.share)));
  const max = Math.min(1, Math.ceil(top * 4) / 4);
  const stepV = max <= 0.25 ? 0.05 : max <= 0.5 ? 0.1 : 0.25;
  const rings: number[] = [];
  for (let v = stepV; v <= max + 1e-9; v += stepV) rings.push(v / max);
  const poly = (f: (i: number) => number) => axes.map((_, i) => at(i, R * f(i)).join(",")).join(" ");
  const bad = axes.map((w, i) => (w.good ? -1 : i)).filter((i) => i >= 0);
  const mid = (i: number, j: number) => { const [x1, y1] = at(i, R), [x2, y2] = at(j, R); return `${(x1 + x2) / 2},${(y1 + y2) / 2}`; };
  const wedge = bad.length ? `M${CX},${CY} L${mid((bad[0] - 1 + n) % n, bad[0])} L${bad.map((i) => at(i, R).join(",")).join(" L")} L${mid(bad[bad.length - 1], (bad[bad.length - 1] + 1) % n)} Z` : "";
  return (
    <div ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Perception radar" className="block h-auto w-full">
        {wedge ? <path d={wedge} fill="var(--aw-neg)" fillOpacity={0.07} /> : null}
        {rings.map((f) => <polygon key={f} points={poly(() => f)} fill="none" stroke="var(--aw-rule)" strokeWidth={1} />)}
        {axes.map((_, i) => { const [x, y] = at(i, R); return <line key={i} x1={CX} y1={CY} x2={x} y2={y} stroke="var(--aw-rule)" strokeWidth={1} />; })}
        {rings.filter((_, i) => i === rings.length - 1 || i === Math.floor((rings.length - 1) / 2)).map((f) => (
          <text key={f} x={CX - 6} y={CY - R * f + FS - 1} textAnchor="end" fontSize={FS - 2} fill="var(--aw-faint)" className="aw-num">{Math.round(max * f * 100)}%</text>
        ))}
        {plotted.map((p) => (
          <g key={p.key}>
            <polygon points={poly((i) => Math.min(1, (p.s.share[axes[i].word] ?? 0) / max))} fill={p.color} fillOpacity={p.you ? 0.16 : 0.03} stroke={p.color} strokeWidth={p.you ? 2.5 : 1.75} strokeDasharray={p.dashed ? "6 5" : undefined} strokeLinejoin="round" />
            {p.you ? axes.map((w, i) => { const [x, y] = at(i, R * Math.min(1, (p.s.share[w.word] ?? 0) / max)); return <circle key={w.word} cx={x} cy={y} r={4.5} fill={p.color} />; }) : null}
          </g>
        ))}
        {!enough(you.scores) ? (
          <g>
            <rect x={CX - FS * 5} y={CY + R * 0.55 - FS} width={FS * 10} height={FS * 1.7} fill="var(--aw-paper)" stroke="var(--aw-rule)" />
            <text x={CX} y={CY + R * 0.55 + FS * 0.35} textAnchor="middle" fontSize={FS} fill="var(--aw-muted)">Too few answers</text>
          </g>
        ) : null}
        {axes.map((w, i) => {
          const [x, y] = at(i, LR), c = Math.cos(ang(i)), s = Math.sin(ang(i));
          const anchor = c > 0.25 ? "start" : c < -0.25 ? "end" : "middle";
          const dy = s < -0.6 ? -FW * 0.65 : s > 0.6 ? FW : 4;
          const v = enough(you.scores) ? pct(you.scores.share[w.word]) : "–";
          return (
            <g key={w.word} role="button" tabIndex={0} aria-label={`${w.word} ${v}`} className="cursor-pointer outline-none [&:focus-visible_text]:underline [&:hover_text:first-of-type]:underline" onClick={() => onWord(w.word)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onWord(w.word))}>
              <rect x={anchor === "start" ? x - 4 : anchor === "end" ? x - FW * 7 : x - FW * 3.5} y={y + dy - FW * 1.2} width={FW * 7} height={FW * 2.5} fill="transparent" />
              <text x={x} y={y + dy} textAnchor={anchor} fontSize={FW} fontWeight={600} fill={w.good ? "var(--aw-ink)" : "var(--aw-neg)"}>{w.word}</text>
              <text x={x} y={y + dy + FW} textAnchor={anchor} fontSize={FS} className="aw-num" fill={w.good ? YOU_COLOR : "var(--aw-neg)"}>{v}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─────────────── one word: its numbers and the quotes behind it ───────────────

type QuoteRow = { id: number; source: Source; engine: string; prompt: string; at: string; run_id: string | null; words: WordHit[] };

function WordPanel(p: {
  sb: SupabaseClient;
  word: PerceptionWord;
  brands: string[];
  start: string;
  brandId: string;
  since: string;
  src: Source;
  engines: string[];
  logoOf: (n: string) => string;
  scoreOf: (n: string, e?: string) => Scores;
  inView: (r: { source: Source; engine: string; prompt: string }) => boolean;
  onClose: () => void;
}) {
  const { sb, word, brands, brandId, since, src, logoOf, scoreOf, inView } = p;
  const [who, setWho] = useState(p.start);
  const [loaded, setLoaded] = useState<{ key: string; rows: QuoteRow[] } | null>(null);
  const key = `${who}|${src}|${word.word}|${since}`;
  const quotes = loaded?.key === key ? loaded.rows : null;
  const [full, setFull] = useState<{ q: QuoteRow; text: string } | null>(null);
  useEffect(() => {
    let live = true;
    sb.from("perception_reads").select("id, source, engine, prompt, at, run_id, words").eq("brand_id", brandId).eq("named", who).eq("source", src).gte("at", since).contains("words", [{ word: word.word }]).order("at", { ascending: false }).limit(60)
      .then(({ data }) => live && setLoaded({ key, rows: ((data ?? []) as QuoteRow[]).filter((r) => inView(r)) }));
    return () => void (live = false);
    // inView follows the page's filters, which reset this panel when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sb, brandId, who, src, since, word.word, key]);

  async function openFull(q: QuoteRow) {
    const { data } = q.source === "direct"
      ? await sb.from("perception_reads").select("answer").eq("id", q.id).maybeSingle()
      : await sb.from("answers").select("text").eq("run_id", q.run_id ?? "").eq("engine", q.engine).eq("prompt", q.prompt).limit(1).maybeSingle();
    setFull({ q, text: String((data as { answer?: string; text?: string } | null)?.answer ?? (data as { text?: string } | null)?.text ?? "") });
  }

  const title = (
    <span className="flex items-center gap-2">
      {word.word}
      <span className={`aw-tag ${word.good ? "text-pos" : "text-neg"}`}>{word.good ? "Good" : "Bad"}</span>
    </span>
  );
  return (
    <SidePanel title={title} kicker={word.definition} onClose={p.onClose}>
      {full ? (
        <div className="flex flex-col gap-3">
          <button type="button" className="self-start text-[12px] text-muted underline underline-offset-2" onClick={() => setFull(null)}>Back</button>
          <div className="flex items-center gap-2"><EngineLogo engine={full.q.engine} size={18} /><span className="aw-micro">{full.q.engine}</span></div>
          <h3 className="aw-h4">{full.q.prompt}</h3>
          <Highlighted text={full.text} quote={full.q.words.find((w) => w.word === word.word)?.quote ?? ""} />
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            {brands.map((b, i) => { const s = scoreOf(b); return (
              <div key={b} className="grid grid-cols-[20px_minmax(0,1fr)_44px] items-center gap-2.5" title={b}>
                <BrandLogo src={logoOf(b)} name={b} size={20} />
                <span className="h-2 bg-surface-2"><span className="block h-full" style={{ width: `${enough(s) ? s.share[word.word] * 100 : 0}%`, background: i === 0 ? YOU_COLOR : RIVAL_LINES[i - 1] }} /></span>
                <span className="aw-num text-right text-[13px] text-ink">{enough(s) ? pct(s.share[word.word]) : "–"}</span>
              </div>
            ); })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1.5">
              {brands.map((b) => (
                <LogoToggle key={b} on={who === b} title={b} onClick={() => setWho(b)}><BrandLogo src={logoOf(b)} name={b} size={20} /></LogoToggle>
              ))}
            </div>
            <span className="aw-num text-[12px] text-muted">{quotes ? `${quotes.length} ${quotes.length === 1 ? "quote" : "quotes"}` : ""}</span>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(70px,1fr))] gap-2">
            {p.engines.map((e) => { const s = scoreOf(who, e); const v = s.n >= (src === "buyer" ? MIN_ANSWERS : 1) ? s.share[word.word] : null; return (
              <div key={e} className="flex flex-col items-center gap-1 border border-rule p-2" title={e}>
                <EngineLogo engine={e} size={22} />
                <span className={`aw-num text-[13px] ${v === null ? "text-faint" : "text-ink"}`}>{pct(v)}</span>
              </div>
            ); })}
          </div>
          {quotes === null ? <Thinking text="Loading quotes" /> : quotes.length ? (
            <div className="flex flex-col">
              {quotes.map((q) => (
                <div key={q.id} className="grid grid-cols-[20px_minmax(0,1fr)] gap-2.5 border-t border-rule-faint py-3">
                  <EngineLogo engine={q.engine} size={20} />
                  <div className="flex flex-col items-start gap-1">
                    <p className="text-ink">{q.words.find((w) => w.word === word.word)?.quote}</p>
                    <button type="button" className="text-[12px] text-muted underline underline-offset-2" onClick={() => openFull(q)}>Full answer</button>
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-muted">No quotes</p>}
        </div>
      )}
    </SidePanel>
  );
}

function Highlighted({ text, quote }: { text: string; quote: string }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => ref.current?.scrollIntoView({ block: "center" }), [text]);
  // Match on the quote's first words, since the answer has markdown the quote lost.
  const words = quote.split(/\s+/).slice(0, 5).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s*_`#>\\[\\]()]+");
  const m = words ? text.match(new RegExp(words, "i")) : null;
  if (!m || m.index === undefined) return <div className="whitespace-pre-wrap break-words leading-[21px]">{text}</div>;
  return (
    <div className="whitespace-pre-wrap break-words leading-[21px]">
      {text.slice(0, m.index)}
      <mark ref={ref} className="bg-brand-pale text-ink">{m[0]}</mark>
      {text.slice(m.index + m[0].length)}
    </div>
  );
}
