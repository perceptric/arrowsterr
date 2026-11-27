"use client";

import { useCallback, useEffect, useState } from "react";
import type { BotKind, BotLine, PageLine } from "@/lib/aiCrawlers";
import type { RunAuth } from "@/lib/runner";
import { post } from "./research/shared";
import { Card, ErrorNote, StatStrip, Thinking } from "./ui";
import { errorText } from "@/lib/errors";

// The AI crawler report on the Visitors page: which AI bots read the brand's site, how often, and which key
// pages they skip. Data comes from /api/crawlers (Cloudflare first, then the WordPress connector plugin).

type SourceState = { state: "ok" | "off" | "missing" | "old" | "error"; note?: string };
type Data = {
  source: "cloudflare" | "wordpress" | null;
  from: string;
  to: string;
  days: number;
  total: number;
  bots: BotLine[];
  pages: PageLine[];
  skipped: string[];
  skippedCount: number;
  checkedPages: number;
  cloudflare: SourceState & { zone?: string; plan?: string; back?: number };
  wordpress: SourceState & { site?: string; pageCache?: boolean; since?: string | null };
};

const KIND: Record<BotKind, string> = { training: "Training", search: "Search", user: "Live answer" };
const KIND_HINT: Record<BotKind, string> = {
  training: "Reads pages to train AI models",
  search: "Builds the index AI answers search",
  user: "Opens a page while answering someone",
};
const nameOf = (id: string, bots: BotLine[]) => bots.find((b) => b.id === id)?.name ?? id;
const day = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "–");

function open(path: string) {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/** How to get crawler data: Cloudflare through Apps for Zippie, or the connector plugin on WordPress. */
function Setup({ data }: { data: Data | null }) {
  const cf = data?.cloudflare;
  const wp = data?.wordpress;
  return (
    <div className="flex flex-col gap-4 p-5">
      <p className="text-[14px] text-body">See which AI bots read your site and which key pages they never open. Pick the way that fits your site.</p>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-2 rounded-aw border border-rule-faint bg-surface-2 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[14px] font-medium text-ink">Cloudflare</span>
            {cf && cf.state !== "off" ? <span className={`aw-status ${cf.state === "ok" ? "aw-status--ranked" : "aw-status--warn"}`}>{cf.state === "ok" ? "Connected" : "Needs a look"}</span> : null}
          </div>
          <p className="aw-small">Works on every Cloudflare plan, Free included. Lower plans can look back fewer days. Connect Cloudflare under Apps for Zippie.</p>
          {cf?.note ? <p className="aw-small text-warn">{cf.note}</p> : null}
          <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm self-start" onClick={() => open("/settings/integrations")}>
            Open Integrations
          </button>
        </div>
        <div className="flex flex-col gap-2 rounded-aw border border-rule-faint bg-surface-2 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[14px] font-medium text-ink">WordPress</span>
            {wp && wp.state !== "off" ? <span className={`aw-status ${wp.state === "ok" ? "aw-status--ranked" : "aw-status--warn"}`}>{wp.state === "ok" ? "Connected" : "Needs a look"}</span> : null}
          </div>
          <p className="aw-small">Install the Arrowsterr Connector plugin (1.3.0 or newer) on a site you publish to. It starts counting AI bot visits right away.</p>
          {wp?.note ? <p className="aw-small text-warn">{wp.note}</p> : null}
          <div className="flex flex-wrap items-center gap-2">
            <a href="/downloads/arrowsterr-connector.zip" download className="aw-btn aw-btn--secondary aw-btn--sm">
              Download plugin
            </a>
            <button type="button" className="aw-text-link text-[13px]" onClick={() => open("/publish/integrations")}>
              Publishing sites
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** One bot's reads per day, as small bars. */
function Bars({ days }: { days: { day: string; hits: number }[] }) {
  const top = Math.max(1, ...days.map((d) => d.hits));
  return (
    <span className="flex h-6 items-end gap-px" aria-hidden="true">
      {days.slice(-30).map((d) => (
        <span key={d.day} className="w-1 rounded-aw-xs bg-brand" style={{ height: `${Math.max(d.hits ? 12 : 4, (d.hits / top) * 100)}%`, opacity: d.hits ? 1 : 0.2 }} title={`${day(d.day)}: ${d.hits}`} />
      ))}
    </span>
  );
}

export function AiCrawlers({ auth, brand, days }: { auth: RunAuth; brand: { id: string; domain: string }; days: number }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [all, setAll] = useState(false);

  const load = useCallback(
    async (fresh: boolean) => {
      setBusy(true);
      setError("");
      try {
        setData(await post<Data>(auth, "/api/crawlers", { brandId: brand.id, days, fresh }));
      } catch (e) {
        setError(errorText(e));
      } finally {
        setBusy(false);
      }
    },
    [auth, brand.id, days],
  );
  useEffect(() => {
    // Loading when the brand or period changes is the point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(false);
  }, [load]);

  const refresh = (
    <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" disabled={busy} onClick={() => load(true)}>
      {busy ? "Reading..." : "Refresh"}
    </button>
  );

  if (!data) {
    if (error)
      return (
        <Card title="AI crawlers" action={refresh}>
          <ErrorNote error={error} className="m-5" />
        </Card>
      );
    return <Thinking text="Checking which AI bots read your site..." />;
  }
  if (!data.source)
    return (
      <Card title="AI crawlers" action={data.cloudflare.state !== "off" || data.wordpress.state !== "off" ? refresh : undefined}>
        {error ? <ErrorNote error={error} className="mx-5 mt-5" /> : null}
        <Setup data={data} />
      </Card>
    );

  const ai = data.bots.filter((b) => b.id !== "googlebot" && b.id !== "bingbot");
  const aiHits = ai.reduce((n, b) => n + b.hits, 0);
  const perDay = data.bots[0]?.days.map((_, i) => ai.reduce((n, b) => n + (b.days[i]?.hits ?? 0), 0)) ?? [];
  const from = data.source === "cloudflare" ? `Cloudflare${data.cloudflare.zone ? ` · ${data.cloudflare.zone}` : ""}${data.cloudflare.plan ? ` · ${data.cloudflare.plan}` : ""}` : `WordPress plugin${data.wordpress.site ? ` · ${data.wordpress.site}` : ""}`;
  const shownSkipped = all ? data.skipped : data.skipped.slice(0, 8);

  return (
    <Card title="AI crawlers" action={refresh}>
      <div className="flex flex-col gap-5 p-5">
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
          <span className="aw-chip">{from}</span>
          <span>
            {day(data.from)} to {day(data.to)}
            {data.days < days ? ` (your Cloudflare plan looks back ${data.days} days)` : ""}
          </span>
        </div>
        {error ? <ErrorNote error={error} /> : null}

        {!data.total ? (
          <div className="rounded-aw border border-rule-faint bg-surface-2 p-4">
            <p className="text-[14px] font-medium text-ink">No AI bot visits yet</p>
            <p className="aw-small mt-1">
              {data.source === "wordpress"
                ? `The plugin counts from the moment it's installed${data.wordpress.since ? ` (first count ${day(data.wordpress.since)})` : ""}. Check back in a day or two.`
                : "Cloudflare saw no AI bot requests in this period. If your robots.txt blocks them, they stop coming."}
            </p>
          </div>
        ) : (
          <>
            <StatStrip
              spark={perDay}
              stats={[
                { label: "AI bot reads", value: aiHits.toLocaleString("en-US"), tone: "brand", sub: "Not counting Googlebot and Bingbot" },
                { label: "AI bots seen", value: String(ai.length) },
                { label: "Pages read", value: String(new Set(data.pages.map((p) => p.path)).size) },
                { label: "Key pages skipped", value: data.checkedPages ? `${data.skippedCount} of ${data.checkedPages}` : "–", tone: data.skippedCount ? "warn" : undefined },
              ]}
            />

            <div className="aw-table-wrap">
              <table className="aw-table">
                <thead>
                  <tr>
                    <th>Bot</th>
                    <th>Type</th>
                    <th className="text-right">Reads</th>
                    <th className="text-right">Pages</th>
                    <th>Last seen</th>
                    <th>By day</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bots.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <div className="font-medium text-ink">{b.name}</div>
                        <div className="aw-small">{b.owner}</div>
                      </td>
                      <td>
                        <span className="aw-chip" title={KIND_HINT[b.kind]}>
                          {KIND[b.kind]}
                        </span>
                      </td>
                      <td className="aw-num text-right">{b.hits.toLocaleString("en-US")}</td>
                      <td className="aw-num text-right">{b.pages.toLocaleString("en-US")}</td>
                      <td className="text-muted">{day(b.last)}</td>
                      <td>
                        <Bars days={b.days} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <section className="flex min-w-0 flex-col gap-2">
                <span className="aw-label">Most read pages</span>
                <ol className="flex flex-col">
                  {data.pages.slice(0, 15).map((p) => (
                    <li key={p.path} className="flex items-start justify-between gap-3 border-b border-rule-faint py-2 last:border-b-0">
                      <span className="min-w-0">
                        <a href={`https://${brand.domain}${p.path}`} target="_blank" rel="noopener noreferrer" className="block truncate text-[14px]">
                          {p.path}
                        </a>
                        <span className="mt-1 flex flex-wrap gap-1">
                          {p.bots.slice(0, 4).map((x) => (
                            <span key={x.id} className="aw-chip">
                              {nameOf(x.id, data.bots)} {x.hits}
                            </span>
                          ))}
                        </span>
                      </span>
                      <span className="aw-num shrink-0 text-[14px] text-ink">{p.hits.toLocaleString("en-US")}</span>
                    </li>
                  ))}
                </ol>
              </section>

              <section className="flex min-w-0 flex-col gap-2">
                <span className="aw-label">Key pages AI bots skipped</span>
                {!data.checkedPages ? (
                  <p className="aw-small">We couldn&apos;t find your sitemap, so there&apos;s no page list to check.</p>
                ) : !data.skippedCount ? (
                  <p className="aw-small">Every key page we checked got at least one AI bot visit.</p>
                ) : (
                  <>
                    <p className="aw-small">No AI bot opened these in this period. Link to them from pages bots do read, and list them in your sitemap and llms.txt.</p>
                    <ul className="flex flex-col">
                      {shownSkipped.map((p) => (
                        <li key={p} className="border-b border-rule-faint py-2 last:border-b-0">
                          <a href={`https://${brand.domain}${p}`} target="_blank" rel="noopener noreferrer" className="block truncate text-[14px]">
                            {p}
                          </a>
                        </li>
                      ))}
                    </ul>
                    {data.skipped.length > 8 ? (
                      <button type="button" className="aw-text-link self-start text-[13px]" onClick={() => setAll(!all)}>
                        {all ? "Show fewer" : `Show ${data.skipped.length - 8} more`}
                      </button>
                    ) : null}
                    {data.skippedCount > data.skipped.length ? <span className="aw-small">And {data.skippedCount - data.skipped.length} more.</span> : null}
                  </>
                )}
              </section>
            </div>
          </>
        )}

        <p className="aw-small">
          Bots are matched by the name they send, which anyone can copy.
          {data.source === "wordpress" && data.wordpress.pageCache ? " This site uses a page cache, and cached pages never reach WordPress, so some visits are missing. Cloudflare counts them all." : ""}
        </p>
      </div>
    </Card>
  );
}
