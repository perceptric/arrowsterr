// Every email with sample data, for a look before a change ships, plus the Supabase sign-in templates.
//   npm run emails            writes email-previews/*.html (ignored by git) and supabase/templates/*.html
// Open the previews in a browser; switch the system to dark mode to see the dark versions.

import { mkdirSync, writeFileSync } from "node:fs";
import { alertEmail, authEmail, briefEmail, freeAlarmEmail, planEmail, tasksEmail, trialEmail, weeklyEmail, type Footer } from "../src/lib/emails.ts";
import type { Email } from "../src/lib/emailKit.ts";
import { reportEmail } from "../src/lib/reportEmail.ts";

const app = "https://app.arrowsterr.com";
const footer: Footer = { text: "You get the weekly summary for this workspace.", links: [{ label: "Unsubscribe", url: `${app}/api/notifications/unsubscribe` }, { label: "Choose your emails", url: `${app}/settings/notifications` }] };
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
  "auth-recovery": authEmail("recovery", { url: `${app}/reset`, email: "you@example.com" }),
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
  { file: "recovery", mail: authEmail("recovery", { url: URL_MARK, email: EMAIL_MARK }) },
];
mkdirSync("supabase/templates", { recursive: true });
for (const t of templates) writeFileSync(`supabase/templates/${t.file}.html`, fill(t.mail.html) + "\n");
writeFileSync("supabase/templates/subjects.txt", templates.map((t) => `${t.file}: ${fill(t.mail.subject)}`).join("\n") + "\n");

console.log(`Wrote ${Object.keys(samples).length} previews to email-previews/ and ${templates.length} templates to supabase/templates/.`);
