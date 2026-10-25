import assert from "node:assert/strict";
import { test } from "node:test";
import { onSite } from "../src/lib/auditScope.ts";

test("the audit crawls only the audited domain and its www twin", () => {
  for (const u of ["https://acme.com/", "https://www.acme.com/pricing", "http://acme.com/blog/post", "https://ACME.com/x"]) assert.equal(onSite(u, "acme.com"), true, u);
  assert.equal(onSite("https://acme.com/", "www.acme.com"), true);
  for (const u of [
    "https://blog.acme.com/",
    "https://evil.com/?acme.com",
    "https://acme.com.evil.com/",
    "https://notacme.com/",
    "http://169.254.169.254/latest/meta-data",
    "http://localhost/",
    "ftp://acme.com/file",
    "https://user:pass@acme.com/",
    "not a url",
  ])
    assert.equal(onSite(u, "acme.com"), false, u);
});
