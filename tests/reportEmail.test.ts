import assert from "node:assert/strict";
import { test } from "node:test";
import { reportEmail, type ReportEmail } from "../src/lib/reportEmail.ts";

const base: ReportEmail = {
  maker: "Arrowsterr",
  accent: "#0943B0",
  brand: "Acme",
  name: "Weekly report",
  subject: null,
  when: "Every Monday at 09:00",
  period: "Last 30 days · Sep 26, 2026 – Oct 25, 2026",
  files: ["AI Visibility by Prompt", "Sources AI Cites"],
  date: new Date("2026-10-26T09:00:00Z"),
};

test("the scheduled email: subject, the attached PDFs, and a plain-text copy", () => {
  const m = reportEmail(base);
  assert.equal(m.subject, "Acme: Weekly report · Oct 26, 2026");
  assert.match(m.html, /AI Visibility by Prompt/);
  assert.match(m.html, /Sources AI Cites/);
  assert.match(m.html, /Every Monday at 09:00\. Reply to this email to change or stop it\./);
  assert.equal(
    m.text,
    ["Arrowsterr", "", "Weekly report", "", "Acme's report is attached: Last 30 days · Sep 26, 2026 – Oct 25, 2026.", "", "Attached:", "- AI Visibility by Prompt (PDF)", "- Sources AI Cites (PDF)", "", "Every Monday at 09:00. Reply to this email to change or stop it."].join("\n"),
  );
});

test("the brand design names the kit and never Arrowsterr", () => {
  const m = reportEmail({ ...base, maker: "Northwind Agency", accent: "#AA2200" });
  assert.doesNotMatch(m.html + m.text + m.subject, /Arrowsterr/i);
  assert.match(m.html, /color:#AA2200/);
  assert.match(m.html, /Northwind Agency/);
});

test("what people typed is escaped, a bad color falls back, and the subject stays on one line", () => {
  const m = reportEmail({ ...base, brand: "<b>Acme</b>", name: 'Q4 "deep" review', accent: "red;background:url(x)", subject: "Hello\r\nBcc: x@evil.com" });
  assert.doesNotMatch(m.html, /<b>Acme<\/b>/);
  assert.match(m.html, /&lt;b&gt;Acme&lt;\/b&gt;/);
  assert.match(m.html, /Q4 &quot;deep&quot; review/);
  assert.match(m.html, /color:#0943B0/);
  assert.equal(m.subject, "Hello Bcc: x@evil.com");
});
