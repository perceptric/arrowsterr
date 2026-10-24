// Email through Resend. Needs RESEND_API_KEY and EMAIL_FROM. Without them, nothing is sent and
// alerts still show in the app.

export const emailReady = () => Boolean(process.env.RESEND_API_KEY?.trim());

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function sendEmail(to: string[], subject: string, lines: string[], link: { href: string; label: string } | null, fromName?: string, key?: string) {
  if (!emailReady() || !to.length) return false;
  const from = process.env.EMAIL_FROM?.trim() || "RiseLocale <hello@riselocale.com>";
  const address = from.match(/<([^>]+)>/)?.[1] ?? from;
  const name = fromName?.replace(/[<>"\r\n]+/g, " ").trim().slice(0, 80);
  const html = `<div style="font:14px/20px -apple-system,Segoe UI,Arial,sans-serif;color:#0a0b0f">${lines.map((l) => `<p>${esc(l)}</p>`).join("")}${
    link ? `<p><a href="${esc(link.href)}" style="display:inline-block;padding:10px 16px;background:#0a0b0f;color:#fff;border-radius:4px;text-decoration:none">${esc(link.label)}</a></p>` : ""
  }</div>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`, "Content-Type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) },
    body: JSON.stringify({ from: name ? `${name} <${address}>` : from, to, subject, html, text: [...lines, link ? `${link.label}: ${link.href}` : ""].join("\n\n") }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Resend returned ${res.status}`);
  return true;
}

export const appUrl = () => (process.env.APP_URL?.trim() || "http://localhost:3100").replace(/\/$/, "");
