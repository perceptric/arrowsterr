// The sign-in screen's link lines and passkey errors (src/lib/authLink.ts). It proves: a confirm link opened in another
// browser says the email is confirmed, any other link opened there says so in one line, errors in the address get a
// plain line, the address is cleaned after, /signup opens Create account, and the passkey waiting in the email box's
// suggestions never shows an error.
import { test } from "node:test";
import assert from "node:assert/strict";
import { hasLinkParams, linkNotice, passkeyError, wantsSignup, withoutLinkParams } from "../src/lib/authLink.ts";

test("a confirm link opened in another browser says the email is confirmed", () => {
  assert.equal(linkNotice("?from=signup&code=8f1c", ""), "Your email is confirmed. Sign in to continue.");
});

test("a sign-in or reset link opened in another browser says where to sign in", () => {
  assert.match(linkNotice("?code=8f1c", ""), /different browser/);
  assert.match(linkNotice("?code=8f1c&invite=abc", ""), /different browser/);
});

test("no code and no error: nothing to say", () => {
  assert.equal(linkNotice("", ""), "");
  assert.equal(linkNotice("?from=signup", ""), "");
  assert.equal(linkNotice("?invite=abc", ""), "");
});

test("an error in the address gets one plain line, a cancelled Google window none", () => {
  assert.match(linkNotice("", "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired"), /expired or was already used/);
  assert.match(linkNotice("?error=server_error&error_description=Something", ""), /didn't sign you in/);
  assert.equal(linkNotice("?error=access_denied&error_description=The+user+cancelled", ""), "");
});

test("the address loses what the link left, and keeps the rest", () => {
  assert.equal(withoutLinkParams("?code=1&from=signup"), "");
  assert.equal(withoutLinkParams("?code=1&utm_source=site&sb_flow_id=x"), "?utm_source=site");
  assert.equal(hasLinkParams("?code=1", ""), true);
  assert.equal(hasLinkParams("", "#error=access_denied"), true);
  assert.equal(hasLinkParams("?utm_source=site", ""), false);
});

test("/signup and ?signup=1 open Create account", () => {
  assert.equal(wantsSignup("/signup", ""), true);
  assert.equal(wantsSignup("/signup/", "?utm_source=site"), true);
  assert.equal(wantsSignup("/", "?signup=1"), true);
  assert.equal(wantsSignup("/", ""), false);
  assert.equal(wantsSignup("/prompts", "?signup=0"), false);
});

test("the passkey waiting in the suggestions never shows an error", () => {
  for (const m of ["a Non-Webauthn related error has occurred", "Resident credentials or empty 'allowCredentials' lists are not supported at this time.", "The operation either timed out or was not allowed.", "Some other failure"]) {
    assert.equal(passkeyError(m, true), "", m);
  }
});

test("a click on Sign in with a passkey shows a plain line, and a closed prompt none", () => {
  assert.equal(passkeyError("The operation either timed out or was not allowed.", false), "");
  assert.equal(passkeyError("AbortError: cancelled", false), "");
  assert.match(passkeyError("a Non-Webauthn related error has occurred", false), /don't work in this browser/);
  assert.match(passkeyError("Passkey not found", false), /No passkey for this site/);
  assert.equal(passkeyError("Server busy", false), "Server busy");
});
