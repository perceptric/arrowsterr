"use client";

import { createContext, useContext, useEffect, useId, useState } from "react";
import { ARTICLE_TASKS, cardPrice, PLANS, PROMPT_STEP, SELF_SERVE, TASK_COST, TASK_STEP, UNLIMITED, VIS_TASKS, type Interval, type Mix, type Plan, type PlanId } from "@/lib/plans";
import { BrandLogo } from "./BrandLogo";
import { ENGINE_LOGOS } from "./Engines";
import { NavIcon } from "./NavIcon";
import { Seg } from "./ui";

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
/** The CMSs past the four logos: Wix, Ghost, HubSpot, Contentful, Sanity, Strapi and webhooks. */
export const CMS_MORE = 7;
export const MCP_APPS = [{ name: "Claude", logo: ENGINE_LOGOS.Claude }, { name: "ChatGPT", logo: ENGINE_LOGOS.ChatGPT }, LOGOS.cursor];

const n = (v: number) => v.toLocaleString("en-US");
const count = (v: number, one: string, many = `${one}s`) => (v >= UNLIMITED ? `Unlimited ${many}` : `${n(v)} ${v === 1 ? one : many}`);
const history = (d: number) => (d >= 365 ? `${Math.round(d / 365)} ${d >= 730 ? "years" : "year"}` : `${Math.round(d / 30)} months`);

/** What each feature does, for the (i) tooltips on the cards. */
export const FEATURE_TIPS = {
  prompts: ["AI visibility tracking", "Track the questions your buyers ask ChatGPT, Claude, Gemini, Perplexity, Google AI Overviews and AI Mode. Every day we ask each AI, save the full answer and show if your brand is named, where it ranks and how AI describes you. Share of voice, mention rate and visibility score for GEO, AEO and LLM SEO, with no spreadsheets."],
  comp: ["Competitor tracking in AI search", "See who AI recommends instead of you. Share of voice, mention rate and position for every competitor, on every prompt and every AI. Spot the brands winning AI answers before your buyers do."],
  sources: ["AI citations and sources", "Every page AI reads before it answers: review sites, Reddit threads, listicles, docs and news. See which domains get cited most, which ones name your competitors and where to get mentioned next. Your AI citation and PR outreach list."],
  hist: ["Visibility history", "Every AI answer saved day by day. Watch your AI visibility trend over time and prove what moved after you published or got mentioned."],
  kw: ["Keyword Research", "Search our database of 8.4 billion keywords across 94 countries. Get search volume, keyword difficulty, CPC, search intent and the 12-month trend, plus thousands of related keywords, questions and long-tail ideas. Find the low-competition, high-intent keywords your buyers type into Google."],
  domain: ["Domain Research", "Look up any website: organic traffic, ranking keywords, top pages, positions 1 to 100 and 12 months of history. Reverse-engineer a competitor's SEO strategy, find their best pages and see their traffic by country."],
  gap: ["Keyword gap and competitive analysis", "Put your site next to your competitors and see every keyword they rank for that you don't, with volume and difficulty. Your list of content to write next, sorted by how easy it is to win."],
  plan: ["Content Plan & Calendar", "An AI agent studies your business, finds the keywords with the most revenue potential and turns them into a content calendar with titles, target keywords, search volume and due dates. Reschedule with a drag and send any idea to the Writer."],
  writer: ["Agentic Writer", "Researches the top-ranking pages, checks the facts and builds an SEO outline, then writes a full article in your brand voice with sources. Comparison tables, FAQs, internal links, images and schema included. Written to rank on Google and get cited by AI."],
  cms: ["Publish to your CMS", "One click to WordPress, Shopify, Webflow, Framer, Wix, Ghost, HubSpot, Contentful, Sanity, Strapi or any webhook. Or let Autopilot write and publish on your schedule."],
  gsc: ["Google Search Console", "Real clicks, impressions, CTR and average position for every page and query. Find pages that are slipping, quick wins on page two and queries you never targeted."],
  ga: ["Google Analytics 4", "Sessions, conversions and the visits that come from ChatGPT, Perplexity, Gemini, Copilot and other AI tools. Prove that AI search sends traffic and revenue."],
  mcp: ["MCP server", "Use Arrowsterr inside Claude, ChatGPT, Cursor or any MCP client. Ask for keyword data, domain traffic, AI visibility and site audits right from your own AI."],
  api: ["Slack, Zapier & API", "Slack alerts when AI starts or stops naming you. Send your data to Zapier, Make, n8n, Google Sheets and Looker Studio, or build on our REST API."],
  reports: ["Client reports", "AI visibility and SEO reports in 8 ready-made designs. Share a live link or a PDF, and schedule them to go out every week or month."],
  wl: ["White-label reports", "Your logo and colors on every report, with no Arrowsterr branding. Send it to clients as your own."],
} as const;
type TipKey = keyof typeof FEATURE_TIPS;

/** What each action uses, for the tasks tooltip. Lines marked seo need SEO Research. */
export const TASK_USES: { text: string; tasks: number; seo?: boolean }[] = [
  { text: "One article (research, outline, write)", tasks: ARTICLE_TASKS, seo: true },
  { text: "A content brief", tasks: TASK_COST.brief, seo: true },
  { text: "A competitive analysis", tasks: TASK_COST.gap },
  { text: "A keyword lookup", tasks: TASK_COST.keyword },
  { text: "Bulk keywords (per 10)", tasks: 1, seo: true },
  { text: "A domain report", tasks: TASK_COST.domain },
  { text: "A Zippie or MCP step", tasks: TASK_COST.mcp },
];
/** Keywords a bulk lookup enriches for each task (TASK_COST.bulk: 1 task per 10 keywords). */
export const BULK_PER_TASK = 10;
/**
 * "About this many" for a number of tasks: articles, keyword lookups and keywords in bulk with SEO Research, else
 * competitor checks and Zippie steps. The first one is the headline.
 */
export function tasksGet(tasks: number, seo: boolean): string[] {
  if (seo) return [`${n(Math.floor(tasks / ARTICLE_TASKS))} articles`, `${n(Math.floor(tasks / TASK_COST.keyword))} keyword lookups`, `${n(tasks * BULK_PER_TASK)} keywords in bulk`];
  return [`${n(Math.floor(tasks / TASK_COST.gap))} competitor checks`, `${n(Math.floor(tasks / TASK_COST.mcp))} Zippie steps`];
}

/** What Zippie's 60+ skills cover, for its (i) list. */
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

/** What someone picked on a card: the toolsets, and extra task and prompt steps. */
export type Choice = { mix: Mix; tasks: number; prompts: number };
type Pick = { visibility: boolean; seo: boolean; tasks: number; prompts: number };
const mixOfPick = (p: Pick): Mix => (p.visibility && p.seo ? "both" : p.visibility ? "visibility" : "seo");
const pickOf = (c?: Choice | null): Pick => ({ visibility: !c || c.mix !== "seo", seo: !c || c.mix !== "visibility", tasks: c?.tasks ?? 0, prompts: c?.prompts ?? 0 });

/** A plan's monthly tasks for a mix, before extra steps. */
export const tasksFor = (id: PlanId, mix: Mix) => (mix === "visibility" ? (VIS_TASKS[id] ?? PLANS[id].tasksPerMonth) : PLANS[id].tasksPerMonth);

const tipBox = "absolute top-full z-40 rounded-aw border border-rule bg-white p-3.5 text-left text-[13px] leading-relaxed font-normal text-body shadow-aw-lg";

/** Which (i) tooltip is open on the grid. Only one at a time; a click outside or Escape closes it. */
const OpenTip = createContext<{ open: string | null; setOpen: (id: string | null) => void }>({ open: null, setOpen: () => {} });

/** The (i) button. Clicking it opens or closes `card`, which the caller places with `place`. */
function InfoTip({ label, title, place, children }: { label: string; title: string; place: string; children: React.ReactNode }) {
  const id = useId();
  const { open, setOpen } = useContext(OpenTip);
  const shown = open === id;
  return (
    <>
      <button
        type="button"
        data-tip={id}
        aria-label={label}
        aria-expanded={shown}
        aria-controls={id}
        onClick={() => setOpen(shown ? null : id)}
        className={`inline-flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-full border border-current text-[10px] leading-none font-medium hover:text-brand ${shown ? "text-brand" : "text-muted"}`}
      >
        i
      </button>
      {shown ? (
        <span id={id} data-tip={id} role="dialog" aria-label={title} className={`${tipBox} ${place}`}>
          {children}
        </span>
      ) : null}
    </>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 24 24" aria-label="Included" className="h-[18px] w-[18px] fill-none stroke-brand stroke-[2.2]" strokeLinecap="round" strokeLinejoin="round">
      <path d="m5 12 5 5 9-10" />
    </svg>
  );
}

/** One feature: icon, a label with an (i) that explains it on click, and a check, a value or a dash. */
function Row({ on = true, icon, text, end, logos, tip }: { on?: boolean; icon: React.ReactNode; text: React.ReactNode; end?: React.ReactNode; logos?: React.ReactNode; tip?: TipKey }) {
  return (
    <li className={`relative flex items-start gap-3 py-2 text-[15px] leading-snug ${on ? "text-ink" : "text-faint"}`}>
      <span aria-hidden="true" className={`flex h-5 w-5 shrink-0 items-center justify-center ${on ? "text-brand" : "opacity-50 grayscale"}`}>
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex items-center gap-1.5">
          {text}
          {tip ? (
            <InfoTip label={`About ${FEATURE_TIPS[tip][0]}`} title={FEATURE_TIPS[tip][0]} place="-right-2 -left-2 mt-1">
              <span className="mb-1 block text-[14px] font-semibold text-ink">{FEATURE_TIPS[tip][0]}</span>
              {FEATURE_TIPS[tip][1]}
            </InfoTip>
          ) : null}
        </span>
        {logos ? <span className={on ? "" : "opacity-50 grayscale"}>{logos}</span> : null}
      </span>
      <span className={`ml-2 shrink-0 text-right text-[14px] ${on ? "aw-num font-semibold text-ink" : "text-faint"}`}>{!on ? <span aria-label="Not included">–</span> : (end ?? <Check />)}</span>
    </li>
  );
}

const Icon = ({ name }: { name: string }) => <NavIcon name={name} />;
const Logo = ({ l }: { l: { name: string; logo: string } }) => <BrandLogo src={l.logo} name={l.name} size={18} />;
const Section = ({ children }: { children: React.ReactNode }) => <li className="mt-3 mb-0.5 text-[12px] font-semibold tracking-wide text-muted uppercase">{children}</li>;

/** "60+ Zippie skills", with an (i) that lists what they cover. */
function SkillsRow() {
  return (
    <li className="relative flex items-start gap-3 py-2 text-[15px] leading-snug text-ink">
      <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center text-brand">
        <Icon name="bot" />
      </span>
      <span className="flex flex-1 items-center gap-1.5">
        60+ Zippie skills
        <InfoTip label="What Zippie can do" title="What Zippie can do" place="left-8 mt-1 w-72">
          <span className="mb-1 block font-semibold text-ink">What Zippie can do</span>
          {SKILL_GROUPS.map((s) => (
            <span key={s} className="block">
              • {s}
            </span>
          ))}
        </InfoTip>
      </span>
      <span className="ml-2 shrink-0">
        <Check />
      </span>
    </li>
  );
}

function Price({ id, pick, interval }: { id: PlanId; pick: Pick; interval: Interval }) {
  const mix = mixOfPick(pick);
  const monthly = Math.round(cardPrice(id, mix, "month", pick.prompts, pick.tasks));
  const yearly = cardPrice(id, mix, "year", pick.prompts, pick.tasks);
  return (
    <div>
      <div className="flex items-end gap-1.5">
        {interval === "year" ? <span className="aw-num mb-1.5 text-[18px] text-faint line-through">${n(monthly)}</span> : null}
        <span className="aw-num text-[38px] leading-none font-semibold text-ink">${n(interval === "year" ? Math.round(yearly) : monthly)}</span>
        <span className="mb-1 text-[14px] text-muted">/mo</span>
      </div>
      <p className="aw-small mt-2">{interval === "year" ? `$${n(Math.round(yearly * 12))} billed yearly after your trial` : "Billed monthly after your trial"}</p>
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

const stepBtn = "flex h-8 w-8 items-center justify-center rounded-aw-sm border border-rule bg-white text-[18px] leading-none text-brand hover:border-brand disabled:cursor-default disabled:text-faint disabled:hover:border-rule";

/** "N prompts/day" or "N tasks/month", with – and + steps. Only the card's price changes. */
function Stepper({ label, info, value, max, onChange, less, more }: { label: string; info?: React.ReactNode; value: number; max: number; onChange: (v: number) => void; less: string; more: string }) {
  return (
    <div className="relative flex items-center gap-2 text-[15px] font-semibold text-ink">
      <span className="aw-num">{label}</span>
      {info}
      <span className="ml-auto flex gap-2">
        <button type="button" className={stepBtn} aria-label={less} disabled={value <= 0} onClick={() => onChange(value - 1)}>
          –
        </button>
        <button type="button" className={stepBtn} aria-label={more} disabled={value >= max} onClick={() => onChange(value + 1)}>
          +
        </button>
      </span>
    </div>
  );
}

/** The (i) next to tasks: what this many tasks gets, and what each action uses. */
function TasksInfo({ tasks, seo }: { tasks: number; seo: boolean }) {
  const [first, ...rest] = tasksGet(tasks, seo);
  return (
    <InfoTip label="What tasks pay for" title="What tasks pay for" place="right-0 left-0 mt-2">
      <span className="block text-[14px] font-semibold text-ink">{n(tasks)} tasks gets you about</span>
      <span className="mt-1 mb-3 block">
        ≈ <b className="font-semibold text-ink">{first}</b>
        {rest.length > 1 ? `, ${rest.slice(0, -1).join(", ")} or ${rest[rest.length - 1]}` : `, or ${rest[0]}`}
      </span>
      <span className="mb-1.5 block text-[14px] font-semibold text-ink">What each action uses</span>
      {TASK_USES.filter((u) => seo || !u.seo).map((u, i) => (
        <span key={u.text} className={`flex justify-between gap-3 py-1 ${i ? "border-t border-rule-faint" : ""}`}>
          <span>{u.text}</span>
          <span className="aw-num font-semibold text-ink">{n(u.tasks)}</span>
        </span>
      ))}
    </InfoTip>
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
  const prompts = p.prompts + pick.prompts * PROMPT_STEP.prompts;
  const tasks = tasksFor(id, mix) + pick.tasks * TASK_STEP.tasks;
  // SEO Research only tracks no prompts, so it buys no prompt steps.
  const promptSteps = pick.visibility ? pick.prompts : 0;
  return (
    <div className={`relative flex flex-col rounded-aw-lg border bg-white p-6 ${hot || current ? "border-2 border-brand" : "border-rule"}`}>
      {hot ? <span className="aw-badge absolute -top-3 left-6">Most popular</span> : null}
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[22px] font-semibold text-ink">{p.name}</h3>
        {current ? <span className="aw-chip aw-chip--brand">Current</span> : null}
      </div>
      <p className="mt-1 min-h-10 text-[14px] text-muted">{p.tagline}</p>
      <div className="mt-4">
        <Price id={id} pick={{ ...pick, prompts: promptSteps }} interval={interval} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2" role="group" aria-label={`Toolsets on ${p.name}`}>
        <Toolset label="AI Visibility" checked={pick.visibility} onChange={() => toggle("visibility")} />
        <Toolset label="SEO Research" checked={pick.seo} onChange={() => toggle("seo")} />
      </div>
      <div className="mt-4">{action(id, { mix, tasks: pick.tasks, prompts: promptSteps })}</div>
      <div className="mt-5 flex flex-col gap-3.5">
        {pick.visibility ? (
          <Stepper
            label={`${n(prompts)} prompts/day`}
            value={pick.prompts}
            max={PROMPT_STEP.max}
            onChange={(v) => setPick({ ...pick, prompts: v })}
            less="Fewer prompts"
            more={`${PROMPT_STEP.prompts} more prompts a day`}
          />
        ) : null}
        <Stepper
          label={`${n(tasks)} tasks/month`}
          info={<TasksInfo tasks={tasks} seo={pick.seo} />}
          value={pick.tasks}
          max={TASK_STEP.max}
          onChange={(v) => setPick({ ...pick, tasks: v })}
          less="Fewer tasks"
          more={`${n(TASK_STEP.tasks)} more tasks a month`}
        />
      </div>
      <div className="mt-5 flex items-center justify-center gap-4 border-y border-dashed border-rule py-3.5 text-[15px] text-body">
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
            <Row icon={<Icon name="radar" />} text={`${n(prompts)} prompts checked daily`} logos={<LogoRow logos={AIS.slice(0, 5)} more={1} />} tip="prompts" />
            <Row icon={<Icon name="swap" />} text="Competitors per brand" end={n(p.competitors)} tip="comp" />
            <Row icon={<Icon name="quote" />} text="Sources AI cites" tip="sources" />
            <Row icon={<Icon name="clock" />} text="History" end={history(p.historyDays)} tip="hist" />
          </>
        ) : null}
        {pick.seo ? (
          <>
            <Section>SEO Research</Section>
            <Row icon={<Icon name="search" />} text="Keyword Research" tip="kw" />
            <Row icon={<Icon name="globe" />} text="Domain Research" tip="domain" />
            <Row icon={<Icon name="gap" />} text="Keyword gap" tip="gap" />
            <Row icon={<Icon name="calendar" />} text="Content Plan & Calendar" on={p.plansPerMonth > 0} tip="plan" />
            <Row icon={<Icon name="pen" />} text="Agentic Writer" end={`${n(ARTICLE_TASKS)} tasks each`} on={p.writer === "full"} tip="writer" />
            <Row icon={<Icon name="upload" />} text="Publish to your CMS" logos={<LogoRow logos={CMS} more={CMS_MORE} />} on={p.writer === "full"} tip="cms" />
          </>
        ) : null}
        <Section>Connect</Section>
        <Row icon={<Logo l={LOGOS.gsc} />} text="Google Search Console" tip="gsc" />
        <Row icon={<Logo l={LOGOS.ga4} />} text="Google Analytics 4" tip="ga" />
        <Row icon={<Icon name="code" />} text="MCP for your AI" logos={<LogoRow logos={MCP_APPS} more={2} />} on={p.mcp} tip="mcp" />
        <Row icon={<Icon name="plug" />} text="Slack, Zapier & API" logos={<LogoRow logos={[LOGOS.slack, LOGOS.zapier]} />} on={p.alerts} tip="api" />
        <Row icon={<Icon name="doc" />} text="8 report templates" on={p.reports === "templates" || p.reports === "whitelabel"} tip="reports" />
        <Row icon={<Icon name="tag" />} text="White-label reports" on={p.reports === "whitelabel"} tip="wl" />
      </ul>
    </div>
  );
}

/**
 * Starter, Pro and Agency side by side, then Enterprise. Each card has its own toolset ticks and prompt and task
 * steppers. `action` draws each plan's button for what's picked on its card. `current` starts the current plan's card
 * on what it has.
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
  const [open, setOpen] = useState<string | null>(null);
  // A click outside the open tooltip and its (i), or Escape, closes it.
  useEffect(() => {
    if (!open) return;
    const click = (e: MouseEvent) => {
      const t = e.target as Element | null;
      // An (i) button opens or closes its own tooltip; any other click outside the open one closes it.
      if (t?.closest?.("button[data-tip]") || t?.closest?.(`[data-tip="${CSS.escape(open)}"]`)) return;
      setOpen(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    document.addEventListener("click", click);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("click", click);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  return (
    <OpenTip.Provider value={{ open, setOpen }}>
      <div className="flex flex-col gap-5">
        <div className="grid items-start gap-5 lg:grid-cols-3">
          {SELF_SERVE.map((id) => {
            const pick = picks[id] ?? pickOf(null);
            const same = current?.plan === id && current.mix === mixOfPick(pick) && current.tasks === pick.tasks && current.prompts === (pick.visibility ? pick.prompts : 0);
            return <Card key={id} id={id} interval={interval} current={Boolean(same)} pick={pick} setPick={(p) => setPicks((all) => ({ ...all, [id]: p }))} action={action} />;
          })}
        </div>
        <div className="flex flex-col gap-5 rounded-aw-lg bg-ink p-6 text-white sm:p-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-medium tracking-wide text-white/60 uppercase">Enterprise</span>
            <h3 className="text-[24px] font-medium text-white">{PLANS.enterprise.tagline}</h3>
            <p className="text-[15px] text-white/70">
              {n(PLANS.enterprise.prompts)}+ prompts a day and {n(PLANS.enterprise.tasksPerMonth)}+ tasks a month, unlimited seats and brands, SSO, a security review and a named success manager. From ${n(PLANS.enterprise.price)}/mo.
            </p>
          </div>
          <div className="shrink-0 lg:w-56">{action("enterprise", null)}</div>
        </div>
      </div>
    </OpenTip.Provider>
  );
}
