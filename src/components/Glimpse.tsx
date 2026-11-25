"use client";

import { PLANS, priceOf, SELF_SERVE, TRACKS, type Interval, type PlanId, type Track } from "@/lib/plans";
import { EmptyScreen } from "./Drawing";

// A toolset the plan doesn't have (docs/empty-screens-plan.md): the lock picture, what to add, and the way to add it.
// A one-toolset plan adds the other toolset on the same plan. title and pitch let a caller name a smaller piece of a toolset.

/** The plan that adds the missing toolset: the same paid plan with both, or Starter. */
export const addPlanFor = (plan: PlanId): PlanId => (SELF_SERVE.includes(plan) ? plan : "foundation");

export function Glimpse({ track, plan, interval, title, pitch, admin, busy, onBoost, onPlans }: { track: Track; plan: PlanId; interval: Interval; title?: string; pitch?: string; admin: boolean; busy: boolean; onBoost: () => void; onPlans: () => void }) {
  const to = addPlanFor(plan);
  return (
    <EmptyScreen
      drawing="lock"
      title={title ?? `Add ${TRACKS[track].label} to your plan`}
      action={
        <>
          {admin ? (
            <button type="button" className="aw-btn aw-btn--primary" disabled={busy} onClick={onBoost}>
              {busy ? "Opening..." : `Get both on ${PLANS[to].name}, $${priceOf(to, "both", interval)}/mo`}
            </button>
          ) : null}
          <button type="button" className="aw-btn aw-btn--secondary" onClick={onPlans}>
            See plans
          </button>
        </>
      }
    >
      {pitch ?? (admin ? "One plan change opens it for every brand." : "Ask an admin to add it to the plan.")}
    </EmptyScreen>
  );
}
