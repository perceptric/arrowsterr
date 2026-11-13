// End-to-end check of Audit's crawler (docs/audit-plan.md, section 10): a local test site with redirects, a loop,
// a flaky page, a slow page, a robots.txt block, an endless calendar, an orphan and a noindex page; an in-memory
// stand-in for the database; and the real crawl code (src/lib/audit/crawlServer.ts) run turn by turn.
// It checks one long turn, many short turns, turns killed mid-batch, two jobs racing, a firewall and the page limit.
// Not in npm test: it loads server code through jiti (a dependency of Tailwind). Run it from the repo root:
//   FREE_TEST_RESOLVE=127.0.0.1 node scripts/audit-crawl-check.mjs
import http from "node:http";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { createJiti } = await import(path.join(REPO, "node_modules/jiti/lib/jiti.mjs"));
const jiti = createJiti(import.meta.url, { alias: { "server-only": path.join(REPO, "node_modules/server-only/empty.js"), "@": path.join(REPO, "src") }, interopDefault: true });

// ─────────────── the test site ───────────────
let flakyHits = 0;
let fetches = 0;
const html = (body, head = "") => `<!doctype html><html><head><title>${body.slice(0, 20)}</title>${head}</head><body>${body}</body></html>`;
const nav = `<header><nav><a href="/">Home</a><a href="/about">About</a><a href="/blog">Blog</a></nav></header>`;
const para = "<p>We wrote this page for the test site so it has a few real sentences of text in it.</p>";
function pagesFor(base) {
  const pages = {
    "/robots.txt": [200, "text/plain", `User-agent: *\nDisallow: /private\nSitemap: ${base}/sitemap.xml\n`],
    "/sitemap.xml": [200, "application/xml", `<?xml version="1.0"?><urlset><url><loc>${base}/</loc></url><url><loc>${base}/about</loc></url><url><loc>${base}/orphan</loc><lastmod>2026-10-01</lastmod></url><url><loc>${base}/noindexed</loc></url><url><loc>${base}/gone</loc></url></urlset>`],
    "/": [200, "text/html", html(`${nav}<main><h1>Home</h1>${para}<a href="/old">Old</a><a href="/slow">Slow</a><a href="/private/x">Private</a><a href="https://example.com/">Out</a><a href="/file.pdf">PDF</a><a href="/events?month=2026-01">Events</a><a href="/blog?utm_source=x">Blog again</a></main><footer><a href="/about">About</a></footer>`)],
    "/about": [200, "text/html", html(`${nav}<main><h1>About</h1>${para}<a href="/team">Team</a><a href="/loop1">Loop</a><a href="/noindexed">Hidden</a></main>`)],
    "/team": [200, "text/html", html(`${nav}<main><h1>Team</h1>${para}</main>`)],
    "/blog": [200, "text/html", html(`${nav}<main><h1>Blog</h1>${para}${[1, 2, 3, 4, 5].map((n) => `<a href="/blog/post-${n}">Post ${n}</a>`).join("")}<a href="/blog?page=2">Next</a></main>`)],
    "/blog?page=2": [200, "text/html", html(`${nav}<main><h1>Blog page 2</h1>${para}</main>`)],
    "/new": [200, "text/html", html(`${nav}<main><h1>New</h1>${para}</main>`)],
    "/slow": [200, "text/html", html(`${nav}<main><h1>Slow</h1>${para}</main>`)],
    "/orphan": [200, "text/html", html(`<main><h1>Orphan</h1>${para}</main>`)],
    "/noindexed": [200, "text/html", html(`${nav}<main><h1>Hidden</h1>${para}</main>`, '<meta name="robots" content="noindex">')],
    "/private/x": [200, "text/html", html("<h1>Private</h1>")],
  };
  for (const n of [1, 2, 3, 4, 5]) pages[`/blog/post-${n}`] = [200, "text/html", html(`${nav}<main><h1>Post ${n}</h1>${para}<a href="/blog">All posts</a><a href="/broken">Broken</a><a href="/flaky">Flaky</a></main>`)];
  return pages;
}
function site() {
  const redirects = { "/old": "/older", "/older": "/new", "/loop1": "/loop2", "/loop2": "/loop1" };
  return http.createServer((req, res) => {
    fetches++;
    const base = `http://${req.headers.host}`;
    const pages = pagesFor(base);
    const url = new URL(req.url, base);
    const key = url.pathname + url.search;
    if (redirects[url.pathname]) {
      res.writeHead(301, { Location: redirects[url.pathname] });
      return res.end();
    }
    if (url.pathname === "/flaky") {
      flakyHits++;
      if (flakyHits === 1) {
        res.writeHead(500);
        return res.end("oops");
      }
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end(html(`${nav}<main><h1>Flaky</h1>${para}</main>`));
    }
    if (url.pathname.startsWith("/events")) {
      const m = Number(url.searchParams.get("month")?.slice(5) ?? 1);
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end(html(`<a href="/events?month=2026-${String(m + 1).padStart(2, "0")}">Next month</a>`));
    }
    const page = pages[key] ?? pages[url.pathname];
    if (!page) {
      res.writeHead(404, { "Content-Type": "text/html" });
      return res.end(html("<h1>Not found</h1>"));
    }
    const send = () => {
      res.writeHead(page[0], { "Content-Type": page[1] });
      res.end(page[2]);
    };
    if (url.pathname === "/slow") setTimeout(send, 1500);
    else send();
  });
}

// ─────────────── an in-memory database with the parts of the Supabase client the crawl uses ───────────────
const KEYS = { audits: ["id"], audit_urls: ["audit_id", "url_hash"], audit_pages: ["audit_id", "url_hash"], audit_links: ["id"], brands: ["id"], runs: ["id"] };
const DEFAULTS = {
  audits: () => ({ status: "queued", stage: "seed", runtime: {}, resumes: 0, pages_found: 0, pages_done: 0, over_limit: 0, lease_until: null, partial_reason: null, stats: null }),
  audit_urls: () => ({ state: "queued", tries: 0, retry_at: null, in_sitemap: false, lastmod: null, skip_reason: null }),
  audit_pages: () => ({ links_to: [], body_links_to: [], h1: [], h2: [], depth: null, links_in: 0, body_links_in: 0, link_score: 0, orphan: false, bad_links_out: 0, value: 0, ai_citations: 0 }),
  audit_links: () => ({}),
};
class Db {
  tables = {};
  serial = 0;
  rows(t) {
    return (this.tables[t] ??= []);
  }
  from(t) {
    return new Query(this, t);
  }
}
class Query {
  constructor(db, t) {
    Object.assign(this, { db, t, filters: [], orders: [], op: "select", lim: null, rng: null, one: null, ret: false, countHead: false });
  }
  select(_cols, opts) {
    if (this.op === "select") this.op = "select";
    else this.ret = true;
    if (opts?.count) this.countHead = Boolean(opts.head);
    return this;
  }
  eq(c, v) { this.filters.push((r) => r[c] === v); return this; }
  neq(c, v) { this.filters.push((r) => r[c] !== v); return this; }
  lt(c, v) { this.filters.push((r) => r[c] != null && r[c] < v); return this; }
  gte(c, v) { this.filters.push((r) => r[c] != null && r[c] >= v); return this; }
  in(c, list) { const s = new Set(list); this.filters.push((r) => s.has(r[c])); return this; }
  is(c, v) { this.filters.push((r) => (r[c] ?? null) === v); return this; }
  not(c, op, v) {
    if (op === "in") { const s = new Set(v.replace(/[()]/g, "").split(",")); this.filters.push((r) => !s.has(r[c])); }
    else if (op === "is") this.filters.push((r) => (r[c] ?? null) !== null);
    return this;
  }
  or(expr) {
    const parts = expr.split(",").map((p) => { const [c, op, ...rest] = p.split("."); return { c, op, v: rest.join(".") }; });
    this.filters.push((r) => parts.some(({ c, op, v }) => (op === "is" ? (r[c] ?? null) === null : op === "lte" ? r[c] != null && r[c] <= v : op === "lt" ? r[c] != null && r[c] < v : false)));
    return this;
  }
  order(c, o = {}) { this.orders.push([c, o.ascending !== false]); return this; }
  limit(n) { this.lim = n; return this; }
  range(a, b) { this.rng = [a, b]; return this; }
  maybeSingle() { this.one = "maybe"; return this; }
  single() { this.one = "single"; return this; }
  insert(rows) { this.op = "insert"; this.payload = [rows].flat(); return this; }
  upsert(rows, opts = {}) { this.op = "upsert"; this.payload = [rows].flat(); this.opts = opts; return this; }
  update(patch) { this.op = "update"; this.payload = patch; return this; }
  delete() { this.op = "delete"; return this; }
  match(r) { return this.filters.every((f) => f(r)); }
  key(r) { return (this.opts?.onConflict?.split(",") ?? KEYS[this.t]).map((k) => r[k]).join("|"); }
  run() {
    const rows = this.db.rows(this.t);
    const clone = (x) => structuredClone(x);
    let out = [];
    if (this.op === "insert" || this.op === "upsert") {
      const index = new Map(rows.map((r, i) => [this.key(r), i]));
      for (const raw of this.payload) {
        const row = clone(raw);
        const k = this.key({ ...(this.t === "audits" && !row.id ? { id: "x" } : {}), ...row });
        if (this.op === "upsert" && index.has(k)) {
          if (!this.opts.ignoreDuplicates) Object.assign(rows[index.get(k)], row);
          out.push(rows[index.get(k)]);
          continue;
        }
        const full = { ...(DEFAULTS[this.t]?.() ?? {}), ...row };
        if (this.t === "audits" && !full.id) full.id = `audit-${++this.db.serial}`;
        if (!full.id && (this.t === "audit_links" || this.t === "audit_urls")) full.id = ++this.db.serial;
        rows.push(full);
        index.set(this.key(full), rows.length - 1);
        out.push(full);
      }
    } else if (this.op === "update") {
      out = rows.filter((r) => this.match(r));
      for (const r of out) Object.assign(r, clone(this.payload));
    } else if (this.op === "delete") {
      this.db.tables[this.t] = rows.filter((r) => !this.match(r));
      return { data: null, error: null };
    } else {
      out = rows.filter((r) => this.match(r));
      for (const [c, asc] of [...this.orders].reverse()) out = [...out].sort((a, b) => (a[c] === b[c] ? 0 : a[c] == null ? 1 : b[c] == null ? -1 : (a[c] < b[c] ? -1 : 1) * (asc ? 1 : -1)));
      if (this.countHead) return { data: null, error: null, count: out.length };
      if (this.rng) out = out.slice(this.rng[0], this.rng[1] + 1);
      if (this.lim != null) out = out.slice(0, this.lim);
    }
    const data = out.map(clone);
    if (this.one) return { data: data[0] ?? null, error: this.one === "single" && !data.length ? { message: "no row" } : null };
    return { data: this.op === "select" || this.ret ? data : null, error: null, count: data.length };
  }
  then(ok, bad) { try { return Promise.resolve(this.run()).then(ok, bad); } catch (e) { return Promise.reject(e).then(ok, bad); } }
}

// ─────────────── run ───────────────
const { runTurn } = await jiti.import(path.join(REPO, "src/lib/audit/crawlServer.ts"));

const server = site();
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const base = `http://acme.test:${port}`;

async function crawl(turnMs, label) {
  flakyHits = 0;
  fetches = 0;
  const db = new Db();
  const settings = { start: `${base}/`, subdomains: false, include: [], exclude: [], speed: "fast", limit: 200 };
  db.rows("audits").push({ ...DEFAULTS.audits(), id: "a1", workspace_id: "w1", brand_id: "b1", root: `${base}/`, settings, started_at: null });
  let turns = 0;
  const t0 = Date.now();
  for (;;) {
    turns++;
    const out = await runTurn(db, "a1", Date.now() + turnMs);
    if (out.done) break;
    if (out.wait > 1) for (const r of db.rows("audit_urls")) if (r.retry_at) r.retry_at = new Date(Date.now() - 1000).toISOString(); // skip the wait
    if (turns > 500) throw new Error("too many turns");
  }
  const audit = db.rows("audits")[0];
  console.log(`${label}: ${turns} turns, ${fetches} requests, ${((Date.now() - t0) / 1000).toFixed(1)} s, status ${audit.status}${audit.partial_reason ? ` (${audit.partial_reason})` : ""}`);
  return { db, audit };
}

const p = (db, pathname) => db.rows("audit_pages").find((r) => new URL(r.url).pathname + new URL(r.url).search === pathname);
const { db, audit } = await crawl(85_000, "One long turn");
assert.equal(audit.status, "done");
assert.equal(audit.stage, "done");
const urls = db.rows("audit_pages").map((r) => new URL(r.url).pathname + new URL(r.url).search).sort();
console.log("Pages:", urls.join(" "));
assert.deepEqual(urls, ["/", "/about", "/blog", "/blog/post-1", "/blog/post-2", "/blog/post-3", "/blog/post-4", "/blog/post-5", "/blog?page=2", "/broken", "/flaky", "/gone", "/loop1", "/new", "/noindexed", "/old", "/orphan", "/slow", "/team"]);
assert.equal(p(db, "/").depth, 0);
assert.equal(p(db, "/about").depth, 1);
assert.equal(p(db, "/new").depth, 1); // through the redirect chain
assert.equal(p(db, "/team").depth, 2);
assert.equal(p(db, "/flaky").depth, 3);
assert.equal(p(db, "/flaky").status, 200); // failed once, then loaded on the retry
assert.equal(p(db, "/old").status, 301);
assert.equal(p(db, "/old").final_url, `${base}/new`);
assert.equal(p(db, "/old").redirect_chain.length, 3);
assert.equal(p(db, "/loop1").status, 301);
assert.equal(p(db, "/loop1").error, "Redirect loop");
assert.equal(p(db, "/loop1").final_url, null);
assert.equal(p(db, "/broken").status, 404);
assert.equal(p(db, "/orphan").orphan, true);
assert.equal(p(db, "/orphan").in_sitemap, true);
assert.equal(p(db, "/orphan").sitemap_lastmod, "2026-10-01T00:00:00.000Z");
assert.equal(db.rows("audit_pages").filter((r) => r.orphan).length, 1);
assert.equal(p(db, "/noindexed").indexable, false);
assert.equal(p(db, "/").indexable, true);
assert.equal(p(db, "/").bad_links_out, 1); // the redirect
assert.equal(p(db, "/blog/post-1").bad_links_out, 1); // the 404
assert.equal(p(db, "/about").bad_links_out, 1); // the loop
assert.equal(Math.max(...db.rows("audit_pages").map((r) => r.link_score)), 10);
assert.equal(p(db, "/blog").link_score, 10); // linked from the nav and from every post
assert.ok(p(db, "/").link_score >= 9);
assert.equal(p(db, "/").links_in, 13); // every page with the nav, once each
assert.equal(p(db, "/blog").links_in, 13); // the nav and the posts, still once per page
assert.equal(p(db, "/blog/post-1").links_in, 1);
assert.ok(p(db, "/blog/post-1").link_score < p(db, "/blog").link_score);
const homeLinks = db.rows("audit_links").filter((l) => l.from_hash === p(db, "/").url_hash);
assert.ok(homeLinks.some((l) => l.place === "nav") && homeLinks.some((l) => l.place === "body") && homeLinks.some((l) => l.place === "footer"));
assert.ok(!db.rows("audit_pages").some((r) => r.url.includes("/events")), "the endless calendar is never crawled");
assert.ok(!db.rows("audit_pages").some((r) => r.url.includes("/private")), "robots.txt is respected");
assert.ok(!db.rows("audit_pages").some((r) => r.url.includes("utm_source")), "tracking parameters are dropped");
assert.equal(audit.stats.orphans, 1);
assert.equal(audit.stats.redirects, 2); // /old and the loop
assert.equal(audit.stats.broken, 2);
assert.equal(audit.stats.noAnswer, 0);
assert.equal(audit.stats.notIndexable, 1);
assert.equal(db.rows("audit_urls").length, 0, "the queue is cleared when the crawl ends");
console.log("Stats:", JSON.stringify(audit.stats));

// The same crawl split into many tiny turns must give the same pages and the same graph.
const split = await crawl(300, "Many short turns");
const facts = (d) => d.rows("audit_pages").map((r) => [r.url, r.status, r.depth, r.links_in, r.link_score, r.orphan, r.bad_links_out, r.indexable].join(" ")).sort();
assert.deepEqual(facts(split.db), facts(db));

// A turn that dies after reading a batch but before saving it (the worker was killed): the next turn reads those
// pages again, and the crawl ends the same.
{
  const d2 = new Db();
  d2.rows("audits").push({ ...DEFAULTS.audits(), id: "a1", workspace_id: "w1", brand_id: "b1", root: `${base}/`, settings: { start: `${base}/`, subdomains: false, include: [], exclude: [], speed: "fast", limit: 200 } });
  flakyHits = 0;
  let killed = 0;
  const realFrom = d2.from.bind(d2);
  d2.from = (t) => {
    if (t === "audit_pages" && killed < 3 && d2.rows("audit_pages").length > 2) {
      killed++;
      const q = realFrom(t);
      const up = q.upsert.bind(q);
      q.upsert = () => { throw new Error("worker killed"); };
      void up;
      return q;
    }
    return realFrom(t);
  };
  for (let i = 0; i < 500; i++) {
    let out;
    try {
      out = await runTurn(d2, "a1", Date.now() + 300);
    } catch {
      continue; // the job would be retried
    }
    if (out.done) break;
    if (out.wait > 1) for (const r of d2.rows("audit_urls")) if (r.retry_at) r.retry_at = new Date(Date.now() - 1000).toISOString();
  }
  assert.equal(killed, 3);
  assert.deepEqual(facts(d2), facts(db));
  console.log("Killed 3 turns mid-batch: same result.");
}

// A second job for the same crawl while one holds it does nothing.
{
  const d3 = new Db();
  d3.rows("audits").push({ ...DEFAULTS.audits(), id: "a1", workspace_id: "w1", brand_id: "b1", root: `${base}/`, settings: { start: `${base}/`, subdomains: false, include: [], exclude: [], speed: "fast", limit: 200 }, lease_until: new Date(Date.now() + 60_000).toISOString() });
  const out = await runTurn(d3, "a1", Date.now() + 1000);
  assert.equal(out.done, true);
  assert.equal(d3.rows("audits")[0].stage, "seed");
  console.log("A second job left the crawl to the one holding it.");
}

// A firewall that challenges our bot on the home page stops the crawl with that reason.
{
  const wall = http.createServer((req, res) => {
    if (req.url === "/robots.txt") { res.writeHead(404); return res.end(); }
    res.writeHead(403, { "Content-Type": "text/html" });
    res.end("<title>Just a moment...</title><script src=/cdn-cgi/challenge-platform/h/b></script>");
  });
  await new Promise((r) => wall.listen(0, "127.0.0.1", r));
  const d4 = new Db();
  const start = `http://wall.test:${wall.address().port}/`;
  d4.rows("audits").push({ ...DEFAULTS.audits(), id: "a1", workspace_id: "w1", brand_id: "b1", root: start, settings: { start, subdomains: false, include: [], exclude: [], speed: "fast", limit: 50 } });
  for (let i = 0; i < 20; i++) if ((await runTurn(d4, "a1", Date.now() + 5000)).done) break;
  assert.equal(d4.rows("audits")[0].status, "failed");
  assert.equal(d4.rows("audits")[0].partial_reason, "firewall");
  assert.equal(d4.rows("audit_pages").length, 0);
  wall.close();
  console.log("Firewall: the crawl stopped with the firewall message, no fake broken pages.");
}

// The page limit holds.
{
  const d5 = new Db();
  d5.rows("audits").push({ ...DEFAULTS.audits(), id: "a1", workspace_id: "w1", brand_id: "b1", root: `${base}/`, settings: { start: `${base}/`, subdomains: false, include: [], exclude: [], speed: "fast", limit: 8 } });
  flakyHits = 0;
  for (let i = 0; i < 100; i++) {
    const out = await runTurn(d5, "a1", Date.now() + 20_000);
    if (out.done) break;
    if (out.wait > 1) for (const r of d5.rows("audit_urls")) if (r.retry_at) r.retry_at = new Date(Date.now() - 1000).toISOString();
  }
  const a5 = d5.rows("audits")[0];
  assert.ok(d5.rows("audit_pages").length <= 9, `read ${d5.rows("audit_pages").length}`); // 8, plus a redirect's landing page
  assert.ok(a5.over_limit > 0);
  console.log(`Limit of 8: read ${d5.rows("audit_pages").length} pages, ${a5.over_limit} more found.`);
}

server.close();
console.log("All end-to-end checks passed.");
