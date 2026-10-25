import assert from "node:assert/strict";
import { test } from "node:test";
import { isSealed, openConfig, openSecret, sealConfig, sealSecret } from "../src/lib/sealed.ts";

function withEnv(env: Record<string, string | undefined>, fn: () => void) {
  const keys = ["SECRETS_KEY", "GOOGLE_TOKEN_KEY", "SUPABASE_SECRET_KEY"];
  const before = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  for (const k of keys) delete process.env[k];
  Object.assign(process.env, Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined)));
  try {
    fn();
  } finally {
    for (const k of keys) {
      if (before[k] === undefined) delete process.env[k];
      else process.env[k] = before[k];
    }
  }
}

test("a secret seals and opens again, and the sealed text doesn't hold it", () => {
  withEnv({ SECRETS_KEY: "test-key-1" }, () => {
    const s = sealSecret("abcd efgh ijkl mnop");
    assert.ok(isSealed(s));
    assert.ok(!s.includes("abcd"));
    assert.notEqual(sealSecret("abcd efgh ijkl mnop"), s, "each seal is different");
    assert.equal(openSecret(s), "abcd efgh ijkl mnop");
    assert.equal(sealSecret(s), s, "sealing twice changes nothing");
  });
});

test("a plain value saved before sealing still reads", () => {
  withEnv({ SECRETS_KEY: "test-key-1" }, () => {
    assert.equal(openSecret("https://hooks.slack.com/services/T0/B0/x"), "https://hooks.slack.com/services/T0/B0/x");
    const old = { siteUrl: "https://example.com", username: "admin", appPassword: "abcd efgh" };
    assert.deepEqual(openConfig(old), old);
  });
});

test("without SECRETS_KEY it uses the Google token key, and adding SECRETS_KEY later still opens those", () => {
  let s = "";
  withEnv({ SUPABASE_SECRET_KEY: "sb-secret" }, () => {
    s = sealSecret("shpat_123");
    assert.ok(isSealed(s));
    assert.equal(openSecret(s), "shpat_123");
  });
  withEnv({ SUPABASE_SECRET_KEY: "sb-secret", SECRETS_KEY: "new-key" }, () => assert.equal(openSecret(s), "shpat_123"));
  withEnv({ SECRETS_KEY: "wrong" }, () => assert.throws(() => openSecret(s)));
});

test("with no key at all, values stay plain so nothing breaks", () => {
  withEnv({}, () => assert.equal(sealSecret("token"), "token"));
});

test("only the secret fields of a config are sealed", () => {
  withEnv({ SECRETS_KEY: "test-key-1" }, () => {
    const c = sealConfig({ siteUrl: "https://example.com", username: "admin", appPassword: "abcd efgh" }, ["appPassword"]);
    assert.equal(c.siteUrl, "https://example.com");
    assert.equal(c.username, "admin");
    assert.ok(isSealed(c.appPassword));
    assert.deepEqual(openConfig(c), { siteUrl: "https://example.com", username: "admin", appPassword: "abcd efgh" });
  });
});
