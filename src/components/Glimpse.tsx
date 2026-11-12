"use client";

import { PLANS, TRACKS, type Track } from "@/lib/plans";
import { EmptyScreen } from "./Drawing";

// A toolset the plan doesn't have (docs/empty-screens-plan.md): the lock picture, what to add, and the way up to Pro.
// title and pitch let a caller name a smaller piece of a toolset.

export function Glimpse({ track, title, pitch, admin, busy, onBoost, onPlans }: { track: Track; title?: string; pitch?: string; admin: boolean; busy: boolean; onBoost: () => void; onPlans: () => void }) {
  const pro = PLANS.scale;
  return (
    <EmptyScreen
      drawing="lock"
      title={title ?? `Add ${TRACKS[track].label} with Pro`}
      action={
        <>
          {admin ? (
            <button type="button" className="aw-btn aw-btn--primary" disabled={busy} onClick={onBoost}>
              {busy ? "Opening..." : `Upgrade to Pro, $${pro.price}/mo`}
            </button>
          ) : null}
          <button type="button" className="aw-btn aw-btn--secondary" onClick={onPlans}>
            See plans
          </button>
        </>
      }
    >
      {pitch ?? (admin ? "One plan change opens it for every brand." : "Ask an admin to upgrade the plan.")}
    </EmptyScreen>
  );
}
