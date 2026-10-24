// The email a schedule sends (docs/reports.md, section 32.4): one email per send, each page's PDF attached.
// In the brand design it carries the Brand Kit's name and color, and Arrowsterr's name appears nowhere.
// Pure, so tests can check the HTML and the plain text.

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
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const safeColor = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : "#0943B0");

export function reportEmail(e: ReportEmail): { subject: string; html: string; text: string } {
  const day = e.date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const subject = (e.subject || `${e.brand}: ${e.name} · ${day}`).replace(/[\r\n]+/g, " ").slice(0, 200);
  const lead = `${e.brand}'s report is attached: ${e.period}.`;
  const foot = `${e.when}. Reply to this email to change or stop it.`;
  const accent = safeColor(e.accent);
  const html = `<!doctype html><html><body style="margin:0;background:#f6f7f9;font-family:Inter,Arial,sans-serif;color:#1b2230">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;padding:32px">
<tr><td style="font-size:15px;font-weight:600;color:${accent};padding-bottom:20px">${esc(e.maker)}</td></tr>
<tr><td style="font-size:22px;font-weight:600;line-height:1.3;padding-bottom:16px">${esc(e.name)}</td></tr>
<tr><td style="font-size:15px;line-height:1.6;color:#3d4657;padding-bottom:12px">${esc(lead)}</td></tr>
<tr><td style="padding:4px 0 8px"><table role="presentation" cellpadding="0" cellspacing="0" width="100%">${e.files
    .map((f) => `<tr><td style="font-size:14px;line-height:1.5;color:#1b2230;padding:8px 12px;border:1px solid #e3e6ec;border-radius:8px">${esc(f)} <span style="color:#7a8499">· PDF</span></td></tr><tr><td style="height:6px"></td></tr>`)
    .join("")}</table></td></tr>
</table>
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px"><tr><td style="font-size:12px;line-height:1.6;color:#7a8499;padding:16px 8px">${esc(foot)}</td></tr></table>
</td></tr></table></body></html>`;
  const text = [e.maker, "", e.name, "", lead, "", "Attached:", ...e.files.map((f) => `- ${f} (PDF)`), "", foot].join("\n");
  return { subject, html, text };
}
