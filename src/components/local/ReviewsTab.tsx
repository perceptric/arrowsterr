"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import QRCode from "qrcode";
import { keywordMentions, keywordWords, monthly, reviewStats, themeShare, themeTable, toAnswer, writeReviewUrl, type SavedReview, type ThemeHit } from "@/lib/localReviews";
import { Card, Seg, StatStrip, Thinking } from "../ui";
import { saveCsv } from "./saveCsv";

// Local Research, Reviews (docs/local-research-plan.md, 4.5): the business's Google reviews against its 3 leaders.
// Reviews per month, reply rate and time, themes with quotes, keyword words, reviews to answer with Draft reply, and
// the review link with a QR code.

type Call = <T>(action: string, extra?: Record<string, unknown>) => Promise<T>;
type Row = { id: string; cid: string; title: string; you: boolean; review_id: string; rating: number | null; text: string | null; author: string | null; url: string | null; posted_at: string | null; reply: string | null; replied_at: string | null; themes: ThemeHit[] | null; removed_at: string | null };
type From = { cid: string; title: string; you: boolean };

const COLS = "id, cid, title, you, review_id, rating, text, author, url, posted_at, reply, replied_at, themes, removed_at";
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "–");
const monthName = (k: string) => new Date(`${k}-15T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
const stars = (n: number | null) => (n === null ? "–" : "★★★★★".slice(0, Math.round(n)) + "☆☆☆☆☆".slice(0, 5 - Math.round(n)));
const days = (d: number | null) => (d === null ? "–" : d < 1 ? "Same day" : `${Math.round(d)} ${Math.round(d) === 1 ? "day" : "days"}`);

const toReview = (r: Row): SavedReview => ({
  id: r.review_id,
  rating: r.rating,
  text: r.text,
  postedAt: r.posted_at,
  author: r.author,
  reply: r.reply,
  repliedAt: r.replied_at,
  url: r.url,
  cid: r.cid,
  title: r.title,
  you: r.you,
  themes: r.themes,
  removedAt: r.removed_at,
});

export function ReviewsTab({ sb, locationId, placeId, keywords, city, canEdit, call, onError }: { sb: SupabaseClient; locationId: string; placeId: string | null; keywords: string[]; city: string | null; canEdit: boolean; call: Call; onError: (e: string) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [meta, setMeta] = useState<{ at: string | null; from: From[]; now: number }>({ at: null, from: [], now: 0 });
  const [reading, setReading] = useState<number | null>(null);
  const load = useCallback(async () => {
    const since = new Date(Date.now() - 400 * 864e5).toISOString();
    const all: Row[] = [];
    for (let page = 0; page < 10; page++) {
      const { data, error } = await sb.from("local_reviews").select(COLS).eq("location_id", locationId).gte("posted_at", since).order("posted_at", { ascending: false }).range(page * 1000, page * 1000 + 999);
      if (error) {
        onError(/local_reviews/.test(error.message) ? "Run supabase/073_local_reviews.sql on the VPS database." : error.message);
        break;
      }
      all.push(...((data ?? []) as Row[]));
      if ((data ?? []).length < 1000) break;
    }
    const { data: loc } = await sb.from("local_locations").select("reviews_at, reviews_from").eq("id", locationId).maybeSingle();
    setMeta({ at: (loc?.reviews_at as string | null) ?? null, from: ((loc?.reviews_from as From[] | null) ?? []).filter((f) => f && f.cid), now: Date.now() });
    setRows(all);
  }, [sb, locationId, onError]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);
  // After Read now, check every 20 seconds for 6 minutes: reviews come from DataForSEO's queue, themes a little later.
  useEffect(() => {
    if (reading === null) return;
    const t = setInterval(() => {
      load();
      if (Date.now() - reading > 6 * 60_000) setReading(null);
    }, 20_000);
    return () => clearInterval(t);
  }, [reading, load]);

  async function readNow() {
    onError("");
    try {
      await call("reviews", { locationId });
      setReading(Date.now());
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }
  const readButton = canEdit ? (
    <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={readNow} disabled={reading !== null}>
      {reading !== null ? "Reading" : "Read now"}
    </button>
  ) : null;

  const view = useMemo(() => {
    if (!rows) return null;
    const reviews = rows.map(toReview);
    const mine = reviews.filter((r) => r.you);
    if (!mine.length) return null;
    const now = meta.now;
    const leaderCids = meta.from.filter((f) => !f.you).map((f) => f.cid);
    const leaderIds = new Set(leaderCids.length ? leaderCids : [...new Set(reviews.filter((r) => !r.you).map((r) => r.cid))].slice(0, 3));
    const groups = [
      { cid: mine[0].cid, title: mine[0].title, you: true, reviews: mine },
      ...[...leaderIds].map((cid) => {
        const list = reviews.filter((r) => !r.you && r.cid === cid);
        return { cid, title: list[0]?.title ?? meta.from.find((f) => f.cid === cid)?.title ?? cid, you: false, reviews: list };
      }),
    ];
    const leaders = groups.filter((g) => !g.you);
    const leaderReviews = leaders.flatMap((g) => g.reviews);
    return {
      now,
      groups: groups.map((g) => ({ ...g, months: monthly(g.reviews, 6, now), stats: reviewStats(g.reviews, now) })),
      themes: themeTable(mine, leaderReviews, now),
      words: keywordMentions(keywordWords(keywords, city), groups, now),
      answer: toAnswer(mine, now),
      rowId: new Map(rows.map((r) => [`${r.cid}:${r.review_id}`, r.id])),
      unread: mine.filter((r) => r.text && !r.themes && !r.removedAt).length,
    };
  }, [rows, meta, keywords, city]);

  if (rows === null) return <Thinking text="Loading" />;
  if (!view)
    return (
      <div className="flex flex-col gap-4">
        <Card>
          <div className="flex flex-col items-start gap-3 px-5 py-5">
            <span className="aw-h4">{reading !== null ? "Reading the Google reviews" : "No reviews read yet"}</span>
            <span className="text-[13.5px] text-body">Your Google reviews next to the 3 businesses that hold the most top 3 spots: how many come in each month, how many get a reply, what people praise and complain about, and the reviews still waiting for an answer. They&apos;re read every week with your scans.</span>
            {reading !== null ? <Thinking text="This takes a few minutes" /> : readButton}
          </div>
        </Card>
        {placeId ? <AskForReviews placeId={placeId} /> : null}
      </div>
    );

  const { groups, themes, words, answer, rowId, unread } = view;
  const you = groups[0];
  const leaders = groups.slice(1);
  const avg = (f: (s: (typeof groups)[number]["stats"]) => number | null) => {
    const xs = leaders.map((g) => f(g.stats)).filter((v): v is number => v !== null);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  };
  const lead90 = avg((s) => s.in90);
  const leadReply = avg((s) => s.replyShare);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[13px] text-muted">
          Read {meta.at ? when(meta.at) : "–"}
          {leaders.length ? `, against ${leaders.map((g) => g.title).join(", ")}` : ""}
          {unread ? `. ${unread} reviews still being read for themes.` : ""}
        </span>
        <span className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="aw-btn aw-btn--secondary aw-btn--sm"
            onClick={() =>
              saveCsv(
                `reviews ${meta.at?.slice(0, 10) ?? ""}.csv`,
                ["Business", "You", "Rating", "Posted", "Author", "Review", "Reply", "Replied", "Themes", "Removed", "Link"],
                (rows ?? []).map((r) => [r.title, r.you ? "Yes" : "", r.rating, r.posted_at?.slice(0, 10), r.author, r.text, r.reply, r.replied_at?.slice(0, 10), (r.themes ?? []).map((t) => `${t.theme} (${t.tone})`).join("; "), r.removed_at ? r.removed_at.slice(0, 10) : "", r.url]),
              )
            }
          >
            Export CSV
          </button>
          {readButton}
        </span>
      </div>
      <StatStrip
        stats={[
          { label: "New reviews, 90 days", value: String(you.stats.in90), sub: lead90 === null ? undefined : `Leaders ${Math.round(lead90)}`, tone: lead90 !== null && you.stats.in90 < lead90 * 0.7 ? "warn" : undefined },
          { label: "Rating, 90 days", value: you.stats.rating90 === null ? "–" : you.stats.rating90.toFixed(1) },
          { label: "Answered, 12 months", value: you.stats.replyShare === null ? "–" : `${you.stats.replyShare}%`, sub: leadReply === null ? undefined : `Leaders ${Math.round(leadReply)}%`, tone: you.stats.replyShare !== null && you.stats.replyShare < 50 ? "warn" : undefined },
          { label: "Median reply time", value: days(you.stats.replyDays) },
          { label: "Waiting for an answer", value: String(answer.length), tone: answer.length ? "neg" : undefined },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card title="Reviews per month">
          <div className="overflow-x-auto">
            <table className="aw-table">
              <thead>
                <tr>
                  <th />
                  {you.months.map((m) => (
                    <th key={m.month} className="text-right">
                      {monthName(m.month)}
                    </th>
                  ))}
                  <th className="text-right">Rating, 90 days</th>
                  <th className="text-right">Answered</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.cid}>
                    <th scope="row" className={`text-left font-medium wrap-break-word ${g.you ? "text-ink" : "text-body"}`}>
                      {g.you ? "You" : g.title}
                    </th>
                    {g.months.map((m) => (
                      <td key={m.month} className={`aw-num text-right ${g.you ? "bg-[var(--signal-tint,rgb(9_67_176_/_0.045))] font-medium" : ""}`}>
                        {m.count}
                      </td>
                    ))}
                    <td className="aw-num text-right">{g.stats.rating90 === null ? "–" : g.stats.rating90.toFixed(1)}</td>
                    <td className="aw-num text-right">{g.stats.replyShare === null ? "–" : `${g.stats.replyShare}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        {placeId ? <AskForReviews placeId={placeId} /> : <Card title="Ask for reviews"><p className="px-5 pb-5 text-[13.5px] text-body">Google didn&apos;t return a place id for this business.</p></Card>}
      </div>

      <Themes rows={themes} />

      {words.length ? (
        <Card title="Keywords in reviews">
          <ul className="flex flex-col">
            {words.slice(0, 8).map((w) => (
              <li key={w.word} className="flex flex-wrap items-baseline gap-x-2 border-t border-[var(--border-medium)] px-5 py-3 text-[13.5px] first:border-t-0">
                <span className="font-medium text-ink">&lsquo;{w.word}&rsquo;</span>
                <span className="text-body">
                  appears in {w.top!.n} of {w.top!.title}&apos;s reviews and {w.you.n} of yours.
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <ToAnswer reviews={answer} rowId={rowId} canEdit={canEdit} call={call} locationId={locationId} onError={onError} />
    </div>
  );
}

function Themes({ rows }: { rows: ReturnType<typeof themeTable> }) {
  const [tone, setTone] = useState<ThemeHit["tone"]>("complaint");
  const shown = rows.filter((r) => r.tone === tone).slice(0, 8);
  return (
    <Card title="What people say" action={<Seg label="Tone" value={tone} onChange={setTone} options={[{ id: "complaint", label: "Complaints" }, { id: "praise", label: "Praise" }]} />}>
      {shown.length ? (
        <div className="overflow-x-auto">
          <table className="aw-table">
            <thead>
              <tr>
                <th>Theme</th>
                <th className="text-right">You</th>
                <th className="text-right">Leaders</th>
                <th>From your reviews</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const you = themeShare(r.you);
                const them = themeShare(r.leaders);
                const worse = you !== null && them !== null && (tone === "complaint" ? you > them + 3 : you + 3 < them);
                return (
                  <tr key={`${r.theme}:${r.tone}`}>
                    <th scope="row" className="text-left font-medium whitespace-nowrap text-ink">
                      {r.theme}
                    </th>
                    <td className={`aw-num text-right ${worse ? "font-medium text-neg" : ""}`}>{you === null ? "–" : `${you}%`}</td>
                    <td className="aw-num text-right">{them === null ? "–" : `${them}%`}</td>
                    <td className="text-[13px] text-body wrap-break-word">{r.quotes.length ? r.quotes.map((q) => `“${q}”`).join(" ") : "–"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 pb-5 text-[13.5px] text-body">{tone === "complaint" ? "No complaint comes up in more than a few reviews." : "No praise comes up in more than a few reviews yet."}</p>
      )}
    </Card>
  );
}

function ToAnswer({ reviews, rowId, canEdit, call, locationId, onError }: { reviews: SavedReview[]; rowId: Map<string, string>; canEdit: boolean; call: Call; locationId: string; onError: (e: string) => void }) {
  const [all, setAll] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const shown = all ? reviews : reviews.slice(0, 10);
  async function draft(key: string) {
    const id = rowId.get(key);
    if (!id) return;
    onError("");
    setBusy(key);
    try {
      const { text } = await call<{ text: string }>("reply", { locationId, reviewId: id });
      setDrafts((d) => ({ ...d, [key]: text }));
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }
  return (
    <Card title={`Reviews to answer${reviews.length ? ` (${reviews.length})` : ""}`}>
      {reviews.length ? (
        <ul className="flex flex-col">
          {shown.map((r) => {
            const key = `${r.cid}:${r.id}`;
            const d = drafts[key];
            return (
              <li key={key} className="flex flex-col gap-2 border-t border-[var(--border-medium)] px-5 py-4 first:border-t-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className={`text-[14px] tracking-[1px] ${r.rating !== null && r.rating <= 2 ? "text-neg" : "text-[var(--aw-warn,#B26A00)]"}`} aria-label={`${r.rating ?? "No"} stars`}>
                    {stars(r.rating)}
                  </span>
                  <span className="font-medium text-ink">{r.author ?? "A customer"}</span>
                  <span className="text-[13px] text-muted">{when(r.postedAt)}</span>
                  {r.url ? (
                    <a href={r.url} target="_blank" rel="noreferrer" className="text-[13px] text-[var(--signal)] underline-offset-2 hover:underline">
                      Open on Google
                    </a>
                  ) : null}
                </div>
                {r.text ? <p className="text-[13.5px] text-body wrap-break-word">{r.text}</p> : <p className="text-[13.5px] text-muted">Rating only</p>}
                {d !== undefined ? (
                  <div className="flex flex-col gap-2">
                    <textarea className="aw-input min-h-[96px] w-full text-[13.5px]" value={d} onChange={(e) => setDrafts((x) => ({ ...x, [key]: e.target.value }))} aria-label="Draft reply" />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="aw-btn aw-btn--secondary aw-btn--sm"
                        onClick={() =>
                          navigator.clipboard.writeText(d).then(() => {
                            setCopied(key);
                            setTimeout(() => setCopied(null), 2000);
                          })
                        }
                      >
                        {copied === key ? "Copied" : "Copy"}
                      </button>
                      <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => draft(key)} disabled={busy !== null}>
                        {busy === key ? "Writing" : "Write again"}
                      </button>
                    </div>
                  </div>
                ) : canEdit ? (
                  <div>
                    <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => draft(key)} disabled={busy !== null}>
                      {busy === key ? "Writing" : "Draft reply"}
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
          {reviews.length > 10 && !all ? (
            <li className="border-t border-[var(--border-medium)] px-5 py-3">
              <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => setAll(true)}>
                Show all {reviews.length}
              </button>
            </li>
          ) : null}
        </ul>
      ) : (
        <p className="px-5 pb-5 text-[13.5px] text-body">Every review from the last 12 months has an answer.</p>
      )}
    </Card>
  );
}

function AskForReviews({ placeId }: { placeId: string }) {
  const url = writeReviewUrl(placeId);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(url, { margin: 1, width: 480, color: { dark: "#111111", light: "#ffffff" } })
      .then((d) => live && setQr(d))
      .catch(() => live && setQr(null));
    return () => {
      live = false;
    };
  }, [url]);
  return (
    <Card title="Ask for reviews">
      <div className="flex flex-col gap-3 px-5 pb-5">
        <span className="rounded-[10px] bg-[var(--bg-tertiary)] px-3 py-2 font-mono text-[12px] text-body wrap-anywhere">{url}</span>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="aw-btn aw-btn--secondary aw-btn--sm"
            onClick={() =>
              navigator.clipboard.writeText(url).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              })
            }
          >
            {copied ? "Copied" : "Copy link"}
          </button>
          {qr ? (
            <a className="aw-btn aw-btn--secondary aw-btn--sm" href={qr} download="review-qr.png">
              Download QR code
            </a>
          ) : null}
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {qr ? <img src={qr} alt="QR code for the review link" width={160} height={160} className="h-[160px] w-[160px] rounded-[8px] border border-[var(--border-medium)]" /> : null}
      </div>
    </Card>
  );
}
