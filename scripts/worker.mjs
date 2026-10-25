// The job worker: node scripts/worker.mjs
// Runs on Fly.io as arrowsterr-worker (fly.worker.toml). It does four things at once:
//   jobs: calls the app's /api/worker forever.
//   PDFs: asks /api/pdf/next for a report to print, opens its print page in Chromium, and sends the PDF back.
//   pages: asks /api/research/render-next for a page an article's research needs, reads it in Chromium,
//          and sends its headings, text, tables and date to /api/research/render-done (docs/content-v2.md).
//   images: asks /api/writer/image-next for an image a draft needs, takes a screenshot of a page or pictures a
//          drawn image in Chromium, and sends it to /api/writer/image-done (docs/agentic-writing.md, section 5).
// Needs APP_URL (like https://app.arrowsterr.com) and WORKER_SECRET, or CRON_SECRET, (the same value as the app's).
// Optional: LIMIT (jobs per tick, default 20), IDLE_MS (wait when there is nothing to do, default 20000),
// PDF_IDLE_MS (wait when no PDF is queued, default 4000), READ_IDLE_MS (wait when no page is queued, default 5000),
// READERS (pages read at once, default 2; 0 turns reading off), IMAGERS (images made at once, default 1; 0 turns
// images off), IMAGE_IDLE_MS (wait when no image is queued, default 5000). Without playwright-core, PDFs, pages and
// images stay off.
import { lookup } from "node:dns/promises";
import { createServer, request as httpRequest } from "node:http";
import { connect as tcpConnect, isIP } from "node:net";

const url = (process.env.APP_URL ?? "").trim().replace(/\/+$/, "");
const secret = (process.env.WORKER_SECRET || process.env.CRON_SECRET || "").trim();
if (!url || !secret) {
  console.error("Set APP_URL and WORKER_SECRET (or CRON_SECRET) on this worker.");
  process.exit(1);
}
const limit = Number(process.env.LIMIT) || 20;
const idle = Number(process.env.IDLE_MS) || 20_000;
const pdfIdle = Number(process.env.PDF_IDLE_MS) || 4_000;
const readIdle = Number(process.env.READ_IDLE_MS) || 5_000;
const readers = Math.max(0, Math.min(6, Number(process.env.READERS ?? 2) || 0));
const imagers = Math.max(0, Math.min(4, Number(process.env.IMAGERS ?? 1) || 0));
const imageIdle = Number(process.env.IMAGE_IDLE_MS) || 5_000;
const machine = (process.env.FLY_MACHINE_ID ?? "local").slice(0, 20);
const auth = { Authorization: `Bearer ${secret}` };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let stop = false;
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => (stop = true));

async function jobs() {
  let failures = 0;
  while (!stop) {
    let data = null;
    let status = 0;
    try {
      const res = await fetch(`${url}/api/worker?limit=${limit}`, { method: "POST", headers: auth, signal: AbortSignal.timeout(6 * 60_000) });
      status = res.status;
      data = await res.json().catch(() => null);
    } catch (e) {
      data = { error: e instanceof Error ? e.message : String(e) };
    }
    if (status === 401) {
      console.error("Wrong WORKER_SECRET or CRON_SECRET.");
      process.exit(1);
    }
    if (!data || data.error) {
      failures++;
      console.error("tick failed:", status, JSON.stringify(data));
      await sleep(Math.min(120_000, 5_000 * 2 ** Math.min(failures, 5))); // the app may be waking up or restarting
      continue;
    }
    failures = 0;
    if (data.claimed) console.log("tick:", JSON.stringify(data));
    if (data.idle) await sleep(idle);
  }
}

// ─────────────── one Chromium for PDFs and pages ───────────────
let browser = null;
let launching = null;
async function chromiumOrNull() {
  try {
    return (await import("playwright-core")).chromium;
  } catch {
    return null;
  }
}
/** The shared browser, started again if it crashed. Loops asking at the same time share one launch. */
async function shared(chromium) {
  if (browser?.isConnected()) return browser;
  launching ??= (proxying ??= startProxy())
    .then((port) =>
      chromium.launch({
        // WebRTC can't open its own UDP paths around the proxy.
        args: ["--disable-dev-shm-usage", "--force-webrtc-ip-handling-policy=disable_non_proxied_udp"],
        // Every request goes through the checking proxy below, loopback included.
        proxy: { server: `http://127.0.0.1:${port}`, bypass: "<-loopback>" },
      }),
    )
    .then((b) => (browser = b))
    .finally(() => (launching = null));
  return launching;
}

// ─────────────── the proxy in front of Chromium ───────────────
// Chromium sends every request through this proxy, so names are looked up here, in Node, and the browser only
// connects to the address that was just checked. A name can't answer public to the check and private to the
// browser (DNS rebinding). The app's own address is let through, so print pages load when it runs locally.
let proxying = null;
const appUrl = new URL(url);
const appHost = `${appUrl.hostname.replace(/^\[|\]$/g, "").toLowerCase()}:${appUrl.port || (appUrl.protocol === "https:" ? 443 : 80)}`;
const LOCAL_NAMES = /(^|\.)(localhost|local|localdomain|internal|intranet|lan|home|corp|flycast|arpa)$/;

/** The address to connect to for host and port, checked now. Null when it is private. */
async function checkedAddress(host, port) {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (`${h}:${port}` === appHost) return h;
  if (isIP(h)) return privateIp(h) ? null : h;
  if (!h.includes(".") || LOCAL_NAMES.test(h)) return null;
  try {
    const list = await lookup(h, { all: true });
    return list.length && !list.some((a) => privateIp(a.address)) ? list[0].address : null;
  } catch {
    return null;
  }
}

async function startProxy() {
  const server = createServer(async (req, res) => {
    // Plain http: the request line holds the full address.
    let u;
    try {
      u = new URL(req.url ?? "");
    } catch {
      return res.writeHead(400).end();
    }
    const port = Number(u.port || 80);
    const ip = u.protocol === "http:" ? await checkedAddress(u.hostname, port) : null;
    if (!ip) return res.writeHead(403).end();
    const headers = { ...req.headers };
    delete headers["proxy-connection"];
    delete headers["proxy-authorization"];
    const up = httpRequest({ host: ip, port, method: req.method, path: `${u.pathname}${u.search}`, headers }, (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    });
    up.on("error", () => res.destroy());
    req.pipe(up);
  });
  // https and WebSockets: a tunnel to the checked address.
  server.on("connect", async (req, socket, head) => {
    socket.on("error", () => socket.destroy());
    const m = (req.url ?? "").match(/^\[?([^\]]+?)\]?:(\d+)$/);
    const ip = m ? await checkedAddress(m[1], Number(m[2])) : null;
    if (!ip) return socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
    const up = tcpConnect(Number(m[2]), ip, () => {
      socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head?.length) up.write(head);
      up.pipe(socket);
      socket.pipe(up);
    });
    up.on("error", () => socket.destroy());
    socket.on("close", () => up.destroy());
  });
  server.on("clientError", (_e, socket) => socket.destroy());
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server.address().port;
}

/** WebSockets aren't covered by context.route, so each one is checked on its own. */
async function publicSockets(context) {
  if (typeof context.routeWebSocket !== "function") return;
  await context.routeWebSocket(/.*/, async (ws) => {
    if (await publicUrl(ws.url())) ws.connectToServer();
    else await ws.close({ code: 1008, reason: "Blocked" }).catch(() => {});
  });
}

async function pdfs(chromium) {
  const worker = `pdf-${machine}`;
  let failures = 0;
  while (!stop) {
    let job = null;
    try {
      const res = await fetch(`${url}/api/pdf/next?worker=${worker}`, { method: "POST", headers: auth, signal: AbortSignal.timeout(30_000) });
      if (res.status === 401) {
        console.error("Wrong WORKER_SECRET or CRON_SECRET.");
        process.exit(1);
      }
      job = await res.json().catch(() => null);
    } catch (e) {
      job = { error: e instanceof Error ? e.message : String(e) };
    }
    if (!job || job.error) {
      failures++;
      console.error("pdf poll failed:", JSON.stringify(job));
      await sleep(Math.min(120_000, 5_000 * 2 ** Math.min(failures, 5)));
      continue;
    }
    failures = 0;
    if (job.idle) {
      await sleep(pdfIdle);
      continue;
    }
    const started = Date.now();
    let context = null;
    try {
      context = await (await shared(chromium)).newContext({ viewport: { width: 1100, height: 1400 }, serviceWorkers: "block", acceptDownloads: false });
      // The print page is the app's own; anything else it loads must be public, as when reading pages.
      await publicOnly(context, Date.now() + 240_000, [], true);
      const page = await context.newPage();
      const res = await page.goto(`${url}${job.path}`, { waitUntil: "networkidle", timeout: 120_000 });
      if (!res || !res.ok()) throw new Error(`Print page answered ${res?.status() ?? "nothing"}.`);
      const failed = await page.locator("[data-failed]").getAttribute("data-failed", { timeout: 1_000 }).catch(() => null);
      if (failed) throw new Error(failed);
      await page.waitForSelector("[data-ready]", { timeout: 120_000 });
      await page.evaluate(() => document.fonts.ready);
      await page.emulateMedia({ media: "print" });
      // Page numbers in the bottom margin, small and grey, on every PDF.
      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: "<span></span>",
        footerTemplate: '<div style="width:100%;padding:0 8mm;font:8px sans-serif;color:#8a8f99;text-align:right"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
        margin: { top: "10mm", bottom: "14mm", left: "8mm", right: "8mm" },
      });
      const done = await fetch(`${url}/api/pdf/done?id=${job.id}`, { method: "POST", headers: { ...auth, "Content-Type": "application/pdf" }, body: pdf, signal: AbortSignal.timeout(60_000) });
      if (!done.ok) throw new Error(`Upload failed: ${done.status} ${await done.text().catch(() => "")}`.slice(0, 500));
      console.log(`pdf ${job.id}: ${Math.round(pdf.length / 1024)} KB in ${Date.now() - started} ms`);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`pdf ${job.id} failed:`, message);
      await fetch(`${url}/api/pdf/fail?id=${job.id}`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ error: message }), signal: AbortSignal.timeout(30_000) }).catch(() => {});
    } finally {
      await context?.close().catch(() => {});
    }
  }
}

// ─────────────── pages for article research ───────────────
// 20 seconds a page, no logins, nothing on a private network. The app checked the address and robots.txt before
// handing it out; here every request the page makes is checked too, redirects one by one, and where it ended up.
const READ_MS = 20_000;
const READER_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 ArrowsterrBot/1.0 (+https://arrowsterr.com/)";

// A copy of privateIp from src/lib/netCheck.ts (tests/netCheck.test.ts covers that one). This file runs alone
// on the worker, so it keeps its own copy. Change both together.
function privateV4(ip) {
  const [a, b, c] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}
function v6Groups(ip) {
  let s = ip.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  const tail = s.match(/^(.*:)(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (tail) {
    const p = tail.slice(2).map(Number);
    if (p.some((n) => n > 255)) return null;
    s = `${tail[1]}${((p[0] << 8) | p[1]).toString(16)}:${((p[2] << 8) | p[3]).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const parts = (x) => (x ? x.split(":") : []);
  const head = parts(halves[0]);
  const rest = halves.length === 2 ? parts(halves[1]) : [];
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  if (fill < 0) return null;
  const all = [...head, ...Array(fill).fill("0"), ...rest];
  if (all.length !== 8 || all.some((h) => !/^[0-9a-f]{1,4}$/.test(h))) return null;
  return all.map((h) => parseInt(h, 16));
}
function privateIp(ip) {
  const v = ip.trim().replace(/^\[|\]$/g, "");
  if (isIP(v) === 4) return privateV4(v);
  const g = v6Groups(v);
  if (!g) return true;
  const zeros = (n) => g.slice(0, n).every((x) => x === 0);
  const v4 = () => `${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`;
  if (zeros(5) && g[5] === 0xffff) return privateV4(v4()); // ::ffff:a.b.c.d
  if (zeros(4) && g[4] === 0xffff && g[5] === 0) return privateV4(v4()); // ::ffff:0:a.b.c.d
  if (zeros(6)) return true; // ::, ::1 and ::a.b.c.d
  if (g[0] === 0x64 && g[1] === 0xff9b) return true; // NAT64
  if (g[0] === 0x2002) return true; // 6to4
  if (g[0] === 0x2001 && (g[1] === 0 || g[1] === 0xdb8)) return true; // Teredo, documentation
  if (g[0] === 0x100 && zeros(4)) return true; // discard
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7, Fly's fdaa:: included
  if ((g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xffc0) === 0xfec0) return true; // link-local, site-local
  return (g[0] & 0xff00) === 0xff00; // multicast
}

const hosts = new Map(); // host -> { ok, at }, for 5 minutes
/** True for http(s) and ws(s) addresses whose every IP is public. */
async function publicUrl(address) {
  let u;
  try {
    u = new URL(address);
  } catch {
    return false;
  }
  if (!/^(https?|wss?):$/.test(u.protocol) || u.username || u.password) return false;
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (isIP(host) || host.includes(":")) return !privateIp(host);
  if (!host.includes(".") || /(^|\.)(localhost|local|localdomain|internal|intranet|lan|home|corp|flycast|arpa)$/.test(host)) return false;
  const hit = hosts.get(host);
  if (hit && Date.now() - hit.at < 300_000) return hit.ok;
  let ok = false;
  try {
    const list = await lookup(host, { all: true });
    ok = list.length > 0 && !list.some((a) => privateIp(a.address));
  } catch {}
  if (hosts.size > 5000) hosts.clear();
  hosts.set(host, { ok, at: Date.now() });
  return ok;
}

// Runs inside the page: headings, the main text, tables and the published date.
function extract() {
  const text = (el) => (el?.innerText ?? el?.textContent ?? "").replace(/\s+/g, " ").trim();
  const headings = [...document.querySelectorAll("h1, h2, h3, h4")]
    .filter((h) => h.getClientRects().length > 0)
    .map((h) => ({ level: Number(h.tagName[1]), text: text(h) }))
    .filter((h) => h.text)
    .slice(0, 200);
  const meta = (sel) => document.querySelector(sel)?.getAttribute("content") || null;
  let published =
    meta('meta[property="article:published_time"]') || meta('meta[itemprop="datePublished"]') || meta('meta[name="date"]') || meta('meta[name="publish-date"]') || meta('meta[name="pubdate"]');
  const inLd = (x) => {
    if (!x || typeof x !== "object") return null;
    if (Array.isArray(x)) {
      for (const y of x) {
        const found = inLd(y);
        if (found) return found;
      }
      return null;
    }
    return typeof x.datePublished === "string" ? x.datePublished : inLd(x["@graph"]);
  };
  for (const s of published ? [] : document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      published = inLd(JSON.parse(s.textContent || ""));
    } catch {}
    if (published) break;
  }
  published ||= document.querySelector("[itemprop=datePublished]")?.getAttribute("datetime") || document.querySelector("article time[datetime], time[datetime]")?.getAttribute("datetime") || null;
  const main = document.querySelector("article") || document.querySelector("main, [role=main]") || document.body;
  for (const el of main.querySelectorAll("script, style, noscript, svg, nav, footer, aside, form, iframe, [aria-hidden=true]")) el.remove();
  const tables = [...main.querySelectorAll("table")]
    .slice(0, 10)
    .map((t) => [...t.rows].slice(0, 50).map((r) => [...r.cells].slice(0, 12).map((c) => text(c).slice(0, 300))))
    .filter((t) => t.length > 1);
  let body = (main.innerText || "").trim();
  if (main !== document.body && body.split(/\s+/).length < 150) body = (document.body.innerText || "").trim();
  return {
    title: document.querySelector('meta[property="og:title"]')?.getAttribute("content") || document.title || null,
    headings,
    body: body.slice(0, 60_000),
    word_count: body.split(/\s+/).filter(Boolean).length,
    tables,
    published_at: published,
    login: Boolean(document.querySelector('input[type="password"]')),
  };
}

async function readPage(chromium, address) {
  const context = await (await shared(chromium)).newContext({ userAgent: READER_UA, viewport: { width: 1280, height: 1600 }, acceptDownloads: false, serviceWorkers: "block" });
  const deadline = Date.now() + READ_MS;
  const left = () => Math.max(1_000, deadline - Date.now());
  try {
    await context.route("**/*", async (route) => {
      const req = route.request();
      try {
        if (["image", "media", "font"].includes(req.resourceType())) return await route.abort();
        if (!(await publicUrl(req.url()))) return await route.abort("blockedbyclient");
        if (!req.isNavigationRequest()) return await route.continue();
        // Redirects are followed one at a time, so a public page can't send the browser into a private network.
        const res = await route.fetch({ maxRedirects: 0, timeout: left() });
        const to = res.headers().location;
        if (res.status() >= 300 && res.status() < 400 && to && !(await publicUrl(new URL(to, req.url()).toString()))) return await route.abort("blockedbyclient");
        return await route.fulfill({ response: res });
      } catch {
        await route.abort().catch(() => {});
      }
    });
    await publicSockets(context);
    const page = await context.newPage();
    page.on("dialog", (d) => d.dismiss().catch(() => {}));
    const res = await page.goto(address, { waitUntil: "domcontentloaded", timeout: READ_MS });
    const status = res?.status() ?? 0;
    if (status === 401 || status === 403 || status === 407) return { ok: false, reason: "blocked", error: `The page answered ${status}.` };
    if (!res || status >= 400) return { ok: false, reason: "failed", error: `The page answered ${status || "nothing"}.` };
    const type = res.headers()["content-type"] ?? "";
    if (type && !/html|xml/i.test(type)) return { ok: false, reason: "blocked", error: "Not a web page." };
    await page.waitForLoadState("networkidle", { timeout: left() }).catch(() => {}); // busy pages are read as they are at 20 seconds
    const final = page.url();
    if (!(await publicUrl(final))) return { ok: false, reason: "private", error: "The page went to a private network." };
    const read = await Promise.race([page.evaluate(extract), sleep(5_000).then(() => Promise.reject(new Error("Timeout: reading the page took too long.")))]);
    if (read.login && read.word_count < 300) return { ok: false, reason: "blocked", error: "The page asks for a login." };
    delete read.login;
    return { ok: true, final_url: final, ...read };
  } finally {
    await context.close().catch(() => {});
  }
}

async function pages(chromium, n) {
  const worker = `read-${machine}-${n}`;
  let failures = 0;
  while (!stop) {
    let task = null;
    try {
      const res = await fetch(`${url}/api/research/render-next?worker=${worker}`, { method: "POST", headers: auth, signal: AbortSignal.timeout(130_000) });
      if (res.status === 401) {
        console.error("Wrong WORKER_SECRET or CRON_SECRET.");
        process.exit(1);
      }
      task = await res.json().catch(() => null);
    } catch (e) {
      task = { error: e instanceof Error ? e.message : String(e) };
    }
    if (!task || task.error) {
      failures++;
      console.error("page poll failed:", JSON.stringify(task));
      await sleep(Math.min(120_000, 5_000 * 2 ** Math.min(failures, 5)));
      continue;
    }
    failures = 0;
    if (task.idle) {
      await sleep(readIdle);
      continue;
    }
    const started = Date.now();
    let result;
    try {
      const late = sleep(READ_MS + 15_000).then(() => ({ ok: false, reason: "timeout", error: "The page took longer than 20 seconds." }));
      result = await Promise.race([readPage(chromium, task.url), late]);
    } catch (e) {
      const message = (e instanceof Error ? e.message : String(e)).split("\n")[0].slice(0, 300);
      result = { ok: false, reason: /timeout/i.test(message) ? "timeout" : /ERR_BLOCKED_BY_CLIENT/.test(message) ? "private" : "failed", error: message };
    }
    const sent = await fetch(`${url}/api/research/render-done?id=${task.id}&worker=${worker}`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify(result), signal: AbortSignal.timeout(60_000) })
      .then((r) => r.ok)
      .catch(() => false);
    console.log(`page ${task.id}: ${result.ok ? `${result.word_count} words` : result.reason} in ${Date.now() - started} ms${sent ? "" : " (not saved)"}`);
  }
}

// ─────────────── images for Agentic Writing ───────────────
// A screenshot is the page at 1440 by 900, after cookie prompts are accepted and banners, chat bubbles and floating
// bars are hidden, set in the frame page the app sent. A drawn image is the page the app built from its spec.
// Every request either page makes must go to a public address, as when reading pages.
const SHOT_MS = 20_000;
const SHOT_SLOT = "__SHOT__";
const ACCEPT = ["Accept all", "Accept All", "Accept all cookies", "Accept All Cookies", "Accept", "Allow all", "Allow all cookies", "I agree", "Agree", "Got it", "OK", "Okay", "Accept Cookies", "Continue"];
const HIDE_CSS = `#onetrust-banner-sdk,#onetrust-consent-sdk,#CybotCookiebotDialog,#CybotCookiebotDialogBodyUnderlay,.osano-cm-window,.osano-cm-dialog,#truste-consent-track,.truste_box_overlay,#usercentrics-root,#didomi-host,.fc-consent-root,#cookie-banner,#cookie-consent,#cookieConsent,.cookie-banner,.cookie-consent,.cookie-notice,[id*="cookie-law"],[class*="CookieBanner"],[class*="cookie-bar"],[aria-label*="cookie" i][role="dialog"],[aria-label*="cookie" i][role="region"],#intercom-container,.intercom-lightweight-app,.intercom-launcher,#hubspot-messages-iframe-container,#drift-widget-container,#drift-frame-controller,.drift-frame-controller,iframe[title*="chat" i],iframe[name*="chat" i],[id*="chat-widget"],.zEWidget-launcher,#fc_frame,#qualified-chat,iframe[src*="qualified"],[class*="ChatLauncher"],#attentive_overlay,#attentive_creative,iframe[id*="attentive"],[class*="klaviyo-form"],.grecaptcha-badge,[aria-modal="true"][role="dialog"]{display:none !important;visibility:hidden !important}`;
const BLOCKED = /just a moment|attention required|access denied|verify you are|are you a robot|captcha|request blocked|forbidden|pardon our interruption/i;

/** Every request the page makes must go to a public address; redirects are followed one at a time. own lets the app's own pages through. */
async function publicOnly(context, deadline, block = [], own = false) {
  const left = () => Math.max(1_000, deadline - Date.now());
  await publicSockets(context);
  await context.route("**/*", async (route) => {
    const req = route.request();
    try {
      if (req.url().startsWith("data:")) return await route.continue();
      if (own && new URL(req.url()).origin === appUrl.origin) return await route.continue();
      if (block.includes(req.resourceType())) return await route.abort();
      if (!(await publicUrl(req.url()))) return await route.abort("blockedbyclient");
      if (!req.isNavigationRequest()) return await route.continue();
      const res = await route.fetch({ maxRedirects: 0, timeout: left() });
      const to = res.headers().location;
      if (res.status() >= 300 && res.status() < 400 && to && !(await publicUrl(new URL(to, req.url()).toString()))) return await route.abort("blockedbyclient");
      return await route.fulfill({ response: res });
    } catch {
      await route.abort().catch(() => {});
    }
  });
}

// Runs inside the page: hide anything fixed or sticky that isn't the header, in the page and every shadow root.
function hideFloating() {
  document.documentElement.style.overflow = "auto";
  if (document.body) document.body.style.overflow = "auto";
  const vw = innerWidth;
  const vh = innerHeight;
  const roots = [document];
  for (let i = 0; i < roots.length && i < 200; i++) {
    for (const el of roots[i].querySelectorAll("*")) {
      if (el.shadowRoot) roots.push(el.shadowRoot);
      const cs = getComputedStyle(el);
      if (cs.position !== "fixed" && cs.position !== "sticky") continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (r.width * r.height > vw * vh * 0.45 || r.top > 90) el.style.setProperty("display", "none", "important");
    }
  }
}

// Runs inside the frame page: true when the screenshot is close to one flat color (a blank or loading page).
async function blankShot() {
  const img = document.querySelector("img.shot");
  if (!img) return true;
  await img.decode().catch(() => {});
  const c = document.createElement("canvas");
  c.width = 144;
  c.height = 90;
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0, 144, 90);
  const d = g.getImageData(0, 0, 144, 90).data;
  let sum = 0;
  let sq = 0;
  const n = d.length / 4;
  for (let i = 0; i < d.length; i += 4) {
    const v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    sum += v;
    sq += v * v;
  }
  const mean = sum / n;
  return Math.sqrt(Math.max(0, sq / n - mean * mean)) < 6;
}

/** Picture #canvas of a page the app built. Fonts and pictures load first. */
async function pictureCanvas(chromium, html) {
  const context = await (await shared(chromium)).newContext({ viewport: { width: 1600, height: 900 }, serviceWorkers: "block", acceptDownloads: false });
  try {
    await publicOnly(context, Date.now() + SHOT_MS);
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: "networkidle", timeout: SHOT_MS }).catch(() => {}); // fonts that don't load fall back
    await page.evaluate(() => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 5_000))]));
    await page.evaluate(() => Promise.all([...document.images].map((i) => (i.complete ? null : i.decode().catch(() => null)))));
    return { page, context };
  } catch (e) {
    await context.close().catch(() => {});
    throw e;
  }
}

async function canvasBytes(page, type) {
  const el = await page.$("#canvas");
  if (!el) throw new Error("The image page has no canvas.");
  const box = await el.boundingBox();
  if (!box || box.height > 8000) throw new Error("The image is the wrong size.");
  const bytes = await el.screenshot(type === "png" ? { type: "png" } : { type: "jpeg", quality: 82 });
  return { bytes, width: Math.round(box.width), height: Math.round(box.height), type };
}

/** A screenshot of a page in its frame, or { final } when the page blocked the bot or came back blank. */
async function screenshot(chromium, task) {
  const context = await (await shared(chromium)).newContext({ userAgent: READER_UA, viewport: { width: 1440, height: 900 }, locale: "en-US", serviceWorkers: "block", acceptDownloads: false });
  let shot;
  try {
    const deadline = Date.now() + SHOT_MS;
    await publicOnly(context, deadline, ["media"]);
    const page = await context.newPage();
    page.on("dialog", (d) => d.dismiss().catch(() => {}));
    const res = await page.goto(task.url, { waitUntil: "domcontentloaded", timeout: SHOT_MS });
    const status = res?.status() ?? 0;
    if (status === 401 || status === 403 || status === 407 || status === 429) return { final: true, error: `The page answered ${status}.` };
    if (!res || status >= 400) return { final: status >= 400 && status < 500, error: `The page answered ${status || "nothing"}.` };
    if (!(await publicUrl(page.url()))) return { final: true, error: "The page went to a private network." };
    await page.waitForLoadState("load", { timeout: Math.max(1_000, deadline - Date.now()) }).catch(() => {});
    await sleep(2_500);
    for (const name of ACCEPT) {
      const b = page.getByRole("button", { name, exact: true }).first();
      if (await b.isVisible({ timeout: 150 }).catch(() => false)) {
        await b.click({ timeout: 1_500 }).catch(() => {});
        await sleep(700);
        break;
      }
    }
    await page.keyboard.press("Escape").catch(() => {});
    // Scroll down and back so pictures that load late are in.
    await page.evaluate(async () => {
      for (let y = 0; y < 2400; y += 600) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 150));
      }
      window.scrollTo(0, 0);
    });
    await sleep(1_200);
    await page.addStyleTag({ content: HIDE_CSS }).catch(() => {});
    await page.evaluate(hideFloating).catch(() => {});
    await sleep(400);
    const said = `${await page.title().catch(() => "")} ${await page.evaluate(() => (document.body ? document.body.innerText.slice(0, 600) : "")).catch(() => "")}`;
    if (BLOCKED.test(said)) return { final: true, error: "The page asked to prove a person is visiting." };
    shot = await page.screenshot({ type: "jpeg", quality: 88 });
  } finally {
    await context.close().catch(() => {});
  }
  const { page, context: frame } = await pictureCanvas(chromium, task.html.replace(SHOT_SLOT, `data:image/jpeg;base64,${shot.toString("base64")}`));
  try {
    if (await page.evaluate(blankShot)) return { final: true, error: "The page came back blank." };
    return await canvasBytes(page, "jpg");
  } finally {
    await frame.close().catch(() => {});
  }
}

async function drawn(chromium, task) {
  const { page, context } = await pictureCanvas(chromium, task.html);
  try {
    return await canvasBytes(page, "png");
  } finally {
    await context.close().catch(() => {});
  }
}

async function images(chromium, n) {
  const worker = `image-${machine}-${n}`;
  let failures = 0;
  while (!stop) {
    let task = null;
    try {
      const res = await fetch(`${url}/api/writer/image-next?worker=${worker}`, { method: "POST", headers: auth, signal: AbortSignal.timeout(60_000) });
      if (res.status === 401) {
        console.error("Wrong WORKER_SECRET or CRON_SECRET.");
        process.exit(1);
      }
      task = await res.json().catch(() => null);
    } catch (e) {
      task = { error: e instanceof Error ? e.message : String(e) };
    }
    if (!task || task.error) {
      failures++;
      console.error("image poll failed:", JSON.stringify(task));
      await sleep(Math.min(120_000, 5_000 * 2 ** Math.min(failures, 5)));
      continue;
    }
    failures = 0;
    if (task.idle) {
      await sleep(imageIdle);
      continue;
    }
    const started = Date.now();
    let out;
    try {
      const late = sleep(SHOT_MS * 2 + 20_000).then(() => ({ final: false, error: "Making the image took too long." }));
      out = await Promise.race([task.kind === "screenshot" ? screenshot(chromium, task) : drawn(chromium, task), late]);
    } catch (e) {
      out = { final: false, error: (e instanceof Error ? e.message : String(e)).split("\n")[0].slice(0, 300) };
    }
    const done = `${url}/api/writer/image-done?id=${task.id}&worker=${worker}`;
    const sent = await (out.bytes
      ? fetch(`${done}&w=${out.width}&h=${out.height}`, { method: "POST", headers: { ...auth, "Content-Type": out.type === "png" ? "image/png" : "image/jpeg" }, body: out.bytes, signal: AbortSignal.timeout(60_000) })
      : fetch(done, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ error: out.error, final: out.final === true }), signal: AbortSignal.timeout(30_000) })
    )
      .then((r) => r.ok)
      .catch(() => false);
    console.log(`image ${task.id} (${task.kind}): ${out.bytes ? `${Math.round(out.bytes.length / 1024)} KB` : out.error} in ${Date.now() - started} ms${sent ? "" : " (not saved)"}`);
  }
}

const chromium = await chromiumOrNull();
if (!chromium) console.log("No playwright-core here, so report PDFs, page reading and images are off.");
await Promise.all([
  jobs(),
  ...(chromium ? [pdfs(chromium), ...Array.from({ length: readers }, (_, i) => pages(chromium, i)), ...Array.from({ length: imagers }, (_, i) => images(chromium, i))] : []),
]);
await browser?.close().catch(() => {});
