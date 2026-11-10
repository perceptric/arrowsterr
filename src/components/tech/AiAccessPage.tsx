"use client";

import { useCallback, useEffect, useState } from "react";
import type { RunAuth } from "@/lib/runner";
import { BOTS, isBad, type BotAccess } from "@/lib/tech/ai";
import { downloadCsv } from "../research/shared";
import { Card, SidePanel, StatStrip, Thinking } from "../ui";
import { AiAccessIntro } from "../ToolIntros";
import { useApi } from "../ZippiePage";

// Technical SEO, AI access (docs/technical-seo-plan.md, phase 4): which AI crawlers may fetch the site and whether
// the firewall lets them, how much of each template needs JavaScript, the brand's pages AI cites, how competitor
// pages AI cites are built, llms.txt, IndexNow and structured data by template.

type Brand = { id: string; name: string; domain: string };
type Tpl = { pattern: string; name: string; pages: number; rendered: number; raw: number | null; after: number | null; share: number | null; headingsRaw: number | null; headingsAfter: number | null; dependent: number; shot: string | null };
type Cited = { url: string; title: string; used: number; status: number | null; indexable: boolean | null; share: number | null; why: string | null };
type Wp = { name: string; plugin: string | null; ready: boolean; indexnow: boolean | null; by: string | null; llms: boolean | null; admin: boolean | null } | null;
type Data = {
  crawl: { id: string; at: string; pages: number; root: string | null; phase4: boolean } | null;
  ai?: { bots: BotAccess[]; llms: { valid: boolean; links: number; broken: string[] } | null; indexNow: boolean | null; cited: number; citedBroken: { url: string; why: string }[] } | null;
  readable?: { rendered: number; readable: number; dependent: number; share: number | null };
  templates?: Tpl[];
  schema?: { pattern: string; name: string; pages: number; types: { type: string; pages: number }[] }[];
  cited?: { answers: number; pages: Cited[] };
  wordpress: Wp;
  canEdit?: boolean;
};
type Rivals = { at: string; theirs: { url: string; domain: string; title: string; used: number; words: number; schema: string[]; questions: number; firstWords: number }[]; yours: number; rows: { label: string; theirs: number; yours: number; gap: boolean }[] };

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const num = (x: number) => x.toLocaleString("en-US");
const short = (u: string, root?: string | null) => {
  try {
    const x = new URL(u);
    return root && x.hostname.replace(/^www\./, "") === new URL(root).hostname.replace(/^www\./, "") ? x.pathname + x.search : u.replace(/^https?:\/\//, "");
  } catch {
    return u;
  }
};
const KIND: Record<string, string> = { search: "AI search", user: "AI user fetch", training: "AI training", google: "Search", bing: "Search" };

export function AiAccessPage({ brand, auth }: { brand: Brand; auth: RunAuth }) {
  const api = useApi(auth);
  const call = useCallback(<T,>(action: string, extra: Record<string, unknown> = {}) => api<T>("/api/tech", { action, brandId: brand.id, ...extra }), [api, brand.id]);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [shot, setShot] = useState<{ url: string; name: string; img: string | null } | null>(null);
  const [rivals, setRivals] = useState<Rivals | null>(null);
  const [busy, setBusy] = useState("");
  const [llms, setLlms] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await call<Data>("ai"));
    } catch (e) {
      setError(msg(e));
    }
  }, [call]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError("");
    setNote("");
    try {
      await fn();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy("");
    }
  }
  const openShot = (url: string, name: string) =>
    run(`shot:${url}`, async () => {
      setShot({ url, name, img: null });
      const r = await call<{ shot: string | null }>("shot", { url });
      setShot({ url, name, img: r.shot });
    });

  const head = <h1 className="aw-h2 mb-0!">AI access</h1>;
  if (!data) return <div className="flex flex-col gap-6">{head}{error ? <p className="aw-error">{error}</p> : <Thinking text="Loading" />}</div>;
  if (!data.crawl)
    return (
      <div className="flex flex-col gap-6">
        {head}
        <p className="aw-callout">Run a Site Audit to check how AI crawlers see {brand.domain}.</p>
        <AiAccessIntro />
      </div>
    );

  const root = data.crawl.root;
  const ai = data.ai ?? null;
  const bots = ai?.bots ?? [];
  const r = data.readable!;
  const allowed = bots.filter((b) => b.robots?.allowed !== false && !isBad(b.firewall)).length;
  const fwBlocked = bots.filter((b) => isBad(b.firewall)).length;
  const wp = data.wordpress;
  const indexNow = ai?.indexNow ?? wp?.indexnow ?? null;
  const llmsState = !ai ? null : !ai.llms ? "Missing" : !ai.llms.valid ? "No title line" : "Found";

  return (
    <div className="flex flex-col gap-4">
      {head}
      {error ? <p className="aw-error">{error}</p> : null}
      {note ? <p className="aw-callout">{note}</p> : null}
      {!data.crawl.phase4 ? <p className="aw-callout">Run a new Site Audit to check each AI crawler against your robots.txt and firewall.</p> : null}
      <StatStrip
        stats={[
          { label: "AI-readable pages", value: r.rendered ? `${Math.round((r.readable / r.rendered) * 100)}%` : "–", sub: r.rendered ? `${num(r.readable)} of ${num(r.rendered)} rendered pages` : "No pages rendered", tone: r.rendered && r.readable / r.rendered < 0.7 ? "warn" : undefined },
          { label: "Bots allowed", value: ai ? `${allowed} of ${bots.length}` : "–" },
          { label: "Blocked by firewall", value: ai ? num(fwBlocked) : "–", tone: fwBlocked ? "neg" : undefined },
          { label: "JavaScript-dependent", value: num(r.dependent), tone: r.dependent ? "warn" : undefined, sub: "Under half the text in raw HTML" },
          { label: "llms.txt", value: llmsState ?? "–", tone: llmsState && llmsState !== "Found" ? "warn" : undefined },
          { label: "IndexNow", value: indexNow === null ? "–" : indexNow ? "On" : "Off", tone: indexNow === false ? "warn" : undefined },
        ]}
      />

      <Card title="AI crawlers" action={<span className="text-[12px] text-muted">Crawled {new Date(data.crawl.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}>
        {bots.length ? <BotMatrix bots={bots} share={r.share} /> : <p className="px-5 pb-5 text-[13px] text-muted">Run a new Site Audit to fill this in.</p>}
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card
          title="JavaScript dependence by template"
          action={
            <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" disabled={!data.templates?.length} onClick={() => downloadCsv("ai-access-templates.csv", ["template", "pages", "rendered", "raw words", "rendered words", "raw share %", "headings raw", "headings rendered", "pages under 50%"], (data.templates ?? []).map((t) => [t.name, t.pages, t.rendered, t.raw ?? "", t.after ?? "", t.share ?? "", t.headingsRaw ?? "", t.headingsAfter ?? "", t.dependent]))}>
              Export CSV
            </button>
          }
        >
          {data.templates?.some((t) => t.rendered) ? (
            <div className="overflow-x-auto">
              <table className="aw-table">
                <thead>
                  <tr>
                    <th>Template</th>
                    <th className="text-right">Rendered</th>
                    <th className="text-right">Words raw</th>
                    <th className="text-right">After JS</th>
                    <th>Text in raw HTML</th>
                    <th className="text-right">Headings</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.templates.filter((t) => t.rendered).map((t) => (
                    <tr key={t.pattern}>
                      <td>
                        <span className="block font-medium text-ink">{t.name}</span>
                        <span className="block text-[12px] wrap-anywhere text-muted">{t.pattern}</span>
                      </td>
                      <td className="aw-num text-right">
                        {num(t.rendered)} of {num(t.pages)}
                      </td>
                      <td className="aw-num text-right">{t.raw === null ? "–" : num(t.raw)}</td>
                      <td className="aw-num text-right">{t.after === null ? "–" : num(t.after)}</td>
                      <td className="min-w-36">
                        <ShareBar share={t.share} />
                      </td>
                      <td className="aw-num text-right">
                        {t.headingsRaw ?? "–"} → {t.headingsAfter ?? "–"}
                      </td>
                      <td className="text-right">
                        {t.shot ? (
                          <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => openShot(t.shot!, t.name)} disabled={busy === `shot:${t.shot}`}>
                            Screenshot
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-5 pb-5 text-[13px] text-muted">No pages were rendered in the latest crawl.</p>
          )}
        </Card>
        <div className="flex flex-col gap-4">
          <LlmsCard ai={ai} wp={wp} canEdit={Boolean(data.canEdit)} busy={busy} text={llms} root={root}
            onDraft={() => run("llms", async () => setLlms((await call<{ text: string }>("llms")).text))}
            onChange={setLlms}
            onPublish={() => run("publish", async () => {
              const out = await call<{ url: string }>("llmsPublish", { text: llms ?? "" });
              setNote(`Saved. It's live at ${out.url}.`);
              await load();
            })}
          />
          <IndexNowCard on={indexNow} wp={wp} canEdit={Boolean(data.canEdit)} busy={busy === "indexnow"}
            onToggle={(on) => run("indexnow", async () => {
              await call("indexnow", { on });
              setNote(on ? "IndexNow is on. Published and updated pages now go to Bing and the others right away." : "IndexNow is off.");
              await load();
            })}
          />
        </div>
      </div>

      <Card title={`Your pages AI cites${data.cited?.answers ? ` (${num(data.cited.answers)} answers, last 30 days)` : ""}`}>
        {data.cited?.pages.length ? (
          <div className="overflow-x-auto">
            <table className="aw-table">
              <thead>
                <tr>
                  <th>Page</th>
                  <th className="text-right">Cited in</th>
                  <th>Status</th>
                  <th>Text in raw HTML</th>
                </tr>
              </thead>
              <tbody>
                {data.cited.pages.map((p) => (
                  <tr key={p.url}>
                    <td className="max-w-[560px] min-w-60">
                      <span className="block font-medium wrap-anywhere text-ink">{short(p.url, root)}</span>
                      {p.title ? <span className="block text-[12px] wrap-break-word text-muted">{p.title}</span> : null}
                    </td>
                    <td className="aw-num text-right">{p.used}%</td>
                    <td>
                      {p.why ? (
                        <span className="aw-status aw-status--missed">{p.why}</span>
                      ) : p.status === null ? (
                        <span className="text-[12.5px] text-muted">Not crawled</span>
                      ) : p.status >= 200 && p.status < 300 && p.indexable ? (
                        <span className="aw-status aw-status--ranked">OK</span>
                      ) : (
                        <span className="aw-status aw-status--warn">{p.status >= 300 && p.status < 400 ? "Redirect" : p.status >= 400 ? `Error ${p.status}` : "Not indexable"}</span>
                      )}
                    </td>
                    <td className="min-w-36">{p.share === null ? <span className="text-[12.5px] text-muted">Not rendered</span> : <ShareBar share={p.share} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 pb-5 text-[13px] text-muted">No AI answer cited {brand.domain} in the last 30 days.</p>
        )}
      </Card>

      <Card
        title="Competitor pages AI cites"
        action={
          <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" disabled={busy === "rivals"} onClick={() => run("rivals", async () => setRivals(await call<Rivals>("rivals", { fresh: Boolean(rivals) })))}>
            {busy === "rivals" ? "Reading pages" : rivals ? "Refresh" : "Compare"}
          </button>
        }
      >
        {rivals ? <RivalsView r={rivals} /> : <p className="px-5 pb-5 text-[13px] text-muted">How the competitor pages AI cites most are built, next to yours.</p>}
      </Card>

      <Card title="Structured data for answers">
        {data.schema?.length ? (
          <div className="overflow-x-auto">
            <table className="aw-table">
              <thead>
                <tr>
                  <th>Template</th>
                  <th className="text-right">Pages</th>
                  <th>Types found</th>
                </tr>
              </thead>
              <tbody>
                {data.schema.map((t) => (
                  <tr key={t.pattern}>
                    <td className="font-medium text-ink">{t.name}</td>
                    <td className="aw-num text-right">{num(t.pages)}</td>
                    <td>
                      {t.types.length ? (
                        <span className="flex flex-wrap gap-1">
                          {t.types.map((x) => (
                            <span key={x.type} className="aw-tag">
                              {x.type} {x.pages === t.pages ? "" : `${num(x.pages)}`}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="text-[12.5px] text-muted">None</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 pb-5 text-[13px] text-muted">No indexable pages in the latest crawl.</p>
        )}
      </Card>

      {shot ? (
        <SidePanel title={short(shot.url, root)} kicker={`${shot.name}, on a phone`} onClose={() => setShot(null)} narrow>
          {shot.img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`data:image/jpeg;base64,${shot.img}`} alt={`How ${short(shot.url, root)} looks on a phone`} className="w-full border border-[var(--aw-rule)]" />
          ) : busy ? (
            <Thinking text="Loading" />
          ) : (
            <p className="text-[13px] text-muted">No screenshot for this page.</p>
          )}
        </SidePanel>
      ) : null}
    </div>
  );
}

function ShareBar({ share }: { share: number | null }) {
  if (share === null) return <span className="text-muted">–</span>;
  const color = share < 50 ? "var(--aw-neg)" : share < 70 ? "var(--aw-warn)" : "var(--aw-pos)";
  return (
    <span className="flex items-center gap-2">
      <span className="block h-2 min-w-16 flex-1 bg-[var(--aw-surface-2)]">
        <span className="block h-full" style={{ width: `${Math.max(2, share)}%`, background: color }} />
      </span>
      <span className="aw-num w-10 text-right text-[12.5px] text-ink">{share}%</span>
    </span>
  );
}

const FIREWALL: Record<string, { text: string; cls: string }> = {
  ok: { text: "Allowed", cls: "aw-status--ranked" },
  blocked: { text: "Likely blocked", cls: "aw-status--missed" },
  challenged: { text: "Challenge page", cls: "aw-status--missed" },
  different: { text: "Different page", cls: "aw-status--warn" },
};

function BotMatrix({ bots, share }: { bots: BotAccess[]; share: number | null }) {
  const read = (b: BotAccess) => {
    const bot = BOTS.find((x) => x.id === b.id);
    if (!bot?.ua) return <span className="text-muted">–</span>;
    if (b.robots?.allowed === false || isBad(b.firewall)) return <span className="text-neg">No</span>;
    if (bot.kind === "google") return "Yes, renders JavaScript";
    if (share === null) return <span className="text-muted">Not checked</span>;
    if (share >= 70) return "Yes";
    return <span className="text-[var(--aw-warn)]">Partial: {100 - share}% of text needs JavaScript</span>;
  };
  return (
    <div className="overflow-x-auto">
      <table className="aw-table">
        <thead>
          <tr>
            <th>Bot</th>
            <th>robots.txt</th>
            <th>Firewall or CDN</th>
            <th>Meta and headers</th>
            <th>Can read text</th>
          </tr>
        </thead>
        <tbody>
          {bots.map((b) => {
            const bot = BOTS.find((x) => x.id === b.id);
            const fw = FIREWALL[b.firewall];
            return (
              <tr key={b.id}>
                <td className="min-w-52">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium text-ink">{b.id}</span>
                    <span className="aw-tag">{KIND[bot?.kind ?? ""] ?? ""}</span>
                  </span>
                  <span className="block text-[12px] text-muted">{bot ? `${bot.owner}: ${bot.use}` : ""}</span>
                </td>
                <td>
                  {b.robots === null ? (
                    <span className="aw-status aw-status--ranked">Allowed</span>
                  ) : b.robots.allowed ? (
                    <span className="aw-status aw-status--ranked">Allowed</span>
                  ) : (
                    <span className="flex flex-col items-start gap-0.5">
                      <span className={`aw-status ${bot?.kind === "training" ? "aw-status--warn" : "aw-status--missed"}`}>Blocked</span>
                      {b.robots.rule ? <code className="text-[11.5px] wrap-anywhere text-muted">{b.robots.rule}</code> : null}
                    </span>
                  )}
                </td>
                <td>
                  {fw ? (
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className={`aw-status ${bot?.kind === "training" && b.firewall !== "ok" ? "aw-status--warn" : fw.cls}`}>{fw.text}</span>
                      {b.status && b.firewall !== "ok" ? <span className="aw-num text-[12px] text-muted">{b.status}</span> : null}
                    </span>
                  ) : (
                    <span className="text-[12.5px] text-muted">{b.firewall === "token" ? "robots.txt token only" : b.firewall === "ip" ? "Checked by IP address" : "Not checked"}</span>
                  )}
                </td>
                <td>{b.meta.length ? <span className="flex flex-wrap gap-1">{b.meta.map((m) => <span key={m} className="aw-status aw-status--warn">{m}</span>)}</span> : <span className="text-muted">–</span>}</td>
                <td className="text-[13px]">{read(b)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LlmsCard({ ai, wp, canEdit, busy, text, root, onDraft, onChange, onPublish }: { ai: Data["ai"] | null; wp: Wp; canEdit: boolean; busy: string; text: string | null; root: string | null; onDraft: () => void; onChange: (t: string) => void; onPublish: () => void }) {
  const l = ai?.llms ?? null;
  const [copied, setCopied] = useState(false);
  return (
    <Card title="llms.txt" action={l ? <span className={`aw-status ${l.valid ? "aw-status--ranked" : "aw-status--warn"}`}>{l.valid ? `Found, ${l.links} links` : "No title line"}</span> : ai ? <span className="aw-status aw-status--warn">Missing</span> : null}>
      <div className="flex flex-col gap-3 px-5 pb-5 text-[13px]">
        {l?.broken.length ? (
          <div>
            <span className="text-body">Broken or moved links:</span>
            <ul className="mt-1 flex flex-col gap-0.5">
              {l.broken.slice(0, 10).map((u) => (
                <li key={u} className="wrap-anywhere text-neg">
                  {short(u, root)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {text === null ? (
          <div>
            <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={onDraft} disabled={busy === "llms"}>
              {busy === "llms" ? "Writing" : l ? "Draft a new one" : "Make llms.txt"}
            </button>
          </div>
        ) : (
          <>
            <textarea className="aw-input w-full font-mono text-[12px]!" style={{ minHeight: 260 }} rows={14} value={text} onChange={(e) => onChange(e.target.value)} aria-label="llms.txt" spellCheck={false} />
            <div className="flex flex-wrap gap-2">
              {wp?.ready && canEdit ? (
                <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" onClick={onPublish} disabled={busy === "publish" || !text.trim()}>
                  {busy === "publish" ? "Saving" : `Publish to ${wp.name}`}
                </button>
              ) : null}
              <button
                type="button"
                className="aw-btn aw-btn--secondary aw-btn--sm"
                onClick={() =>
                  navigator.clipboard.writeText(text).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  })
                }
              >
                {copied ? "Copied" : "Copy"}
              </button>
              <a className="aw-btn aw-btn--secondary aw-btn--sm" download="llms.txt" href={`data:text/plain;charset=utf-8,${encodeURIComponent(text)}`}>
                Download
              </a>
            </div>
            {!wp?.ready ? <p className="text-muted">Upload it to your site&apos;s root as /llms.txt.</p> : null}
          </>
        )}
      </div>
    </Card>
  );
}

function IndexNowCard({ on, wp, canEdit, busy, onToggle }: { on: boolean | null; wp: Wp; canEdit: boolean; busy: boolean; onToggle: (on: boolean) => void }) {
  return (
    <Card title="IndexNow" action={on === null ? null : <span className={`aw-status ${on ? "aw-status--ranked" : "aw-status--warn"}`}>{on ? "On" : "Off"}</span>}>
      <div className="flex flex-col gap-3 px-5 pb-5 text-[13px]">
        {!wp ? (
          <p className="text-body">Works with WordPress and the Arrowsterr Connector plugin.</p>
        ) : !wp.ready ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-body">{wp.plugin ? `Update the Arrowsterr Connector plugin on ${wp.name} to 1.2.0.` : `Install the Arrowsterr Connector plugin on ${wp.name}.`}</p>
            <a href="/downloads/arrowsterr-connector.zip" download className="aw-btn aw-btn--secondary aw-btn--sm">
              Download plugin
            </a>
          </div>
        ) : wp.by && wp.by !== "arrowsterr" ? (
          <p className="text-body">{wp.by === "rankmath" ? "Rank Math's Instant Indexing sends it." : "Another plugin sends it."}</p>
        ) : canEdit ? (
          <div>
            <button type="button" className={`aw-btn aw-btn--sm ${on ? "aw-btn--secondary" : "aw-btn--primary"}`} onClick={() => onToggle(!on)} disabled={busy}>
              {busy ? "Saving" : on ? "Turn off" : "Turn on"}
            </button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function RivalsView({ r }: { r: Rivals }) {
  return (
    <div className="flex flex-col gap-5 px-5 pb-5 text-[13px]">
      <div className="overflow-x-auto">
        <table className="aw-table">
          <thead>
            <tr>
              <th>What the page has</th>
              <th className="text-right">Their pages</th>
              <th className="text-right">Yours</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {r.rows.map((x) => (
              <tr key={x.label}>
                <td className="text-ink">{x.label}</td>
                <td className="aw-num text-right">{x.theirs}%</td>
                <td className="aw-num text-right">{r.yours ? `${x.yours}%` : "–"}</td>
                <td>{x.gap && r.yours ? <span className="aw-status aw-status--warn">They do, you don&apos;t</span> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!r.yours ? <p className="text-muted">Run a new Site Audit to compare your pages.</p> : null}
      <div>
        <h3 className="aw-h4 mb-2">Their most cited pages</h3>
        <ul className="flex flex-col gap-3">
          {r.theirs.map((p) => (
            <li key={p.url} className="flex flex-col gap-0.5 border-t border-[var(--aw-rule)] pt-3 first:border-t-0 first:pt-0">
              <span className="flex flex-wrap items-center justify-between gap-2">
                <a href={p.url} target="_blank" rel="noreferrer" className="min-w-0 font-medium wrap-anywhere text-ink hover:underline">
                  {p.url.replace(/^https?:\/\//, "")}
                </a>
                <span className="aw-num text-muted">Cited in {p.used}%</span>
              </span>
              <span className="text-muted">
                {num(p.words)} words in raw HTML, {p.questions} question headings{p.schema.length ? `, ${[...new Set(p.schema)].slice(0, 5).join(", ")}` : ", no structured data"}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
