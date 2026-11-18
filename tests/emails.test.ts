import assert from "node:assert/strict";
import { test } from "node:test";
import type { Run } from "../src/lib/chats.ts";
import { plainError, ptsTag, renderEmail, type Email } from "../src/lib/emailKit.ts";
import {
  alertEmail,
  authEmail,
  briefEmail,
  contentPlanEmail,
  firstLookEmail,
  freeAlarmEmail,
  helpEmail,
  noBrandEmail,
  planEmail,
  promptsEmail,
  tasksEmail,
  trialEmail,
  trialOverEmail,
  upgradeEmail,
  weeklyEmail,
  welcomeEmail,
  winBackEmail,
  type Footer,
} from "../src/lib/emails.ts";
import { promptMoves } from "../src/lib/metrics.ts";

const footer: Footer = { text: "You get the weekly summary for this workspace.", links: [{ label: "Unsubscribe", url: "https://app.arrowsterr.com/api/notifications/unsubscribe?u=1" }] };
const url = "https://app.arrowsterr.com/prompts";

const all: Record<string, Email> = {
  weekly: weeklyEmail(
    {
      workspace: "Acme",
      from: new Date("2026-10-26T12:00:00Z"),
      to: new Date("2026-11-01T12:00:00Z"),
      url,
      appUrl: "https://app.arrowsterr.com",
      brands: [{ name: "Acme", visibility: 34, change: 4.2, position: 2.4, sentiment: 72, byEngine: [{ engine: "Gemini", visibility: 29 }, { engine: "ChatGPT", visibility: 41 }], top: [{ name: "Rival", visibility: 62 }], gained: [{ prompt: "best crm", engines: ["ChatGPT", "Claude"] }], lost: [{ prompt: "cheap crm", engines: ["Gemini"] }] }],
    },
    footer,
  ),
  alert: alertEmail({ brand: "Acme", day: new Date("2026-11-04T12:00:00Z"), you: 28, before: 34, overtaken: { name: "Rival", visibility: 31, before: 28 }, engines: [{ engine: "ChatGPT", now: 30, was: 41 }, { engine: "Claude", now: 33, was: 33 }], lost: [{ prompt: "best crm", engines: ["ChatGPT"] }], url }, footer),
  briefReady: briefEmail({ ok: true, keyword: "crm", volume: 1900, difficulty: 42, stage: "bofu", outline: ["One", "Two"], terms: 24, questions: 6, url }, footer),
  briefFailed: briefEmail({ ok: false, keyword: "crm", error: "DataForSEO returned 502: Bad Gateway", tasks: 75, url }, footer),
  planReady: planEmail({ ok: true, site: "acme.com", pages: [{ keyword: "learn crm", volume: 5000, stage: "tofu" }, { keyword: "buy crm", volume: 100, stage: "bofu" }], url }, footer),
  planFailed: planEmail({ ok: false, site: "acme.com", error: "duplicate key value violates unique constraint", url }, footer),
  trial: trialEmail({ workspace: "Acme", days: 3, ends: new Date("2026-11-08T12:00:00Z"), visibility: 34, prompts: 50, briefs: 6, plans: [{ name: "Starter", tagline: "One toolset", price: 39 }], url }, footer),
  tasks: tasksEmail({ workspace: "Acme", used: 6720, limit: 8000, plan: "Pro", resets: new Date("2026-12-01T00:00:00Z"), packs: [{ tasks: 1000, price: 15 }], credits: 0, url }, footer),
  free: freeAlarmEmail({ spent: 52.4, limit: 50, tools: [{ name: "keyword", runs: 3, cost: 52.4 }], url }),
  confirm: authEmail("confirm", { url, email: "a@b.co", code: "123456" }),
  magic: authEmail("magic", { url, email: "a@b.co", code: "123456" }),
  recovery: authEmail("recovery", { url, email: "a@b.co" }),
  welcome: welcomeEmail({ brand: "Acme", steps: [{ title: "Make your workspace", done: true }, { title: "Add your brand", done: true }, { title: "See your first answers", done: false }], trialEnds: new Date("2026-11-26T12:00:00Z"), url, sign: { name: "Sam", role: "Founder" } }, footer),
  welcomeNoBrand: welcomeEmail({ brand: null, steps: [{ title: "Add your brand", done: false }], url }, footer),
  noBrand: noBrandEmail({ url }, footer),
  firstLook: firstLookEmail({ brand: "Acme", visibility: 18, answers: 96, top: [{ name: "Rival", visibility: 54 }, { name: "Other", visibility: 20 }], example: { engine: "ChatGPT", prompt: "best crm", names: ["Rival", "Other"], youNamed: false }, url }, footer),
  firstLookLead: firstLookEmail({ brand: "Acme", visibility: 60, answers: 40, top: [{ name: "Rival", visibility: 30 }], example: null, url }, footer),
  prompts: promptsEmail({ brand: "Acme", count: 4, limit: 25, ideas: [{ prompt: "Rival alternatives", stage: "bofu" }], url }, footer),
  contentPlan: contentPlanEmail({ brand: "Acme", site: "acme.com", trialEnds: new Date("2026-11-26T12:00:00Z"), url }, footer),
  trialOver: trialOverEmail({ workspace: "Acme", cols: ["Trial", "Free", "Starter"], rows: [{ label: "Prompts", values: ["25", "15", "50"] }], pick: 2, price: 49, annual: 42, url, stayUrl: url }, footer),
  upgrade: upgradeEmail({ brand: "Acme", visibility: 22.5, prompts: 12, promptLimit: 15, engines: ["ChatGPT", "AI Overview"], missing: ["Claude", "Gemini"], plan: { name: "Starter", price: 49, prompts: 50, competitors: 10 }, url }, footer),
  help: helpEmail({ brand: "Acme", url }, footer),
  winBack: winBackEmail({ brand: "Acme", since: new Date("2026-10-19T12:00:00Z"), before: 22.5, now: 15.8, byEngine: [{ engine: "ChatGPT", visibility: 19 }], top: [{ name: "Rival", visibility: 57 }], url }, footer),
};

test("every email has a subject, a preview line, a plain-text copy, a footer, the logo and no '·'", () => {
  for (const [name, m] of Object.entries(all)) {
    assert.ok(m.subject.length > 5 && !/[\r\n]/.test(m.subject), name);
    assert.ok(m.preview.length > 5, name);
    assert.ok(m.html.includes(`>${m.preview.replace(/'/g, "'")}`) || m.html.includes(m.preview.replace(/&/g, "&amp;")), `${name} preview`);
    assert.ok(m.text.includes("--\n"), `${name} footer in text`);
    assert.match(m.html, /arrowsterr-logo-color\.png/, name);
    assert.match(m.html, /prefers-color-scheme: dark/, name);
    assert.doesNotMatch(m.html + m.text + m.subject, /·/, name);
  }
});

test("a failed job never shows the raw error", () => {
  assert.doesNotMatch(all.briefFailed.html + all.briefFailed.text, /DataForSEO|502|Bad Gateway/);
  assert.match(all.briefFailed.text, /A data source didn't answer/);
  assert.match(all.briefFailed.text, /75 tasks/);
  assert.doesNotMatch(all.planFailed.html + all.planFailed.text, /duplicate key|constraint/);
  assert.equal(plainError("Anthropic returned 429: rate limited"), "A data source was too busy to answer. This often clears in a few minutes.");
  assert.equal(plainError(null), "It stopped partway. This often clears in a few minutes.");
});

test("the weekly summary leads with the number, sorts AI models and marks your brand", () => {
  const w = all.weekly;
  assert.equal(w.subject, "Acme: 34% of AI answers this week, up 4.2");
  assert.equal(w.preview, "ChatGPT named you most. 1 new prompt, 1 lost.");
  assert.ok(w.text.indexOf("ChatGPT: 41%") < w.text.indexOf("Gemini: 29%"));
  assert.match(w.html, /font-weight:600;">Acme</);
  assert.match(w.text, /- best crm, Named by ChatGPT and Claude \(New\)/);
  assert.match(w.text, /- cheap crm, Gemini stopped naming you \(Lost\)/);
});

test("the alert names who passed you and the biggest move first", () => {
  const a = all.alert;
  assert.equal(a.subject, "Rival passed Acme in AI answers");
  assert.equal(a.preview, "Visibility fell 6 points to 28%, mostly in ChatGPT.");
  assert.match(a.text, /- ChatGPT, 41% to 30% \(-11 pts\)/);
  assert.doesNotMatch(a.text, /- Claude, 33% to 33%/); // no move, no row
});

test("the plan puts ready-to-buy pages first, and the trial shows the prices it is given", () => {
  assert.ok(all.planReady.text.indexOf("buy crm") < all.planReady.text.indexOf("learn crm"));
  assert.match(all.trial.text, /Starter, One toolset: \$39 a month/);
  assert.match(all.tasks.subject, /^1,280 tasks left this month$/);
});

test("the trial email says the workspace moves to Free, never read-only", () => {
  assert.match(all.trial.text, /moves to the Free plan/);
  assert.doesNotMatch(all.trial.text + all.trial.preview, /read-only/);
});

test("getting-started emails use the brand's real numbers and show the answer that skipped it", () => {
  assert.equal(all.firstLook.subject, "Rival shows up in AI answers more than Acme");
  assert.match(all.firstLook.text, /ChatGPT, "best crm":\n1\. Rival\n2\. Other\nNot named: Acme/);
  assert.equal(all.firstLookLead.subject, "Acme is in 60% of AI answers so far");
  assert.match(all.welcome.text, /\[x\] Add your brand\n3\. See your first answers/);
  assert.match(all.welcome.text, /Free trial until Nov 26/);
  assert.match(all.welcome.text, /Sam\nFounder/);
  assert.equal(all.welcomeNoBrand.subject, "See what ChatGPT says about your brand");
  assert.match(all.prompts.text, /4\/25 prompts tracked/);
  assert.match(all.contentPlan.text, /In your trial until Nov 26\. Not on Free\./);
  assert.match(all.trialOver.text, /Trial \| Free \| Starter\nPrompts: Trial 25, Free 15, Starter 50/);
  assert.equal(all.upgrade.subject, "You're seeing 2 of 4 AIs for Acme");
  assert.match(all.trialOver.text, /Get Starter, \$49 a month/);
  assert.match(all.firstLook.text, /Acme 18% vs Rival 54%/);
  assert.match(all.upgrade.text, /ChatGPT, AI Overview, Claude \(off\), Gemini \(off\)/);
  assert.match(all.firstLook.html, /background-image:linear-gradient/);
  assert.equal(all.winBack.subject, "Acme's AI visibility fell 6.7 points while you were away");
});

test("sign-in emails carry the code, and the code block is left out without one", () => {
  assert.match(all.magic.html, /123456/);
  assert.match(all.magic.text, /Or enter this code: 123456/);
  assert.doesNotMatch(all.recovery.html, /Or enter this code/);
});

test("names are escaped and only web links make buttons", () => {
  const m = renderEmail({ subject: "x\ny", preview: "p", title: "<script>alert(1)</script>", blocks: [{ t: "p", text: 'a "b" <c>' }], button: { label: "Go", url: "javascript:alert(1)" }, footer: { text: "f" } });
  assert.equal(m.subject, "x y");
  assert.doesNotMatch(m.html, /<script>alert/);
  assert.doesNotMatch(m.html, /javascript:/);
  assert.match(m.html, /a &quot;b&quot; &lt;c&gt;/);
});

test("ptsTag rounds and picks a tone", () => {
  assert.deepEqual(ptsTag(4.24), { text: "+4.2 pts", tone: "good" });
  assert.deepEqual(ptsTag(-1), { text: "-1 pt", tone: "bad" });
  assert.deepEqual(ptsTag(0.3), { text: "+0.3 pts", tone: "neutral" });
});

const chat = (engine: string, prompt: string, named: string[], answered = true) => ({ engine, prompt, text: "", answered, sources: [], brands: named.map((name, i) => ({ name, position: i + 1, sentiment: 60 })), error: null });
const run = (at: string, chats: ReturnType<typeof chat>[]) => ({ at, engines: [], chats }) as unknown as Run;

test("promptMoves finds prompts gained and lost, and ignores prompts not asked in both weeks", () => {
  const before = [run("2026-10-20T08:00:00Z", [chat("ChatGPT", "a", ["Rival"]), chat("Gemini", "b", ["Acme"]), chat("ChatGPT", "c", ["Acme"]), chat("ChatGPT", "d", ["acme"])])];
  const now = [run("2026-10-27T08:00:00Z", [chat("ChatGPT", "a", ["Acme"]), chat("Claude", "a", ["Acme", "Rival"]), chat("Gemini", "b", ["Rival"]), chat("ChatGPT", "d", ["Acme"]), chat("ChatGPT", "e", ["Acme"]), chat("ChatGPT", "c", [], false)])];
  const m = promptMoves(now, before, "Acme");
  assert.deepEqual(m.gained, [{ prompt: "a", engines: ["ChatGPT", "Claude"] }]);
  assert.deepEqual(m.lost, [{ prompt: "b", engines: ["Gemini"] }]);
});
