import "server-only";

// Sends email through Resend. Needs RESEND_API_KEY and EMAIL_FROM (like "Arrowsterr <hello@arrowsterr.com>") on the server.

export const emailReady = () => Boolean(process.env.RESEND_API_KEY?.trim());

/** More for one email: a plain-text copy, files, who replies go to, the sender's name, and a key so a retry never sends twice. */
export type EmailExtra = { text?: string; attachments?: { filename: string; content: string }[]; replyTo?: string | null; fromName?: string; idempotencyKey?: string };

const fromWith = (name: string | undefined) => {
  const from = process.env.EMAIL_FROM?.trim() || "Arrowsterr <hello@arrowsterr.com>";
  const clean = name?.replace(/[<>"\r\n]+/g, " ").trim().slice(0, 80);
  if (!clean) return from;
  const address = from.match(/<([^>]+)>/)?.[1] ?? from;
  return `${clean} <${address}>`;
};

export async function sendEmail(to: string[], subject: string, html: string, headers?: Record<string, string>, extra: EmailExtra = {}) {
  if (!emailReady() || !to.length) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`,
      "Content-Type": "application/json",
      ...(extra.idempotencyKey ? { "Idempotency-Key": extra.idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from: fromWith(extra.fromName),
      to,
      subject,
      html,
      ...(extra.text ? { text: extra.text } : {}),
      ...(extra.attachments?.length ? { attachments: extra.attachments } : {}),
      ...(extra.replyTo ? { reply_to: extra.replyTo } : {}),
      ...(headers ? { headers } : {}),
    }),
    signal: AbortSignal.timeout(extra.attachments?.length ? 60_000 : 15_000),
  });
  if (!res.ok) throw new Error(`Resend returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return true;
}

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * A plain, on-brand email: a heading, a few lines, optional blocks of ready-made HTML (tables), one button,
 * and an optional footer line (who it's for and how to stop it). Lines are plain text; blocks are trusted HTML.
 */
export function emailHtml(title: string, lines: string[], button: { label: string; url: string }, more: { blocks?: string[]; footer?: string } = {}) {
  return `<!doctype html><html><body style="margin:0;background:#f6f7f9;font-family:Inter,Arial,sans-serif;color:#1b2230">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;padding:32px">
<tr><td style="font-size:15px;font-weight:600;color:#0943B0;padding-bottom:20px">Arrowsterr</td></tr>
<tr><td style="font-size:22px;font-weight:600;line-height:1.3;padding-bottom:16px">${esc(title)}</td></tr>
${lines.map((l) => `<tr><td style="font-size:15px;line-height:1.6;color:#3d4657;padding-bottom:12px">${esc(l)}</td></tr>`).join("")}
${(more.blocks ?? []).map((b) => `<tr><td style="padding:4px 0 16px">${b}</td></tr>`).join("")}
<tr><td style="padding-top:12px"><a href="${esc(button.url)}" style="display:inline-block;background:#0943B0;color:#fff;text-decoration:none;font-size:15px;font-weight:500;padding:12px 20px;border-radius:10px">${esc(button.label)}</a></td></tr>
</table>
${more.footer ? `<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px"><tr><td style="font-size:12px;line-height:1.6;color:#7a8499;padding:16px 8px">${more.footer}</td></tr></table>` : ""}
</td></tr></table></body></html>`;
}
