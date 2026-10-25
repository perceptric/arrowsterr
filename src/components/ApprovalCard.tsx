"use client";

import { useCallback, useEffect, useState } from "react";
import type { Approval } from "@/lib/ask";
import { BlockError, SkelBlock } from "./states";

// Something Zippie asked to do (start an audit, change or delete Editorial Calendar pieces). It runs only when an
// editor presses Approve here (/api/ask approve).

type Api = <T>(path: string, body: Record<string, unknown>) => Promise<T>;

const LABEL: Record<string, { text: string; tone: string }> = {
  ready: { text: "Waiting", tone: "aw-status--warn" },
  applying: { text: "Running", tone: "aw-status--pending" },
  applied: { text: "Done", tone: "aw-status--ranked" },
  undone: { text: "Declined", tone: "aw-status--pending" },
  failed: { text: "Failed", tone: "aw-status--missed" },
};

export function ApprovalCard({ id, api, canEdit }: { id: string; api: Api; canEdit: boolean }) {
  const [a, setA] = useState<Approval | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setA((await api<{ approval: Approval }>("/api/ask", { action: "approval", actionId: id })).approval);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [api, id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);
  const decide = async (action: "approve" | "decline") => {
    setBusy(true);
    setError("");
    try {
      setA((await api<{ approval: Approval }>("/api/ask", { action, actionId: id })).approval);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      await load();
    } finally {
      setBusy(false);
    }
  };
  if (!a)
    return (
      <div className="zp-card">
        {error ? (
          <BlockError
            what="this request"
            onRetry={() => {
              setError("");
              void load();
            }}
          />
        ) : (
          <SkelBlock lines={2} />
        )}
      </div>
    );
  const label = LABEL[a.status] ?? { text: a.status, tone: "" };
  return (
    <div className="zp-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-medium text-ink">{a.title}</p>
          <p className="text-[12px] text-muted">
            <span className={`aw-status ${label.tone}`}>{label.text}</span> {a.error || (a.status === "ready" ? "" : a.step)}
          </p>
        </div>
        {canEdit && a.status === "ready" ? (
          <div className="flex gap-2">
            <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" disabled={busy} onClick={() => void decide("decline")}>
              Decline
            </button>
            <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" disabled={busy} onClick={() => void decide("approve")}>
              Approve
            </button>
          </div>
        ) : null}
      </div>
      {a.lines.length ? (
        <ul className="flex flex-col gap-1 text-[13px] text-body">
          {a.lines.slice(0, 20).map((l, i) => (
            <li key={i} className="truncate">
              {l}
            </li>
          ))}
          {a.lines.length > 20 ? <li className="text-muted">{a.lines.length - 20} more</li> : null}
        </ul>
      ) : null}
      {error ? <p className="aw-error">{error}</p> : null}
    </div>
  );
}
