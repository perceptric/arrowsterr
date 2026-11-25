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
  const blocks: Block[] = [{ t: "p", text: `Your trial for ${t.workspace} ends on ${day(t.ends)}. After that the workspace is read-only until you pick a plan, and your prompts stop being checked. Nothing is deleted.` }];
  if (found.length) blocks.push({ t: "label", text: "What your trial found" }, { t: "stats", items: found });
  blocks.push({ t: "label", text: "Plans" }, { t: "rows", items: t.plans.map((p) => ({ title: p.name, meta: p.tagline, right: `$${num(p.price)} a month` })) });
  return renderEmail({
    subject: `${left} left on your Arrowsterr trial`,
    preview: "Pick a plan to keep every AI checked daily. Nothing is deleted.",
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

// ─────────────── getting started (src/lib/nurture.ts) ───────────────
// The first weeks of a new workspace: one email at a time, each with one thing to do, skipped once it's done.
// Each one opens with a Signal Blue hero (a title and one big visual), then one short list and a button.

export type Sign = { name: string; role?: string };
const signOff = (s?: Sign | null): Block[] => (s ? [{ t: "sign", name: s.name, ...(s.role ? { role: s.role } : {}) }] : []);
const initials = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

export type WelcomeData = {
  brand?: string | null;
  steps: { title: string; meta?: string; done: boolean }[];
  trialEnds?: Date | null;
  url: string;
  sign?: Sign | null;
};

export function welcomeEmail(w: WelcomeData, footer: Footer): Email {
  const done = w.steps.filter((x) => x.done).length;
  return renderEmail({
    subject: w.brand ? `Your first AI answers for ${w.brand} are on the way` : "See what ChatGPT says about your brand",
    preview: w.brand ? "First numbers from every AI within a day." : "Add your website to see how often AI names you.",
    title: w.brand ? `${w.brand}'s first AI answers land within a day` : "Let's see what AI says about you",
    sub: { text: w.trialEnds ? `Free trial until ${day(w.trialEnds)}. No card needed.` : "Here's your first week." },
    hero: { kicker: "Welcome to Arrowsterr", visual: { k: "progress", done, total: w.steps.length, label: `${done} of ${w.steps.length} done` } },
    blocks: [{ t: "steps", items: w.steps.map((x) => ({ title: x.title, done: x.done })) }],
    button: { label: w.brand ? "Open Arrowsterr →" : "Add your brand →", url: w.url },
    after: signOff(w.sign),
    footer,
  });
}

export function noBrandEmail(n: { url: string; sign?: Sign | null }, footer: Footer): Email {
  return renderEmail({
    subject: "Your first AI visibility score takes 2 minutes",
    preview: "Paste your website. Arrowsterr picks the prompts and competitors.",
    title: "2 minutes to your first AI visibility score",
    sub: { text: "Your workspace is ready. It just needs a brand." },
    hero: { kicker: "Quick setup", visual: { k: "big", value: "2 min", label: "from your website to your first score" } },
    blocks: [
      {
        t: "steps",
        items: [
          { title: "Paste your website", done: false },
          { title: "Keep the prompts and competitors we suggest", done: false },
          { title: "Get answers from every AI within a day", done: false },
        ],
      },
    ],
    button: { label: "Add your brand →", url: n.url },
    after: signOff(n.sign),
    footer,
  });
}

export type FirstLookData = {
  brand: string;
  visibility: number;
  answers: number;
  top: { name: string; visibility: number }[];
  example?: { engine: string; prompt: string; names: string[]; youNamed: boolean } | null;
  url: string;
};

export function firstLookEmail(f: FirstLookData, footer: Footer): Email {
  const leader = f.top[0];
  const behind = Boolean(leader && leader.visibility > f.visibility);
  const blocks: Block[] = [];
  if (f.top.length) {
    blocks.push({ t: "label", text: "Who AI names most" });
    blocks.push({ t: "bars", items: [...f.top.slice(0, 3).map((t) => ({ name: t.name, value: t.visibility, muted: true })), { name: f.brand, value: f.visibility, you: true }].sort((a, b) => b.value - a.value) });
  }
  if (f.example) {
    blocks.push({ t: "label", text: f.example.youNamed ? "A real answer" : "A real answer that skipped you" });
    blocks.push({
      t: "answer",
      engine: f.example.engine,
      prompt: f.example.prompt,
      items: f.example.names.slice(0, 3).map((n) => ({ name: n, you: n.toLowerCase() === f.brand.toLowerCase() })),
      ...(f.example.youNamed ? {} : { missing: f.brand }),
    });
  }
  return renderEmail({
    subject: behind && leader ? `${leader.name} shows up in AI answers more than ${f.brand}` : `${f.brand} is in ${pct(f.visibility)} of AI answers so far`,
    preview: behind && leader ? `${leader.name} is in ${pct(leader.visibility)} of answers. ${f.brand} is in ${pct(f.visibility)}.` : `From your first ${num(f.answers)} answers.`,
    title: behind ? "Here's who AI recommends instead of you" : `AI names ${f.brand} more than anyone so far`,
    sub: { text: `From your first ${num(f.answers)} AI answers.` },
    hero: {
      kicker: "Your first look",
      visual: leader ? { k: "duel", you: { name: f.brand, value: pct(f.visibility) }, them: { name: leader.name, value: pct(leader.visibility) } } : { k: "big", value: pct(f.visibility), label: "of AI answers name you" },
    },
    blocks,
    button: { label: "See every answer →", url: f.url },
    footer,
  });
}

export type PromptsData = { brand: string; count: number; limit: number; ideas: { prompt: string; stage: string }[]; url: string };

export function promptsEmail(p: PromptsData, footer: Footer): Email {
  return renderEmail({
    subject: "The questions your buyers ask AI",
    preview: `${p.brand} tracks ${plural(p.count, "prompt")}. A few more give you a truer score.`,
    title: "Add the questions your buyers ask AI",
    sub: { text: "More prompts, truer score." },
    hero: { kicker: "Prompts", visual: { k: "big", value: `${num(p.count)}/${num(p.limit)}`, label: "prompts tracked" } },
    blocks: p.ideas.length ? [{ t: "label", text: "Try these" }, { t: "rows", items: p.ideas.map((x) => ({ title: x.prompt, tag: STAGE_TAG[x.stage] ?? { text: x.stage, tone: "neutral" as const } })) }] : [],
    button: { label: "Add prompts →", url: p.url },
    footer,
  });
}

export function contentPlanEmail(c: { brand: string; site: string; trialEnds?: Date | null; url: string }, footer: Footer): Email {
  return renderEmail({
    subject: "Turn your AI gaps into a content plan",
    preview: `The pages to write for ${c.site}, closest to a sale first.`,
    title: "Get the pages to write so AI quotes you",
    sub: { text: c.trialEnds ? `In your trial until ${day(c.trialEnds)}.` : `Planned for ${c.site} in one click.` },
    hero: { kicker: "Content Plan", visual: { k: "big", value: "1", label: `free Content Plan for ${c.site}` } },
    blocks: [
      {
        t: "rows",
        items: [
          { title: "Pages to write", tag: STAGE_TAG.bofu },
          { title: "Pages to update", tag: { text: "Update", tone: "spark" } },
          { title: "A brief for each one", tag: { text: "Ready", tone: "good" } },
        ],
      },
    ],
    button: { label: "Make my Content Plan →", url: c.url },
    footer,
  });
}

export type TrialOverData = { workspace: string; cols: string[]; rows: { label: string; values: string[] }[]; pick: number; price: number; annual: number; url: string };

export function trialOverEmail(t: TrialOverData, footer: Footer): Email {
  return renderEmail({
    subject: "Your trial ended. Your data is safe.",
    preview: `${t.workspace} is read-only until you pick a plan. Nothing was deleted.`,
    title: "Your trial ended. Your data is safe.",
    sub: { text: `${t.workspace} is read-only until you pick a plan. Nothing was deleted.` },
    hero: { kicker: "Trial over", visual: { k: "big", value: "100%", label: "of your brands, prompts and history kept" } },
    blocks: [{ t: "compare", cols: t.cols, rows: t.rows, pick: t.pick }],
    button: { label: `Get ${t.cols[t.pick]}, $${num(t.price)} a month →`, url: t.url },
    footer,
  });
}

export type UpgradeData = { brand: string; visibility?: number | null; prompts: number; promptLimit: number; engines: string[]; missing: string[]; plan: { name: string; price: number; prompts: number; competitors: number }; url: string };

export function upgradeEmail(u: UpgradeData, footer: Footer): Email {
  const seen = u.engines.length;
  const all = seen + u.missing.length;
  return renderEmail({
    subject: `You're seeing ${seen} of ${all} AIs for ${u.brand}`,
    preview: `${list(u.missing)} also answer your buyers.`,
    title: `You're seeing ${seen} of ${all} AIs`,
    sub: { text: `Free checks ${list(u.engines)}, once a week.` },
    hero: { kicker: "Your plan", visual: { k: "dots", on: seen, total: all, label: `${u.plan.name} checks all ${all}, every day` } },
    blocks: [
      { t: "engines", items: [...u.engines.map((n) => ({ name: n, on: true })), ...u.missing.map((n) => ({ name: n, on: false }))] },
      {
        t: "rows",
        items: [
          { title: "Checks every day", tag: { text: "Daily", tone: "good" } },
          { title: `${num(u.plan.prompts)} prompts, ${num(u.plan.competitors)} competitors`, tag: { text: `Free: ${num(u.promptLimit)}`, tone: "neutral" } },
        ],
      },
    ],
    button: { label: `Get ${u.plan.name}, $${num(u.plan.price)} a month →`, url: u.url },
    footer,
  });
}

export function helpEmail(h: { brand?: string | null; url: string; sign?: Sign | null }, footer: Footer): Email {
  return renderEmail({
    subject: "Want a hand setting up Arrowsterr?",
    preview: "Reply with your website. We'll set it up for you.",
    title: "Want us to set it up for you?",
    sub: { text: "Just reply to this email." },
    hero: { kicker: "We can help", ...(h.sign ? { visual: { k: "avatar" as const, initials: initials(h.sign.name), name: h.sign.name, ...(h.sign.role ? { role: h.sign.role } : {}) } } : {}) },
    blocks: [{ t: "p", text: `Tell us ${h.brand ? `what ${h.brand} sells` : "your website"} and who buys it. We'll pick your prompts and competitors and send back what we find.` }],
    button: { label: "Open Arrowsterr →", url: h.url },
    footer,
  });
}

export type WinBackData = { brand: string; since: Date; before: number; now: number; byEngine: { engine: string; visibility: number }[]; top: { name: string; visibility: number }[]; url: string };

export function winBackEmail(w: WinBackData, footer: Footer): Email {
  const change = Math.round((w.now - w.before) * 10) / 10;
  const moved = Math.abs(change) >= 0.5;
  const blocks: Block[] = [];
  if (w.top.length) blocks.push({ t: "label", text: "Who AI names most this week" }, { t: "bars", items: [...w.top.slice(0, 3).map((t) => ({ name: t.name, value: t.visibility, muted: true })), { name: w.brand, value: w.now, you: true }].sort((a, b) => b.value - a.value) });
  return renderEmail({
    subject: moved ? `${w.brand}'s AI visibility ${change > 0 ? "rose" : "fell"} ${Math.abs(change)} points while you were away` : `${w.brand} is in ${pct(w.now)} of AI answers this week`,
    preview: `From ${pct(w.before)} the week of ${day(w.since)} to ${pct(w.now)} now.`,
    title: moved ? `Your AI visibility ${change > 0 ? "rose" : "fell"} while you were away` : "Here's where you stand in AI answers",
    hero: { kicker: "While you were away", visual: { k: "change", from: { label: `Week of ${day(w.since)}`, value: pct(w.before) }, to: { label: "This week", value: pct(w.now) }, tag: ptsTag(change) } },
    blocks,
    button: { label: "See what changed →", url: w.url },
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

/** Sent when an account signs in from a device it hasn't used before. */
export function newDeviceEmail(d: { device: string; ip: string; when: Date; resetUrl: string }): Email {
  const when = d.when.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC";
  return renderEmail({
    subject: "New sign-in to your Arrowsterr account",
    preview: `${d.device}, ${when}`,
    eyebrow: "Security",
    title: "New sign-in to your account",
    blocks: [
      { t: "rows", items: [{ title: "Device", right: d.device }, { title: "Address", right: d.ip || "Unknown" }, { title: "Time", right: when }] },
      { t: "small", text: "If this was you, you can ignore this email. If it wasn't, reset your password now and turn on two-step sign-in in Settings, then Password and security." },
    ],
    button: { label: "Reset my password", url: d.resetUrl },
    footer: { text: "Sent to keep your account safe." },
  });
}

// ─────────────── sign-in emails (Supabase Auth templates) ───────────────

export type AuthKind = "confirm" | "magic" | "recovery" | "invite" | "email_change_old" | "email_change_new" | "reauth";

/**
 * Sign-in emails. The Send Email hook (src/app/api/auth/email-hook) sends them through Resend, and
 * scripts/email-previews.ts also writes them to supabase/templates/ with Supabase's placeholders.
 */
export function authEmail(kind: AuthKind, a: { url: string; email: string; code?: string; newEmail?: string; inviter?: string }): Email {
  const footer: Footer = { text: `Sent by Arrowsterr to ${a.email}. This is an account email, so it can't be turned off.` };
  const ignore = (what: string): Block => ({ t: "small", text: `If you didn't ${what}, you can ignore this email. Your account stays as it is.` });
  const code = a.code ? [{ t: "code" as const, label: "Or enter this code", code: a.code }] : [];
  switch (kind) {
    case "recovery":
      return renderEmail({
        subject: "Reset your Arrowsterr password",
        preview: `Choose a new password for ${a.email}. The link works for 1 hour.`,
        eyebrow: "Account security",
        title: "Reset your password",
        blocks: [{ t: "p", text: `We got a request to reset the password for ${a.email}. The link works for 1 hour and only once.` }],
        button: { label: "Choose a new password", url: a.url },
        after: [...code, { t: "small", text: "If you didn't ask for this, your password stays the same. Someone may have typed your email by mistake." }],
        footer,
      });
    case "invite":
      return renderEmail({
        subject: `${a.inviter ? `${a.inviter} invited you` : "You're invited"} to Arrowsterr`,
        preview: "Join your team on Arrowsterr and see what AI says about your brand.",
        title: "You're invited to Arrowsterr",
        blocks: [
          { t: "p", text: `${a.inviter ? `${a.inviter} invited` : "You were invited"} ${a.email} to a workspace on Arrowsterr. It tracks how ChatGPT, Gemini, Claude and Perplexity talk about your brand, and helps you fix it.` },
        ],
        button: { label: "Accept the invite", url: a.url },
        after: [ignore("expect this invite")],
        footer,
      });
    case "email_change_old":
      return renderEmail({
        subject: "Confirm your new Arrowsterr email",
        preview: `Your email is changing to ${a.newEmail ?? "a new address"}.`,
        eyebrow: "Account security",
        title: "Confirm your email change",
        blocks: [{ t: "p", text: `Someone asked to change this account's email from ${a.email} to ${a.newEmail ?? "a new address"}. Confirm it here to go ahead.` }],
        button: { label: "Confirm the change", url: a.url },
        after: [...code, { t: "small", text: "If you didn't ask for this, don't click the button, and change your password in Settings." }],
        footer,
      });
    case "email_change_new":
      return renderEmail({
        subject: "Confirm your new Arrowsterr email",
        preview: "One click to start using this address on Arrowsterr.",
        eyebrow: "Account security",
        title: "Confirm your new email",
        blocks: [{ t: "p", text: `Confirm ${a.newEmail ?? a.email} as the new email for your Arrowsterr account.` }],
        button: { label: "Confirm new email", url: a.url },
        after: [...code, ignore("ask for this")],
        footer,
      });
    case "reauth":
      return renderEmail({
        subject: `${a.code ?? "Your"} is your Arrowsterr security code`,
        preview: "Enter it to finish the change you started.",
        eyebrow: "Account security",
        title: "Your security code",
        blocks: [{ t: "p", text: "Enter this code in Arrowsterr to finish the change you started, like a new password." }],
        after: [...(a.code ? [{ t: "code" as const, label: "Security code", code: a.code }] : []), ignore("start a change")],
        footer,
      });
    default: {
      const confirm = kind === "confirm";
      return renderEmail({
        subject: confirm ? "Confirm your email for Arrowsterr" : a.code ? `${a.code} is your Arrowsterr sign-in code` : "Sign in to Arrowsterr",
        preview: a.code ? `Your code is ${a.code}. It works for 1 hour.` : confirm ? "One click to finish setting up." : "One click to sign in.",
        title: confirm ? "Confirm your email" : "Sign in to Arrowsterr",
        blocks: [{ t: "p", text: confirm ? `Welcome to Arrowsterr. Confirm ${a.email} to finish setting up your account.` : `Use the button or the code to sign in as ${a.email}. Both work for 1 hour and only once.` }],
        button: { label: confirm ? "Confirm email" : "Sign in", url: a.url },
        after: [...code, ignore(confirm ? "sign up" : "ask to sign in")],
        footer,
      });
    }
  }
}

/** Security notices Supabase can send after a change: a new password, email, sign-in method or 2-step code. */
export function securityNoticeEmail(kind: string, a: { email: string; detail?: string; settingsUrl: string; resetUrl: string }): Email | null {
  const notes: Record<string, [string, string]> = {
    password_changed_notification: ["Your password was changed", "The password for your Arrowsterr account was just changed."],
    email_changed_notification: ["Your email was changed", `Your Arrowsterr account's email was changed${a.detail ? ` to ${a.detail}` : ""}.`],
    identity_linked_notification: ["A sign-in method was added", `${a.detail ?? "A new sign-in method"} can now sign in to your Arrowsterr account.`],
    identity_unlinked_notification: ["A sign-in method was removed", `${a.detail ?? "A sign-in method"} was removed from your Arrowsterr account.`],
    mfa_factor_enrolled_notification: ["2-step sign-in was turned on", "A new 2-step sign-in method was added to your Arrowsterr account."],
    mfa_factor_unenrolled_notification: ["2-step sign-in was removed", "A 2-step sign-in method was removed from your Arrowsterr account."],
    phone_changed_notification: ["Your phone number was changed", "The phone number on your Arrowsterr account was changed."],
  };
  const n = notes[kind];
  if (!n) return null;
  return renderEmail({
    subject: n[0],
    preview: "If this was you, there's nothing to do.",
    eyebrow: "Account security",
    title: n[0],
    blocks: [
      { t: "p", text: n[1] },
      { t: "small", text: "If this was you, there's nothing to do. If it wasn't, reset your password now and check Settings, then Password and security." },
    ],
    button: { label: "Reset my password", url: a.resetUrl },
    link: { label: "Open security settings", url: a.settingsUrl },
    footer: { text: `Sent by Arrowsterr to ${a.email} to keep your account safe.` },
  });
}

export { fileSize };
