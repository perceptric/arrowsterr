import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanDomain, dropAlert, fixPlayOf, isFull, isStuck, issueChanges, matchesPages, pageKey, partialReason, previousFull, scoreToSave, weeklyDue, WEEK_MS, type AuditRow } from "../src/lib/siteAudit.ts";

const page = (url: string, status: number) => ({ url, status });

test("a crawl where most pages time out is partial and gets no score", () => {
  const pages = [page("https://acme.com", 200), page("https://acme.com/a", 0), page("https://acme.com/b", 0), page("https://acme.com/c", 0)];
  const reason = partialReason(pages, "acme.com");
  assert.equal(reason, "3 of 4 pages didn't load.");
  assert.equal(scoreToSave(96, reason), null);
});

test("a crawl where the homepage times out is partial, however many other pages load", () => {
  const pages = [page("https://www.acme.com/", 0), ...Array.from({ length: 9 }, (_, i) => page(`https://acme.com/p${i}`, 200))];
  assert.equal(partialReason(pages, "https://acme.com"), "The homepage didn't load.");
});

test("pages that answer with an error are findings, not a broken crawl", () => {
  const pages = [page("https://acme.com", 200), page("https://acme.com/old", 404), page("https://acme.com/x", 500), page("https://acme.com/y", 0)];
  assert.equal(partialReason(pages, "acme.com"), null);
  assert.equal(scoreToSave(71, null), 71);
});

test("a flaky crawl with exactly half the pages silent still scores, one more silent page does not", () => {
  const half = [page("https://acme.com", 200), page("https://acme.com/a", 200), page("https://acme.com/b", 0), page("https://acme.com/c", 0)];
  assert.equal(partialReason(half, "acme.com"), null);
  assert.notEqual(partialReason([...half, page("https://acme.com/d", 0)], "acme.com"), null);
  assert.equal(partialReason([], "acme.com"), "No pages could be read.");
});

const row = (id: string, score: number | null, extra: Partial<AuditRow> = {}): AuditRow => ({ id, status: "done", score, created_at: "2026-11-01T00:00:00Z", ...extra });

test("the change arrow and the alert skip partial and failed crawls", () => {
  const audits = [row("now", 70), row("partial", null, { result: { partial: "3 of 4 pages didn't load." } }), row("failed", null, { status: "failed" }), row("full", 82)];
  assert.equal(previousFull(audits, audits[0])?.id, "full");
  assert.equal(dropAlert(audits[3], audits[0]), 12);
  assert.equal(isFull(audits[1]), false);
});

test("no alert for a small dip, a rise, or when either side is partial", () => {
  assert.equal(dropAlert(row("a", 82), row("b", 78)), null);
  assert.equal(dropAlert(row("a", 70), row("b", 90)), null);
  assert.equal(dropAlert(row("a", 82), row("b", 50, { result: { partial: "The homepage didn't load." } })), null);
  assert.equal(dropAlert(null, row("b", 50)), null);
  assert.equal(dropAlert(row("a", 82), row("b", 77)), 5);
});

test("issue changes since the last full crawl, with fixed issues listed", () => {
  const prev = [{ id: "missing_alt", count: 10, severity: "medium" as const }, { id: "thin", count: 4, severity: "low" as const }, { id: "slow", count: 2, severity: "low" as const }];
  const now = [{ id: "missing_alt", count: 6, severity: "medium" as const }, { id: "thin", count: 7, severity: "low" as const }, { id: "broken_links", count: 3, severity: "high" as const }];
  const { changes, fixed } = issueChanges(prev, now);
  assert.deepEqual(changes.get("missing_alt"), { kind: "fewer", by: 4 });
  assert.deepEqual(changes.get("thin"), { kind: "more", by: 3 });
  assert.deepEqual(changes.get("broken_links"), { kind: "new" });
  assert.deepEqual(fixed.map((i) => i.id), ["slow"]);
  assert.equal(issueChanges(null, now).changes.size, 0);
});

test("weekly crawls are due a week after the last one, never while one runs or before the first", () => {
  const now = Date.parse("2026-11-09T12:00:00Z");
  const ago = (ms: number) => new Date(now - ms).toISOString();
  assert.equal(weeklyDue({ weekly: true, lastStarted: ago(WEEK_MS), running: false, now }), true);
  assert.equal(weeklyDue({ weekly: true, lastStarted: ago(WEEK_MS - 2 * 3600_000), running: false, now }), true);
  assert.equal(weeklyDue({ weekly: true, lastStarted: ago(5 * 864e5), running: false, now }), false);
  assert.equal(weeklyDue({ weekly: true, lastStarted: ago(WEEK_MS), running: true, now }), false);
  assert.equal(weeklyDue({ weekly: false, lastStarted: ago(WEEK_MS * 2), running: false, now }), false);
  assert.equal(weeklyDue({ weekly: true, lastStarted: null, running: false, now }), false);
});

test("a crawl stuck for 45 minutes no longer blocks the next one", () => {
  const now = Date.parse("2026-11-09T12:00:00Z");
  assert.equal(isStuck({ status: "running", created_at: new Date(now - 50 * 60_000).toISOString() }, now), true);
  assert.equal(isStuck({ status: "running", created_at: new Date(now - 10 * 60_000).toISOString() }, now), false);
  assert.equal(isStuck({ status: "done", created_at: new Date(now - 90 * 60_000).toISOString() }, now), false);
});

test("a fix finds the CMS page for a crawled URL with or without www, slash or case", () => {
  const ids = ["https://acme.com/blog/post", "https://acme.com"];
  assert.equal(matchesPages({ id: "12", url: "https://www.acme.com/blog/post/" }, ids), true);
  assert.equal(matchesPages({ id: "13", url: "http://ACME.com/" }, ids), true);
  assert.equal(matchesPages({ id: "14", url: "https://acme.com/blog/post-2/" }, ids), false);
  assert.equal(matchesPages({ id: "15", url: "https://acme.com/blog/postx" }, ids), false);
  assert.equal(matchesPages({ id: "16", url: "https://other.com/blog/post" }, ids), false);
  assert.equal(matchesPages({ id: "17", url: "" }, ["17"]), true);
  assert.equal(pageKey("https://acme.com/a/?x=1#top"), "acme.com/a?x=1");
});

test("domains are stored bare, and junk is refused", () => {
  assert.equal(cleanDomain("https://www.Acme.com/pricing?x=1"), "acme.com");
  assert.equal(cleanDomain("blog.acme.co.uk"), "blog.acme.co.uk");
  assert.equal(cleanDomain("not a site"), "");
  assert.equal(cleanDomain("localhost"), "");
});

test("only meta, alt and schema issues can start a fix", () => {
  assert.equal(fixPlayOf({ play: "meta" }), "meta");
  assert.equal(fixPlayOf({ play: "links" }), null);
  assert.equal(fixPlayOf({}), null);
});
