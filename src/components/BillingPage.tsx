"use client";

import { askConfirm } from "@/components/Dialogs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";
import { atLeast, getPlanUsage, type PlanUsage, type Workspace } from "@/lib/db";
import { LADDER, mixOf, PLANS, TASK_COST, TASK_PACKS, TRACKS, type Interval, type Mix, type PackId, type PlanId } from "@/lib/plans";
import type { RunAuth } from "@/lib/runner";
import { IntervalSwitch, PlanGrid, type Choice } from "./PlanGrid";
import { post } from "./research/shared";
import { ErrorNote, Meter } from "./ui";
import { errorText } from "@/lib/errors";

export const SALES = "mailto:sales@arrowsterr.com?subject=Arrowsterr%20Enterprise";
const date = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const rank = (id: PlanId) => LADDER.indexOf(id);

/**
 * Pick a plan: Checkout for a first plan, an instant switch after that. Returns a message, or opens Stripe.
 * Without a mix, extra tasks or extra prompts, the workspace keeps the ones it has.
 */
export async function choosePlan(auth: RunAuth, plan: PlanId, interval: Interval, choice: { mix?: Mix; tasks?: number; prompts?: number } = {}) {
  const r = await post<{ url?: string; changed?: boolean }>(auth, "/api/billing/checkout", { plan, interval, ...choice });
  if (r.url) window.location.href = r.url;
  return r.changed ? `You're on ${PLANS[plan].name} now.` : "";
}

/** Buy a task pack: opens Stripe Checkout. */
export async function buyPack(auth: RunAuth, pack: PackId) {
  const r = await post<{ url: string }>(auth, "/api/billing/pack", { pack });
  window.location.href = r.url;
}

/** Plan, allowances, and every plan to pick from. */
export function BillingPage({ sb, ws, auth, onPlan }: { sb: SupabaseClient; ws: Workspace; auth: RunAuth; onPlan: () => void }) {
  const isAdmin = atLeast(ws.role, "admin");
  const [plan, setPlan] = useState<PlanUsage | null>(null);
  const [cycle, setCycle] = useState<Interval>("month");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const p = await getPlanUsage(sb, ws.id).catch((e) => (setError(errorText(e)), null));
    setPlan(p);
    if (p?.interval) setCycle(p.interval);
    return p;
  }, [sb, ws.id]);

  useEffect(() => {
    load();
    // Back from Stripe Checkout: the webhook lands within seconds, so look again a few times.
    const params = new URLSearchParams(window.location.search);
    if (params.get("pack") === "done") {
      params.delete("pack");
      window.history.replaceState(null, "", window.location.pathname + (params.size ? `?${params}` : ""));
      const before = Date.now();
      const t = window.setInterval(async () => {
        await load();
        if (Date.now() - before > 12_000) window.clearInterval(t);
      }, 2000);
      setNotice("Thanks! Your tasks are added as soon as Stripe confirms the payment.");
      return () => window.clearInterval(t);
    }
    if (params.get("checkout") !== "done") return;
    params.delete("checkout");
    window.history.replaceState(null, "", window.location.pathname + (params.size ? `?${params}` : ""));
    let tries = 0;
    const timer = window.setInterval(async () => {
      const p = await load();
      if ((p && p.plan !== "trial" && p.plan !== "legacy" && p.status === "active") || ++tries >= 10) {
        window.clearInterval(timer);
        if (p) setNotice(`You're on ${p.name} now.`);
        onPlan();
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [load, onPlan]);

  async function act(key: string, fn: () => Promise<string | void>) {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      const done = await fn();
      if (done) {
        setNotice(done);
        await load();
        onPlan();
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  const paying = Boolean(plan && plan.customer && plan.plan !== "trial" && plan.plan !== "legacy" && plan.status !== "read_only");
  const portal = () =>
    act("portal", async () => {
      const r = await post<{ url: string }>(auth, "/api/billing/portal", {});
      window.location.href = r.url;
    });
  // What the current plan has, so its card starts there. A v5 Starter's card starts on both toolsets: today's Starter.
  const current = paying && plan ? { plan: plan.plan, mix: plan.v5 ? ("both" as Mix) : mixOf(plan.track), tasks: plan.taskSteps, prompts: plan.promptSteps } : null;
  const button = (id: PlanId, choice: Choice | null) => {
    if (id === "enterprise" || !choice)
      return (
        <a href={SALES} className="aw-btn aw-btn--block bg-white! text-ink!">
          Talk to us
        </a>
      );
    const samePick = current?.plan === id && current.mix === choice.mix && current.tasks === choice.tasks && current.prompts === choice.prompts && !plan?.older;
    const same = samePick && (plan?.interval ?? "month") === cycle;
    if (same)
      return (
        <button type="button" className="aw-btn aw-btn--secondary aw-btn--block" disabled>
          Current plan
        </button>
      );
    const up = !paying || !plan || rank(id) > rank(plan.plan);
    const label = !paying ? "Choose" : samePick ? `Switch to ${cycle === "year" ? "yearly" : "monthly"}` : plan?.plan === id ? "Update plan" : up ? "Boost" : "Switch";
    const key = `${id}-${choice.mix}-${choice.tasks}-${choice.prompts}`;
    return (
      <button
        type="button"
        className={`aw-btn aw-btn--block ${up || !paying ? "aw-btn--primary" : "aw-btn--secondary"}`}
        disabled={!isAdmin || busy !== null}
        title={isAdmin ? undefined : "Ask an admin"}
        onClick={async () => {
          if (paying && !(await askConfirm({ title: plan?.plan === id ? `Update your ${PLANS[id].name} plan?` : `Switch to ${PLANS[id].name}?`, text: "The difference is charged or credited today.", action: "Switch", danger: false }))) return;
          act(key, () => choosePlan(auth, id, cycle, choice));
        }}
      >
        {busy === key ? "Opening..." : label}
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-[14px] text-body">Your plan, tasks and invoices.</p>
        {plan?.customer && isAdmin ? (
          <button
            type="button"
            className="aw-btn aw-btn--secondary"
            disabled={busy !== null}
            onClick={portal}
          >
            {busy === "portal" ? "Opening..." : "Invoices & payment"}
          </button>
        ) : null}
      </div>
      {error ? <ErrorNote error={error} onRetry={plan ? undefined : () => (setError(""), void load())} /> : null}
      {notice ? <p className="aw-callout text-[15px]!">{notice}</p> : null}

      {plan ? (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="aw-h4 mb-0!">{plan.name}</h2>
            {plan.status === "read_only" ? (
              <span className="aw-status aw-status--missed">Read-only</span>
            ) : plan.status === "past_due" ? (
              <span className="aw-status aw-status--warn">Payment failed</span>
            ) : plan.trialLeft !== null ? (
              <span className="aw-status aw-status--pending">{plan.trialLeft} days left</span>
            ) : null}
            {plan.cancelAt ? <span className="aw-small">Ends {date(plan.cancelAt)}</span> : plan.periodEnd && paying ? <span className="aw-small">Renews {date(plan.periodEnd)}</span> : null}
          </div>
          {plan.plan === "foundation" && plan.track ? (
            <p className="text-[14px] text-body">
              Your Starter plan, at its earlier price, opens <strong>{TRACKS[plan.track].label}</strong>. Choose Starter again below to get both toolsets, the Agentic Writer and MCP, or tick one toolset for a lower price.
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-3">
            {plan.allowances
              .filter((a) => a.metric === "tasks")
              .map((a) => (
                <Meter key={a.metric} label="Tasks this month" used={a.used} limit={a.limit} />
              ))}
            <div className="aw-frame flex flex-col justify-center gap-1 px-4 py-3">
              <span className="aw-label">Task packs</span>
              <span className="aw-num text-[22px] text-ink">{plan.credits.toLocaleString("en-US")}</span>
              <span className="text-[12px] text-muted">Used after the month&apos;s tasks. Never expire.</span>
            </div>
            {plan.allowances
              .filter((a) => a.metric === "checknow" && a.limit > 0)
              .map((a) => (
                <Meter key={a.metric} label="On-demand checks today" used={a.used} limit={a.limit} />
              ))}
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="aw-h4 mb-0!">Task packs</h2>
          <p className="text-[14px] text-body">Ran out of tasks? Top up any time. Pack tasks never expire. Tracking your prompts never uses tasks.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {TASK_PACKS.map((p) => (
            <div key={p.id} className="aw-frame flex flex-col gap-3 p-5">
              <span className="aw-num text-[26px] text-ink">{p.tasks.toLocaleString("en-US")} tasks</span>
              <span className="text-[14px] text-body">
                ${p.price} · ${((p.price / p.tasks) * 1000).toFixed(2)} per 1,000
              </span>
              <button type="button" className="aw-btn aw-btn--primary aw-btn--sm self-start" disabled={!isAdmin || busy !== null} title={isAdmin ? undefined : "Ask an admin"} onClick={() => act(p.id, () => buyPack(auth, p.id))}>
                {busy === p.id ? "Opening..." : "Buy"}
              </button>
            </div>
          ))}
        </div>
        <details className="aw-frame px-5 py-3 text-[14px]">
          <summary className="cursor-pointer font-medium text-ink">What does a task cost?</summary>
          <ul className="mt-3 grid gap-1.5 text-body sm:grid-cols-2">
            {[
              ["Keyword lookup", TASK_COST.keyword],
              ["Domain research", TASK_COST.domain],
              ["Competitive analysis", TASK_COST.gap],
              ["Your pages on Google", TASK_COST.pages],
              ["Content brief", TASK_COST.brief],
              ["Writer agent job", TASK_COST.agent],
              ["Stats with sources", TASK_COST.stats],
              ["Interactive element", TASK_COST.widget],
              ["Small AI job", TASK_COST.ai],
            ].map(([k, v]) => (
              <li key={k as string} className="flex justify-between gap-3 border-b border-rule-faint py-1">
                <span>{k}</span>
                <span className="aw-num text-ink">{v} tasks</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[13px] text-muted">Tracking prompts and publishing use no tasks.</p>
        </details>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="aw-h4 mb-0!">Plans</h2>
          <IntervalSwitch value={cycle} onChange={setCycle} />
        </div>
        {plan ? <PlanGrid key={current ? `${current.plan}-${current.mix}-${current.tasks}-${current.prompts}` : "new"} interval={cycle} current={current} action={button} /> : null}
      </section>
    </div>
  );
}
