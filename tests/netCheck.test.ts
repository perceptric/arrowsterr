import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isIP } from "node:net";
import { test } from "node:test";
import { privateHost, privateIp, publicAddress, v6Groups } from "../src/lib/netCheck.ts";

// Addresses that must never be fetched, in the forms people use to sneak past a check.
const PRIVATE = [
  "127.0.0.1",
  "10.0.0.1",
  "172.16.5.4",
  "192.168.0.1",
  "100.64.0.1",
  "100.127.255.255",
  "169.254.169.254",
  "0.0.0.0",
  "224.0.0.1",
  "::",
  "::1",
  "[::1]",
  "::ffff:127.0.0.1",
  "::ffff:7f00:1", // what new URL("http://[::ffff:127.0.0.1]/").hostname gives
  "::ffff:a9fe:a9fe", // 169.254.169.254, mapped
  "::ffff:0:7f00:1",
  "::7f00:1", // IPv4 compatible
  "::127.0.0.1",
  "64:ff9b::7f00:1", // NAT64
  "64:ff9b::808:808",
  "64:ff9b:1::1",
  "2002:7f00:1::", // 6to4
  "2001:0:4136:e378::1", // Teredo
  "fc00::1",
  "fd12:3456::1",
  "fdaa::3", // Fly's private network
  "fdaa:0:1:a7b::2",
  "fe80::1",
  "fe80::1%eth0",
  "febf::1",
  "ff02::1",
  "not an address",
];
const PUBLIC = ["8.8.8.8", "1.1.1.1", "172.32.0.1", "100.128.0.1", "::ffff:8.8.8.8", "::ffff:808:808", "2606:4700::1111", "2a00:1450:4001:80b::200e"];

test("private, local, metadata and disguised IPv6 addresses are refused, public ones pass", () => {
  for (const ip of PRIVATE) assert.equal(privateIp(ip), true, ip);
  for (const ip of PUBLIC) assert.equal(privateIp(ip), false, ip);
});

test("the URL parser's rewrite of a mapped loopback address is still caught", () => {
  const host = new URL("http://[::ffff:127.0.0.1]/").hostname;
  assert.equal(host, "[::ffff:7f00:1]");
  assert.equal(privateIp(host), true);
  assert.equal(publicAddress("http://[::ffff:127.0.0.1]/"), false);
  assert.equal(publicAddress("http://[64:ff9b::a9fe:a9fe]/latest/meta-data"), false);
  assert.equal(publicAddress("http://169.254.169.254/latest/meta-data"), false);
  assert.equal(publicAddress("http://0x7f.1/"), false, "the URL parser turns this into 127.0.0.1");
  assert.equal(publicAddress("https://example.com/page"), true);
});

test("IPv6 groups expand every short form", () => {
  assert.deepEqual(v6Groups("::"), [0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(v6Groups("::ffff:1.2.3.4"), [0, 0, 0, 0, 0, 0xffff, 0x102, 0x304]);
  assert.deepEqual(v6Groups("fdaa::1"), [0xfdaa, 0, 0, 0, 0, 0, 0, 1]);
  assert.equal(v6Groups("1::2::3"), null);
  assert.equal(v6Groups("::ffff:1.2.3.999"), null);
});

test("local names are refused before DNS", () => {
  for (const h of ["localhost", "LOCALHOST", "db.internal", "printer.local", "app.flycast", "intranet", "metadata", "", "[::1]"]) assert.equal(privateHost(h), true, h);
  for (const h of ["example.com", "www.example.co.uk", "8.8.8.8"]) assert.equal(privateHost(h), false, h);
  assert.equal(publicAddress("ftp://example.com/"), false);
  assert.equal(publicAddress("https://user:pass@example.com/"), false);
});

test("the worker's own copy agrees with netCheck.ts", () => {
  const src = readFileSync(new URL("../scripts/worker.mjs", import.meta.url), "utf8");
  const body = src.slice(src.indexOf("function privateV4(ip)"), src.indexOf("const hosts = new Map();"));
  const workerPrivate = new Function("isIP", `${body}; return privateIp;`)(isIP) as (ip: string) => boolean;
  for (const ip of [...PRIVATE, ...PUBLIC]) assert.equal(workerPrivate(ip), privateIp(ip), ip);
});
