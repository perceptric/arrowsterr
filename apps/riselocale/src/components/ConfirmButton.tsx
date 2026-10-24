"use client";

import { useState, useTransition } from "react";

/** A button that asks once, inline, before it runs. */
export default function ConfirmButton({ label, ask, run, danger }: { label: string; ask: string; run: () => Promise<unknown>; danger?: boolean }) {
  const [asking, setAsking] = useState(false);
  const [pending, start] = useTransition();
  if (!asking)
    return (
      <button type="button" className={`rl-btn rl-btn--secondary rl-btn--sm ${danger ? "btn-danger" : ""}`} onClick={() => setAsking(true)}>
        {label}
      </button>
    );
  return (
    <span className="confirm">
      <span>{ask}</span>
      <button type="button" className={`rl-btn rl-btn--secondary rl-btn--sm ${danger ? "btn-danger" : ""}`} disabled={pending} onClick={() => start(async () => void (await run()))}>
        Yes
      </button>
      <button type="button" className="rl-btn rl-btn--secondary rl-btn--sm" onClick={() => setAsking(false)}>
        No
      </button>
    </span>
  );
}
