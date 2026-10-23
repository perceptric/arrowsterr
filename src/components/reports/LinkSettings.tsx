"use client";

import { useState } from "react";
import type { RunAuth } from "@/lib/runner";
import { DateField } from "../Pickers";
import { errText, post } from "./reportApi";

// A shared link's password and expiry date (docs/reports.md, section 32.7). Adding either is on Pro and up;
// removing works on every plan. Used in the Share window and in Reports → Links.

export type LinkLock = { id: string; locked: boolean; expires_at: string | null };

export function LinkSettings({ auth, link, secure, onSaved }: { auth: RunAuth; link: LinkLock; secure: boolean; onSaved: (l: LinkLock) => void }) {
  const day = link.expires_at ? link.expires_at.slice(0, 10) : "";
  const [expires, setExpires] = useState(day);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const changed = expires !== day || Boolean(password);

  async function save(patch: { password?: string | null; expires?: string | null }) {
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const { link: l } = await post<{ link: LinkLock }>(auth, "/api/reports/links", { action: "update", id: link.id, ...patch });
      setPassword("");
      setSaved(true);
      onSaved(l);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t border-rule-faint pt-4">
      <div className="flex items-center gap-2">
        <span className="aw-label mb-0!">Protect this link</span>
        {!secure ? <span className="aw-status aw-status--pending">Pro</span> : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-muted">Expires</span>
          <DateField value={expires} onChange={(v) => setExpires(v ?? "")} label="Expires" placeholder="Never" disabled={!secure && !day} className="aw-dropdown--field w-full" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-muted">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={link.locked ? "Password set" : "No password"}
            aria-label="Password"
            autoComplete="new-password"
            disabled={!secure}
            className="aw-input w-full"
          />
        </label>
      </div>
      {error ? <p className="aw-error">{error}</p> : null}
      <div className="flex flex-wrap items-center justify-end gap-3">
        {saved && !changed ? <span className="text-[13px] text-muted">Saved</span> : null}
        {link.locked ? (
          <button type="button" className="aw-text-link text-[13px]" disabled={busy} onClick={() => save({ password: null })}>
            Remove password
          </button>
        ) : null}
        <button
          type="button"
          className="aw-btn aw-btn--secondary aw-btn--sm"
          disabled={busy || !changed}
          onClick={() => save({ ...(expires !== day ? { expires: expires || null } : {}), ...(password ? { password } : {}) })}
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
