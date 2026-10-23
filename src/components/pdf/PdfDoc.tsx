/* eslint-disable @next/next/no-img-element -- logos come from any site; this page is printed, not browsed */
// One PDF for one page (docs/reports.md, section 32.3): the shared frame, then that page's own sections.
// No hooks and no browser code, so the print page renders it on the server exactly as stored.
import type { CompetitorsPdf, PdfSnapshot, PromptsPdf, SourcesPdf } from "@/lib/pdf/pages";
import type { DomainBulkPdf, DomainPdf, GapPdf, KeywordBulkPdf, KeywordPdf, KwRow } from "@/lib/pdf/research";
import type { GapRow } from "@/lib/gap";

export type { PdfSnapshot };

const pct = (n: number | null | undefined) => (n === null || n === undefined ? "–" : `${Math.round(n)}%`);
const spot = (n: number | null | undefined) => (n === null || n === undefined ? "–" : `#${n.toFixed(1)}`);
const num = (n: number | null | undefined) => (n === null || n === undefined ? "–" : Math.round(n).toLocaleString("en-US"));

/** The change from before, with a sign and an arrow, so it reads without color. */
function Change({ now, before, unit = "", lowerIsBetter = false }: { now: number | null; before: number | null; unit?: string; lowerIsBetter?: boolean }) {
  if (now === null || before === null) return null;
  const d = now - before;
  if (Math.abs(d) < 0.5) return <span className="pdf-chg">no change</span>;
  const good = lowerIsBetter ? d < 0 : d > 0;
  return (
    <span className={`pdf-chg ${good ? "is-good" : "is-bad"}`}>
      {d > 0 ? "▲" : "▼"} {d > 0 ? "+" : "−"}
      {Math.abs(d).toFixed(unit === "%" ? 1 : 1)}
      {unit === "%" ? " pts" : ""}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="pdf-sec">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

/** A small line chart, one line per name. Visibility runs 0 to 100. */
function Lines({ points, names, colors }: { points: { label: string; values: Record<string, number | null> }[]; names: string[]; colors: string[] }) {
  if (points.length < 2) return <p className="pdf-note">Not enough days to draw a trend yet.</p>;
  const W = 700;
  const H = 200;
  const P = { l: 34, r: 10, t: 10, b: 24 };
  const x = (i: number) => P.l + (i * (W - P.l - P.r)) / (points.length - 1);
  const y = (v: number) => H - P.b - (v / 100) * (H - P.t - P.b);
  const step = Math.max(1, Math.ceil(points.length / 7));
  return (
    <figure className="pdf-chart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Visibility by day">
        {[0, 25, 50, 75, 100].map((t) => (
          <g key={t}>
            <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} stroke="var(--line)" />
            <text x={P.l - 6} y={y(t) + 4} textAnchor="end" className="pdf-axis">
              {t}%
            </text>
          </g>
        ))}
        {points.map((p, i) =>
          i % step === 0 ? (
            <text key={p.label + i} x={x(i)} y={H - 6} textAnchor="middle" className="pdf-axis">
              {p.label}
            </text>
          ) : null,
        )}
        {names.map((n, k) => {
          const d = points.map((p, i) => (p.values[n] === null || p.values[n] === undefined ? null : `${x(i)},${y(p.values[n]!)}`)).filter(Boolean);
          return d.length ? <polyline key={n} points={d.join(" ")} fill="none" stroke={colors[k % colors.length]} strokeWidth={k ? 1.6 : 2.6} /> : null;
        })}
      </svg>
      <figcaption className="pdf-legend">
        {names.map((n, k) => (
          <span key={n}>
            <i style={{ background: colors[k % colors.length] }} />
            {n}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

const Bar = ({ value, you = false }: { value: number | null; you?: boolean }) => (
  <span className="pdf-bar">
    <i style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%`, background: you ? "var(--accent)" : "var(--accent2)" }} />
  </span>
);

// ─────────────── Prompts ───────────────

function PromptsBody({ d, brand }: { d: PromptsPdf; brand: string }) {
  const s = d.scores;
  return (
    <>
      <p className="pdf-lead">{d.headline}</p>
      {s ? (
        <div className="pdf-tiles pdf-tiles--3">
          <div className="pdf-tile">
            <small>Visibility</small>
            <b>{pct(s.visibility.now)}</b>
            <Change now={s.visibility.now} before={s.visibility.before} unit="%" />
            <span>Share of AI answers that name {brand}{s.visibility.rank ? ` · Rank ${s.visibility.rank} of ${s.visibility.of}` : ""}</span>
          </div>
          <div className="pdf-tile">
            <small>Sentiment</small>
            <b>{num(s.sentiment.now)}</b>
            <Change now={s.sentiment.now} before={s.sentiment.before} />
            <span>How well AI talks about {brand}, 0 to 100{s.sentiment.rank ? ` · Rank ${s.sentiment.rank} of ${s.sentiment.of}` : ""}</span>
          </div>
          <div className="pdf-tile">
            <small>Position</small>
            <b>{num(s.position.now)}</b>
            <Change now={s.position.now} before={s.position.before} />
            <span>{s.position.spot === null ? "Not named yet" : `Average spot ${spot(s.position.spot)} in the list`}{s.position.rank ? ` · Rank ${s.position.rank} of ${s.position.of}` : ""}</span>
          </div>
        </div>
      ) : null}
      <Section title="Visibility by day">
        <Lines points={d.trend.points} names={d.trend.names} colors={["var(--accent)", "#7C8697", "#A6AEBB", "#2B3242"]} />
      </Section>
      <Section title="Visibility by topic">
        <table className="pdf-table">
          <thead>
            <tr>
              <th>Topic</th>
              <th className="r">Visibility</th>
              {d.engines.map((e) => (
                <th key={e} className="r">
                  {e}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.topics.map((t) => (
              <tr key={t.name}>
                <td className="strong">{t.name}</td>
                <td className="r num">{pct(t.visibility)}</td>
                {d.engines.map((e) => (
                  <td key={e} className="r num">
                    {pct(t.byEngine[e])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      {d.topics.map((t) => (
        <Section key={t.name} title={`Prompts in ${t.name}`}>
          <table className="pdf-table">
            <thead>
              <tr>
                <th>Prompt</th>
                <th className="r">Visibility</th>
                {d.engines.map((e) => (
                  <th key={e} className="r">
                    {e}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {t.prompts.map((p) => (
                <tr key={p.prompt}>
                  <td>{p.prompt}</td>
                  <td className="r num">{pct(p.visibility)}</td>
                  {d.engines.map((e) => (
                    <td key={e} className="r num">
                      {p.ranks[e] === null || p.ranks[e] === undefined ? "–" : `#${p.ranks[e]}`}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      ))}
      <p className="pdf-note">Engine columns show {brand}&apos;s spot in each AI&apos;s latest answer. A dash means that answer did not name {brand}.</p>
    </>
  );
}

// ─────────────── Competitors ───────────────

function Quadrant({ dots }: { dots: CompetitorsPdf["quadrant"] }) {
  if (!dots.length) return <p className="pdf-note">No brands with a position yet.</p>;
  const W = 700;
  const H = 360;
  const P = 40;
  // The axes fit the brands, so close scores still spread out. The lines sit at 50% and the middle spot, as on the page.
  const pos = dots.map((d) => d.position);
  const vis = dots.map((d) => d.visibility);
  const p0 = Math.max(1, Math.min(...pos) - 0.3);
  const p1 = Math.max(...pos) + 0.3;
  const v0 = Math.max(0, Math.min(...vis) - 8);
  const v1 = Math.min(100, Math.max(...vis) + 8);
  const x = (n: number) => P + ((p1 - n) / (p1 - p0 || 1)) * (W - 2 * P);
  const y = (n: number) => H - P - ((n - v0) / (v1 - v0 || 1)) * (H - 2 * P);
  const midPos = (Math.min(...pos) + Math.max(...pos)) / 2;
  return (
    <figure className="pdf-chart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Brands by visibility and position">
        <rect x={P} y={P} width={W - 2 * P} height={H - 2 * P} fill="var(--surface)" stroke="var(--line)" />
        <line x1={x(midPos)} x2={x(midPos)} y1={P} y2={H - P} stroke="var(--line)" />
        {v0 < 50 && v1 > 50 ? <line x1={P} x2={W - P} y1={y(50)} y2={y(50)} stroke="var(--line)" /> : null}
        <text x={P + 8} y={P + 16} className="pdf-axis">Challengers</text>
        <text x={W - P - 8} y={P + 16} textAnchor="end" className="pdf-axis">Leaders</text>
        <text x={P + 8} y={H - P - 8} className="pdf-axis">Rising stars</text>
        <text x={W - P - 8} y={H - P - 8} textAnchor="end" className="pdf-axis">Niche kings</text>
        <text x={W / 2} y={H - 10} textAnchor="middle" className="pdf-axis">
          Average spot in the list, #{p1.toFixed(1)} to #{p0.toFixed(1)} (better to the right)
        </text>
        <text x={14} y={H / 2} textAnchor="middle" transform={`rotate(-90 14 ${H / 2})`} className="pdf-axis">
          Visibility, {Math.round(v0)}% to {Math.round(v1)}%
        </text>
        {dots.map((d, i) => (
          <g key={d.name}>
            <circle cx={x(d.position)} cy={y(d.visibility)} r={d.isYou ? 7 : 5} fill={d.isYou ? "var(--accent)" : "#7C8697"} />
            <text x={x(d.position) + 9} y={y(d.visibility) + (i % 2 ? 13 : -6)} className={d.isYou ? "pdf-dot pdf-dot--you" : "pdf-dot"}>
              {d.name}
            </text>
          </g>
        ))}
      </svg>
    </figure>
  );
}

function CompetitorsBody({ d }: { d: CompetitorsPdf }) {
  return (
    <>
      <Section title="Where each brand sits">
        <Quadrant dots={d.quadrant} />
      </Section>
      <Section title="Brands AI names most">
        <table className="pdf-table">
          <thead>
            <tr>
              <th className="n">#</th>
              <th>Brand</th>
              <th>Visibility</th>
              <th className="r">Change</th>
              <th className="r">Position</th>
              <th className="r">Sentiment</th>
            </tr>
          </thead>
          <tbody>
            {d.brands.map((b, i) => (
              <tr key={b.name} className={b.isYou ? "is-you" : ""}>
                <td className="n num">{i + 1}</td>
                <td className="strong">{b.name}</td>
                <td>
                  <span className="pdf-barcell">
                    <Bar value={b.visibility} you={b.isYou} />
                    <span className="num">{pct(b.visibility)}</span>
                  </span>
                </td>
                <td className="r">
                  <Change now={b.visibility} before={b.visibilityBefore} unit="%" />
                </td>
                <td className="r num">{spot(b.position)}</td>
                <td className="r num">{num(b.sentiment)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      {d.leaders.rows.length ? (
        <Section title="Topic leaders">
          <table className="pdf-table">
            <thead>
              <tr>
                <th>Topic</th>
                {d.leaders.names.map((n) => (
                  <th key={n} className="r">
                    {n}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.leaders.rows.map((r) => (
                <tr key={r.topic}>
                  <td className="strong">{r.topic}</td>
                  {d.leaders.names.map((n) => (
                    <td key={n} className={`r num ${r.leader === n ? "is-lead" : ""}`}>
                      {pct(r.values[n])}
                      {r.leader === n ? " ★" : ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="pdf-note">★ marks the brand named most in each topic.</p>
        </Section>
      ) : null}
      {d.battle ? (
        <Section title={`Battle card: ${d.battle.a} vs ${d.battle.b}`}>
          <div className="pdf-tiles pdf-tiles--4">
            {d.battle.tiles.map((t) => {
              const show = (v: number | null) => (t.label === "Visibility" ? pct(v) : t.label === "Position" ? spot(v) : t.label === "Rank by visibility" ? (v === null ? "–" : `#${v}`) : num(v));
              return (
                <div key={t.label} className="pdf-tile">
                  <small>{t.label}</small>
                  <span className="pdf-vs">
                    <b>{show(t.a)}</b>
                    <em>vs</em>
                    <b className="is-them">{show(t.b)}</b>
                  </span>
                </div>
              );
            })}
          </div>
          <Lines points={d.battle.trend} names={[d.battle.a, d.battle.b]} colors={["var(--accent)", "#7C8697"]} />
          <table className="pdf-table">
            <thead>
              <tr>
                <th>AI model</th>
                <th className="r">{d.battle.a}</th>
                <th className="r">{d.battle.b}</th>
                <th className="r">Gap</th>
              </tr>
            </thead>
            <tbody>
              {d.battle.byEngine.map((r) => (
                <tr key={r.key}>
                  <td className="strong">{r.key}</td>
                  <td className="r num">{pct(r.a)}</td>
                  <td className="r num">{pct(r.b)}</td>
                  <td className="r num">{r.a === null || r.b === null ? "–" : `${r.a - r.b > 0 ? "+" : r.a - r.b < 0 ? "−" : ""}${Math.abs(r.a - r.b).toFixed(1)} pts`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      ) : null}
    </>
  );
}

// ─────────────── Sources ───────────────

const path = (u: string) => {
  try {
    const x = new URL(u);
    return `${x.hostname.replace(/^www\./, "")}${x.pathname === "/" ? "" : x.pathname}`.slice(0, 90);
  } catch {
    return u.slice(0, 90);
  }
};

function SourcesBody({ d }: { d: SourcesPdf }) {
  const parts = [
    { label: "Owned", value: d.shares.owned, color: "var(--accent)" },
    { label: "Third-party", value: d.shares.third, color: "var(--ink)" },
    { label: "Review sites", value: d.shares.reviews, color: "var(--accent2)" },
  ];
  return (
    <>
      <Section title="What AI reads when it answers">
        <div className="pdf-share" role="img" aria-label={parts.map((p) => `${p.label} ${pct(p.value)}`).join(", ")}>
          {parts.filter((p) => p.value > 0).map((p) => (
            <i key={p.label} style={{ width: `${p.value}%`, background: p.color }} />
          ))}
        </div>
        <p className="pdf-legend">
          {parts.map((p) => (
            <span key={p.label}>
              <i style={{ background: p.color }} />
              {p.label} {pct(p.value)}
            </span>
          ))}
        </p>
      </Section>
      <Section title="Top sites AI cites">
        <table className="pdf-table">
          <thead>
            <tr>
              <th className="n">#</th>
              <th>Site</th>
              <th>Type</th>
              <th className="r">Used</th>
              <th className="r">Answers</th>
            </tr>
          </thead>
          <tbody>
            {d.sites.map((s, i) => (
              <tr key={s.domain}>
                <td className="n num">{i + 1}</td>
                <td className="strong">{s.domain}</td>
                <td>{s.type}</td>
                <td className="r num">{num(s.used)}</td>
                <td className="r num">{num(s.chats)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section title="Most cited links">
        <table className="pdf-table">
          <thead>
            <tr>
              <th className="n">#</th>
              <th>Link</th>
              <th className="r">Used</th>
              <th className="r">Answers</th>
              <th className="r">Prompts</th>
            </tr>
          </thead>
          <tbody>
            {d.links.map((l, i) => (
              <tr key={l.url}>
                <td className="n num">{i + 1}</td>
                <td>
                  <span className="strong">{l.title || path(l.url)}</span>
                  {l.title ? <small className="pdf-sub">{path(l.url)}</small> : null}
                </td>
                <td className="r num">{num(l.used)}</td>
                <td className="r num">{num(l.chats)}</td>
                <td className="r num">{num(l.prompts)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section title="Your pages AI cites">
        {d.owned.length ? (
          <table className="pdf-table">
            <thead>
              <tr>
                <th>Page</th>
                <th className="r">Used</th>
                <th className="r">Answers</th>
                <th className="r">Prompts</th>
              </tr>
            </thead>
            <tbody>
              {d.owned.map((l) => (
                <tr key={l.url}>
                  <td>
                    <span className="strong">{l.title || path(l.url)}</span>
                    {l.title ? <small className="pdf-sub">{path(l.url)}</small> : null}
                  </td>
                  <td className="r num">{num(l.used)}</td>
                  <td className="r num">{num(l.chats)}</td>
                  <td className="r num">{num(l.prompts)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="pdf-note">AI did not cite any of your pages in this period.</p>
        )}
      </Section>
    </>
  );
}

// ─────────────── Research ───────────────

const money = (n: number | null | undefined) => (n === null || n === undefined ? "–" : `$${n.toFixed(2)}`);
const kdText = (kd: number | null, word?: string | null) => (kd === null ? "–" : word ? `${kd} · ${word}` : String(kd));
const rankText = (n: number | null | undefined) => (n === null || n === undefined ? "–" : `#${n}`);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function Tiles({ items }: { items: { label: string; value: string; note?: string; text?: boolean }[] }) {
  return (
    <div className={`pdf-tiles ${items.length > 4 ? "pdf-tiles--dense" : ""}`} style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
      {items.map((t) => (
        <div key={t.label} className="pdf-tile">
          <small>{t.label}</small>
          <b className={t.text ? "is-text" : ""}>{t.value}</b>
          {t.note ? <span>{t.note}</span> : null}
        </div>
      ))}
    </div>
  );
}

/** Searches a month as bars, oldest first. */
function Bars({ points }: { points: { month: string; volume: number }[] }) {
  if (points.length < 2) return <p className="pdf-note">No monthly searches to show yet.</p>;
  const W = 700;
  const H = 170;
  const P = { l: 44, r: 6, t: 8, b: 22 };
  const max = Math.max(1, ...points.map((p) => p.volume));
  const w = (W - P.l - P.r) / points.length;
  const y = (v: number) => H - P.b - (v / max) * (H - P.t - P.b);
  return (
    <figure className="pdf-chart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Searches a month">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={P.l} x2={W - P.r} y1={y(max * f)} y2={y(max * f)} stroke="var(--line)" />
            <text x={P.l - 6} y={y(max * f) + 4} textAnchor="end" className="pdf-axis">
              {num(max * f)}
            </text>
          </g>
        ))}
        {points.map((p, i) => (
          <g key={p.month}>
            <rect x={P.l + i * w + 4} y={y(p.volume)} width={Math.max(2, w - 8)} height={H - P.b - y(p.volume)} fill="var(--accent)" />
            <text x={P.l + i * w + w / 2} y={H - 6} textAnchor="middle" className="pdf-axis">
              {MONTHS[Number(p.month.slice(5, 7)) - 1] ?? p.month}
            </text>
          </g>
        ))}
      </svg>
    </figure>
  );
}

function KwTable({ rows }: { rows: KwRow[] }) {
  if (!rows.length) return <p className="pdf-note">None found.</p>;
  return (
    <table className="pdf-table">
      <thead>
        <tr>
          <th>Keyword</th>
          <th className="r">Volume</th>
          <th className="r">Difficulty</th>
          <th>Intent</th>
          <th className="r">CPC</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.keyword}>
            <td className="strong">{r.keyword}</td>
            <td className="r num">{num(r.volume)}</td>
            <td className="r num">{kdText(r.kd)}</td>
            <td className="cap">{r.intent ?? "–"}</td>
            <td className="r num">{money(r.cpc)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function KeywordBody({ d }: { d: KeywordPdf }) {
  const t = d.tiles;
  return (
    <>
      {t ? (
        <Tiles
          items={[
            { label: "Volume", value: num(t.volume), note: t.source === "ads" ? "From Google Ads" : t.source === "clickstream" ? "Clickstream estimate" : "Searches a month" },
            { label: "Difficulty", value: t.kd === null ? "–" : String(t.kd), note: t.kdWord ?? undefined },
            { label: "Intent", value: t.intent ? t.intent[0].toUpperCase() + t.intent.slice(1) : "–", text: Boolean(t.intent) },
            { label: "CPC", value: money(t.cpc) },
            { label: "12-month trend", value: t.trendChange === null ? "–" : `${t.trendChange > 0 ? "+" : t.trendChange < 0 ? "−" : ""}${Math.abs(t.trendChange)}%`, note: t.trendChange === null ? undefined : t.trendChange >= 0 ? "▲ Growing" : "▼ Falling" },
          ]}
        />
      ) : (
        <p className="pdf-lead">No search data for &ldquo;{d.keyword}&rdquo; in {d.country}.</p>
      )}
      <Section title="Searches by month">
        <Bars points={d.trend} />
      </Section>
      <Section title={`Keyword variations · ${num(d.variations.total)} in all`}>
        <KwTable rows={d.variations.rows} />
      </Section>
      <Section title={`Questions · ${num(d.questions.total)} in all`}>
        <KwTable rows={d.questions.rows} />
      </Section>
      {d.clusters.length ? (
        <Section title="Keyword clusters">
          <table className="pdf-table">
            <thead>
              <tr>
                <th>Cluster</th>
                <th className="r">Keywords</th>
                <th className="r">Volume</th>
                <th>Examples</th>
              </tr>
            </thead>
            <tbody>
              {d.clusters.map((c) => (
                <tr key={c.name}>
                  <td className="strong">{c.name}</td>
                  <td className="r num">{num(c.count)}</td>
                  <td className="r num">{num(c.volume)}</td>
                  <td>{c.keywords.slice(0, 4).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      ) : null}
      <Section title="Google top 10">
        {d.serp && d.serp.rows.length ? (
          <>
            <table className="pdf-table">
              <thead>
                <tr>
                  <th className="n">#</th>
                  <th>Page</th>
                  <th className="r">Visits</th>
                  <th className="r">Keywords</th>
                  <th className="r">AI Overview</th>
                </tr>
              </thead>
              <tbody>
                {d.serp.rows.map((r) => (
                  <tr key={r.rank + r.url}>
                    <td className="n num">{r.rank}</td>
                    <td>
                      <span className="strong">{r.title || r.domain}</span>
                      <small className="pdf-sub">{path(r.url)}</small>
                    </td>
                    <td className="r num">{num(r.traffic)}</td>
                    <td className="r num">{num(r.keywords)}</td>
                    <td className="r">{r.aiCited ? "Cited" : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {d.serp.features.length ? <p className="pdf-note">On the page: {d.serp.features.map((f) => f.replace(/_/g, " ")).join(", ")}.</p> : null}
          </>
        ) : (
          <p className="pdf-note">Google&apos;s results for this keyword are not saved.</p>
        )}
      </Section>
      {d.serp?.aio.shown ? (
        <Section title="Sources in the AI Overview">
          {d.serp.aio.cites.length ? (
            <table className="pdf-table">
              <thead>
                <tr>
                  <th className="n">#</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {d.serp.aio.cites.map((c, i) => (
                  <tr key={c.url + i}>
                    <td className="n num">{i + 1}</td>
                    <td>
                      <span className="strong">{c.title || c.domain}</span>
                      <small className="pdf-sub">{path(c.url)}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="pdf-note">Google showed an AI Overview with no sources.</p>
          )}
        </Section>
      ) : null}
    </>
  );
}

function KeywordBulkBody({ d }: { d: KeywordBulkPdf }) {
  return (
    <>
      <Tiles
        items={[
          { label: "Keywords", value: num(d.tiles.keywords) },
          { label: "With data", value: num(d.tiles.found) },
          { label: "Searches a month", value: num(d.tiles.volume) },
          { label: "Average difficulty", value: num(d.tiles.avgKd) },
        ]}
      />
      <Section title="Every keyword">
        <table className="pdf-table">
          <thead>
            <tr>
              <th>Keyword</th>
              <th className="r">Volume</th>
              <th className="r">Difficulty</th>
              <th>Intent</th>
              <th className="r">CPC</th>
              <th className="r">12 months</th>
            </tr>
          </thead>
          <tbody>
            {d.rows.map((r) => (
              <tr key={r.keyword}>
                <td className="strong">{r.keyword}</td>
                <td className="r num">{num(r.volume)}</td>
                <td className="r num">{kdText(r.kd)}</td>
                <td className="cap">{r.intent ?? "–"}</td>
                <td className="r num">{money(r.cpc)}</td>
                <td className="r num">{r.trendChange === null ? "–" : `${r.trendChange > 0 ? "+" : r.trendChange < 0 ? "−" : ""}${Math.abs(r.trendChange)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </>
  );
}

function DomainBody({ d }: { d: DomainPdf }) {
  const o = d.tiles;
  return (
    <>
      {o ? (
        <Tiles
          items={[
            { label: "Keywords on Google", value: num(o.keywords) },
            { label: "Visits a month", value: num(o.traffic), note: "Estimated" },
            { label: "In top 3", value: num(o.top3) },
            { label: "In top 10", value: num(o.top10) },
            { label: "New this month", value: `+${num(o.newKw)}`, note: `${num(o.lostKw)} lost` },
          ]}
        />
      ) : (
        <p className="pdf-lead">Google has little data for {d.domain} in {d.country}.</p>
      )}
      <Section title="Top 50 keywords">
        {d.keywords.length ? (
          <table className="pdf-table">
            <thead>
              <tr>
                <th>Keyword</th>
                <th className="r">Position</th>
                <th className="r">Volume</th>
                <th className="r">Difficulty</th>
                <th className="r">Visits</th>
                <th>Page</th>
              </tr>
            </thead>
            <tbody>
              {d.keywords.map((k) => (
                <tr key={k.keyword}>
                  <td className="strong">{k.keyword}</td>
                  <td className="r num">{rankText(k.rank)}</td>
                  <td className="r num">{num(k.volume)}</td>
                  <td className="r num">{kdText(k.kd)}</td>
                  <td className="r num">{num(k.traffic)}</td>
                  <td className="pdf-url">{k.url ? path(k.url) : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="pdf-note">No ranking keywords found.</p>
        )}
      </Section>
      <Section title="Top 20 pages">
        {d.pages.length ? (
          <table className="pdf-table">
            <thead>
              <tr>
                <th>Page</th>
                <th className="r">Keywords</th>
                <th className="r">Visits</th>
                <th>Top keyword</th>
              </tr>
            </thead>
            <tbody>
              {d.pages.map((p) => (
                <tr key={p.url}>
                  <td className="pdf-url strong">{path(p.url)}</td>
                  <td className="r num">{num(p.keywords)}</td>
                  <td className="r num">{num(p.traffic)}</td>
                  <td>{p.top}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="pdf-note">No pages found.</p>
        )}
      </Section>
      <Section title="Top 10 competitors">
        {d.competitors.length ? (
          <table className="pdf-table">
            <thead>
              <tr>
                <th className="n">#</th>
                <th>Site</th>
                <th className="r">Shared keywords</th>
                <th className="r">Keywords</th>
                <th className="r">Visits</th>
              </tr>
            </thead>
            <tbody>
              {d.competitors.map((c, i) => (
                <tr key={c.domain}>
                  <td className="n num">{i + 1}</td>
                  <td className="strong">{c.domain}</td>
                  <td className="r num">{num(c.shared)}</td>
                  <td className="r num">{num(c.keywords)}</td>
                  <td className="r num">{num(c.traffic)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="pdf-note">No competitors found.</p>
        )}
      </Section>
    </>
  );
}

function DomainBulkBody({ d }: { d: DomainBulkPdf }) {
  return (
    <>
      <Tiles
        items={[
          { label: "Sites", value: num(d.tiles.sites) },
          { label: "Keywords on Google", value: num(d.tiles.keywords) },
          { label: "Visits a month", value: num(d.tiles.traffic), note: "Estimated" },
          { label: "Traffic value", value: `$${num(d.tiles.value)}` },
        ]}
      />
      <Section title="Every site">
        <table className="pdf-table">
          <thead>
            <tr>
              <th>Site or page</th>
              <th className="r">Keywords</th>
              <th className="r">Visits</th>
              <th className="r">Value</th>
              <th className="r">Paid keywords</th>
            </tr>
          </thead>
          <tbody>
            {d.rows.map((r) => (
              <tr key={r.target}>
                <td className="pdf-url strong">{path(r.kind === "page" ? r.target : `https://${r.target}`)}</td>
                <td className="r num">{num(r.keywords)}</td>
                <td className="r num">{num(r.traffic)}</td>
                <td className="r num">{r.value === null ? "–" : `$${num(r.value)}`}</td>
                <td className="r num">{num(r.paidKeywords)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </>
  );
}

function GapTable({ rows, you, them }: { rows: GapRow[]; you: string; them: string }) {
  if (!rows.length) return <p className="pdf-note">None found.</p>;
  return (
    <table className="pdf-table">
      <thead>
        <tr>
          <th>Keyword</th>
          <th className="r">Volume</th>
          <th className="r">Difficulty</th>
          <th className="r">{them}</th>
          <th className="r">{you}</th>
          <th>{them}&apos;s page</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.keyword}>
            <td className="strong">{r.keyword}</td>
            <td className="r num">{num(r.volume)}</td>
            <td className="r num">{kdText(r.kd)}</td>
            <td className="r num">{rankText(r.them)}</td>
            <td className="r num">{rankText(r.you)}</td>
            <td className="pdf-url">{r.url ? path(r.url) : "–"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function GapBody({ d }: { d: GapPdf }) {
  const you = d.you.name;
  const them = d.them.name;
  return (
    <>
      <Tiles
        items={[
          { label: `Owned by ${them}`, value: num(d.counts.missing) },
          { label: "Shared", value: num(d.counts.shared) },
          { label: `Owned by ${you}`, value: num(d.counts.only) },
          { label: `${them} ranks higher`, value: num(d.counts.weaker), note: "Shared keywords" },
          { label: `${you} ranks higher`, value: num(d.counts.lead), note: "Shared keywords" },
        ]}
      />
      {d.rivals.length ? (
        <Section title="Rivals in AI answers">
          <table className="pdf-table">
            <thead>
              <tr>
                <th>Brand</th>
                <th>Site</th>
                <th>Visibility</th>
                <th className="r">Position</th>
              </tr>
            </thead>
            <tbody>
              {d.rivals.map((r) => (
                <tr key={r.name} className={r.domain === d.them.domain ? "is-you" : ""}>
                  <td className="strong">{r.name}</td>
                  <td>{r.domain}</td>
                  <td>
                    <span className="pdf-barcell">
                      <Bar value={r.visibility} />
                      <span className="num">{pct(r.visibility)}</span>
                    </span>
                  </td>
                  <td className="r num">{spot(r.position)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      ) : null}
      <Section title={`Top 50 opportunities: keywords only ${them} ranks for`}>
        <GapTable rows={d.opportunities} you={you} them={them} />
      </Section>
      <Section title={`Where ${them} leads`}>
        <GapTable rows={d.theyLead} you={you} them={them} />
      </Section>
      <Section title={`Where ${you} leads`}>
        <GapTable rows={d.youLead} you={you} them={them} />
      </Section>
    </>
  );
}

/** The whole PDF: cover, the page's sections, and the footer. */
export function PdfDoc({ s }: { s: PdfSnapshot }) {
  const t = s.tokens;
  const vars = {
    "--accent": t.accent,
    "--accent2": t.accent2,
    "--ink": t.ink,
    "--text": t.text,
    "--muted": t.muted,
    "--paper": t.paper,
    "--surface": t.surface,
    "--line": t.line,
    "--cover": t.coverBg,
    "--cover-text": t.coverText,
    "--heading": t.heading,
    "--body": t.body,
    "--numbers": t.numbers,
    "--radius": `${t.radius}px`,
  } as React.CSSProperties;
  const made = new Date(s.at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const d = s.data;
  return (
    <article className="pdf" style={vars}>
      {t.fonts ? <link rel="stylesheet" href={t.fonts} /> : null}
      <style>{PDF_CSS}</style>
      <header className="pdf-cover">
        <div className="pdf-cover__top">
          {t.logo ? <img src={t.logo} alt={t.maker} className="pdf-cover__logo" /> : <b className="pdf-cover__maker">{t.maker}</b>}
          <span>{made}</span>
        </div>
        <p className="pdf-cover__for">
          {s.brand.logo ? <img src={s.brand.logo} alt="" /> : null}
          {t.design === "brand" && t.maker !== s.brand.name ? `Prepared for ${s.brand.name}` : s.brand.name} · {s.brand.domain}
        </p>
        <h1>{s.title}</h1>
        <p className="pdf-cover__period">
          {s.period}
          {s.filters.length ? ` · ${s.filters.join(" · ")}` : ""}
        </p>
      </header>
      <main className="pdf-body">
        {"answers" in d && !d.answers ? <p className="pdf-lead">No AI answers in these dates yet. Daily checks fill this report in.</p> : null}
        {d.page === "prompts" ? (
          <PromptsBody d={d} brand={s.brand.name} />
        ) : d.page === "competitors" ? (
          <CompetitorsBody d={d} />
        ) : d.page === "sources" ? (
          <SourcesBody d={d} />
        ) : d.page === "keywords" ? (
          <KeywordBody d={d} />
        ) : d.page === "keywords-bulk" ? (
          <KeywordBulkBody d={d} />
        ) : d.page === "domain" ? (
          <DomainBody d={d} />
        ) : d.page === "domain-bulk" ? (
          <DomainBulkBody d={d} />
        ) : (
          <GapBody d={d} />
        )}
      </main>
      <footer className="pdf-foot">{t.footer || t.maker}</footer>
    </article>
  );
}

const PDF_CSS = `
.pdf { font-family: var(--body); color: var(--text); background: var(--paper); font-size: 12.5px; line-height: 1.5; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.pdf *, .pdf *::before, .pdf *::after { box-sizing: border-box; }
.pdf h1, .pdf h2 { font-family: var(--heading); color: var(--ink); margin: 0; letter-spacing: -0.01em; }
.pdf .num, .pdf-tile b { font-family: var(--numbers); font-variant-numeric: tabular-nums; }
.pdf-cover { padding: 28px 32px 30px; border-radius: var(--radius); background: var(--cover); color: var(--cover-text); }
.pdf-cover__top { display: flex; align-items: center; justify-content: space-between; gap: 16px; font-size: 12px; opacity: .9; }
.pdf-cover__logo { max-height: 30px; max-width: 200px; object-fit: contain; }
.pdf-cover__maker { font-family: var(--heading); font-size: 18px; }
.pdf-cover__for { display: flex; align-items: center; gap: 8px; margin: 34px 0 6px; font-size: 13px; opacity: .85; }
.pdf-cover__for img { width: 18px; height: 18px; border-radius: 4px; object-fit: contain; background: #fff; }
.pdf-cover h1 { color: var(--cover-text); font-size: 34px; line-height: 1.1; font-weight: 600; }
.pdf-cover__period { margin: 10px 0 0; font-size: 13px; opacity: .85; }
.pdf-body { padding: 8px 4px 0; }
.pdf-lead { margin: 22px 0 6px; font-size: 15px; color: var(--ink); font-weight: 500; }
.pdf-sec { margin-top: 26px; break-inside: auto; }
.pdf-sec h2 { font-size: 17px; font-weight: 600; margin-bottom: 10px; break-after: avoid; }
.pdf-tiles { display: grid; gap: 10px; margin-top: 16px; }
.pdf-tiles--3 { grid-template-columns: repeat(3, 1fr); }
.pdf-tiles--4 { grid-template-columns: repeat(4, 1fr); margin-bottom: 14px; }
.pdf-tile { display: flex; flex-direction: column; gap: 3px; padding: 12px 14px; border-radius: var(--radius); background: var(--surface); border: 1px solid var(--line); break-inside: avoid; }
.pdf-tile small { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
.pdf-tile b { font-size: 26px; font-weight: 500; color: var(--ink); line-height: 1.15; }
.pdf-tile span { font-size: 11.5px; color: var(--muted); }
.pdf-tiles--dense .pdf-tile b { font-size: 19px; }
.pdf-tile b.is-text { font-family: var(--body); font-weight: 600; }
.pdf-vs { display: flex; align-items: baseline; gap: 6px; }
.pdf-vs b { font-size: 20px; }
.pdf-vs b.is-them { color: var(--muted); }
.pdf-vs em { font-style: normal; font-size: 11px; color: var(--muted); }
.pdf-chg { font-size: 11.5px; font-weight: 500; color: var(--muted); }
.pdf-chg.is-good { color: #0B7A54; }
.pdf-chg.is-bad { color: #C02A35; }
.pdf-table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
.pdf-table th { text-align: left; font-weight: 600; color: var(--muted); font-size: 10.5px; text-transform: uppercase; letter-spacing: .04em; padding: 6px 8px; border-bottom: 1px solid var(--line); }
.pdf-table td { padding: 6px 8px; border-bottom: 1px solid var(--line); vertical-align: top; color: var(--text); }
.pdf-table tr { break-inside: avoid; }
.pdf-table thead { display: table-header-group; }
.pdf-table .r { text-align: right; white-space: nowrap; }
.pdf-table .n { width: 28px; color: var(--muted); }
.pdf-table .strong { color: var(--ink); font-weight: 500; }
.pdf-table tr.is-you td { background: var(--surface); }
.pdf-table tr.is-you .strong { color: var(--accent); }
.pdf-table td.is-lead { color: var(--ink); font-weight: 600; }
.pdf-sub { display: block; font-size: 10.5px; color: var(--muted); word-break: break-all; }
.pdf-table .cap { text-transform: capitalize; }
.pdf-table .pdf-url { font-size: 10.5px; word-break: break-all; max-width: 220px; }
.pdf-barcell { display: flex; align-items: center; gap: 8px; }
.pdf-bar { display: block; flex: 1; min-width: 80px; height: 6px; border-radius: 3px; background: var(--line); overflow: hidden; }
.pdf-bar i { display: block; height: 100%; }
.pdf-chart { margin: 0; break-inside: avoid; }
.pdf-axis { font-size: 10px; fill: var(--muted); font-family: var(--body); }
.pdf-dot { font-size: 10.5px; fill: var(--text); font-family: var(--body); }
.pdf-dot--you { fill: var(--accent); font-weight: 600; }
.pdf-legend { display: flex; flex-wrap: wrap; gap: 6px 16px; margin: 6px 0 0; font-size: 11px; color: var(--muted); }
.pdf-legend span { display: inline-flex; align-items: center; gap: 6px; }
.pdf-legend i { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
.pdf-share { display: flex; gap: 2px; height: 26px; border-radius: var(--radius); overflow: hidden; }
.pdf-share i { display: block; height: 100%; }
.pdf-note { margin: 8px 0 0; font-size: 11px; color: var(--muted); }
.pdf-foot { margin-top: 30px; padding-top: 10px; border-top: 1px solid var(--line); font-size: 10.5px; color: var(--muted); }
@media screen { .pdf { max-width: 860px; margin: 24px auto; padding: 0 16px 40px; } }
@media print { html, body, body > .aw { background: var(--paper) !important; min-height: 0 !important; } }
`;
