"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Location } from "@/lib/local";
import { ALERT_LABEL, alertSettings, type AlertKind } from "@/lib/localAlerts";
import { Card, Thinking } from "../ui";

// Local Research alerts (docs/local-research-plan.md, 4.8): what was sent for this location, and its settings.

type Row = { id: string; kind: AlertKind; title: string; detail: string; status: "checking" | "open" | "dropped"; created_at: string; emailed_at: string | null };
const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export function AlertsTab({ sb, loc, canEdit, onSave, onError }: { sb: SupabaseClient; loc: Location & { id: string }; canEdit: boolean; onSave: (alerts: { on: boolean; ratingBelow: number | null }) => Promise<void>; onError: (e: string) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const set = alertSettings(loc);
  const [level, setLevel] = useState(set.ratingBelow === null ? "" : String(set.ratingBelow));
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const { data, error } = await sb.from("local_alerts").select("id, kind, title, detail, status, created_at, emailed_at").eq("location_id", loc.id).neq("status", "dropped").order("created_at", { ascending: false }).limit(60);
    if (error) onError(/local_alerts/.test(error.message) ? "Run supabase/075_local_alerts.sql on the VPS database." : error.message);
    setRows((data ?? []) as Row[]);
  }, [sb, loc.id, onError]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function save(next: { on: boolean; ratingBelow: number | null }) {
    setBusy(true);
    try {
      await onSave(next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card title="Alert settings">
        <div className="flex flex-col gap-3 px-5 pb-5">
          <label className="flex cursor-pointer items-center gap-2 text-[13.5px] text-ink">
            <input type="checkbox" className="h-4 w-4" checked={set.on} disabled={!canEdit || busy} onChange={() => save({ on: !set.on, ratingBelow: set.ratingBelow })} />
            Email alerts for this location
          </label>
          <div className="flex flex-wrap items-center gap-2 text-[13.5px] text-body">
            <span>Alert when the Google rating falls below</span>
            <input
              className="aw-input w-20! flex-none"
              inputMode="decimal"
              aria-label="Rating level"
              placeholder="4.5"
              value={level}
              disabled={!canEdit || busy}
              onChange={(e) => setLevel(e.target.value.replace(/[^\d.]/g, "").slice(0, 3))}
            />
            <button
              type="button"
              className="aw-btn aw-btn--secondary aw-btn--sm"
              disabled={!canEdit || busy || level === (set.ratingBelow === null ? "" : String(set.ratingBelow))}
              onClick={() => {
                const r = level.trim() ? Number(level) : null;
                if (r !== null && !(r > 1 && r <= 5)) return onError("Pick a rating between 1 and 5.");
                onError("");
                save({ on: set.on, ratingBelow: r });
              }}
            >
              Save
            </button>
          </div>
        </div>
      </Card>
      <Card title="Alerts">
        {rows === null ? (
          <div className="px-5 pb-5">
            <Thinking text="Loading" />
          </div>
        ) : rows.length ? (
          <ul className="flex flex-col">
            {rows.map((a) => (
              <li key={a.id} className="flex flex-col gap-1 border-t border-[var(--border-medium)] px-5 py-3 first:border-t-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className={`aw-status ${a.kind === "new_rival" ? "" : "aw-status--warn"}`}>{a.status === "checking" ? "Checking again" : ALERT_LABEL[a.kind]}</span>
                  <span className="font-medium text-ink wrap-break-word">{a.title}</span>
                  <span className="ml-auto text-[12.5px] text-muted">
                    {when(a.created_at)}
                    {a.emailed_at ? ", emailed" : ""}
                  </span>
                </div>
                <span className="text-[13px] text-body wrap-break-word">{a.detail}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 pb-5 text-[13.5px] text-body">No alerts yet. A rank drop, a new competitor in the top 3, a change Google made to your listing, a 1 or 2 star review, or your rating falling below your level shows here and is emailed, once a day at most.</p>
        )}
      </Card>
    </div>
  );
}
