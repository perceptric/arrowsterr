"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { GoogleButton } from "./GoogleButton";
import { Logo } from "./Logo";
import { plainError } from "@/lib/authErrors";

type Mode = "signin" | "signup" | "forgot" | "link";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Seconds before the same email can be sent again. */
const RESEND_WAIT = 30;

/** A password box with a button that shows what was typed. */
function PasswordInput({ id, autoComplete, minLength, value, onChange, autoFocus }: { id: string; autoComplete: string; minLength?: number; value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={shown ? "text" : "password"}
        autoComplete={autoComplete}
        minLength={minLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        autoFocus={autoFocus}
        className="aw-input pr-11!"
      />
      <button
        type="button"
        onClick={() => setShown(!shown)}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        title={shown ? "Hide password" : "Show password"}
        className="aw-icon-btn absolute top-1/2 right-1.5 -translate-y-1/2"
      >
        <svg className="aw-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
          {shown ? <path d="M4 4l16 16" /> : null}
        </svg>
      </button>
    </div>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="aw-dotgrid flex min-h-screen justify-center px-4 py-10">
      <div className="flex w-full max-w-md flex-col gap-6">
        <Logo size="md" />
        <div className="aw-frame">
          <div className="aw-frame__body flex flex-col gap-5">{children}</div>
        </div>
      </div>
    </main>
  );
}

/** True when the address asks for the Create account tab: /?signup, as the Start free buttons link. */
const wantsSignup = () => {
  try {
    return new URLSearchParams(window.location.search).has("signup");
  } catch {
    return false;
  }
};

/** Sign in, create an account, or reset a password. */
export function AuthScreen({ sb, invited, googleClientId = null }: { sb: SupabaseClient; invited: boolean; googleClientId?: string | null }) {
  const [mode, setMode] = useState<Mode>(() => (invited || wantsSignup() ? "signup" : "signin"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // The email already has an account: the error offers Sign in.
  const [exists, setExists] = useState(false);
  const [sent, setSent] = useState("");
  // Which email went out, so Send again sends the same one and the code is checked the right way.
  const [kind, setKind] = useState<"signup" | "link" | "reset" | null>(null);
  const [wait, setWait] = useState(0);
  const [code, setCode] = useState("");

  useEffect(() => {
    if (wait <= 0) return;
    const t = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(t);
  }, [wait]);

  function fail(err: unknown) {
    const text = plainError(message(err));
    setExists(text === "This email already has an account.");
    setError(text);
  }

  /** Sends one email: the confirm link, a sign-in link or a reset link. */
  async function send(k: "signup" | "link" | "reset") {
    const redirect = window.location.origin;
    if (k === "signup") {
      const { error } = await sb.auth.resend({ type: "signup", email, options: { emailRedirectTo: redirect } });
      if (error) throw error;
      setSent(`We sent a link to ${email}. Click it to finish creating your account.`);
    } else if (k === "link") {
      // Signs in, or makes the account on a first visit. Comes back to this page, so invite links keep working.
      const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect + window.location.pathname } });
      if (error) throw error;
      setSent(`We sent a sign-in link to ${email}. Click it to sign in.`);
    } else {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: redirect });
      if (error) throw error;
      setSent(`If ${email} has an account, a reset link is on its way.`);
    }
    setKind(k);
    setWait(RESEND_WAIT);
  }

  async function sendAgain() {
    if (!kind || wait > 0) return;
    setBusy(true);
    setError("");
    try {
      await send(kind);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  /** The code in the sign-in or confirm email, for a link opened on another device. */
  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const token = code.trim();
      let { error } = await sb.auth.verifyOtp({ email, token, type: "email" });
      if (error && kind === "signup") ({ error } = await sb.auth.verifyOtp({ email, token, type: "signup" }));
      if (error) throw error;
    } catch (err) {
      setError(/invalid|expired/i.test(message(err)) ? "That code is not right or has expired. Check the newest email." : plainError(message(err)));
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setExists(false);
    setSent("");
    setKind(null);
    try {
      const redirect = window.location.origin;
      if (mode === "signin") {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) {
          // The account is there but the email was never confirmed: send the link again in place of a dead end.
          if (/email not confirmed/i.test(error.message)) {
            await send("signup");
            setSent(`Confirm your email first. We sent a new link to ${email}.`);
            return;
          }
          throw error;
        }
      } else if (mode === "signup") {
        const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: redirect } });
        if (error) throw error;
        // Supabase answers a sign-up for a confirmed email with no error and no identities, and sends nothing.
        if (data.user && !data.user.identities?.length) {
          setExists(true);
          setError("This email already has an account.");
          return;
        }
        if (!data.session) {
          setSent(`We sent a link to ${email}. Click it to finish creating your account.`);
          setKind("signup");
          setWait(RESEND_WAIT);
        }
      } else if (mode === "link") {
        await send("link");
      } else {
        await send("reset");
      }
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setBusy(true);
    setError("");
    const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin + window.location.pathname } });
    if (error) {
      setError(plainError(error.message));
      setBusy(false);
    }
  }

  function switchTo(m: Mode) {
    setMode(m);
    setError("");
    setExists(false);
    setSent("");
    setKind(null);
    setCode("");
  }

  // The sign-in link is a way to sign in, so it keeps the Sign in tab selected.
  const selected = (m: Mode) => mode === m || (m === "signin" && mode === "link");
  const tab = (m: Mode, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={selected(m)}
      onClick={() => switchTo(m)}
    >
      {label}
    </button>
  );

  return (
    <Frame>
      {mode === "forgot" ? (
        <h1 className="aw-h3 mb-0!">Reset your password</h1>
      ) : (
        <div role="tablist" aria-label="Account" className="aw-tabs aw-tabs--lg">
          {tab("signin", "Sign in")}
          {tab("signup", "Create account")}
        </div>
      )}
      {invited ? (
        <p className="aw-callout">You were invited to a workspace. Use the email address the invite was sent to.</p>
      ) : null}
      {mode !== "forgot" ? (
        <>
          {googleClientId ? (
            <GoogleButton sb={sb} clientId={googleClientId} onError={setError} />
          ) : (
            <button type="button" className="aw-btn aw-btn--secondary aw-btn--block gap-3" onClick={google} disabled={busy}>
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
              </svg>
              Continue with Google
            </button>
          )}
          <div className="flex items-center gap-3 text-[13px] text-muted">
            <span className="h-px flex-1 bg-rule" />
            or
            <span className="h-px flex-1 bg-rule" />
          </div>
        </>
      ) : null}
      <form onSubmit={submit} className="flex flex-col gap-5">
        <div>
          <label className="aw-label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            className="aw-input"
          />
        </div>
        {mode === "signin" || mode === "signup" ? (
          <div>
            <label className="aw-label" htmlFor="password">
              Password
            </label>
            <PasswordInput
              id="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              minLength={mode === "signup" ? 8 : undefined}
              value={password}
              onChange={setPassword}
            />
            {mode === "signup" ? <p className="aw-small mt-2">At least 8 characters.</p> : null}
          </div>
        ) : null}
        {error ? (
          <p className="aw-error">
            {error}
            {exists ? (
              <>
                {" "}
                <button type="button" className="aw-text-link" onClick={() => switchTo("signin")}>
                  Sign in
                </button>
              </>
            ) : null}
          </p>
        ) : null}
        {sent ? (
          <div className="aw-callout flex flex-col items-start gap-2 text-[15px]!">
            <span>{sent}</span>
            {kind ? (
              <button type="button" className="aw-text-link text-[13px]" onClick={sendAgain} disabled={busy || wait > 0}>
                {wait > 0 ? `Send again in ${wait}s` : "Send again"}
              </button>
            ) : null}
          </div>
        ) : null}
        <button type="submit" className="aw-btn aw-btn--primary aw-btn--block" disabled={busy}>
          {busy ? "Please wait..." : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : mode === "link" ? "Email me a sign-in link" : "Send reset link"}
        </button>
      </form>
      {sent && (kind === "link" || kind === "signup") ? (
        <form onSubmit={verify} className="flex flex-col gap-3">
          <label className="aw-label" htmlFor="email-code">
            Code from the email
          </label>
          <input
            id="email-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6,10}"
            maxLength={10}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="aw-input aw-mono text-center text-[22px] tracking-[0.3em]"
          />
          <button type="submit" className="aw-btn aw-btn--secondary aw-btn--block" disabled={busy || code.length < 6}>
            {busy ? "Checking..." : "Continue"}
          </button>
        </form>
      ) : null}
      {mode === "signup" || mode === "link" ? (
        <p className="aw-small">
          {mode === "link" ? "New here? The link also creates your account. " : null}By creating an account you agree to the{" "}
          <a className="aw-text-link" href="https://arrowsterr.com/terms" target="_blank" rel="noopener noreferrer">
            Terms
          </a>{" "}
          and{" "}
          <a className="aw-text-link" href="https://arrowsterr.com/privacy" target="_blank" rel="noopener noreferrer">
            Privacy Policy
          </a>
          .
        </p>
      ) : null}
      {mode === "signin" ? (
        <div className="flex flex-wrap justify-between gap-3">
          <button type="button" className="aw-text-link" onClick={() => switchTo("forgot")}>
            Forgot your password?
          </button>
          <button type="button" className="aw-text-link" onClick={() => switchTo("link")}>
            Email me a sign-in link instead
          </button>
        </div>
      ) : mode === "link" ? (
        <button type="button" className="aw-text-link self-start" onClick={() => switchTo("signin")}>
          Sign in with a password instead
        </button>
      ) : mode === "forgot" ? (
        <button type="button" className="aw-text-link self-start" onClick={() => switchTo("signin")}>
          Back to sign in
        </button>
      ) : null}
    </Frame>
  );
}

/** Shown after a password reset link is clicked. */
export function NewPassword({ sb, onDone }: { sb: SupabaseClient; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await sb.auth.updateUser({ password });
    setBusy(false);
    if (error) setError(plainError(error.message));
    else onDone();
  }

  return (
    <Frame>
      <h1 className="aw-h3 mb-0!">Choose a new password</h1>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <div>
          <label className="aw-label" htmlFor="new-password">
            New password
          </label>
          <PasswordInput id="new-password" autoComplete="new-password" minLength={8} value={password} onChange={setPassword} autoFocus />
        </div>
        {error ? <p className="aw-error">{error}</p> : null}
        <button type="submit" className="aw-btn aw-btn--primary aw-btn--block" disabled={busy}>
          {busy ? "Saving..." : "Save password"}
        </button>
      </form>
    </Frame>
  );
}

/** The 6-digit code from an authenticator app, for people with 2-step sign-in on. */
export function CodeCheck({ sb, onDone }: { sb: SupabaseClient; onDone: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { data } = await sb.auth.mfa.listFactors();
      const factor = data?.totp.find((f) => f.status === "verified");
      if (!factor) return onDone();
      const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() });
      if (error) throw error;
      onDone();
    } catch (err) {
      setError(/invalid/i.test(message(err)) ? "That code is not right. Check the app and try the newest one." : plainError(message(err)));
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Frame>
      <h1 className="aw-h3 mb-0!">Enter your code</h1>
      <p className="text-[15px] text-body">Open your authenticator app and type the 6-digit code for Arrowsterr.</p>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <input
          aria-label="6-digit code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          className="aw-input aw-mono text-center text-[22px] tracking-[0.3em]"
        />
        {error ? <p className="aw-error">{error}</p> : null}
        <button type="submit" className="aw-btn aw-btn--primary aw-btn--block" disabled={busy || code.length !== 6}>
          {busy ? "Checking..." : "Continue"}
        </button>
        <button type="button" className="aw-text-link text-[13px]" onClick={() => sb.auth.signOut()}>
          Sign out
        </button>
      </form>
    </Frame>
  );
}
