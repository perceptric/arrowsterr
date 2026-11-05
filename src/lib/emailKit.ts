// The look every Arrowsterr email shares (docs/brand.md, v8 calm look): the logo, a light gray shell, one white panel
// with a hairline ring, a dark pill button and Signal Blue only for your own brand. Emails are built from blocks, so
// each one gets an HTML body and a plain-text copy from the same data. Pure, so tests can check every email.
//
// Email clients are old: tables for layout, styles inline, and a dark-mode stylesheet keyed on classes for the
// clients that read one (Apple Mail, iOS, Outlook for Mac). Clients that don't keep the light look.

export type Tone = "good" | "bad" | "neutral" | "blue" | "spark";
export type Tag = { text: string; tone: Tone };
export type Link = { label: string; url: string };

export type Block =
  | { t: "p"; text: string }
  | { t: "small"; text: string }
  | { t: "label"; text: string }
  | { t: "stats"; items: { label: string; value: string; tag?: Tag }[] }
  | { t: "bars"; items: { name: string; value: number; you?: boolean; muted?: boolean }[] }
  | { t: "rows"; items: { title: string; meta?: string; right?: string; tag?: Tag; url?: string }[] }
  | { t: "callout"; text: string }
  | { t: "meter"; used: number; limit: number; left: string; right: string }
  | { t: "files"; items: { name: string; size?: string }[] }
  | { t: "code"; label: string; code: string };

export type EmailParts = {
  subject: string;
  /** The line inboxes show after the subject. */
  preview: string;
  eyebrow?: string;
  title: string;
  sub?: { text: string; tag?: Tag };
  blocks: Block[];
  button?: Link;
  /** A quieter text link next to the button. */
  link?: Link;
  /** Blocks under the button, like a sign-in code. */
  after?: Block[];
  /** Why the person gets this email, and the links to stop or change it. */
  footer: { text: string; links?: Link[] };
  /** A Brand Kit's name and color in place of the Arrowsterr logo (white-label reports). */
  maker?: { name: string; color: string };
};

export type Email = { subject: string; preview: string; html: string; text: string };

export const appUrl = () => (typeof process !== "undefined" ? process.env.APP_URL?.trim().replace(/\/+$/, "") : "") || "https://app.arrowsterr.com";

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
const safeColor = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : "#0943B0");
const safeUrl = (u: string) => (/^(https?:|mailto:)/i.test(u) ? u : "#");

// Light values; the dark ones live in DARK below. Same tokens as src/app/calm-ui.css.
const C = {
  shell: "#F5F5F5", panel: "#FFFFFF", soft: "#FAFAFA", line: "#EBEBEB", ink: "#171717", ink2: "#737373",
  btn: "#333333", signal: "#0943B0", signalSoft: "#E8EEFA", track: "#F0F0F0", muted: "#D4D4D4",
  good: "#0B7A54", goodSoft: "#E6F4EE", bad: "#B42318", badSoft: "#FDECEA", spark: "#F5A70A", sparkText: "#8A4B00", sparkSoft: "#FFF4DC", neutralText: "#404040",
};
const FONT = "Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const TONES: Record<Tone, [string, string]> = {
  good: [C.goodSoft, C.good],
  bad: [C.badSoft, C.bad],
  neutral: [C.track, C.neutralText],
  blue: [C.signalSoft, C.signal],
  spark: [C.sparkSoft, C.sparkText],
};

const DARK = `@media (prefers-color-scheme: dark) {
.c-shell{background:#161614!important}.c-panel{background:#1F1F1D!important;border-color:#2C2C29!important}
.c-soft{background:#1A1A18!important;border-color:#2C2C29!important}.c-ink{color:#E8E8E3!important}.c-ink2{color:#9A9A95!important}
.c-line{border-color:#2C2C29!important}.c-track{background:#2C2C29!important}.c-muted{background:#55554F!important}
.c-signal{background:#6E95E6!important}.c-btn{background:#F5F5F0!important;color:#171717!important}
.c-good{background:#13291F!important;color:#7FD1AE!important}.c-bad{background:#3A1D1A!important;color:#F4A39A!important}
.c-spark{background:#33280F!important;color:#FFC53D!important}.c-neutral{background:#262624!important;color:#D9D9D4!important}
.c-blue{background:#17223A!important;color:#9DB6F0!important}.logo-light{display:none!important}.logo-dark{display:block!important}
}`;

const tagHtml = (t: Tag) => {
  const [bg, fg] = TONES[t.tone];
  return `<span class="c-${t.tone}" style="display:inline-block;background:${bg};color:${fg};font-size:12px;line-height:18px;font-weight:500;border-radius:6px;padding:1px 7px;white-space:nowrap">${esc(t.text)}</span>`;
};
const tr = (inner: string) => `<tr><td>${inner}</td></tr>`;
const table = (inner: string, style = "") => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="${style}">${inner}</table>`;
const barCell = (pct: number, color: string, cls: string) =>
  `<td class="${cls}" width="${pct}%" style="background:${color};height:8px;border-radius:4px;font-size:0;line-height:0">&nbsp;</td><td class="c-track" style="background:${C.track};height:8px;border-radius:4px;font-size:0;line-height:0">&nbsp;</td>`;
const pctOf = (v: number, max: number) => Math.min(100, Math.max(2, Math.round((v / (max || 1)) * 100)));
const fmtPct = (n: number) => `${Math.round(n * 10) / 10}%`;

function blockHtml(b: Block): string {
  switch (b.t) {
    case "p":
      return `<tr><td class="c-ink" style="font-size:15px;line-height:24px;color:${C.ink};padding-bottom:12px">${esc(b.text)}</td></tr>`;
    case "small":
      return `<tr><td class="c-ink2" style="font-size:13px;line-height:20px;color:${C.ink2};padding-top:14px">${esc(b.text)}</td></tr>`;
    case "label":
      return `<tr><td class="c-ink2" style="font-size:12px;line-height:16px;font-weight:500;color:${C.ink2};padding:24px 0 8px">${esc(b.text)}</td></tr>`;
    case "stats": {
      const w = Math.floor(100 / Math.max(1, b.items.length));
      const cells = b.items
        .map(
          (s, i) => `<td valign="top" class="c-line" width="${w}%" style="padding:14px 16px;${i ? `border-left:1px solid ${C.line};` : ""}">
<div class="c-ink2" style="font-size:12px;line-height:16px;color:${C.ink2};padding-bottom:4px">${esc(s.label)}</div>
<div class="c-ink" style="font-size:24px;line-height:30px;font-weight:600;letter-spacing:-0.02em;color:${C.ink};font-variant-numeric:tabular-nums">${esc(s.value)}</div>${s.tag ? `<div style="padding-top:6px">${tagHtml(s.tag)}</div>` : ""}</td>`,
        )
        .join("");
      return `<tr><td style="padding-top:8px">${table(`<tr>${cells}</tr>`, `background:${C.soft};border:1px solid ${C.line};border-radius:8px`).replace("<table ", '<table class="c-soft" ')}</td></tr>`;
    }
    case "bars": {
      const max = Math.max(100, ...b.items.map((x) => x.value));
      const rows = b.items
        .map((x) => {
          const bold = x.you ? "font-weight:600;" : "";
          const color = x.muted ? C.muted : C.signal;
          return `<tr><td class="c-ink" style="font-size:14px;line-height:20px;color:${C.ink};padding:6px 12px 6px 0;width:120px;${bold}">${esc(x.name)}</td>
<td style="padding:6px 0">${table(`<tr>${barCell(pctOf(x.value, max), color, x.muted ? "c-muted" : "c-signal")}</tr>`)}</td>
<td class="c-ink" style="font-size:14px;line-height:20px;color:${C.ink};padding:6px 0 6px 12px;width:52px;text-align:right;font-variant-numeric:tabular-nums;${bold}">${esc(fmtPct(x.value))}</td></tr>`;
        })
        .join("");
      return tr(table(rows));
    }
    case "rows": {
      const rows = b.items
        .map((r) => {
          const title = r.url ? `<a href="${esc(safeUrl(r.url))}" class="c-ink" style="color:${C.ink};text-decoration:none">${esc(r.title)}</a>` : esc(r.title);
          const right = [r.right ? esc(r.right) : "", r.tag ? tagHtml(r.tag) : ""].filter(Boolean).join("&nbsp; ");
          return `<tr><td class="c-line" style="padding:10px 0;border-bottom:1px solid ${C.line}"><div class="c-ink" style="font-size:14px;line-height:20px;color:${C.ink};font-weight:500">${title}</div>${r.meta ? `<div class="c-ink2" style="font-size:13px;line-height:18px;color:${C.ink2}">${esc(r.meta)}</div>` : ""}</td>
<td class="c-line c-ink" align="right" valign="middle" style="padding:10px 0 10px 12px;border-bottom:1px solid ${C.line};white-space:nowrap;font-size:14px;color:${C.ink};font-variant-numeric:tabular-nums">${right}</td></tr>`;
        })
        .join("");
      return tr(table(rows, `border-top:1px solid ${C.line}`).replace("<table ", '<table class="c-line" '));
    }
    case "callout":
      return `<tr><td style="padding:4px 0 8px">${table(`<tr><td class="c-soft c-ink" style="background:${C.soft};border:1px solid ${C.line};border-radius:8px;padding:12px 14px;font-size:14px;line-height:21px;color:${C.ink}">${esc(b.text)}</td></tr>`)}</td></tr>`;
    case "meter": {
      const pct = Math.min(100, Math.max(2, Math.round((b.used / (b.limit || 1)) * 100)));
      const bar = `<tr><td width="${pct}%" style="background:${C.spark};height:10px;border-radius:5px;font-size:0;line-height:0">&nbsp;</td>${pct < 100 ? `<td class="c-track" style="background:${C.track};height:10px;border-radius:5px;font-size:0;line-height:0">&nbsp;</td>` : ""}</tr>`;
      const under = `<tr><td class="c-ink2" style="font-size:13px;color:${C.ink2};padding-top:8px;font-variant-numeric:tabular-nums">${esc(b.left)}</td><td class="c-ink2" align="right" style="font-size:13px;color:${C.ink2};padding-top:8px">${esc(b.right)}</td></tr>`;
      return `<tr><td style="padding-top:8px">${table(bar)}${table(under)}</td></tr>`;
    }
    case "files":
      return b.items
        .map(
          (f) => `<tr><td style="padding-bottom:8px">${table(
            `<tr><td width="44" style="padding:10px 0 10px 12px"><span class="c-bad" style="display:inline-block;background:${C.badSoft};color:${C.bad};font-size:10px;font-weight:600;border-radius:6px;width:32px;line-height:32px;text-align:center">PDF</span></td>
<td class="c-ink" style="font-size:14px;color:${C.ink};font-weight:500;padding:10px 12px">${esc(f.name)}</td>${f.size ? `<td class="c-ink2" align="right" style="font-size:13px;color:${C.ink2};padding:10px 14px;white-space:nowrap">${esc(f.size)}</td>` : ""}</tr>`,
            `border:1px solid ${C.line};border-radius:8px`,
          ).replace("<table ", '<table class="c-line" ')}</td></tr>`,
        )
        .join("");
    case "code":
      return `<tr><td style="padding:20px 0 4px">${table(`<tr><td class="c-soft" align="center" style="background:${C.soft};border:1px solid ${C.line};border-radius:8px;padding:16px">
<div class="c-ink2" style="font-size:12px;color:${C.ink2};padding-bottom:6px">${esc(b.label)}</div>
<div class="c-ink" style="font-size:28px;line-height:34px;font-weight:600;letter-spacing:0.3em;padding-left:0.3em;color:${C.ink};font-family:ui-monospace,Menlo,Consolas,monospace">${esc(b.code)}</div></td></tr>`)}</td></tr>`;
  }
}

function blockText(b: Block): string[] {
  switch (b.t) {
    case "p":
    case "small":
    case "callout":
      return [b.text, ""];
    case "label":
      return [b.text, ""];
    case "stats":
      return [...b.items.map((s) => `${s.label}: ${s.value}${s.tag ? ` (${s.tag.text})` : ""}`), ""];
    case "bars":
      return [...b.items.map((x) => `${x.name}: ${fmtPct(x.value)}`), ""];
    case "rows":
      return [...b.items.map((r) => `- ${r.title}${r.meta ? `, ${r.meta}` : ""}${r.right ? `: ${r.right}` : ""}${r.tag ? ` (${r.tag.text})` : ""}${r.url ? ` ${r.url}` : ""}`), ""];
    case "meter":
      return [`${b.left}. ${b.right}.`, ""];
    case "files":
      return [...b.items.map((f) => `- ${f.name} (PDF${f.size ? `, ${f.size}` : ""})`), ""];
    case "code":
      return [`${b.label}: ${b.code}`, ""];
  }
}

/** One email from its parts: subject, preview line, HTML body and plain-text copy. */
export function renderEmail(e: EmailParts): Email {
  const subject = oneLine(e.subject).slice(0, 200);
  const preview = oneLine(e.preview).slice(0, 200);
  const app = appUrl();
  const brand = e.maker
    ? `<div style="font-size:16px;line-height:28px;font-weight:600;color:${safeColor(e.maker.color)}">${esc(e.maker.name)}</div>`
    : `<img class="logo-light" src="${app}/brand/arrowsterr-logo-color.png" width="152" height="28" alt="Arrowsterr" style="display:block;border:0;height:28px;width:152px"><!--[if !mso]><!--><img class="logo-dark" src="${app}/brand/arrowsterr-logo-white.png" width="152" height="28" alt="Arrowsterr" style="display:none;border:0;height:28px;width:152px"><!--<![endif]-->`;
  const btn = e.button
    ? `<tr><td style="padding-top:24px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td class="c-btn" style="background:${C.btn};border-radius:9999px"><a class="c-btn" href="${esc(safeUrl(e.button.url))}" style="display:inline-block;background:${C.btn};color:#FFFFFF;text-decoration:none;font-size:14px;line-height:20px;font-weight:500;padding:11px 22px;border-radius:9999px">${esc(e.button.label)}</a></td>${
        e.link ? `<td style="padding-left:16px"><a href="${esc(safeUrl(e.link.url))}" class="c-ink2" style="font-size:14px;color:${C.ink2};text-decoration:underline">${esc(e.link.label)}</a></td>` : ""
      }</tr></table></td></tr>`
    : "";
  const sub = e.sub
    ? `<tr><td class="c-ink2" style="padding-bottom:14px;font-size:14px;line-height:20px;color:${C.ink2}">${e.sub.tag ? `${tagHtml(e.sub.tag)}&nbsp; ` : ""}${esc(e.sub.text)}</td></tr>`
    : "";
  const footLinks = (e.footer.links ?? []).map((l) => `<a href="${esc(safeUrl(l.url))}" class="c-ink2" style="color:${C.ink2};text-decoration:underline">${esc(l.label)}</a>`).join("&nbsp;&nbsp; ");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${esc(subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet"><style>${DARK}</style></head>
<body class="c-shell" style="margin:0;padding:0;background:${C.shell};font-family:${FONT};-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${esc(preview)}${"&#8199;&#65279;&#847; ".repeat(30)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="c-shell" style="background:${C.shell}"><tr><td align="center" style="padding:32px 16px 40px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">
<tr><td style="padding:0 4px 20px">${brand}</td></tr>
<tr><td class="c-panel" style="background:${C.panel};border:1px solid ${C.line};border-radius:12px;padding:32px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:${FONT}">
${e.eyebrow ? `<tr><td class="c-ink2" style="font-size:13px;line-height:18px;color:${C.ink2};padding-bottom:8px">${esc(e.eyebrow)}</td></tr>` : ""}
<tr><td class="c-ink" style="font-size:24px;line-height:31px;font-weight:600;letter-spacing:-0.02em;color:${C.ink};padding-bottom:${e.sub ? 8 : 14}px">${esc(e.title)}</td></tr>
${sub}${e.blocks.map(blockHtml).join("\n")}
${btn}${(e.after ?? []).map(blockHtml).join("\n")}
</table></td></tr>
<tr><td class="c-ink2" style="font-size:12px;line-height:18px;color:${C.ink2};padding:20px 4px 0;font-family:${FONT}">${esc(e.footer.text)}${footLinks ? ` ${footLinks}` : ""}</td></tr>
</table></td></tr></table></body></html>`;

  const lines = [
    e.maker?.name ?? "Arrowsterr",
    "",
    ...(e.eyebrow ? [e.eyebrow] : []),
    e.title,
    ...(e.sub ? [`${e.sub.tag ? `${e.sub.tag.text} ` : ""}${e.sub.text}`] : []),
    "",
    ...e.blocks.flatMap(blockText),
    ...(e.button ? [`${e.button.label}: ${e.button.url}`, ""] : []),
    ...(e.link ? [`${e.link.label}: ${e.link.url}`, ""] : []),
    ...(e.after ?? []).flatMap(blockText),
    "--",
    e.footer.text,
    ...(e.footer.links ?? []).map((l) => `${l.label}: ${l.url}`),
  ];
  const text = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { subject, preview, html, text };
}

// ─────────────── small helpers the emails share ───────────────

/** "+4.2 pts", "-6 pts", "+1 pt". */
export const ptsTag = (n: number): Tag => {
  const r = Math.round(n * 10) / 10;
  const word = Math.abs(r) === 1 ? "pt" : "pts";
  return { text: `${r > 0 ? "+" : ""}${r} ${word}`, tone: r >= 1 ? "good" : r <= -1 ? "bad" : "neutral" };
};
export const num = (n: number) => Math.round(n).toLocaleString("en-US");
export const pct = (n: number) => fmtPct(n);
export const fileSize = (bytes: number) => (bytes >= 1_000_000 ? `${(Math.round(bytes / 100_000) / 10).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`);
export const day = (d: Date, tz = "UTC") => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: tz });
export const STAGE_TAG: Record<string, Tag> = {
  bofu: { text: "Ready to buy", tone: "blue" },
  mofu: { text: "Comparing", tone: "neutral" },
  tofu: { text: "Learning", tone: "neutral" },
};

/**
 * What a customer reads when a job fails. Raw errors from vendors and the database stay in the logs; the email
 * gets one plain line. Stopped is handled before this (no email).
 */
export function plainError(raw: string | null | undefined): string {
  const e = (raw ?? "").toLowerCase();
  if (!e.trim()) return "It stopped partway. This often clears in a few minutes.";
  if (/\b(429|rate|too many|quota|busy|overloaded|529)\b/.test(e)) return "A data source was too busy to answer. This often clears in a few minutes.";
  if (/\b(5\d\d|bad gateway|timeout|timed out|unavailable|econn|network|fetch failed|socket|aborted)\b/.test(e)) return "A data source didn't answer. This often clears in a few minutes.";
  if (/\b(no results|no keywords|nothing found|empty)\b/.test(e)) return "The research found too little to work with. A broader keyword or site may help.";
  if (/\b(task|credit|limit|allowance|plan)\b/.test(e)) return "This month's allowance ran out partway. Top up or wait for it to reset.";
  return "It stopped partway. This often clears in a few minutes.";
}
