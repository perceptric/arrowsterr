import assert from "node:assert/strict";
import { test } from "node:test";
import { aiProspects, boardStats, emailsIn, findLink, moveError, nextCheck, suppressed, unlinkedMention } from "../src/lib/linkBuilding.ts";

test("a card moves to Won only with the page where the link is, and never to Contacted when it's on the do-not-contact list", () => {
  assert.match(moveError("won", null, false)!, /page where the link is/);
  assert.match(moveError("won", "not a url", false)!, /page where the link is/);
  assert.equal(moveError("won", "https://blog.example.com/best-crm", false), null);
  assert.match(moveError("contacted", null, true)!, /do-not-contact/);
  assert.match(moveError("replied", null, true)!, /do-not-contact/);
  assert.equal(moveError("lost", null, true), null);
  assert.equal(moveError("prospect", null, false), null);
});

const page = (body: string) => `<html><body>${body}</body></html>`;

test("the link check finds a link to any page of the brand, www or subdomain, and prefers a followed one", () => {
  const html = page('<a href="https://www.other.com">x</a><a rel="nofollow" href="https://acme.com/a">Acme</a><a href="https://blog.acme.com/post">Acme blog</a>');
  const r = findLink(html, "https://site.com/list", "acme.com");
  assert.equal(r.found, true);
  assert.equal(r.follow, true);
  assert.equal(r.anchor, "Acme blog");
  assert.equal(findLink(page('<a href="/acme">relative</a><a href="https://notacme.com">x</a>'), "https://site.com/", "acme.com").found, false);
  assert.equal(findLink(page('<a rel="sponsored" href="//acme.com">x</a>'), "https://site.com/", "acme.com").follow, false);
});

test("a won link that times out or goes missing once stays won; two failed checks in a row mark it gone", () => {
  let s = { live: true as boolean | null, misses: 0 };
  s = nextCheck(s, "error");
  assert.deepEqual(s, { live: true, misses: 1 });
  s = nextCheck(s, "found");
  assert.deepEqual(s, { live: true, misses: 0 });
  s = nextCheck(s, "missing");
  assert.equal(s.live, true);
  s = nextCheck(s, "error");
  assert.deepEqual(s, { live: false, misses: 2 });
  assert.deepEqual(nextCheck({ live: null, misses: 0 }, "missing"), { live: null, misses: 1 });
});

test("the do-not-contact list matches the email, the email's domain, or the site and its subdomains", () => {
  const list = new Set(["jane@news.com", "blocked.io", "competitor.com"]);
  assert.equal(suppressed({ domain: "news.com", email: "jane@news.com" }, list), true);
  assert.equal(suppressed({ domain: "other.org", email: "x@blocked.io" }, list), true);
  assert.equal(suppressed({ domain: "blog.competitor.com" }, list), true);
  assert.equal(suppressed({ domain: "news.com", email: "editor@news.com" }, list), false);
  assert.equal(suppressed({ domain: "notcompetitor.com" }, list), false);
  assert.equal(suppressed({}, list), false);
});

test("contact emails: role addresses on the site's own domain first, junk dropped", () => {
  const html = page('<a href="mailto:Support@site.com">s</a> Write to editor@site.com or jane.doe@gmail.com. <img src="logo@2x.png"> noreply@site.com hello@site.com user@example.com');
  assert.deepEqual(emailsIn(html, "www.site.com"), ["editor@site.com", "hello@site.com", "support@site.com", "jane.doe@gmail.com"]);
  assert.deepEqual(emailsIn(page("No emails here."), "site.com"), []);
  // Error-tracking addresses in page code are not contacts.
  assert.deepEqual(emailsIn(page("ce1a6e4081594e5e6d533e8e4fc66a0c@o4510320006397952.ingest.us.sentry.io x@sentry-next.wixpress.com"), "site.com"), []);
});

test("AI prospects: sites cited in answers that name a rival and not the brand, no forums, the brand or rivals", () => {
  const brand = { name: "Acme", domain: "acme.com" };
  const rivals = [{ name: "Rival", domain: "rival.com" }, { name: "Other", domain: "other.io" }];
  const chats = [
    { brands: [{ name: "Rival" }], sources: [{ url: "https://techradar.com/best-crm", domain: "techradar.com" }, { url: "https://reddit.com/r/crm" }, { url: "https://rival.com/" }, { url: "https://www.g2.com/crm" }] },
    { brands: [{ name: "Rival" }, { name: "Other" }], sources: [{ url: "https://techradar.com/best-crm" }, { url: "https://acme.com/x" }] },
    { brands: [{ name: "Acme" }, { name: "Rival" }], sources: [{ url: "https://zdnet.com/crm" }] },
    { brands: [{ name: "Nobody" }], sources: [{ url: "https://cnet.com/crm" }] },
  ];
  const p = aiProspects(chats, brand, rivals);
  assert.deepEqual(p.map((x) => x.domain), ["techradar.com", "g2.com"]);
  assert.equal(p[0].url, "https://techradar.com/best-crm");
  assert.match(p[0].note, /2× in answers that name Rival and Other and not Acme/);
});

test("an unlinked mention names the brand as a word and doesn't link to it", () => {
  const brand = { name: "Acme", domain: "acme.com" };
  assert.equal(unlinkedMention(page("<p>We tried Acme and liked it.</p>"), "https://blog.com/a", brand), true);
  assert.equal(unlinkedMention(page('<p>We tried <a href="https://acme.com">Acme</a>.</p>'), "https://blog.com/a", brand), false);
  assert.equal(unlinkedMention(page("<p>Acmeville is a town.</p>"), "https://blog.com/a", brand), false);
  assert.equal(unlinkedMention(page("<p>Acme</p>"), "https://www.acme.com/about", brand), false);
});

test("board stats count columns, reply rate and won links that went missing", () => {
  const s = boardStats([{ stage: "prospect" }, { stage: "contacted" }, { stage: "replied" }, { stage: "won", link_live: true }, { stage: "won", link_live: false }, { stage: "lost" }]);
  assert.deepEqual(s, { prospects: 1, reached: 5, replyRate: 60, won: 2, gone: 1 });
});
