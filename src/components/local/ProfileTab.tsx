"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { postsWithin, profileChanges, profileGaps, profileScore, type Profile } from "@/lib/localProfile";
import { Card, StatStrip, Thinking } from "../ui";

// Local Research, Profile (docs/local-research-plan.md, 4.4): the location's Google profile against the 3 competitors
// with the most top 3 spots, the gaps first, a score, and the changes Google made to the listing (two reads agree).

type Row = { id: string; cid: string | null; you: boolean; confirm: boolean; read_at: string; data: Profile };
type Call = <T>(action: string, extra?: Record<string, unknown>) => Promise<T>;

const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const nice = (a: string) => a.replace(/^(has|is|offers|accepts|serves)_/, "").replace(/_/g, " ");

export function ProfileTab({ sb, locationId, canEdit, call, onError }: { sb: SupabaseClient; locationId: string; canEdit: boolean; call: Call; onError: (e: string) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [gapsOnly, setGapsOnly] = useState(false);
  const [reading, setReading] = useState<number | null>(null);
  const load = useCallback(async () => {
    const { data, error } = await sb.from("local_profiles").select("id, cid, you, confirm, read_at, data").eq("location_id", locationId).order("read_at", { ascending: false }).limit(80);
    if (error) onError(/local_profiles/.test(error.message) ? "Run supabase/072_local_profiles.sql on the VPS database." : error.message);
    setRows((data ?? []) as Row[]);
  }, [sb, locationId, onError]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);
  // After Read now, check every 15 seconds for 4 minutes: details land in a minute, posts a little later.
  useEffect(() => {
    if (reading === null) return;
    const t = setInterval(() => {
      load();
      if (Date.now() - reading > 4 * 60_000) setReading(null);
    }, 15_000);
    return () => clearInterval(t);
  }, [reading, load]);

  const view = useMemo(() => {
    if (!rows?.length) return null;
    const yours = rows.filter((r) => r.you);
    if (!yours.length) return null;
    const full = yours.find((r) => !r.confirm) ?? yours[0];
    const rivals = rows.filter((r) => !r.you && r.read_at === full.read_at).map((r) => r.data);
    const you = yours[0].data;
    const now = Date.parse(yours[0].read_at);
    return {
      you,
      rivals,
      at: yours[0].read_at,
      gaps: profileGaps(you, rivals, now),
      score: profileScore(you, rivals, now),
      changes: profileChanges(yours.map((r) => ({ at: r.read_at, profile: r.data }))),
      now,
    };
  }, [rows]);

  async function readNow() {
    onError("");
    try {
      await call("profile", { locationId });
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

  if (rows === null) return <Thinking text="Loading" />;
  if (!view)
    return (
      <Card>
        <div className="flex flex-col items-start gap-3 px-5 py-5">
          <span className="aw-h4">{reading !== null ? "Reading the Google profiles" : "No profile read yet"}</span>
          <span className="text-[13.5px] text-body">Your Google profile next to the 3 businesses that hold the most top 3 spots, with what they have that you don&apos;t. It&apos;s read every week with your scans.</span>
          {reading !== null ? <Thinking text="This takes about two minutes" /> : readButton}
        </div>
      </Card>
    );

  const { you, rivals, gaps, score, changes, now } = view;
  const gapIds = new Set(gaps.map((g) => g.id.split(":")[0]));
  const posts30 = (p: Profile) => postsWithin(p, 30, now);
  const cats = (p: Profile) => [p.category, ...p.categories].filter(Boolean).join(", ") || "None";
  const ROWS: { id: string; label: string; get: (p: Profile) => string; gap: string[] }[] = [
    { id: "category", label: "Categories", get: cats, gap: ["category"] },
    { id: "hours", label: "Hours", get: (p) => (p.hours.length ? `${p.hours.filter((h) => !/closed$/.test(h)).length} days open` : "Not set"), gap: ["hours"] },
    { id: "photos", label: "Photos", get: (p) => (p.photos === null ? "–" : p.photos.toLocaleString("en-US")), gap: ["photos"] },
    { id: "description", label: "Description", get: (p) => (p.description ? `${p.description.length} characters` : "None"), gap: ["description"] },
    { id: "attributes", label: "Attributes", get: (p) => (p.attributes.length ? p.attributes.slice(0, 4).map(nice).join(", ") + (p.attributes.length > 4 ? ` and ${p.attributes.length - 4} more` : "") : "None"), gap: ["attributes"] },
    { id: "posts", label: "Posts, 30 days", get: (p) => (posts30(p) === null ? "Not read" : String(posts30(p))), gap: ["posts"] },
    { id: "questions", label: "Questions", get: (p) => (p.questions ? `${p.questions.total}, ${p.questions.unanswered ? `${p.questions.unanswered} with no answer` : "all answered"}` : "Not read"), gap: ["questions"] },
    { id: "booking", label: "Booking link", get: (p) => (p.bookingUrl ? "Yes" : "None"), gap: ["booking"] },
    { id: "rating", label: "Rating", get: (p) => (p.rating === null ? "–" : `${p.rating}, ${p.reviews?.toLocaleString("en-US") ?? 0} reviews`), gap: [] },
    { id: "claimed", label: "Claimed", get: (p) => (p.claimed === null ? "–" : p.claimed ? "Yes" : "No"), gap: ["claim"] },
  ];
  const shown = gapsOnly ? ROWS.filter((r) => r.gap.some((g) => gapIds.has(g))) : ROWS;
  const open = you.questions?.unanswered ?? 0;
  const p30 = posts30(you);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[13px] text-muted">Read {when(view.at)}{rivals.length ? `, against ${rivals.map((r) => r.title).join(", ")}` : ""}</span>
        {readButton}
      </div>
      <StatStrip
        stats={[
          { label: "Profile score, of 100", value: String(score), tone: score >= 80 ? undefined : "warn" },
          { label: "Gaps against the leaders", value: String(gaps.length), tone: gaps.length ? "warn" : undefined },
          { label: "Changed on Google", value: String(changes.length), tone: changes.length ? "warn" : undefined },
          { label: "Questions with no answer", value: you.questions ? String(open) : "–", tone: open ? "neg" : undefined },
          { label: "Posts in 30 days", value: p30 === null ? "–" : String(p30), tone: p30 === 0 ? "neg" : undefined },
        ]}
      />

      {changes.map((c) => (
        <Card key={c.field}>
          <div className="flex flex-col gap-3 px-5 py-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="aw-status aw-status--warn">Changed on Google</span>
              <span className="aw-h4">{c.label}</span>
              <span className="text-[13px] text-muted">
                Seen {when(c.seenAt)}, confirmed {when(c.confirmedAt)}
              </span>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-[12px] bg-[var(--bg-tertiary)] px-3.5 py-3 text-[13.5px]">
                <span className="block text-[12px] font-medium text-muted">Before</span>
                <span className="font-medium text-ink wrap-break-word">{c.before}</span>
              </div>
              <div className="rounded-[12px] bg-[var(--aw-warn-bg)] px-3.5 py-3 text-[13.5px]">
                <span className="block text-[12px] font-medium text-muted">Now on Google</span>
                <span className="font-medium text-ink wrap-break-word">{c.now}</span>
              </div>
            </div>
          </div>
        </Card>
      ))}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card
          title={`You against the top ${rivals.length}`}
          action={
            <label className="flex cursor-pointer items-center gap-2 text-[13px] text-body">
              <input type="checkbox" checked={gapsOnly} onChange={() => setGapsOnly(!gapsOnly)} className="h-4 w-4" />
              Gaps only
            </label>
          }
        >
          <div className="overflow-x-auto">
            <table className="aw-table">
              <thead>
                <tr>
                  <th />
                  <th>You</th>
                  {rivals.map((r) => (
                    <th key={r.cid ?? r.title}>{r.title}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => {
                  const gap = row.gap.some((g) => gapIds.has(g));
                  return (
                    <tr key={row.id}>
                      <th scope="row" className="text-left font-normal whitespace-nowrap text-muted">
                        {row.label}
                      </th>
                      <td className={`bg-[var(--signal-tint,rgb(9_67_176_/_0.045))] font-medium wrap-break-word ${gap ? "text-neg" : "text-ink"}`}>{row.get(you)}</td>
                      {rivals.map((r) => (
                        <td key={r.cid ?? r.title} className="wrap-break-word">
                          {row.get(r)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Fix first">
          {gaps.length ? (
            <ol className="flex flex-col">
              {gaps.map((g, i) => (
                <li key={g.id} className="flex gap-3 border-t border-[var(--border-medium)] px-5 py-3.5 first:border-t-0">
                  <span className="aw-num grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-[var(--signal-soft)] text-[12px] font-semibold text-[var(--signal-strong,var(--signal))]">{i + 1}</span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-medium text-ink">{g.title}</span>
                    <span className="text-[13px] text-muted">{g.why}</span>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="px-5 pb-5 text-[13.5px] text-body">Your profile has everything the leaders show.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
