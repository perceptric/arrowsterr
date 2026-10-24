"use client";

import { useActionState } from "react";
import { login, signup, type FormState } from "@/app/actions";

export default function AuthForm({ kind }: { kind: "login" | "signup" }) {
  const [state, action, pending] = useActionState<FormState, FormData>(kind === "login" ? login : signup, null);
  return (
    <form className="form" action={action}>
      {kind === "signup" && (
        <>
          <div className="rl-field">
            <label htmlFor="name">Your name</label>
            <input id="name" name="name" className="rl-input" autoComplete="name" />
          </div>
          <div className="rl-field">
            <label htmlFor="company">Business or agency</label>
            <input id="company" name="company" className="rl-input" autoComplete="organization" />
          </div>
        </>
      )}
      <div className="rl-field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" className="rl-input" autoComplete="email" required />
      </div>
      <div className="rl-field">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" className="rl-input" autoComplete={kind === "login" ? "current-password" : "new-password"} required minLength={kind === "signup" ? 10 : undefined} />
      </div>
      {state?.error && <p className="error">{state.error}</p>}
      <button className="rl-btn rl-btn--primary" disabled={pending}>
        {pending ? "One moment…" : kind === "login" ? "Sign in" : "Create account"}
      </button>
    </form>
  );
}
