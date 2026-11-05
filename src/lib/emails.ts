// Every email Arrowsterr sends, as pure builders: data in, subject, preview line, HTML and plain text out.
// The senders (notify.ts, nudges.ts, scheduleServer.ts, freeTools.ts) load the data; scripts/email-previews.ts
// renders each one with sample data. Look and parts: src/lib/emailKit.ts.

import { day, fileSize, num, pct, plainError, ptsTag, renderEmail, STAGE_TAG, type Block, type Email, type EmailParts, type Tag } from "./emailKit.ts";

export type Footer = EmailParts["footer"];
type PromptMove = { prompt: string; engines: string[] };

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const plural = (n: number, one: string, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`;

// ─────────────── weekly summary ───────────────

export type WeeklyBrand = {
  name: string;
  visibility: number;
  change: number | null;
  byEngine: { engine: string; visibility: number }[];
  top: { name: string; visibility: number }[];
  position?: number | null;
  sentiment?: number | null;
  gained?: PromptMove[];
  lost?: PromptMove[];
};

export function weeklyEmail(w: { workspace: string; from: Date; to: Date; brands: WeeklyBrand[]; url: string; appUrl: string }, footer: Footer): Email {
  const range = `${day(w.from)} to ${day(w.to)}`;
  const one = w.brands.length === 1 ? w.brands[0] : null;
  const lead = one ?? [...w.brands].sort((a, b) => b.visibility - a.visibility)[0];
  const blocks: Block[] = [];
  for (const b of w.brands) {
    if (!one) blocks.push({ t: "label", text: b.name });
    blocks.push({
      t: "stats",
      items: [
        { label: "Visibility", value: pct(b.visibility), ...(b.change !== null && !one ? { tag: ptsTag(b.change) } : {}) },
        ...(b.position ? [{ label: "Average position", value: String(Math.round(b.position * 10) / 10) }] : []),
        ...(b.sentiment !== null && b.sentiment !== undefined ? [{ label: "Sentiment", value: String(Math.round(b.sentiment)) }] : []),
      ],
    });
    if (b.byEngine.length) {
      blocks.push({ t: "label", text: one ? "By AI model" : `${b.name} by AI model` });
      blocks.push({ t: "bars", items: [...b.byEngine].sort((x, y) => y.visibility - x.visibility).map((e) => ({ name: e.engine, value: e.visibility })) });
    }
    if (b.top.length) {
      blocks.push({ t: "label", text: "Named most next to you" });
      const rows = [...b.top.map((t) => ({ name: t.name, value: t.visibility, muted: true })), { name: b.name, value: b.visibility, you: true }].sort((x, y) => y.value - x.value);
      blocks.push({ t: "bars", items: rows });
    }
    const moves = [
      ...(b.gained ?? []).slice(0, 3).map((m) => ({ title: m.prompt, meta: `Named by ${list(m.engines)}`, tag: { text: "New", tone: "good" } as Tag })),
      ...(b.lost ?? []).slice(0, 3).map((m) => ({ title: m.prompt, meta: `${list(m.engines)} stopped naming ${one ? "you" : b.name}`, tag: { text: "Lost", tone: "bad" } as Tag })),
    ];
    if (moves.length) blocks.push({ t: "label", text: "Prompts this week" }, { t: "rows", items: moves });
  }
  const gained = w.brands.reduce((n, b) => n + (b.gained?.length ?? 0), 0);
  const lost = w.brands.reduce((n, b) => n + (b.lost?.length ?? 0), 0);
  const bestEngine = [...lead.byEngine].sort((a, b) => b.visibility - a.visibility)[0]?.engine;
  const preview = [bestEngine ? `${bestEngine} named ${one ? "you" : lead.name} most.` : "", gained || lost ? `${plural(gained, "new prompt")}, ${num(lost)} lost.` : ""].filter(Boolean).join(" ") || `How AI answers talked about ${w.workspace} this week.`;
  const change = lead.change;
  const subject = one
    ? `${one.name}: ${pct(one.visibility)} of AI answers this week${change !== null && Math.abs(change) >= 0.1 ? `, ${change > 0 ? "up" : "down"} ${Math.abs(Math.round(change * 10) / 10)}` : ""}`
    : `Your week in AI answers: ${w.workspace}`;
  return renderEmail({
    subject,
    preview,
    eyebrow: `Weekly summary, ${range}`,
    title: one ? `${one.name} is in ${pct(one.visibility)} of AI answers` : `Your week in AI answers`,
    ...(one && change !== null ? { sub: { text: `from ${pct(Math.round((one.visibility - change) * 10) / 10)} the week before`, tag: ptsTag(change) } } : !one ? { sub: { text: `${w.brands.length} brands in ${w.workspace}` } } : {}),
    blocks,
    button: { label: "See this week", url: w.url },
    link: { label: "Open Arrowsterr", url: w.appUrl },
    footer,
  });
}

// ─────────────── visibility alert ───────────────

export type AlertData = {
  brand: string;
  day: Date;
  you: number;
  before: number;
  overtaken?: { name: string; visibility: number; before: number } | null;
  engines: { engine: string; now: number; was: number }[];
  lost?: PromptMove[];
  url: string;
};

export function alertEmail(a: AlertData, footer: Footer): Email {
  const change = Math.round((a.you - a.before) * 10) / 10;
  const o = a.overtaken;
  const moved = [...a.engines].filter((e) => Math.abs(e.now - e.was) >= 0.5).sort((x, y) => Math.abs(y.now - y.was) - Math.abs(x.now - x.was));
  const biggest = moved[0];
  const title = o ? `${o.name} passed ${a.brand} in AI answers` : `${a.brand}'s AI visibility ${change < 0 ? "fell" : "rose"} ${Math.abs(change)} points`;
  const preview = `Visibility ${change < 0 ? "fell" : change > 0 ? "rose" : "held"}${change ? ` ${Math.abs(change)} points` : ""} to ${pct(a.you)}${biggest ? `, mostly in ${biggest.engine}` : ""}.`;
  const blocks: Block[] = [
    {
      t: "stats",
      items: [
        { label: "Before", value: pct(a.before) },
        { label: "Today", value: pct(a.you), tag: ptsTag(change) },
        ...(o ? [{ label: `${o.name} today`, value: pct(o.visibility), tag: { ...ptsTag(o.visibility - o.before), tone: "neutral" as const } }] : []),
      ],
    },
  ];
  if (moved.length) {
    blocks.push({ t: "label", text: "Where it moved" }, { t: "rows", items: moved.slice(0, 5).map((e) => ({ title: e.engine, meta: `${pct(e.was)} to ${pct(e.now)}`, tag: ptsTag(e.now - e.was) })) });
  }
  if (a.lost?.length) {
    blocks.push({ t: "label", text: "Prompts you lost" }, { t: "rows", items: a.lost.slice(0, 3).map((m) => ({ title: m.prompt, meta: `${list(m.engines)} stopped naming you` })) });
  }
  return renderEmail({ subject: title, preview, eyebrow: `Visibility alert, ${day(a.day)}`, title, blocks, button: { label: "See what changed", url: a.url }, footer });
}

// ─────────────── content brief ───────────────

export type BriefData = {
  ok: boolean;
  keyword: string;
  volume?: number | null;
  difficulty?: number | null;
  stage?: string | null;
  outline?: string[];
  terms?: number;
  questions?: number;
  error?: string | null;
  tasks?: number;
  url: string;
};

export function briefEmail(b: BriefData, footer: Footer): Email {
  const kw = `"${b.keyword}"`;
  if (!b.ok) {
    return renderEmail({
      subject: `Your brief for ${kw} didn't finish`,
      preview: `${b.tasks ? `${plural(b.tasks, "task")} ${b.tasks === 1 ? "is" : "are"} back in your plan. ` : ""}Try again in a few minutes.`,
      eyebrow: "Content brief",
      title: `Your brief for ${kw} didn't finish`,
      blocks: [{ t: "callout", text: plainError(b.error) }, ...(b.tasks ? [{ t: "rows" as const, items: [{ title: "Tasks returned", meta: "Back in this month's plan", tag: { text: plural(b.tasks, "task"), tone: "good" as const } }] }] : [])],
      button: { label: "Try again", url: b.url },
      footer,
    });
  }
  const extras = [b.terms ? plural(b.terms, "term") + " to use" : "", b.questions ? plural(b.questions, "question") + " people ask" : ""].filter(Boolean);
  const stage = b.stage ? STAGE_TAG[b.stage] : undefined;
  const stats = [
    ...(b.volume !== null && b.volume !== undefined ? [{ label: "Search volume", value: num(b.volume) }] : []),
    ...(b.difficulty !== null && b.difficulty !== undefined ? [{ label: "Difficulty", value: String(b.difficulty) }] : []),
    ...(stage ? [{ label: "Stage", value: stage.text }] : []),
  ];
  const blocks: Block[] = [];
  if (stats.length) blocks.push({ t: "stats", items: stats });
  if (b.outline?.length) blocks.push({ t: "label", text: "Outline" }, { t: "rows", items: b.outline.slice(0, 5).map((h, i) => ({ title: `${i + 1}. ${h}` })) });
  blocks.push({ t: "small", text: `Also inside: search intent${extras.length ? `, ${list(extras)}` : " and the terms to use"}.` });
  return renderEmail({
    subject: `Your brief for ${kw} is ready`,
    preview: b.outline?.length ? `${plural(b.outline.length, "section")} in the outline${extras.length ? `, ${list(extras)}` : ""}.` : "Search intent, what to cover and the terms to use.",
    eyebrow: "Content brief",
    title: `Your brief for ${kw} is ready`,
    blocks,
    button: { label: "Open the brief", url: b.url },
    footer,
  });
}

// ─────────────── Content Plan ───────────────

export type PlanData = {
  ok: boolean;
  site: string; // the domain
  pages?: { keyword: string; volume: number; stage: string; update?: boolean }[];
  error?: string | null;
  url: string;
};

const STAGE_ORDER: Record<string, number> = { bofu: 0, mofu: 1, tofu: 2 };

export function planEmail(p: PlanData, footer: Footer): Email {
  if (!p.ok) {
    return renderEmail({
      subject: `Your Content Plan for ${p.site} didn't finish`,
      preview: "Your plan credit came back. Try again in a few minutes.",
      eyebrow: "Content Plan",
      title: `Your Content Plan for ${p.site} didn't finish`,
      blocks: [{ t: "callout", text: plainError(p.error) }, { t: "rows", items: [{ title: "Plan credit returned", meta: "You can start again right away", tag: { text: "1 plan", tone: "good" } }] }],
      button: { label: "Try again", url: p.url },
      footer,
    });
  }
  const pages = p.pages ?? [];
  const count = (s: string) => pages.filter((x) => x.stage === s && !x.update).length;
  const fresh = pages.filter((x) => !x.update);
  const first = [...pages].sort((a, b) => (STAGE_ORDER[a.stage] ?? 3) - (STAGE_ORDER[b.stage] ?? 3) || b.volume - a.volume).slice(0, 5);
  const blocks: Block[] = [];
  if (pages.length) {
    blocks.push({
      t: "stats",
      items: [
        { label: "Pages", value: num(fresh.length) },
        { label: "Ready to buy", value: num(count("bofu")) },
        { label: "Comparing", value: num(count("mofu")) },
        { label: "Learning", value: num(count("tofu")) },
      ],
    });
    blocks.push({
      t: "label",
      text: "Write these first",
    }, {
      t: "rows",
      items: first.map((x) => ({ title: x.keyword, meta: x.update ? "Update this page" : `${num(x.volume)} searches a month`, tag: x.update ? { text: "Update", tone: "spark" as const } : (STAGE_TAG[x.stage] ?? { text: x.stage, tone: "neutral" as const }) })),
    });
  } else {
    blocks.push({ t: "p", text: `Arrowsterr finished researching ${p.site}. Your plan of pages to write and update is waiting, bottom of the funnel first.` });
  }
  const top = first.find((x) => !x.update);
  return renderEmail({
    subject: `Your Content Plan for ${p.site} is ready`,
    preview: pages.length ? `${plural(fresh.length, "page")}, ${num(count("bofu"))} ready to buy.${top ? ` Start with ${top.keyword}.` : ""}` : "Your plan of pages to write and update is waiting.",
    eyebrow: "Content Plan",
    title: `Your Content Plan for ${p.site} is ready`,
    blocks,
    button: { label: "Open the Content Plan", url: p.url },
    footer,
  });
}

// ─────────────── trial and tasks ───────────────

export type TrialData = {
  workspace: string;
  days: number;
  ends: Date;
  visibility?: number | null;
  prompts?: number;
  briefs?: number;
  plans: { name: string; tagline: string; price: number }[];
  url: string;
};

export function trialEmail(t: TrialData, footer: Footer): Email {
  const left = `${t.days} day${t.days === 1 ? "" : "s"}`;
  const found = [
    ...(t.visibility !== null && t.visibility !== undefined ? [{ label: "Visibility", value: pct(t.visibility) }] : []),
    ...(t.prompts ? [{ label: "Prompts tracked", value: num(t.prompts) }] : []),
    ...(t.briefs ? [{ label: "Briefs", value: num(t.briefs) }] : []),
  ];
  const blocks: Block[] = [{ t: "p", text: `Your trial for ${t.workspace} ends on ${day(t.ends)}. After that the workspace turns read-only. Nothing is deleted.` }];
  if (found.length) blocks.push({ t: "label", text: "What your trial found" }, { t: "stats", items: found });
  blocks.push({ t: "label", text: "Plans" }, { t: "rows", items: t.plans.map((p) => ({ title: p.name, meta: p.tagline, right: `$${num(p.price)} a month` })) });
  return renderEmail({
    subject: `${left} left on your Arrowsterr trial`,
    preview: "Pick a plan to keep tracking. Nothing is deleted.",
    eyebrow: "Trial",
    title: `${left} left on your trial`,
    blocks,
    button: { label: "Pick a plan", url: t.url },
    footer,
  });
}

export type TasksData = { workspace: string; used: number; limit: number; plan: string; resets: Date; packs: { tasks: number; price: number }[]; credits: number; url: string };

export function tasksEmail(t: TasksData, footer: Footer): Email {
  const left = Math.max(0, t.limit - t.used);
  const share = Math.round((t.used / (t.limit || 1)) * 100);
  return renderEmail({
    subject: `${num(left)} tasks left this month`,
    preview: `You've used ${share}% of ${t.plan}'s tasks. They reset ${day(t.resets)}.`,
    eyebrow: "Usage",
    title: `${num(left)} tasks left this month`,
    blocks: [
      { t: "meter", used: t.used, limit: t.limit, left: `${num(t.used)} of ${num(t.limit)} used on ${t.plan}`, right: `Resets ${day(t.resets)}` },
      ...(t.credits ? [{ t: "small" as const, text: `You also have ${plural(t.credits, "pack task")}.` }] : []),
      { t: "label", text: "Task packs" },
      { t: "rows", items: t.packs.map((p) => ({ title: `${num(p.tasks)} tasks`, meta: "Never expire", right: `$${num(p.price)}` })) },
    ],
    button: { label: "Buy tasks", url: t.url },
    footer,
  });
}

// ─────────────── free tools alarm (to the team) ───────────────

export function freeAlarmEmail(f: { spent: number; limit: number; tools: { name: string; runs: number; cost: number }[]; url: string }): Email {
  const money = (n: number) => `$${n.toFixed(2)}`;
  return renderEmail({
    subject: "Free tools paused for today",
    preview: `${money(f.spent)} spent, past the $${f.limit} limit.`,
    eyebrow: "Internal",
    title: "Free tools paused for today",
    blocks: [
      { t: "stats", items: [{ label: "Spent today", value: money(f.spent) }, { label: "Daily limit", value: `$${f.limit}` }, { label: "Resumes", value: "00:00", tag: { text: "UTC", tone: "neutral" } }] },
      ...(f.tools.length ? [{ t: "label" as const, text: "By tool" }, { t: "rows" as const, items: f.tools.map((x) => ({ title: x.name, meta: plural(x.runs, "run"), right: money(x.cost) })) }] : []),
      { t: "small", text: "Saved results still work. New paid runs wait until midnight UTC. The limit is FREE_SPEND_DAY." },
    ],
    button: { label: "Open Arrowsterr", url: f.url },
    footer: { text: "Sent to FREE_ALERT_EMAIL." },
  });
}

// ─────────────── sign-in emails (Supabase Auth templates) ───────────────

export type AuthKind = "confirm" | "magic" | "recovery";

/** Supabase sends these. scripts/email-previews.ts writes them to supabase/templates/ with Supabase's placeholders. */
export function authEmail(kind: AuthKind, a: { url: string; email: string; code?: string }): Email {
  const footer: Footer = { text: `Sent by Arrowsterr to ${a.email}.` };
  if (kind === "recovery") {
    return renderEmail({
      subject: "Reset your Arrowsterr password",
      preview: `Choose a new password for ${a.email}.`,
      title: "Reset your password",
      blocks: [{ t: "p", text: `Someone asked to reset the password for ${a.email}.` }],
      button: { label: "Choose a new password", url: a.url },
      after: [{ t: "small", text: "If you didn't ask for this, your password stays the same." }],
      footer,
    });
  }
  const confirm = kind === "confirm";
  return renderEmail({
    subject: confirm ? "Confirm your email for Arrowsterr" : "Sign in to Arrowsterr",
    preview: a.code ? `Your code is ${a.code}.` : confirm ? "One click to finish setting up." : "One click to sign in.",
    title: confirm ? "Confirm your email" : "Sign in to Arrowsterr",
    blocks: [{ t: "p", text: confirm ? `Confirm ${a.email} to finish setting up Arrowsterr.` : `Use the button or the code to sign in as ${a.email}.` }],
    button: { label: confirm ? "Confirm email" : "Sign in", url: a.url },
    after: [
      ...(a.code ? [{ t: "code" as const, label: "Or enter this code", code: a.code }] : []),
      { t: "small", text: confirm ? "If you didn't sign up, you can ignore this email." : "If you didn't ask to sign in, you can ignore this email." },
    ],
    footer,
  });
}

export { fileSize };
