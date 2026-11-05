import "server-only";
import type { Email } from "./emailKit";

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

export { esc } from "./emailKit";

/** Send an email built with the kit (src/lib/emailKit.ts): its HTML and its plain-text copy. */
export function sendBuilt(to: string[], mail: Email, headers?: Record<string, string>, extra: EmailExtra = {}) {
  return sendEmail(to, mail.subject, mail.html, headers, { text: mail.text, ...extra });
}
