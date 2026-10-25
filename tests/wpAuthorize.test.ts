import { test } from "node:test";
import assert from "node:assert/strict";
import { authorizeUrl, newState, readAnswer, siteAddress, WP_APP_ID } from "../src/lib/wpAuthorize.ts";

test("a typed site address becomes a clean https address, or nothing", () => {
  assert.equal(siteAddress("example.com"), "https://example.com");
  assert.equal(siteAddress(" https://www.example.com/ "), "https://www.example.com");
  assert.equal(siteAddress("https://example.com/blog/wp-admin/profile.php"), "https://example.com/blog");
  assert.equal(siteAddress("http://localhost:8080"), "http://localhost:8080");
  assert.equal(siteAddress("not a site"), "");
  assert.equal(siteAddress(""), "");
});

test("the approve screen names Arrowsterr and comes back to the callback, with a reject address", () => {
  const u = new URL(authorizeUrl("https://example.com", "https://app.arrowsterr.com", "s1"));
  assert.equal(u.origin + u.pathname, "https://example.com/wp-admin/authorize-application.php");
  assert.equal(u.searchParams.get("app_name"), "Arrowsterr");
  assert.equal(u.searchParams.get("app_id"), WP_APP_ID);
  assert.equal(u.searchParams.get("success_url"), "https://app.arrowsterr.com/connect/wordpress?state=s1");
  assert.equal(u.searchParams.get("reject_url"), "https://app.arrowsterr.com/connect/wordpress?state=s1&rejected=1");
});

test("the callback reads WordPress's answer, or says why there isn't one", () => {
  assert.deepEqual(readAnswer(new URLSearchParams("state=s1&site_url=https%3A%2F%2Fexample.com&user_login=admin&password=abcd%20efgh%20ijkl"), "s1"), { ok: true, siteUrl: "https://example.com", username: "admin", appPassword: "abcd efgh ijkl" });
  assert.equal(readAnswer(new URLSearchParams("state=s1&rejected=1"), "s1").ok, false);
  assert.equal(readAnswer(new URLSearchParams("state=s1&site_url=https%3A%2F%2Fexample.com&user_login=admin"), "s1").ok, false);
});

test("a callback without this browser's state is turned away", () => {
  const good = "site_url=https%3A%2F%2Fevil.example&user_login=admin&password=abcd";
  assert.equal(readAnswer(new URLSearchParams(good), "s1").ok, false); // no state at all
  assert.equal(readAnswer(new URLSearchParams(`state=s2&${good}`), "s1").ok, false); // someone else's state
  assert.equal(readAnswer(new URLSearchParams(`state=s1&${good}`), null).ok, false); // this browser never started one
  assert.equal(readAnswer(new URLSearchParams(`state=&${good}`), "").ok, false);
  assert.equal(readAnswer(new URLSearchParams(`state=s1&${good}`), "s1").ok, true);
});

test("each connect gets a new long random state", () => {
  const a = newState();
  assert.match(a, /^[0-9a-f]{48}$/);
  assert.notEqual(a, newState());
});
