"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useRef, useState } from "react";
import { GoogleButton } from "./GoogleButton";
import { Logo } from "./Logo";
import { Turnstile } from "./Turnstile";

type Mode = "signin" | "signup" | "forgot" | "link";

/** An open invite link: its token, the workspace's name and the email it was sent to. */
export type InviteInfo = { token: string; workspace: string; email: string };

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

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

/** Supabase's answer when an email already has an account. */
const taken = (msg: string) => /already (been )?registered|already exists/i.test(msg);

/** Sign in, create an account, or reset a password. */
export function AuthScreen({
  sb,
  invite = null,
  problem = "",
  googleClientId = null,
  turnstileSiteKey = null,
}: {
  sb: SupabaseClient;
  invite?: InviteInfo | null;
  /** Why an invite link didn't work, shown until the person tries something. */
  problem?: string;
  googleClientId?: string | null;
  turnstileSiteKey?: string | null;
}) {
  const [mode, setMode] = useState<Mode>(invite ? "signup" : "signin");
  const [email, setEmail] = useState(invite?.email ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(problem);
  const [sent, setSent] = useState("");

  // The bot check. Each token works once, so a new widget loads after every try.
  const captcha = useRef("");
  const [captchaRound, setCaptchaRound] = useState(0);
  const [captchaReady, setCaptchaReady] = useState(false);
  const onCaptcha = (t: string) => {
    captcha.current = t;
    setCaptchaReady(Boolean(t));
  };
  /** The token for one try, then a fresh widget. Undefined when the bot check is off. */
  function takeCaptcha() {
    if (!turnstileSiteKey) return undefined;
    const t = captcha.current;
    onCaptcha("");
    setCaptchaRound((n) => n + 1);
    return t;
  }

  // Email links come back with the invite, so it still works on another device or browser.
  const back = (path = "/") => window.location.origin + path + (invite ? `?invite=${encodeURIComponent(invite.token)}` : "");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (turnstileSiteKey && !captcha.current) return setError("Finish the bot check first.");
    setBusy(true);
    setError("");
    setSent("");
    const captchaToken = takeCaptcha();
    try {
      if (mode === "signin") {
        const { error } = await sb.auth.signInWithPassword({ email, password, options: { captchaToken } });
        if (error) throw error;
      } else if (mode === "signup") {
        const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: back(), captchaToken } });
        if (error) throw error;
        // With email confirmation on, Supabase hides a taken email: the new user comes back with no identities.
        if (data.user && !data.session && data.user.identities?.length === 0) throw new Error("User already registered");
        if (!data.session) setSent(`We sent a link to ${email}. Click it to finish creating your account.`);
      } else if (mode === "link") {
        // Signs in, or makes the account on a first visit. Comes back to this page with the invite.
        const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: back(window.location.pathname), captchaToken } });
        if (error) throw error;
        setSent(`We sent a sign-in link to ${email}. Click it to sign in.`);
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: back(), captchaToken });
        if (error) throw error;
        setSent(`If ${email} has an account, a reset link is on its way.`);
      }
    } catch (err) {
      const msg = message(err);
      if (mode === "signup" && taken(msg)) {
        // An invite opens on Create account, but many invited people already have one.
        setMode("signin");
        setPassword("");
        setError(invite ? `${email} already has an account. Sign in to join ${invite.workspace}.` : `${email} already has an account. Sign in instead.`);
      } else setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setBusy(true);
    setError("");
    const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: back(window.location.pathname) } });
    if (error) {
      setError(error.message);
      setBusy(false);
    }
  }

  function switchTo(m: Mode) {
    setMode(m);
    setError("");
    setSent("");
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
        <>
          {/* The screen's title for screen readers; the tabs show it on screen. */}
          <h1 className="sr-only">{mode === "signup" ? "Create your Arrowsterr account" : "Sign in to Arrowsterr"}</h1>
          <div role="tablist" aria-label="Account" className="aw-tabs aw-tabs--lg">
            {tab("signin", "Sign in")}
            {tab("signup", "Create account")}
          </div>
        </>
      )}
      {invite ? (
        <p className="aw-callout">
          Join {invite.workspace}. Use {invite.email}.
        </p>
      ) : null}
      {mode !== "forgot" ? (
        <>
          {googleClientId ? (
            <GoogleButton sb={sb} clientId={googleClientId} onError={setError} captcha={turnstileSiteKey ? () => takeCaptcha() ?? "" : undefined} />
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
            <input
              id="password"
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              minLength={mode === "signup" ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="aw-input"
            />
            {mode === "signup" ? <p className="aw-small mt-2">At least 8 characters.</p> : null}
          </div>
        ) : null}
        {turnstileSiteKey ? <Turnstile key={captchaRound} siteKey={turnstileSiteKey} onToken={onCaptcha} onError={setError} /> : null}
        {error ? <p className="aw-error">{error}</p> : null}
        {sent ? <p className="aw-callout text-[15px]!">{sent}</p> : null}
        <button type="submit" className="aw-btn aw-btn--primary aw-btn--block" disabled={busy || Boolean(turnstileSiteKey && !captchaReady)}>
          {busy ? "Please wait..." : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : mode === "link" ? "Email me a sign-in link" : "Send reset link"}
        </button>
      </form>
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
    if (error) setError(error.message);
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
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoFocus
            className="aw-input"
          />
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
      setError(/invalid/i.test(message(err)) ? "That code is not right. Check the app and try the newest one." : message(err));
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

/** Signed in with a different email than the invite was sent to. Nothing is thrown away until the person picks. */
export function InviteMismatch({ invitedEmail, email, onSwitch, onSkip }: { invitedEmail: string; email: string; onSwitch: () => void; onSkip: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Frame>
      <h1 className="aw-h3 mb-0!">This invite is for another email</h1>
      <p className="text-[15px] text-body">
        The invite was sent to {invitedEmail}. You are signed in as {email}.
      </p>
      <button
        type="button"
        className="aw-btn aw-btn--primary aw-btn--block"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          onSwitch();
        }}
      >
        Sign in as {invitedEmail}
      </button>
      <button
        type="button"
        className="aw-text-link self-start"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          onSkip();
        }}
      >
        Continue as {email} without the invite
      </button>
    </Frame>
  );
}
