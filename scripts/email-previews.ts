// Every email with sample data, for a look before a change ships, plus the Supabase sign-in templates.
//   npm run emails            writes email-previews/*.html (ignored by git) and supabase/templates/*.html
// Open the previews in a browser; switch the system to dark mode to see the dark versions.

import { mkdirSync, writeFileSync } from "node:fs";
import {
  alertEmail,
  authEmail,
  briefEmail,
  contentPlanEmail,
  firstLookEmail,
  freeAlarmEmail,
  helpEmail,
  newDeviceEmail,
  noBrandEmail,
  planEmail,
  promptsEmail,
  securityNoticeEmail,
  tasksEmail,
  trialEmail,
  trialOverEmail,
  upgradeEmail,
  weeklyEmail,
  welcomeEmail,
  winBackEmail,
  type Footer,
} from "../src/lib/emails.ts";
import type { Email } from "../src/lib/emailKit.ts";
import { reportEmail } from "../src/lib/reportEmail.ts";

const app = "https://app.arrowsterr.com";
const footer: Footer = { text: "You get the weekly summary for this workspace.", links: [{ label: "Unsubscribe", url: `${app}/api/notifications/unsubscribe` }, { label: "Choose your emails", url: `${app}/settings/notifications` }] };
const tips: Footer = { text: "You get getting-started tips because you made this workspace.", links: [{ label: "Unsubscribe", url: `${app}/api/notifications/unsubscribe` }, { label: "Choose your emails", url: `${app}/settings/notifications` }] };
const sign = { name: "Sam Reed", role: "Founder, Arrowsterr" };
const admin: Footer = { text: "You get this because you're an admin of this workspace.", links: [{ label: "Billing", url: `${app}/settings/billing` }] };

const samples: Record<string, Email | { subject: string; html: string; text: string }> = {
  weekly: weeklyEmail(
    {
      workspace: "Sample workspace",
      from: new Date("2026-10-26T12:00:00Z"),
      to: new Date("2026-11-01T12:00:00Z"),
      url: `${app}/prompts`,
      appUrl: app,
      brands: [
        {
          name: "Sample brand",
          visibility: 34,
          change: 4.2,
          position: 2.4,
          sentiment: 72,
          byEngine: [
            { engine: "ChatGPT", visibility: 41 },
            { engine: "Gemini", visibility: 29 },
            { engine: "Perplexity", visibility: 38 },
          ],
          top: [
            { name: "Rival one", visibility: 62 },
            { name: "Rival two", visibility: 31 },
          ],
          gained: [{ prompt: "best tool for small teams", engines: ["ChatGPT", "Claude"] }],
          lost: [{ prompt: "how to pick a tool", engines: ["Gemini"] }],
        },
      ],
    },
    footer,
  ),
  alert: alertEmail(
    {
      brand: "Sample brand",
      day: new Date("2026-11-04T12:00:00Z"),
      you: 28,
      before: 34,
      overtaken: { name: "Rival one", visibility: 31, before: 28 },
      engines: [
        { engine: "ChatGPT", now: 30, was: 41 },
        { engine: "Gemini", now: 24, was: 29 },
        { engine: "Perplexity", now: 37, was: 38 },
      ],
      lost: [{ prompt: "best tool for small teams", engines: ["ChatGPT"] }],
      url: `${app}/prompts`,
    },
    footer,
  ),
  "brief-ready": briefEmail({ ok: true, keyword: "sample keyword", volume: 1900, difficulty: 42, stage: "bofu", outline: ["What it is", "How it works", "What to ask", "Pricing"], terms: 24, questions: 6, url: `${app}/editorial-calendar` }, footer),
  "brief-failed": briefEmail({ ok: false, keyword: "sample keyword", error: "DataForSEO returned 502: Bad Gateway", tasks: 75, url: `${app}/editorial-calendar` }, footer),
  "plan-ready": planEmail(
    {
      ok: true,
      site: "example.com",
      pages: [
        { keyword: "sample keyword", volume: 1900, stage: "bofu" },
        { keyword: "second keyword", volume: 880, stage: "bofu" },
        { keyword: "best sample tools", volume: 1300, stage: "mofu" },
        { keyword: "what is a sample", volume: 2400, stage: "tofu" },
        { keyword: "/services/seo", volume: 0, stage: "bofu", update: true },
      ],
      url: `${app}/editorial-calendar`,
    },
    footer,
  ),
  "plan-failed": planEmail({ ok: false, site: "example.com", error: "timeout", url: `${app}/editorial-calendar` }, footer),
  trial: trialEmail(
    {
      workspace: "Sample workspace",
      days: 3,
      ends: new Date("2026-11-08T12:00:00Z"),
      visibility: 34,
      prompts: 50,
      briefs: 6,
      plans: [
        { name: "Starter", tagline: "One toolset: AI Visibility or Organic Research", price: 39 },
        { name: "Pro", tagline: "Both toolsets, with the Agentic Writer", price: 179 },
      ],
      url: `${app}/settings/billing`,
    },
    admin,
  ),
  tasks: tasksEmail({ workspace: "Sample workspace", used: 6720, limit: 8000, plan: "Pro", resets: new Date("2026-12-01T00:00:00Z"), packs: [{ tasks: 1000, price: 15 }, { tasks: 5000, price: 59 }], credits: 0, url: `${app}/settings/billing` }, admin),
  report: reportEmail({
    maker: "Arrowsterr",
    accent: "#0943B0",
    brand: "Sample brand",
    name: "Monthly AI visibility report",
    subject: null,
    when: "Every month on the 1st at 09:00",
    period: "Last 30 days · Oct 1, 2026 – Oct 31, 2026",
    files: ["AI Visibility by Prompt", "Sources AI Cites"],
    sizes: [1_200_000, 740_000],
    date: new Date("2026-11-01T09:00:00Z"),
    scores: { visibility: { now: 34, before: 29.8 }, position: { now: 2.4, before: 2.7 }, sentiment: { now: 72, before: 70 } },
  }),
  free: freeAlarmEmail({ spent: 52.4, limit: 50, tools: [{ name: "keyword", runs: 296, cost: 31.2 }, { name: "snapshot", runs: 128, cost: 21.2 }], url: app }),
  "auth-confirm": authEmail("confirm", { url: `${app}/confirm`, email: "you@example.com", code: "482913" }),
  "auth-magic": authEmail("magic", { url: `${app}/signin`, email: "you@example.com", code: "482913" }),
  "auth-recovery": authEmail("recovery", { url: `${app}/reset`, email: "you@example.com", code: "482913" }),
  "auth-invite": authEmail("invite", { url: `${app}/invite`, email: "you@example.com", inviter: "Sam from Momos" }),
  "auth-email-change": authEmail("email_change_old", { url: `${app}/change`, email: "you@example.com", newEmail: "new@example.com", code: "482913" }),
  "auth-reauth": authEmail("reauth", { url: "", email: "you@example.com", code: "482913" }),
  "security-password": securityNoticeEmail("password_changed_notification", { email: "you@example.com", settingsUrl: `${app}/settings/security`, resetUrl: app })!,
  "security-device": newDeviceEmail({ device: "Chrome on macOS", ip: "203.0.113.7", when: new Date("2026-11-17T11:22:00Z"), resetUrl: app }),

  // Getting started (src/lib/nurture.ts), in the order they go out.
  "nurture-1-welcome": welcomeEmail(
    {
      brand: "Northwind",
      steps: [
        { title: "Make your workspace", done: true },
        { title: "Add your brand", meta: "Paste your website and Arrowsterr does the rest", done: true },
        { title: "See your first answers", meta: "From every AI, within a day", done: false },
        { title: "Track 10 prompts or more", meta: "The questions your buyers ask AI", done: false },
        { title: "Make a Content Plan", meta: "The pages to write so AI quotes you", done: false },
      ],
      trialEnds: new Date("2026-11-26T12:00:00Z"),
      url: `${app}/prompts`,
      sign,
    },
    tips,
  ),
  "nurture-1-welcome-no-brand": welcomeEmail(
    {
      brand: null,
      steps: [
        { title: "Make your workspace", done: true },
        { title: "Add your brand", meta: "Paste your website and Arrowsterr does the rest", done: false },
        { title: "See your first answers", meta: "From every AI, within a day", done: false },
        { title: "Track 10 prompts or more", meta: "The questions your buyers ask AI", done: false },
        { title: "Make a Content Plan", meta: "The pages to write so AI quotes you", done: false },
      ],
      trialEnds: new Date("2026-11-26T12:00:00Z"),
      url: `${app}/onboarding`,
      sign,
    },
    tips,
  ),
  "nurture-2-no-brand": noBrandEmail({ url: `${app}/onboarding`, sign }, tips),
  "nurture-3-first-look": firstLookEmail(
    {
      brand: "Northwind",
      visibility: 18,
      answers: 96,
      top: [
        { name: "Fabrikam", visibility: 54 },
        { name: "Contoso", visibility: 41 },
        { name: "Tailspin", visibility: 23 },
      ],
      example: { engine: "ChatGPT", prompt: "best review management software for restaurants", names: ["Fabrikam", "Contoso", "Tailspin"], youNamed: false },
      url: `${app}/prompts`,
    },
    tips,
  ),
  "nurture-4-prompts": promptsEmail(
    {
      brand: "Northwind",
      count: 4,
      limit: 25,
      ideas: [
        { prompt: "best review management software for restaurant groups", stage: "bofu" },
        { prompt: "Fabrikam alternatives", stage: "bofu" },
        { prompt: "Northwind vs Fabrikam", stage: "mofu" },
        { prompt: "how to choose a review management software", stage: "tofu" },
      ],
      url: `${app}/prompts`,
    },
    tips,
  ),
  "nurture-5-content-plan": contentPlanEmail({ brand: "Northwind", site: "northwind.com", trialEnds: new Date("2026-11-26T12:00:00Z"), url: `${app}/opportunities` }, tips),
  "nurture-6-trial-over": trialOverEmail(
    {
      workspace: "Northwind",
      cols: ["Trial", "Starter", "Pro"],
      rows: [
        { label: "AIs checked", values: ["All 6", "All 6", "All 6"] },
        { label: "How often", values: ["Daily", "Daily", "Daily"] },
        { label: "Prompts", values: ["25", "50", "150"] },
        { label: "Competitors", values: ["10", "10", "15"] },
        { label: "Days of history", values: ["180", "180", "365"] },
        { label: "Content Plans a month", values: ["1", "1", "1"] },
      ],
      pick: 1,
      price: 49,
      annual: 42,
      url: `${app}/settings/billing`,
    },
    tips,
  ),
  "nurture-7-upgrade": upgradeEmail(
    { brand: "Northwind", visibility: 22.5, prompts: 12, promptLimit: 15, engines: ["ChatGPT", "AI Overview"], missing: ["Claude", "Gemini", "Perplexity", "AI Mode"], plan: { name: "Starter", price: 49, prompts: 50, competitors: 10 }, url: `${app}/settings/billing` },
    tips,
  ),
  "nurture-7-help": helpEmail({ brand: "Northwind", url: `${app}/prompts`, sign }, tips),
  "nurture-8-win-back": winBackEmail(
    {
      brand: "Northwind",
      since: new Date("2026-10-19T12:00:00Z"),
      before: 22.5,
      now: 15.8,
      byEngine: [
        { engine: "ChatGPT", visibility: 19 },
        { engine: "AI Overview", visibility: 12.5 },
      ],
      top: [
        { name: "Fabrikam", visibility: 57 },
        { name: "Contoso", visibility: 38 },
      ],
      url: `${app}/prompts`,
    },
    tips,
  ),
};

mkdirSync("email-previews", { recursive: true });
for (const [name, mail] of Object.entries(samples)) {
  writeFileSync(`email-previews/${name}.html`, mail.html);
  writeFileSync(`email-previews/${name}.txt`, `Subject: ${mail.subject}\n\n${mail.text}\n`);
}

// Supabase Auth templates: Supabase fills in {{ .ConfirmationURL }}, {{ .Token }} and {{ .Email }} when it sends.
const URL_MARK = "https://placeholder.invalid/confirmation";
const CODE_MARK = "000000";
const EMAIL_MARK = "person@placeholder.invalid";
const fill = (html: string) => html.replaceAll(URL_MARK, "{{ .ConfirmationURL }}").replaceAll(CODE_MARK, "{{ .Token }}").replaceAll(EMAIL_MARK, "{{ .Email }}");
const templates = [
  { file: "confirmation", mail: authEmail("confirm", { url: URL_MARK, email: EMAIL_MARK, code: CODE_MARK }) },
  { file: "magic_link", mail: authEmail("magic", { url: URL_MARK, email: EMAIL_MARK, code: CODE_MARK }) },
  { file: "recovery", mail: authEmail("recovery", { url: URL_MARK, email: EMAIL_MARK, code: CODE_MARK }) },
  { file: "invite", mail: authEmail("invite", { url: URL_MARK, email: EMAIL_MARK }) },
  { file: "email_change", mail: authEmail("email_change_new", { url: URL_MARK, email: EMAIL_MARK, code: CODE_MARK }) },
  { file: "reauthentication", mail: authEmail("reauth", { url: URL_MARK, email: EMAIL_MARK, code: CODE_MARK }) },
];
mkdirSync("supabase/templates", { recursive: true });
for (const t of templates) writeFileSync(`supabase/templates/${t.file}.html`, fill(t.mail.html) + "\n");
writeFileSync("supabase/templates/subjects.txt", templates.map((t) => `${t.file}: ${fill(t.mail.subject)}`).join("\n") + "\n");

console.log(`Wrote ${Object.keys(samples).length} previews to email-previews/ and ${templates.length} templates to supabase/templates/.`);
