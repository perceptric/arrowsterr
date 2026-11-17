"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { passwordProblem, strength } from "@/lib/passwordCheck";
import { Logo } from "./Logo";
import { Turnstile } from "./Turnstile";

type Mode = "signin" | "signup" | "forgot" | "link";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** A centered card, for the short screens after sign-in: a new password and the 2-step code. */
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

const ANSWER = [
  { name: "Notion", you: false },
  { name: "Your brand", you: true },
  { name: "ClickUp", you: false },
  { name: "Asana", you: false },
];

/** The blue side of the sign-in page: what Arrowsterr does, with a sample AI answer. Hidden on small screens. */
function Showcase() {
  return (
    <aside className="relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col lg:justify-between" style={{ background: "linear-gradient(160deg, #0943B0 0%, #0A2F7A 100%)" }}>
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.12]" style={{ backgroundImage: "radial-gradient(#fff 1px, transparent 1px)", backgroundSize: "18px 18px" }} />
      <div className="relative">
        <Logo size="md" invert />
      </div>
      <div className="relative flex max-w-md flex-col gap-8">
        <div className="flex flex-col gap-3">
          <h2 className="text-[34px] leading-[1.15] font-semibold tracking-[-0.02em] text-white">Know what AI says about your brand.</h2>
          <p className="text-[16px] leading-relaxed text-white/80">Track how ChatGPT, Gemini, Claude, Perplexity and Google&apos;s AI answers talk about you, then fix what they get wrong.</p>
        </div>
        <div className="rounded-[16px] border border-white/15 bg-white/10 p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between text-[12px] text-white/70">
            <span>ChatGPT</span>
            <span>&ldquo;best project tool for agencies&rdquo;</span>
          </div>
          <ol className="mt-3 flex flex-col gap-1.5">
            {ANSWER.map((b, i) => (
              <li key={b.name} className={`flex items-center gap-3 rounded-[10px] px-3 py-2 text-[14px] ${b.you ? "bg-white font-medium text-[#0943B0]" : "text-white/85"}`}>
                <span className={`w-4 text-[12px] ${b.you ? "text-[#0943B0]/70" : "text-white/50"}`}>{i + 1}</span>
                {b.name}
                {b.you ? <span className="ml-auto text-[12px] font-medium">Up 3 spots</span> : null}
              </li>
            ))}
          </ol>
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/15 pt-4">
            <div>
              <div className="text-[22px] font-semibold text-white">62%</div>
              <div className="text-[12px] text-white/70">AI visibility</div>
            </div>
            <div>
              <div className="text-[22px] font-semibold text-white">+18%</div>
              <div className="text-[12px] text-white/70">This month</div>
            </div>
          </div>
        </div>
      </div>
      <p className="relative text-[12px] text-white/60">AI visibility, SEO and content in one place.</p>
    </aside>
  );
}

/** A password box with a show/hide button and a Caps Lock warning. It hides again when the form is sent. */
function PasswordField({ id, label, value, onChange, autoComplete, autoFocus, meter }: { id: string; label: string; value: string; onChange: (v: string) => void; autoComplete: string; autoFocus?: boolean; meter?: boolean }) {
  const [shown, setShown] = useState(false);
  const [caps, setCaps] = useState(false);
  const box = useRef<HTMLInputElement>(null);
  const s = strength(value);
  const tone = ["", "bg-neg", "bg-warn", "bg-brand", "bg-pos"][s.score];

  // Hide it again on submit, so the browser never saves or shows it as plain text afterward.
  useEffect(() => {
    const form = box.current?.form;
    if (!form) return;
    const hide = () => setShown(false);
    form.addEventListener("submit", hide);
    return () => form.removeEventListener("submit", hide);
  }, []);

  function toggle() {
    const el = box.current;
    const start = el?.selectionStart ?? null;
    const end = el?.selectionEnd ?? null;
    setShown((v) => !v);
    // Keep focus and the cursor where they were.
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      if (start !== null && end !== null) el.setSelectionRange(start, end);
    });
  }
  const checkCaps = (e: React.KeyboardEvent<HTMLInputElement>) => setCaps(e.getModifierState?.("CapsLock") ?? false);

  return (
    <div>
      <label className="aw-label" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <input
          ref={box}
          id={id}
          type={shown ? "text" : "password"}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={checkCaps}
          onKeyUp={checkCaps}
          onBlur={() => setCaps(false)}
          required
          autoFocus={autoFocus}
          aria-describedby={caps ? `${id}-caps` : undefined}
          className="aw-input pr-11!"
        />
        <button
          type="button"
          onClick={toggle}
          onMouseDown={(e) => e.preventDefault()}
          aria-label={shown ? "Hide password" : "Show password"}
          aria-pressed={shown}
          aria-controls={id}
          title={shown ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-[inherit] text-muted transition-colors hover:text-ink focus-visible:text-ink"
        >
          {shown ? (
            <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3l18 18" />
              <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
              <path d="M9.9 5.2A9.8 9.8 0 0 1 12 5c5 0 8.5 4.4 9.5 7a13 13 0 0 1-2.7 3.9M6.6 6.6A13.5 13.5 0 0 0 2.5 12c1 2.6 4.5 7 9.5 7a9.6 9.6 0 0 0 5.4-1.6" />
            </svg>
          ) : (
            <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2.5 12C3.5 9.4 7 5 12 5s8.5 4.4 9.5 7c-1 2.6-4.5 7-9.5 7s-8.5-4.4-9.5-7z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
      {caps ? (
        <p id={`${id}-caps`} className="mt-1.5 text-[12px] text-warn" role="status">
          Caps Lock is on.
        </p>
      ) : null}
      {meter ? (
        <div className="mt-2 flex items-center gap-3">
          <div className="flex flex-1 gap-1" aria-hidden>
            {[1, 2, 3, 4].map((n) => (
              <span key={n} className={`h-1 flex-1 rounded-full ${value && n <= s.score ? tone : "bg-rule"}`} />
            ))}
          </div>
          <span className="w-16 text-right text-[12px] text-muted" aria-live="polite">
            {value ? s.label : "8+ characters"}
          </span>
        </div>
      ) : null}
    </div>
  );
}

const TITLES: Record<Mode, [string, string]> = {
  signin: ["Welcome back", "Sign in to your Arrowsterr account."],
  signup: ["Create your account", "Start tracking your brand in AI answers."],
  forgot: ["Reset your password", "We'll email you a link to choose a new one."],
  link: ["Sign in with a link", "We'll email you a link. No password needed."],
};

/** Sign in, create an account, or reset a password. */
export function AuthScreen({ sb, invited, turnstileSiteKey = null, passkeys = false }: { sb: SupabaseClient; invited: boolean; turnstileSiteKey?: string | null; passkeys?: boolean }) {
  const [mode, setMode] = useState<Mode>(invited ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState("");
  const [code, setCode] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [round, setRound] = useState(0);
  const onToken = useCallback((t: string) => setCaptcha(t), []);
  const captchaToken = captcha || undefined;
  const canPasskey = passkeys && typeof window !== "undefined" && "PublicKeyCredential" in window;

  // Passkey autofill: on the sign-in form, the browser offers saved passkeys in the email box's suggestions.
  const auto = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!canPasskey || mode !== "signin") return;
    const ctrl = new AbortController();
    auto.current = ctrl;
    (async () => {
      const ok = await (window.PublicKeyCredential as unknown as { isConditionalMediationAvailable?: () => Promise<boolean> }).isConditionalMediationAvailable?.().catch(() => false);
      if (!ok || ctrl.signal.aborted) return;
      const { error } = await sb.auth.signInWithPasskey({ options: { mediation: "conditional", signal: ctrl.signal } });
      if (error && !ctrl.signal.aborted && !/abort|cancel|not allowed/i.test(error.message)) setError(error.message);
    })();
    return () => ctrl.abort();
  }, [sb, canPasskey, mode]);

  async function passkey() {
    auto.current?.abort();
    setBusy(true);
    setError("");
    const { error } = await sb.auth.signInWithPasskey({ options: { captchaToken } });
    setBusy(false);
    if (error && !/abort|cancel|not allowed/i.test(error.message)) setError(/not found|no passkey|credential/i.test(error.message) ? "No passkey for this site on this device. Sign in another way, then add one in Settings." : error.message);
  }

  /** The code in the sign-in or confirm email, for a link opened on another device. */
  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const token = code.trim();
      let { error } = await sb.auth.verifyOtp({ email, token, type: "email" });
      if (error && mode === "signup") ({ error } = await sb.auth.verifyOtp({ email, token, type: "signup" }));
      if (error) throw error;
    } catch (err) {
      setError(/invalid|expired/i.test(message(err)) ? "That code is not right or has expired. Check the newest email." : message(err));
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (turnstileSiteKey && !captcha) return setError("Please wait for the security check to finish.");
    setBusy(true);
    setError("");
    setSent("");
    try {
      const redirect = window.location.origin;
      if (mode === "signin") {
        // Through the server, which counts wrong tries and locks them out.
        const res = await fetch("/api/auth/signin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, captchaToken }) });
        const out = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(out.error || "Sign-in failed. Try again.");
        const { error } = await sb.auth.setSession({ access_token: out.access_token, refresh_token: out.refresh_token });
        if (error) throw error;
      } else if (mode === "signup") {
        const problem = await passwordProblem(password);
        if (problem) throw new Error(problem);
        const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: redirect, captchaToken } });
        if (error) throw error;
        if (!data.session) setSent(`We sent a link to ${email}. Click it to finish creating your account.`);
      } else if (mode === "link") {
        // Signs in, or makes the account on a first visit. Comes back to this page, so invite links keep working.
        const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect + window.location.pathname, captchaToken } });
        if (error) throw error;
        setSent(`We sent a sign-in link to ${email}. Click it to sign in.`);
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: redirect, captchaToken });
        if (error) throw error;
        setSent(`If ${email} has an account, a reset link is on its way.`);
      }
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
      // A token works once, so get a new one for the next try.
      if (turnstileSiteKey) {
        setCaptcha("");
        setRound((r) => r + 1);
      }
    }
  }

  async function google() {
    setBusy(true);
    setError("");
    const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin + window.location.pathname, queryParams: { prompt: "select_account" } } });
    if (error) {
      setError(error.message);
      setBusy(false);
    }
  }

  function switchTo(m: Mode) {
    setMode(m);
    setError("");
    setSent("");
    setCode("");
  }

  const [title, sub] = TITLES[mode];
  return (
    <main className="grid min-h-screen bg-surface lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <Showcase />
      <section className="flex items-center justify-center px-5 py-10 sm:px-8">
        <div className="flex w-full max-w-[400px] flex-col gap-6">
          <div className="lg:hidden">
            <Logo size="md" />
          </div>
          <div className="flex flex-col gap-1.5">
            <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.02em] text-ink">{title}</h1>
            <p className="text-[15px] text-muted">{sub}</p>
          </div>
          {invited ? <p className="aw-callout text-[14px]">You were invited to a workspace. Use the email address the invite was sent to.</p> : null}
          {mode === "signin" || mode === "signup" ? (
            <>
              {/* Google's full-page sign-in: the person picks an account on Google, then comes back here. */}
              <button type="button" className="aw-btn aw-btn--secondary aw-btn--block gap-3" onClick={google} disabled={busy}>
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48">
                  <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
                  <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                  <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                  <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
                </svg>
                Continue with Google
              </button>
              {canPasskey && mode === "signin" ? (
                <button type="button" className="aw-btn aw-btn--secondary aw-btn--block gap-3" onClick={passkey} disabled={busy}>
                  <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="9" cy="8" r="4" />
                    <path d="M3 20c0-3.3 2.7-6 6-6 1.2 0 2.3.3 3.2.9" />
                    <circle cx="17.5" cy="14.5" r="2.5" />
                    <path d="M17.5 17v4M17.5 19h2" />
                  </svg>
                  Sign in with a passkey
                </button>
              ) : null}
              <div className="flex items-center gap-3 text-[12px] text-muted">
                <span className="h-px flex-1 bg-rule" />
                or use your email
                <span className="h-px flex-1 bg-rule" />
              </div>
            </>
          ) : null}
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div>
              <label className="aw-label" htmlFor="email">
                Email
              </label>
              <input id="email" type="email" autoComplete={canPasskey && mode === "signin" ? "username webauthn" : "email"} autoCapitalize="none" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus className="aw-input" />
            </div>
            {mode === "signin" || mode === "signup" ? (
              <div className="flex flex-col gap-1.5">
                <PasswordField id="password" label="Password" value={password} onChange={setPassword} autoComplete={mode === "signup" ? "new-password" : "current-password"} meter={mode === "signup"} />
                {mode === "signin" ? (
                  <button type="button" className="aw-text-link self-end text-[13px]" onClick={() => switchTo("forgot")}>
                    Forgot password?
                  </button>
                ) : null}
              </div>
            ) : null}
            {turnstileSiteKey ? <Turnstile siteKey={turnstileSiteKey} round={round} onToken={onToken} /> : null}
            {error ? <p className="aw-error">{error}</p> : null}
            {sent ? <p className="aw-callout text-[14px]!">{sent}</p> : null}
            <button type="submit" className="aw-btn aw-btn--primary aw-btn--block mt-1" disabled={busy}>
              {busy ? "Please wait..." : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : mode === "link" ? "Email me a sign-in link" : "Send reset link"}
            </button>
          </form>
          {sent && (mode === "link" || mode === "signup") ? (
            <form onSubmit={verify} className="flex flex-col gap-3">
              <label className="aw-label" htmlFor="email-code">
                Or enter the code from the email
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
          <div className="flex flex-col gap-3 border-t border-rule-faint pt-5 text-[14px] text-body">
            {mode === "signin" ? (
              <>
                <span>
                  New to Arrowsterr?{" "}
                  <button type="button" className="aw-text-link" onClick={() => switchTo("signup")}>
                    Create an account
                  </button>
                </span>
                <button type="button" className="aw-text-link self-start" onClick={() => switchTo("link")}>
                  Email me a sign-in link instead
                </button>
              </>
            ) : mode === "signup" ? (
              <span>
                Already have an account?{" "}
                <button type="button" className="aw-text-link" onClick={() => switchTo("signin")}>
                  Sign in
                </button>
              </span>
            ) : (
              <button type="button" className="aw-text-link self-start" onClick={() => switchTo("signin")}>
                Back to sign in
              </button>
            )}
            {mode === "signup" || mode === "link" ? (
              <p className="text-[12px] text-muted">
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
          </div>
        </div>
      </section>
    </main>
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
    const problem = await passwordProblem(password);
    if (problem) {
      setBusy(false);
      return setError(problem);
    }
    const { error } = await sb.auth.updateUser({ password });
    setBusy(false);
    if (error) setError(error.message);
    else onDone();
  }

  return (
    <Frame>
      <h1 className="aw-h3 mb-0!">Choose a new password</h1>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <PasswordField id="new-password" label="New password" value={password} onChange={setPassword} autoComplete="new-password" autoFocus meter />
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
