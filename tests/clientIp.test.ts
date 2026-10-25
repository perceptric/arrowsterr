import assert from "node:assert/strict";
import { test } from "node:test";
import { clientIp } from "../src/lib/clientIp.ts";

const req = (h: Record<string, string>) => ({ headers: new Headers(h) });

test("Fly's own header wins over anything the visitor sends", () => {
  assert.equal(clientIp(req({ "fly-client-ip": "203.0.113.7", "x-forwarded-for": "1.2.3.4, 203.0.113.7" })), "203.0.113.7");
  assert.equal(clientIp(req({ "fly-client-ip": " 2001:db8::1 " })), "2001:db8::1");
});

test("without it, the last x-forwarded-for entry is used, never the first", () => {
  assert.equal(clientIp(req({ "x-forwarded-for": "6.6.6.6, 198.51.100.2" })), "198.51.100.2", "a made up first entry is ignored");
  assert.equal(clientIp(req({ "x-forwarded-for": "198.51.100.2" })), "198.51.100.2");
  assert.equal(clientIp(req({ "x-forwarded-for": "6.6.6.6,198.51.100.2 , " })), "198.51.100.2", "spaces and empty entries are skipped");
});

test("no address at all reads as unknown, and long values are cut", () => {
  assert.equal(clientIp(req({})), "unknown");
  assert.equal(clientIp(req({ "x-forwarded-for": " , " })), "unknown");
  assert.equal(clientIp(req({ "fly-client-ip": "x".repeat(500) })).length, 64);
});
