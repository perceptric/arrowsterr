import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { appOrigin, shareToken, tokenHash } from "../src/lib/reportLinks.ts";

process.env.REPORT_LINK_SECRET = "test-secret";

test("a token's hash is the plain sha256 hex the migration backfills", () => {
  const token = "a".repeat(64);
  assert.equal(tokenHash(token), createHash("sha256").update(token, "utf8").digest("hex"));
  assert.match(tokenHash(token), /^[a-f0-9]{64}$/);
  assert.notEqual(tokenHash(token), token);
});

test("new tokens come from the link id and the secret, and pass the share page's check", () => {
  const id = "4b1f8a3e-2c7d-4e5f-9a0b-1c2d3e4f5a6b";
  const t = shareToken(id);
  assert.match(t, /^[a-f0-9]{48,64}$/);
  assert.equal(shareToken(id), t, "the same link always rebuilds the same token");
  assert.notEqual(shareToken("4b1f8a3e-2c7d-4e5f-9a0b-1c2d3e4f5a6c"), t);
  process.env.REPORT_LINK_SECRET = "another-secret";
  assert.notEqual(shareToken(id), t, "nobody can make a token without the secret");
  process.env.REPORT_LINK_SECRET = "test-secret";
});

test("share links use APP_URL when it is set", () => {
  const h = new Headers({ host: "app.example.com" });
  const before = process.env.APP_URL;
  delete process.env.APP_URL;
  assert.equal(appOrigin(h), "https://app.example.com");
  process.env.APP_URL = "https://app.arrowsterr.com/";
  assert.equal(appOrigin(h), "https://app.arrowsterr.com");
  if (before === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = before;
});
