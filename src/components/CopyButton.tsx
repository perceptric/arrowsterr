"use client";

import { useEffect, useRef, useState } from "react";

// The one copy button: copies a value and says "Copied" for two seconds.
// text can be a function when the value has to be fetched first (a share link the server rebuilds).

export function CopyButton({
  text,
  label = "Copy link",
  className = "aw-btn aw-btn--secondary aw-btn--sm",
  disabled,
  startCopied = false,
  onError,
}: {
  text: string | (() => Promise<string>);
  label?: string;
  className?: string;
  disabled?: boolean;
  /** Show "Copied" at first, when the value was already copied for the person. */
  startCopied?: boolean;
  /** Called when the clipboard refuses, so the screen can say how to copy by hand. */
  onError?: (e: unknown) => void;
}) {
  const [copied, setCopied] = useState(startCopied);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (startCopied) timer.current = setTimeout(() => setCopied(false), 2000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [startCopied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(typeof text === "string" ? text : await text());
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      onError?.(e);
    }
  }

  return (
    <button type="button" className={className} disabled={disabled} onClick={copy}>
      {copied ? "Copied" : label}
    </button>
  );
}
