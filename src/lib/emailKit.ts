// The look every Arrowsterr email shares (docs/brand.md, v8 calm look; getting-started emails add a Signal Blue hero): the logo, a light gray shell, one white panel
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
  | { t: "meter"; used: number; limit: number; left: string; right: string; tone?: "spark" | "blue" }
  | { t: "files"; items: { name: string; size?: string }[] }
  | { t: "code"; label: string; code: string }
  /** A short checklist: done steps get a green check, the rest a number. */
  | { t: "steps"; items: { title: string; meta?: string; done: boolean }[] }
  /** One AI answer as a card: the engine, the question and the brands it named, in order. `missing` is a brand it left out. */
  | { t: "answer"; engine: string; prompt: string; items: { name: string; you?: boolean }[]; missing?: string }
  /** A side-by-side table, like plans. `pick` is the column to highlight. */
  | { t: "compare"; cols: string[]; rows: { label: string; values: string[] }[]; pick?: number }
  /** A sign-off from a person, for notes that should read like one. */
  | { t: "sign"; name: string; role?: string }
  /** AI engines as colored chips; the ones that are off show dimmed. */
  | { t: "engines"; items: { name: string; on: boolean }[] };

/** The big picture in a hero header: one number, a face-off, a progress bar, dots, a before and after, or a person. */
export type HeroVisual =
  | { k: "big"; value: string; label: string; tag?: Tag }
  | { k: "duel"; you: { name: string; value: string }; them: { name: string; value: string } }
  | { k: "progress"; done: number; total: number; label: string }
  | { k: "dots"; on: number; total: number; label: string }
  | { k: "change"; from: { label: string; value: string }; to: { label: string; value: string }; tag: Tag }
  | { k: "avatar"; initials: string; name: string; role?: string };

/** A Signal Blue header with the title in white and one big visual, for emails that should stand out. */
export type Hero = { kicker?: string; visual?: HeroVisual };

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
  /** A Signal Blue header carrying the title, the sub line and one big visual. */
  hero?: Hero;
};

export type Email = { subject: string; preview: string; html: string; text: string };

export const appUrl = () => (typeof process !== "undefined" ? process.env.APP_URL?.trim().replace(/\/+$/, "") : "") || "https://app.arrowsterr.com";

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
const safeColor = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : "#0943B0");
const safeUrl = (u: string) => (/^(https?:|mailto:)/i.test(u) ? u : "#");

// Light values; the dark ones live in DARK below. Same tokens as src/app/globals.css.
const C = {
  shell: "#F5F5F5", panel: "#FFFFFF", soft: "#FAFAFA", line: "#EBEBEB", ink: "#171717", ink2: "#737373",
  btn: "#0943B0", signal: "#0943B0", signalSoft: "#E8EEFA", track: "#F0F0F0", muted: "#D4D4D4",
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
.c-signal{background:#6E95E6!important}.c-btn{background:#4F7FE0!important;color:#FFFFFF!important}
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

/** Each AI's own color, for its dot and chip. */
const ENGINE_COLOR: Record<string, string> = {
  ChatGPT: "#10A37F", Claude: "#D97757", Gemini: "#4285F4", Perplexity: "#1FB8CD", "AI Overview": "#EA4335", "AI Mode": "#7B61FF",
};
const engineColor = (n: string) => ENGINE_COLOR[n] ?? C.signal;
const dot = (color: string, size = 8) => `<span style="display:inline-block;width:${size}px;height:${size}px;border-radius:${size}px;background:${color};vertical-align:middle"></span>`;

// The hero: Signal Blue, deeper at the top left, with white type. Clients without gradients get the flat blue.
const HERO_BG = `background:#0943B0;background-image:linear-gradient(135deg,#062F80 0%,#0943B0 55%,#2E66D9 100%)`;
const W = "#FFFFFF";
const W2 = "rgba(255,255,255,0.72)";
const W3 = "rgba(255,255,255,0.16)";

function heroVisual(v: HeroVisual): string {
  switch (v.k) {
    case "big":
      return `<div style="font-size:64px;line-height:68px;font-weight:700;letter-spacing:-0.04em;color:${W};font-variant-numeric:tabular-nums">${esc(v.value)}</div>
<div style="font-size:14px;line-height:20px;color:${W2};padding-top:6px">${esc(v.label)}${v.tag ? `&nbsp; <span style="display:inline-block;background:${W};color:${TONES[v.tag.tone][1]};font-size:12px;line-height:18px;font-weight:600;border-radius:6px;padding:1px 8px">${esc(v.tag.text)}</span>` : ""}</div>`;
    case "duel": {
      const side = (x: { name: string; value: string }, you: boolean) =>
        `<td width="44%" valign="top" style="background:${you ? W : W3};border-radius:12px;padding:16px 18px">
<div style="font-size:13px;line-height:18px;font-weight:600;color:${you ? C.signal : W2};white-space:nowrap;overflow:hidden">${esc(x.name)}</div>
<div style="font-size:40px;line-height:46px;font-weight:700;letter-spacing:-0.03em;color:${you ? C.signal : W};font-variant-numeric:tabular-nums">${esc(x.value)}</div></td>`;
      return table(`<tr>${side(v.you, true)}<td width="12%" align="center" style="font-size:13px;font-weight:600;color:${W2}">vs</td>${side(v.them, false)}</tr>`);
    }
    case "progress": {
      const pct = Math.min(100, Math.max(4, Math.round((v.done / (v.total || 1)) * 100)));
      return `<div style="font-size:14px;line-height:20px;color:${W};font-weight:600;padding-bottom:10px">${esc(v.label)}</div>${table(
        `<tr><td width="${pct}%" style="background:${W};height:10px;border-radius:5px;font-size:0;line-height:0">&nbsp;</td>${pct < 100 ? `<td style="background:${W3};height:10px;border-radius:5px;font-size:0;line-height:0">&nbsp;</td>` : ""}</tr>`,
      )}`;
    }
    case "dots": {
      const cells = Array.from({ length: v.total }, (_, i) => `<td style="padding-right:8px">${dot(i < v.on ? W : W3, 18)}</td>`).join("");
      return `<table role="presentation" cellpadding="0" cellspacing="0"><tr>${cells}</tr></table><div style="font-size:14px;line-height:20px;color:${W2};padding-top:10px">${esc(v.label)}</div>`;
    }
    case "change":
      return `<div style="font-size:14px;line-height:20px;color:${W2}">${esc(v.from.label)}: <span style="font-weight:600;color:${W}">${esc(v.from.value)}</span> &rarr; ${esc(v.to.label)}</div>
<div style="padding-top:4px"><span style="font-size:60px;line-height:64px;font-weight:700;letter-spacing:-0.04em;color:${W};font-variant-numeric:tabular-nums;vertical-align:middle">${esc(v.to.value)}</span>&nbsp;&nbsp;<span style="display:inline-block;background:${W};color:${TONES[v.tag.tone][1]};font-size:13px;line-height:20px;font-weight:600;border-radius:6px;padding:2px 9px;white-space:nowrap;vertical-align:middle">${esc(v.tag.text)}</span></div>`;
    case "avatar":
      return `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td><div style="width:52px;height:52px;line-height:52px;border-radius:26px;background:${W};color:${C.signal};font-size:18px;font-weight:700;text-align:center">${esc(v.initials)}</div></td>
<td style="padding-left:14px"><div style="font-size:15px;line-height:22px;font-weight:600;color:${W}">${esc(v.name)}</div>${v.role ? `<div style="font-size:13px;line-height:18px;color:${W2}">${esc(v.role)}</div>` : ""}</td></tr></table>`;
  }
}

function heroHtml(h: Hero, title: string, sub?: { text: string; tag?: Tag }): string {
  return `<tr><td bgcolor="#0943B0" style="${HERO_BG};border-radius:11px 11px 0 0;padding:32px 32px 30px">
${h.kicker ? `<div style="padding-bottom:14px"><span style="display:inline-block;background:${W3};color:${W};font-size:12px;line-height:18px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;border-radius:999px;padding:3px 11px">${esc(h.kicker)}</span></div>` : ""}
<div style="font-size:28px;line-height:34px;font-weight:700;letter-spacing:-0.025em;color:${W}">${esc(title)}</div>
${sub ? `<div style="font-size:15px;line-height:22px;color:${W2};padding-top:8px">${esc(sub.text)}</div>` : ""}
${h.visual ? `<div style="padding-top:24px">${heroVisual(h.visual)}</div>` : ""}
</td></tr>`;
}

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
      // Three or more side by side get a little tighter, so they still fit a phone.
      const tight = b.items.length >= 3;
      const cells = b.items
        .map(
          (s, i) => `<td valign="top" class="c-line" width="${w}%" style="padding:${tight ? "12px 10px" : "14px 16px"};${i ? `border-left:1px solid ${C.line};` : ""}">
<div class="c-ink2" style="font-size:12px;line-height:16px;color:${C.ink2};padding-bottom:4px">${esc(s.label)}</div>
<div class="c-ink" style="font-size:${tight ? 20 : 24}px;line-height:${tight ? 26 : 30}px;font-weight:600;letter-spacing:-0.02em;color:${C.ink};font-variant-numeric:tabular-nums">${esc(s.value)}</div>${s.tag ? `<div style="padding-top:6px">${tagHtml(s.tag)}</div>` : ""}</td>`,
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
      return `<tr><td style="padding-top:8px">${table(rows)}</td></tr>`;
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
      const fill = b.tone === "blue" ? C.signal : C.spark;
      const bar = `<tr><td class="${b.tone === "blue" ? "c-signal" : ""}" width="${pct}%" style="background:${fill};height:10px;border-radius:5px;font-size:0;line-height:0">&nbsp;</td>${pct < 100 ? `<td class="c-track" style="background:${C.track};height:10px;border-radius:5px;font-size:0;line-height:0">&nbsp;</td>` : ""}</tr>`;
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
    case "steps": {
      const rows = b.items
        .map((s, i) => {
          const dot = s.done
            ? `<span class="c-good" style="display:inline-block;width:24px;height:24px;line-height:24px;border-radius:12px;background:${C.goodSoft};color:${C.good};font-size:13px;font-weight:600;text-align:center">&#10003;</span>`
            : `<span class="c-line c-ink2" style="display:inline-block;width:22px;height:22px;line-height:22px;border-radius:12px;border:1px solid ${C.line};color:${C.ink2};font-size:12px;font-weight:600;text-align:center">${i + 1}</span>`;
          const last = i === b.items.length - 1;
          return `<tr><td width="36" valign="top" style="padding:10px 0;${last ? "" : `border-bottom:1px solid ${C.line};`}" class="c-line">${dot}</td>
<td class="c-line" style="padding:10px 0;${last ? "" : `border-bottom:1px solid ${C.line};`}"><div class="${s.done ? "c-ink2" : "c-ink"}" style="font-size:14px;line-height:20px;font-weight:500;color:${s.done ? C.ink2 : C.ink}">${esc(s.title)}</div>${s.meta ? `<div class="c-ink2" style="font-size:13px;line-height:18px;color:${C.ink2}">${esc(s.meta)}</div>` : ""}</td></tr>`;
        })
        .join("");
      return `<tr><td style="padding-top:4px">${table(rows)}</td></tr>`;
    }
    case "answer": {
      const color = engineColor(b.engine);
      const head = `<tr><td style="padding:14px 16px 4px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td>${dot(color, 10)}</td><td class="c-ink" style="padding-left:8px;font-size:13px;line-height:18px;font-weight:600;color:${C.ink}">${esc(b.engine)}</td></tr></table></td></tr>`;
      const ask = `<tr><td align="right" style="padding:8px 16px 4px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td class="c-btn" style="background:${C.signal};color:#FFFFFF;border-radius:16px 16px 4px 16px;padding:9px 14px;font-size:14px;line-height:20px">${esc(b.prompt)}</td></tr></table></td></tr>`;
      const rows = b.items
        .map((x, i) => {
          const you = Boolean(x.you);
          return `<tr><td width="26" class="c-ink2" style="font-size:13px;line-height:20px;color:${you ? C.signal : C.ink2};padding:7px 0;font-variant-numeric:tabular-nums">${i + 1}.</td><td class="c-ink" style="font-size:14px;line-height:20px;color:${you ? C.signal : C.ink};font-weight:${you ? 700 : 500};padding:7px 0">${esc(x.name)}</td><td align="right" style="padding:7px 0">${you ? tagHtml({ text: "You", tone: "blue" }) : ""}</td></tr>`;
        })
        .join("");
      const miss = b.missing
        ? `<tr><td colspan="3" style="padding-top:8px">${table(
            `<tr><td class="c-ink2" style="font-size:14px;line-height:20px;color:${C.ink2};padding:9px 12px">${esc(b.missing)}</td><td align="right" style="padding:9px 12px">${tagHtml({ text: "Not named", tone: "bad" })}</td></tr>`,
            `border:1px dashed #E5A39C;border-radius:10px`,
          )}</td></tr>`
        : "";
      const reply = `<tr><td style="padding:6px 16px 16px"><table role="presentation" width="88%" cellpadding="0" cellspacing="0"><tr><td class="c-panel c-line" style="background:${C.panel};border:1px solid ${C.line};border-radius:16px 16px 16px 4px;padding:8px 14px">${table(rows + miss)}</td></tr></table></td></tr>`;
      return `<tr><td style="padding:8px 0 4px">${table(head + ask + reply, `background:${C.soft};border:1px solid ${C.line};border-radius:14px`).replace("<table ", '<table class="c-soft" ')}</td></tr>`;
    }
    case "engines": {
      // Inline chips wrap on their own on a narrow screen.
      const chips = b.items
        .map(
          (x) =>
            `<span class="${x.on ? "c-panel c-line" : "c-soft c-line"}" style="display:inline-block;margin:0 6px 8px 0;background:${x.on ? C.panel : C.soft};border:1px ${x.on ? "solid" : "dashed"} ${C.line};border-radius:999px;padding:6px 12px;white-space:nowrap">${dot(x.on ? engineColor(x.name) : C.muted)}<span class="${x.on ? "c-ink" : "c-ink2"}" style="padding-left:6px;font-size:13px;line-height:18px;font-weight:500;color:${x.on ? C.ink : C.ink2};vertical-align:middle">${esc(x.name)}</span></span>`,
        )
        .join("");
      return `<tr><td style="padding-top:8px;font-size:0;line-height:0">${chips}</td></tr>`;
    }
    case "compare": {
      const pick = b.pick ?? -1;
      const w = Math.floor(62 / Math.max(1, b.cols.length));
      const head = `<tr><td class="c-line" style="padding:0 0 10px;border-bottom:1px solid ${C.line}"></td>${b.cols
        .map(
          (c, i) =>
            `<td class="c-line ${i === pick ? "" : "c-ink2"}" width="${w}%" align="center" style="padding:0 6px 10px;border-bottom:1px solid ${C.line};font-size:13px;line-height:18px;font-weight:600;color:${i === pick ? C.signal : C.ink2}">${i === pick ? `<span class="c-blue" style="display:inline-block;background:${C.signalSoft};color:${C.signal};border-radius:6px;padding:2px 8px">${esc(c)}</span>` : esc(c)}</td>`,
        )
        .join("")}</tr>`;
      const rows = b.rows
        .map(
          (r) =>
            `<tr><td class="c-line c-ink2" style="padding:10px 0;border-bottom:1px solid ${C.line};font-size:13px;line-height:18px;color:${C.ink2}">${esc(r.label)}</td>${r.values
              .map(
                (v, i) =>
                  `<td class="c-line c-ink" align="center" style="padding:10px 6px;border-bottom:1px solid ${C.line};font-size:14px;line-height:20px;color:${C.ink};font-weight:${i === pick ? 600 : 400};font-variant-numeric:tabular-nums">${esc(v)}</td>`,
              )
              .join("")}</tr>`,
        )
        .join("");
      return `<tr><td style="padding-top:8px">${table(head + rows)}</td></tr>`;
    }
    case "sign":
      return `<tr><td style="padding-top:18px"><div class="c-ink" style="font-size:15px;line-height:22px;color:${C.ink};font-weight:500">${esc(b.name)}</div>${b.role ? `<div class="c-ink2" style="font-size:13px;line-height:18px;color:${C.ink2}">${esc(b.role)}</div>` : ""}</td></tr>`;
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
    case "steps":
      return [...b.items.map((s, i) => `${s.done ? "[x]" : `${i + 1}.`} ${s.title}${s.meta ? `, ${s.meta}` : ""}`), ""];
    case "answer":
      return [`${b.engine}, "${b.prompt}":`, ...b.items.map((x, i) => `${i + 1}. ${x.name}${x.you ? " (you)" : ""}`), ...(b.missing ? [`Not named: ${b.missing}`] : []), ""];
    case "compare":
      return [b.cols.join(" | "), ...b.rows.map((r) => `${r.label}: ${r.values.map((v, i) => `${b.cols[i]} ${v}`).join(", ")}`), ""];
    case "sign":
      return [b.name, ...(b.role ? [b.role] : []), ""];
    case "engines":
      return [b.items.map((x) => `${x.name}${x.on ? "" : " (off)"}`).join(", "), ""];
  }
}

function heroText(v: HeroVisual): string {
  switch (v.k) {
    case "big":
      return `${v.value} ${v.label}${v.tag ? ` (${v.tag.text})` : ""}`;
    case "duel":
      return `${v.you.name} ${v.you.value} vs ${v.them.name} ${v.them.value}`;
    case "progress":
    case "dots":
      return v.label;
    case "change":
      return `${v.from.label} ${v.from.value} to ${v.to.label} ${v.to.value} (${v.tag.text})`;
    case "avatar":
      return `${v.name}${v.role ? `, ${v.role}` : ""}`;
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
${
  e.hero
    ? `<tr><td class="c-panel" style="background:${C.panel};border:1px solid ${C.line};border-radius:12px;padding:0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:${FONT}">${heroHtml(e.hero, e.title, e.sub)}
<tr><td style="padding:${e.blocks.length ? 28 : 4}px 32px 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:${FONT}">
${e.blocks.map(blockHtml).join("\n")}
${btn}${(e.after ?? []).map(blockHtml).join("\n")}
</table></td></tr></table></td></tr>`
    : `<tr><td class="c-panel" style="background:${C.panel};border:1px solid ${C.line};${e.maker ? "" : `border-top:3px solid ${C.signal};`}border-radius:12px;padding:32px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:${FONT}">
${e.eyebrow ? `<tr><td class="c-ink2" style="font-size:13px;line-height:18px;color:${C.ink2};padding-bottom:8px">${esc(e.eyebrow)}</td></tr>` : ""}
<tr><td class="c-ink" style="font-size:24px;line-height:31px;font-weight:600;letter-spacing:-0.02em;color:${C.ink};padding-bottom:${e.sub ? 8 : 14}px">${esc(e.title)}</td></tr>
${sub}${e.blocks.map(blockHtml).join("\n")}
${btn}${(e.after ?? []).map(blockHtml).join("\n")}
</table></td></tr>`
}
<tr><td class="c-ink2" style="font-size:12px;line-height:18px;color:${C.ink2};padding:20px 4px 0;font-family:${FONT}">${esc(e.footer.text)}${footLinks ? ` ${footLinks}` : ""}</td></tr>
${e.maker ? "" : `<tr><td class="c-ink2" style="font-size:12px;line-height:18px;color:${C.ink2};padding:12px 4px 0;font-family:${FONT}">Arrowsterr, AI visibility and SEO in one place.&nbsp; <a href="https://docs.arrowsterr.com" class="c-ink2" style="color:${C.ink2};text-decoration:underline">Help</a>&nbsp;&nbsp; <a href="https://arrowsterr.com/privacy" class="c-ink2" style="color:${C.ink2};text-decoration:underline">Privacy</a></td></tr>`}
</table></td></tr></table></body></html>`;

  const lines = [
    e.maker?.name ?? "Arrowsterr",
    "",
    ...(e.hero?.kicker ? [e.hero.kicker] : e.eyebrow ? [e.eyebrow] : []),
    e.title,
    ...(e.sub ? [`${e.sub.tag ? `${e.sub.tag.text} ` : ""}${e.sub.text}`] : []),
    ...(e.hero?.visual ? [heroText(e.hero.visual)] : []),
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
