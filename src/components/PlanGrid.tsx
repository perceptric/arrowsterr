"use client";

import { useState } from "react";
import { PLANS, priceOf, SELF_SERVE, stepPrice, TASK_STEP, UNLIMITED, VIS_TASKS, type Interval, type Mix, type Plan, type PlanId } from "@/lib/plans";
import { BrandLogo } from "./BrandLogo";
import { ENGINE_LOGOS } from "./Engines";
import { NavIcon } from "./NavIcon";
import { Seg, Tip } from "./ui";

/** The AIs every plan tracks, for the logo rows. */
export const AIS: { name: string; logo: string }[] = [
  { name: "ChatGPT", logo: ENGINE_LOGOS.ChatGPT },
  { name: "Claude", logo: ENGINE_LOGOS.Claude },
  { name: "Gemini", logo: ENGINE_LOGOS.Gemini },
  { name: "Perplexity", logo: ENGINE_LOGOS.Perplexity },
  { name: "AI Overviews", logo: ENGINE_LOGOS["AI Overview"] },
  { name: "AI Mode", logo: ENGINE_LOGOS["AI Mode"] },
];
/** The other logos the cards show, from public/logos. */
export const LOGOS = {
  wordpress: { name: "WordPress", logo: "/logos/wordpress.png" },
  shopify: { name: "Shopify", logo: "/logos/shopify.png" },
  webflow: { name: "Webflow", logo: "/logos/webflow.png" },
  framer: { name: "Framer", logo: "/logos/framer.png" },
  cursor: { name: "Cursor", logo: "/logos/cursor.png" },
  slack: { name: "Slack", logo: "/logos/slack.png" },
  zapier: { name: "Zapier", logo: "/logos/zapier.png" },
  gsc: { name: "Google Search Console", logo: "/logos/search-console.png" },
  ga4: { name: "Google Analytics 4", logo: "/logos/google-analytics.svg" },
};
export const CMS = [LOGOS.wordpress, LOGOS.shopify, LOGOS.webflow, LOGOS.framer];
export const MCP_APPS = [{ name: "Claude", logo: ENGINE_LOGOS.Claude }, { name: "ChatGPT", logo: ENGINE_LOGOS.ChatGPT }, LOGOS.cursor];

const n = (v: number) => v.toLocaleString("en-US");
const money = (v: number) => (Number.isInteger(v) ? n(v) : v.toFixed(2));
const count = (v: number, one: string, many = `${one}s`) => (v >= UNLIMITED ? `Unlimited ${many}` : `${n(v)} ${v === 1 ? one : many}`);
const history = (d: number) => (d >= 365 ? `${Math.round(d / 365)} ${d >= 730 ? "years" : "year"}` : `${Math.round(d / 30)} months`);

const TIPS = {
  tasks: "Tasks pay for research, the Writer, MCP and Zippie's skills. An MCP call uses 1, a keyword lookup 10 and a domain report 10. Tracking prompts never uses tasks.",
};
/** What Zippie's 60+ skills cover, for the hover list. */
export const SKILL_GROUPS = [
  "AI visibility reviews and prompt finding",
  "Competitor teardowns",
  "Keyword research and content gaps",
  "Outlines and full articles",
  "Internal links and orphan pages",
  "Site health, speed and indexing",
  "Structured data and AI crawlers",
  "Fact checks, edits and proofreading",
];

/** Overlapping AI logos. */
export function LogoStack({ size = 20 }: { size?: number }) {
  return (
    <span className="inline-flex items-center" aria-label={AIS.map((a) => a.name).join(", ")}>
      {AIS.filter((a, i) => AIS.findIndex((b) => b.logo === a.logo) === i).map((a, i) => (
        <span key={a.name} className="rounded-aw bg-white ring-2 ring-white" style={{ marginLeft: i ? -size * 0.3 : 0 }}>
          <BrandLogo src={a.logo} name={a.name} size={size} />
        </span>
      ))}
    </span>
  );
}

/** A row of small logos, with "+N" for the ones left out. */
export function LogoRow({ logos, more = 0 }: { logos: { name: string; logo: string }[]; more?: number }) {
  return (
    <span className="flex items-center gap-1.5" aria-label={logos.map((l) => l.name).join(", ") + (more ? ` and ${more} more` : "")}>
      {logos.map((l) => (
        <BrandLogo key={l.name} src={l.logo} name={l.name} size={18} />
      ))}
      {more ? <span className="text-[12px] text-muted">+{more}</span> : null}
    </span>
  );
}

export function IntervalSwitch({ value, onChange }: { value: Interval; onChange: (v: Interval) => void }) {
  return (
    <Seg
      label="Billing period"
      value={value}
      onChange={onChange}
      options={[
        { id: "month", label: "Monthly" },
        { id: "year", label: <>Yearly <span className="rounded-full bg-pos-bg px-2 py-0.5 text-[11px] text-pos">Save 15%</span></> },
      ]}
    />
  );
}

/** What someone picked on a card: the toolsets and extra task steps. */
export type Choice = { mix: Mix; tasks: number };
type Pick = { visibility: boolean; seo: boolean; tasks: number };
const mixOfPick = (p: Pick): Mix => (p.visibility && p.seo ? "both" : p.visibility ? "visibility" : "seo");
const pickOf = (c?: Choice | null): Pick => ({ visibility: !c || c.mix !== "seo", seo: !c || c.mix !== "visibility", tasks: c?.tasks ?? 0 });

/** A plan's monthly tasks for a mix, before extra steps. */
export const tasksFor = (id: PlanId, mix: Mix) => (mix === "visibility" ? (VIS_TASKS[id] ?? PLANS[id].tasksPerMonth) : PLANS[id].tasksPerMonth);

function Row({ on = true, icon, text, end, logos }: { on?: boolean; icon: React.ReactNode; text: React.ReactNode; end?: React.ReactNode; logos?: React.ReactNode }) {
  return (
    <li className={`flex items-start gap-3 py-2 text-[15px] leading-snug ${on ? "text-ink" : "text-faint"}`}>
      <span aria-hidden="true" className={`flex h-5 w-5 shrink-0 items-center justify-center ${on ? "text-brand" : "opacity-50 grayscale"}`}>
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        {text}
        {logos ? <span className={on ? "" : "opacity-50 grayscale"}>{logos}</span> : null}
      </span>
      <span className={`ml-2 shrink-0 text-right text-[14px] ${on ? "aw-num font-semibold text-ink" : "text-faint"}`}>
        {!on ? (
          <span aria-label="Not included">–</span>
        ) : end ?? (
          <svg viewBox="0 0 24 24" aria-label="Included" className="h-[18px] w-[18px] fill-none stroke-brand stroke-[2.2]" strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 12 5 5 9-10" />
          </svg>
        )}
      </span>
    </li>
  );
}

const Icon = ({ name }: { name: string }) => <NavIcon name={name} />;
const Logo = ({ l }: { l: { name: string; logo: string } }) => <BrandLogo src={l.logo} name={l.name} size={18} />;
const Section = ({ children }: { children: React.ReactNode }) => <li className="mt-3 mb-0.5 text-[12px] font-semibold tracking-wide text-muted uppercase">{children}</li>;

/** "60+ Zippie skills", with what they cover on hover or focus. */
function SkillsRow() {
  return (
    <li className="group/skills relative flex items-start gap-3 py-2 text-[15px] leading-snug text-ink">
      <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center text-brand">
        <Icon name="bot" />
      </span>
      <button type="button" className="flex-1 cursor-help text-left">
        <span className="border-b-[1.5px] border-dotted border-current">60+ Zippie skills</span>
      </button>
      <svg viewBox="0 0 24 24" aria-label="Included" className="ml-2 h-[18px] w-[18px] shrink-0 fill-none stroke-brand stroke-[2.2]" strokeLinecap="round" strokeLinejoin="round">
        <path d="m5 12 5 5 9-10" />
      </svg>
      <span
        role="tooltip"
        className="pointer-events-none absolute top-full left-8 z-40 w-72 rounded-aw border border-rule bg-white p-3.5 text-[13px] leading-relaxed text-body opacity-0 shadow-aw-lg transition-opacity group-focus-within/skills:opacity-100 group-hover/skills:opacity-100"
      >
        <span className="mb-1 block font-semibold text-ink">What Zippie can do</span>
        {SKILL_GROUPS.map((s) => (
          <span key={s} className="block">
            • {s}
          </span>
        ))}
      </span>
    </li>
  );
}

function Price({ id, mix, steps, interval }: { id: PlanId; mix: Mix; steps: number; interval: Interval }) {
  const monthly = priceOf(id, mix, "month") + stepPrice(steps, "month");
  const shown = Math.round(priceOf(id, mix, interval) + stepPrice(steps, interval));
  return (
    <div>
      <div className="flex items-end gap-1.5">
        {interval === "year" ? <span className="aw-num mb-1.5 text-[18px] text-faint line-through">${n(monthly)}</span> : null}
        <span className="aw-num text-[38px] leading-none font-semibold text-ink">${n(shown)}</span>
        <span className="mb-1 text-[14px] text-muted">/mo</span>
      </div>
      <p className="aw-small mt-2">{interval === "year" ? `$${n((priceOf(id, mix, "year") + stepPrice(steps, "year")) * 12)} billed yearly after your trial` : "Billed monthly after your trial"}</p>
    </div>
  );
}

function Toolset({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className={`flex cursor-pointer items-center gap-2.5 rounded-aw border px-3 py-2.5 text-[14px] font-semibold whitespace-nowrap text-ink select-none ${checked ? "border-brand bg-brand-pale/40" : "border-rule bg-white"}`}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      {label}
    </label>
  );
}

function Card({ id, interval, current, pick, setPick, action }: { id: PlanId; interval: Interval; current: boolean; pick: Pick; setPick: (p: Pick) => void; action: (plan: PlanId, choice: Choice) => React.ReactNode }) {
  const p: Plan = PLANS[id];
  const hot = id === "scale";
  const mix = mixOfPick(pick);
  const toggle = (k: "visibility" | "seo") => {
    const other = k === "visibility" ? "seo" : "visibility";
    if (pick[k] && !pick[other]) return; // one toolset always stays on
    setPick({ ...pick, [k]: !pick[k] });
  };
  const steps = pick.tasks;
  return (
    <div className={`relative flex flex-col rounded-aw-lg border bg-white p-6 ${hot || current ? "border-2 border-brand" : "border-rule"}`}>
      {hot ? <span className="aw-badge absolute -top-3 left-6">Most popular</span> : null}
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[22px] font-semibold text-ink">{p.name}</h3>
        {current ? <span className="aw-chip aw-chip--brand">Current</span> : null}
      </div>
      <p className="mt-1 min-h-10 text-[14px] text-muted">{p.tagline}</p>
      <div className="mt-4">
        <Price id={id} mix={mix} steps={steps} interval={interval} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2" role="group" aria-label={`Toolsets on ${p.name}`}>
        <Toolset label="AI Visibility" checked={pick.visibility} onChange={() => toggle("visibility")} />
        <Toolset label="SEO Research" checked={pick.seo} onChange={() => toggle("seo")} />
      </div>
      <div className="mt-4">{action(id, { mix, tasks: steps })}</div>
      <div className="mt-5 flex items-center gap-2 text-[15px] font-semibold text-ink">
        <span className="aw-num">{n(tasksFor(id, mix) + steps * TASK_STEP.tasks)} tasks/month</span>
        <Tip text={TIPS.tasks} />
        <span className="ml-auto flex gap-2">
          <button type="button" className="flex h-8 w-8 items-center justify-center rounded-aw-sm border border-rule bg-white text-[18px] leading-none text-brand hover:border-brand disabled:cursor-default disabled:text-faint disabled:hover:border-rule" aria-label="Fewer tasks" disabled={!steps} onClick={() => setPick({ ...pick, tasks: steps - 1 })}>
            –
          </button>
          <button type="button" className="flex h-8 w-8 items-center justify-center rounded-aw-sm border border-rule bg-white text-[18px] leading-none text-brand hover:border-brand disabled:cursor-default disabled:text-faint disabled:hover:border-rule" aria-label={`${n(TASK_STEP.tasks)} more tasks a month`} disabled={steps >= TASK_STEP.max} onClick={() => setPick({ ...pick, tasks: steps + 1 })}>
            +
          </button>
        </span>
      </div>
      <p className="mt-1 min-h-5 text-[12.5px] font-medium text-pos">{steps ? `+${n(steps * TASK_STEP.tasks)} extra tasks · +$${money(stepPrice(steps, interval))}/mo` : ""}</p>
      <div className="mt-3 flex items-center justify-center gap-4 border-y border-dashed border-rule py-3.5 text-[15px] text-body">
        <span className="flex items-center gap-2">
          <span className="text-brand">
            <Icon name="user" />
          </span>
          {count(p.seats, "seat")} included
        </span>
        <span className="flex items-center gap-2">
          <span className="text-brand">
            <Icon name="globe" />
          </span>
          {count(p.brands, "brand")}
        </span>
      </div>
      <ul className="flex flex-1 flex-col pt-2">
        <SkillsRow />
        {pick.visibility ? (
          <>
            <Section>AI Visibility</Section>
            <Row icon={<Icon name="radar" />} text={`${n(p.prompts)} prompts checked daily`} logos={<LogoRow logos={AIS.slice(0, 5)} more={1} />} />
            <Row icon={<Icon name="swap" />} text="Competitors per brand" end={n(p.competitors)} />
            <Row icon={<Icon name="quote" />} text="Sources AI cites" />
            <Row icon={<Icon name="clock" />} text="History" end={history(p.historyDays)} />
          </>
        ) : null}
        {pick.seo ? (
          <>
            <Section>SEO Research</Section>
            <Row icon={<Icon name="search" />} text="Keyword Research" />
            <Row icon={<Icon name="calendar" />} text="Content Plan & Calendar" on={p.plansPerMonth > 0} />
            <Row icon={<Icon name="pen" />} text="Agentic Writer" end={`${n(p.articlesPerMonth)} /mo`} on={p.writer === "full"} />
            <Row icon={<Icon name="upload" />} text="Publish to your CMS" logos={<LogoRow logos={CMS} more={4} />} on={p.writer === "full"} />
          </>
        ) : null}
        <Section>Connect</Section>
        <Row icon={<Logo l={LOGOS.gsc} />} text="Google Search Console" />
        <Row icon={<Logo l={LOGOS.ga4} />} text="Google Analytics 4" />
        <Row icon={<Icon name="code" />} text="MCP for your AI" logos={<LogoRow logos={MCP_APPS} more={2} />} on={p.mcp} />
        <Row icon={<Icon name="plug" />} text="Slack, Zapier & API" logos={<LogoRow logos={[LOGOS.slack, LOGOS.zapier]} />} on={p.alerts} />
        <Row icon={<Icon name="doc" />} text="8 report templates" on={p.reports === "templates" || p.reports === "whitelabel"} />
        <Row icon={<Icon name="tag" />} text="White-label reports" on={p.reports === "whitelabel"} />
      </ul>
    </div>
  );
}

/**
 * Starter, Pro and Agency side by side, then Enterprise. Each card has its own toolset ticks and extra-task stepper.
 * `action` draws each plan's button for what's picked on its card. `current` starts the current plan's card on what it has.
 */
export function PlanGrid({
  interval,
  current,
  action,
}: {
  interval: Interval;
  current?: ({ plan: PlanId } & Choice) | null;
  action: (plan: PlanId, choice: Choice | null) => React.ReactNode;
}) {
  const [picks, setPicks] = useState<Partial<Record<PlanId, Pick>>>(() => (current ? { [current.plan]: pickOf(current) } : {}));
  return (
    <div className="flex flex-col gap-5">
      <div className="grid items-start gap-5 lg:grid-cols-3">
        {SELF_SERVE.map((id) => {
          const pick = picks[id] ?? pickOf(null);
          const same = current?.plan === id && current.mix === mixOfPick(pick) && current.tasks === pick.tasks;
          return <Card key={id} id={id} interval={interval} current={Boolean(same)} pick={pick} setPick={(p) => setPicks((all) => ({ ...all, [id]: p }))} action={action} />;
        })}
      </div>
      <div className="flex flex-col gap-5 rounded-aw-lg bg-ink p-6 text-white sm:p-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium tracking-wide text-white/60 uppercase">Enterprise</span>
          <h3 className="text-[24px] font-medium text-white">{PLANS.enterprise.tagline}</h3>
          <p className="text-[15px] text-white/70">
            {n(PLANS.enterprise.prompts)}+ prompts, {n(PLANS.enterprise.tasksPerMonth)}+ tasks and {n(PLANS.enterprise.articlesPerMonth)}+ articles a month, unlimited seats and brands, SSO, a security review and a named success manager. From ${n(PLANS.enterprise.price)}/mo.
          </p>
        </div>
        <div className="shrink-0 lg:w-56">{action("enterprise", null)}</div>
      </div>
    </div>
  );
}
