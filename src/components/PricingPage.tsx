"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { ARTICLE_TASKS, MIX_PRICES, PLANS, PROMPT_STEP, SELF_SERVE, TASK_COST, TASK_STEP, UNLIMITED, VIS_TASKS, type Interval, type Plan, type PlanId } from "@/lib/plans";
import { SALES } from "./BillingPage";
import { BrandLogo } from "./BrandLogo";
import { Logo } from "./Logo";
import { NavIcon } from "./NavIcon";
import { AIS, CMS, CMS_MORE, IntervalSwitch, LogoRow, LogoStack, LOGOS, MCP_APPS, PlanGrid } from "./PlanGrid";

const n = (v: number) => (v >= UNLIMITED ? "Unlimited" : v.toLocaleString("en-US"));
const yes = (on: boolean) => (on ? "✓" : "–");
const history = (d: number) => (d >= 365 ? `${Math.round(d / 365)} yr` : `${Math.round(d / 30)} months`);

type Cell = (p: Plan, id: PlanId) => string;
type CompareRow = { label: string; icon: React.ReactNode; logos?: React.ReactNode; value: Cell };
const icon = (name: string) => <NavIcon name={name} />;
const logo = (l: { name: string; logo: string }) => <BrandLogo src={l.logo} name={l.name} size={18} />;

const ROWS: { group: string; rows: CompareRow[] }[] = [
  {
    group: "Your plan",
    rows: [
      { label: "Tasks a month", icon: icon("zap"), value: (p) => n(p.tasksPerMonth) },
      { label: "Tasks a month, AI Visibility only", icon: icon("zap"), value: (_, id) => n(VIS_TASKS[id] ?? 0) },
      { label: "Add prompts and tasks on the card", icon: icon("plus"), value: () => "✓" },
      { label: "Seats", icon: icon("user"), value: (p) => n(p.seats) },
      { label: "Brands", icon: icon("globe"), value: (p) => n(p.brands) },
      { label: "60+ Zippie skills", icon: icon("bot"), value: (p) => yes(p.mcp) },
    ],
  },
  {
    group: "AI Visibility",
    rows: [
      { label: "Prompts checked daily", icon: icon("radar"), logos: <LogoStack size={16} />, value: (p) => n(p.prompts) },
      { label: "On-demand checks a day", icon: icon("pulse"), value: (p) => n(p.checkNowPerDay) },
      { label: "Competitors per brand", icon: icon("swap"), value: (p) => n(p.competitors) },
      { label: "Sources AI cites", icon: icon("quote"), value: () => "✓" },
      { label: "History", icon: icon("clock"), value: (p) => history(p.historyDays) },
    ],
  },
  {
    group: "SEO Research",
    rows: [
      { label: "Keyword Research, 8.4 billion keywords", icon: icon("search"), value: () => "✓" },
      { label: "Domain Research", icon: icon("globe"), value: () => "✓" },
      { label: "Keyword gap", icon: icon("gap"), value: () => "✓" },
      { label: "Content Plan & Calendar", icon: icon("calendar"), value: (p) => yes(p.plansPerMonth > 0) },
      { label: "Agentic Writer, about this many articles", icon: icon("pen"), value: (p) => n(Math.floor(p.tasksPerMonth / ARTICLE_TASKS)) },
      { label: "Publish to your CMS", icon: icon("upload"), logos: <LogoRow logos={CMS} more={CMS_MORE} />, value: (p) => yes(p.writer === "full") },
    ],
  },
  {
    group: "Connect & reports",
    rows: [
      { label: "Google Search Console", icon: logo(LOGOS.gsc), value: () => "✓" },
      { label: "Google Analytics 4", icon: logo(LOGOS.ga4), value: () => "✓" },
      { label: "Traffic & AI visits", icon: icon("trend"), value: (p) => (p.pageviewsPerMonth >= 1_000_000 ? `${p.pageviewsPerMonth / 1_000_000}M` : `${p.pageviewsPerMonth / 1000}k`) },
      { label: "MCP for your AI", icon: icon("code"), logos: <LogoRow logos={MCP_APPS} more={2} />, value: (p) => yes(p.mcp) },
      { label: "Slack, Zapier & API", icon: icon("plug"), logos: <LogoRow logos={[LOGOS.slack, LOGOS.zapier]} />, value: (p) => yes(p.alerts) },
      { label: "8 report templates", icon: icon("doc"), value: (p) => yes(p.reports === "templates" || p.reports === "whitelabel") },
      { label: "White-label reports", icon: icon("tag"), value: (p) => yes(p.reports === "whitelabel") },
    ],
  },
];

const price = (id: PlanId, mix: "both" | "visibility" | "seo") => MIX_PRICES[id]?.[mix].price ?? PLANS[id].price;

const FAQ: { q: string; a: string }[] = [
  { q: "Is there a free trial?", a: "Yes. Every plan starts with 7 days free, with the Agentic Writer and no card. When the trial ends, your workspace waits for you to pick a plan. Nothing is deleted." },
  {
    q: "Can I pay for just one toolset?",
    a: `Yes. Untick AI Visibility or SEO Research on any plan and the price drops. Starter is $${price("foundation", "seo")} a month with either one, Pro is $${price("scale", "seo")} with SEO Research only or $${price("scale", "visibility")} with AI Visibility only, and Agency is $${price("agency", "seo")} or $${price("agency", "visibility")}. Add the other one any time on the Billing page.`,
  },
  { q: "What is a prompt?", a: "A question people ask AI, like “best CRM for startups”. We ask it to every AI and record whether your brand is named, in what spot, next to which competitors, and which sources the AI used." },
  { q: "Which AIs do you track?", a: "ChatGPT, Claude, Gemini, Perplexity, Google AI Overviews and Google AI Mode, on every plan with AI Visibility." },
  { q: "Do my brands share prompts?", a: "Yes. Your prompts are one pool for the whole workspace. Split them between your brands any way you like." },
  {
    q: "What is a task?",
    a: `Every action you run uses a few tasks: a Zippie or MCP step is ${TASK_COST.mcp}, a keyword lookup ${TASK_COST.keyword}, a domain report ${TASK_COST.domain}, a competitive analysis ${TASK_COST.gap} and a content brief ${TASK_COST.brief}. Tracking your prompts never uses tasks.`,
  },
  {
    q: "How many articles can I write?",
    a: `As many as your tasks cover. One Agentic Writer article takes ${ARTICLE_TASKS} tasks for the research, the outline and the writing, so ${n(PLANS.scale.tasksPerMonth)} tasks is about ${n(Math.floor(PLANS.scale.tasksPerMonth / ARTICLE_TASKS))} articles. Writing an article again is free.`,
  },
  {
    q: "What if I need more prompts or tasks?",
    a: `Press + on any card. Prompts go up ${PROMPT_STEP.prompts} at a time and tasks ${n(TASK_STEP.tasks)} at a time, and the price on the card changes as you go. Ran out mid-month? Buy a task pack on the Billing page. Pack tasks never expire and are used after your monthly tasks.`,
  },
  {
    q: "What does Starter include?",
    a: `Both toolsets: ${PLANS.foundation.prompts} prompts checked daily on all six AIs, ${n(PLANS.foundation.tasksPerMonth)} tasks a month (about ${Math.floor(PLANS.foundation.tasksPerMonth / ARTICLE_TASKS)} articles), Keyword and Domain Research, the Content Plan, and MCP with 60+ Zippie skills. Pro and up add more of each, plus Slack, Zapier and the API.`,
  },
  { q: "Can I change plans later?", a: "Any time. Upgrades start right away and you only pay the difference. Downgrades credit what is left of your month." },
];

/** The public pricing page. */
export function PricingPage() {
  const [cycle, setCycle] = useState<Interval>("month");
  const trial = (primary: boolean) => (
    <Link href="/" className={`aw-btn aw-btn--block ${primary ? "aw-btn--primary" : "aw-btn--secondary"}`}>
      Try 7 days free
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[15px] w-[15px] fill-none stroke-current stroke-[2.2]" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 17 17 7M8 7h9v9" />
      </svg>
    </Link>
  );
  return (
    <main className="min-h-screen bg-paper">
      <div className="bg-[radial-gradient(1200px_500px_at_50%_-120px,var(--aw-brand-pale),transparent)]">
        <header className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-6 sm:px-8">
          <Link href="/" aria-label="Arrowsterr home">
            <Logo size="sm" />
          </Link>
          <nav className="flex items-center gap-2">
            <Link href="/" className="aw-btn aw-btn--secondary aw-btn--sm">
              Sign in
            </Link>
            <Link href="/" className="aw-btn aw-btn--primary aw-btn--sm hidden sm:inline-flex">
              Try 7 days free
            </Link>
          </nav>
        </header>

        <section className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-4 pt-10 pb-12 text-center sm:px-8">
          <span className="aw-chip aw-chip--brand">Pricing</span>
          <h1 className="aw-display mb-0!">Be the brand AI recommends</h1>
          <p className="aw-lede max-w-2xl">Tick what you need on any plan: AI Visibility, SEO Research or both. Every plan starts with a 7-day free trial, no card.</p>
          <ul className="flex flex-wrap justify-center gap-2">
            {AIS.map((a) => (
              <li key={a.name} className="flex items-center gap-2 rounded-full border border-rule bg-white py-1.5 pr-3.5 pl-1.5 text-[13px] font-medium text-ink shadow-aw-sm">
                <BrandLogo src={a.logo} name={a.name} size={22} />
                {a.name}
              </li>
            ))}
          </ul>
          <IntervalSwitch value={cycle} onChange={setCycle} />
        </section>
      </div>

      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-8">
        <PlanGrid
          interval={cycle}
          action={(id) =>
            id === "enterprise" ? (
              <a href={SALES} className="aw-btn aw-btn--block bg-white! text-ink!">
                Talk to us
              </a>
            ) : (
              trial(id === "scale")
            )
          }
        />
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-8">
        <h2 className="aw-h2 mb-2! text-center">Compare plans</h2>
        <p className="mb-6 text-center text-[15px] text-muted">Prices with both toolsets. Untick one on a card above to see its price.</p>
        <div className="overflow-x-auto rounded-aw-lg border border-rule bg-white">
          <table className="w-full min-w-[760px] text-[14px]">
            <thead>
              <tr className="border-b border-rule">
                <th className="w-[40%] p-4 text-left font-medium text-muted" />
                {SELF_SERVE.map((id) => (
                  <th key={id} className={`p-4 text-center ${id === "scale" ? "bg-brand-pale/50" : ""}`}>
                    <span className="block text-[16px] font-medium text-ink">{PLANS[id].name}</span>
                    <span className="aw-num text-[13px] font-normal text-muted">${cycle === "year" ? PLANS[id].annual : PLANS[id].price}/mo</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((g) => (
                <Fragment key={g.group}>
                  <tr>
                    <td colSpan={SELF_SERVE.length + 1} className="bg-surface-2 px-4 py-2.5 text-[12px] font-medium tracking-wide text-muted uppercase">
                      {g.group}
                    </td>
                  </tr>
                  {g.rows.map((r) => (
                    <tr key={r.label} className="border-t border-rule-faint">
                      <td className="p-4 text-ink">
                        <span className="flex items-start gap-3">
                          <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center text-brand">
                            {r.icon}
                          </span>
                          <span className="flex flex-col gap-1.5">
                            {r.label}
                            {r.logos}
                          </span>
                        </span>
                      </td>
                      {SELF_SERVE.map((id) => {
                        const v = r.value(PLANS[id], id);
                        return (
                          <td key={id} className={`p-4 text-center ${id === "scale" ? "bg-brand-pale/50" : ""} ${v === "✓" ? "text-brand" : v === "–" ? "text-faint" : "aw-num text-ink"}`}>
                            {v}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 pb-20 sm:px-8">
        <h2 className="aw-h2 mb-6! text-center">Questions</h2>
        <div className="aw-faq">
          {FAQ.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <div className="aw-faq__a">
                <p>{f.a}</p>
              </div>
            </details>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-8">
        <div className="flex flex-col items-center gap-5 rounded-aw-xl bg-[linear-gradient(135deg,var(--aw-brand),var(--aw-brand-deep))] px-6 py-14 text-center text-white">
          <LogoStack size={30} />
          <h2 className="text-[32px] leading-tight font-medium text-white sm:text-[40px]">Find out what AI says about you</h2>
          <p className="max-w-xl text-[16px] text-white/80">Your first results in minutes. 7 days free, no card.</p>
          <Link href="/" className="aw-btn aw-btn--lg bg-white! text-brand!">
            Try 7 days free
          </Link>
        </div>
      </section>
    </main>
  );
}
