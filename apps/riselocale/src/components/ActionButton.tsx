"use client";

import { useTransition } from "react";

/** A button that runs a server action. */
export default function ActionButton({ label, run, primary }: { label: string; run: () => Promise<unknown>; primary?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" className={`rl-btn ${primary ? "rl-btn--primary" : "rl-btn--secondary rl-btn--sm"}`} disabled={pending} onClick={() => start(async () => void (await run()))}>
      {label}
    </button>
  );
}
