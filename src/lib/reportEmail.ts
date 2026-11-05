// The email a schedule sends (docs/reports.md, section 32.4): one email per send, each page's PDF attached.
// In the brand design it carries the Brand Kit's name and color, and Arrowsterr's name appears nowhere.
// Pure, so tests can check the HTML and the plain text. Look and parts: src/lib/emailKit.ts.

import { fileSize, ptsTag, renderEmail, type Block, type Tag } from "./emailKit.ts";

type Score = { now: number | null; before: number | null };

export type ReportEmail = {
  maker: string; // "Arrowsterr", or the Brand Kit's name
  accent: string; // a hex color
  brand: string; // the brand the report is about
  name: string; // the schedule's name
  subject: string | null; // the schedule's own subject line, if it has one
  when: string; // "Every Monday at 09:00"
  period: string; // "Last 30 days · Sep 26, 2026 – Oct 25, 2026"
  files: string[]; // the attached PDFs' titles
  date: Date;
  /** Each attached file's size in bytes, in the same order as files. */
  sizes?: number[];
  /** The headline numbers from the prompts page, when the report has one. */
  scores?: { visibility: Score; position: Score; sentiment: Score } | null;
};

const round = (n: number) => Math.round(n * 10) / 10;
const diffTag = (s: Score, lowerIsBetter = false): Tag | undefined => {
  if (s.now === null || s.before === null) return undefined;
  const d = round(s.now - s.before);
  const good = lowerIsBetter ? d < 0 : d > 0;
  return { text: `${d > 0 ? "+" : ""}${d}`, tone: d === 0 ? "neutral" : good ? "good" : "bad" };
};

export function reportEmail(e: ReportEmail): { subject: string; html: string; text: string } {
  const day = e.date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const period = e.period.replace(/\s+·\s+/g, ", ");
  const subject = e.subject || `${e.brand}: ${e.name}, ${day}`;
  const blocks: Block[] = [];
  const s = e.scores;
  if (s && s.visibility.now !== null) {
    const vis = s.visibility.before !== null ? ptsTag(s.visibility.now - s.visibility.before) : undefined;
    blocks.push({
      t: "stats",
      items: [
        { label: "Visibility", value: `${round(s.visibility.now)}%`, ...(vis ? { tag: vis } : {}) },
        ...(s.position.now !== null ? [{ label: "Average position", value: String(round(s.position.now)), ...(diffTag(s.position, true) ? { tag: diffTag(s.position, true) } : {}) }] : []),
        ...(s.sentiment.now !== null ? [{ label: "Sentiment", value: String(Math.round(s.sentiment.now)), ...(diffTag(s.sentiment) ? { tag: diffTag(s.sentiment) } : {}) }] : []),
      ],
    });
  }
  blocks.push({ t: "label", text: "Attached" }, { t: "files", items: e.files.map((name, i) => ({ name, ...(e.sizes?.[i] ? { size: fileSize(e.sizes[i]) } : {}) })) });
  const lead = s?.visibility.now !== null && s?.visibility.now !== undefined ? `${round(s.visibility.now)}% visibility.` : "";
  const mail = renderEmail({
    subject,
    preview: [lead, `${e.files.length} PDF${e.files.length === 1 ? "" : "s"} attached.`].filter(Boolean).join(" "),
    eyebrow: e.name,
    title: `${e.brand}'s report`,
    sub: { text: period },
    blocks,
    footer: { text: `${e.when}. Reply to this email to change or stop it.` },
    // Arrowsterr's own design shows the logo; a Brand Kit shows its name in its color.
    ...(e.maker.trim().toLowerCase() === "arrowsterr" ? {} : { maker: { name: e.maker, color: e.accent } }),
  });
  return { subject: mail.subject, html: mail.html, text: mail.text };
}
