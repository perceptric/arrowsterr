"use client";

import { useState } from "react";

export default function CopyLink({ url, label }: { url: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="rl-btn rl-btn--secondary rl-btn--sm"
      onClick={async () => {
        const full = new URL(url, window.location.origin).toString();
        try {
          await navigator.clipboard.writeText(full);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          window.open(full, "_blank", "noopener");
        }
      }}
    >
      {done ? "Copied" : label}
    </button>
  );
}
