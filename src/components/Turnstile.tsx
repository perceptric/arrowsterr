"use client";

import { useEffect, useRef } from "react";

// Cloudflare Turnstile: a bot check that most people never see. Shown only when TURNSTILE_SITE_KEY is set.
// Supabase checks the token when bot protection is on in its Auth settings.

type Api = { render(el: HTMLElement, o: Record<string, unknown>): string; reset(id: string): void; remove(id: string): void };
const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

function load(): Promise<Api> {
  const w = window as unknown as { turnstile?: Api };
  if (w.turnstile) return Promise.resolve(w.turnstile);
  return new Promise((resolve, reject) => {
    let tag = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT}"]`);
    if (!tag) {
      tag = document.createElement("script");
      tag.src = SCRIPT;
      tag.async = true;
      document.head.appendChild(tag);
    }
    tag.addEventListener("load", () => (w.turnstile ? resolve(w.turnstile) : reject(new Error("The security check did not load."))));
    tag.addEventListener("error", () => reject(new Error("The security check did not load. Check your connection or ad blocker.")));
  });
}

/** Calls onToken with a fresh token, or "" when it expires. Change `round` to get a new token after each try. */
export function Turnstile({ siteKey, round, onToken }: { siteKey: string; round: number; onToken: (t: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let id = "";
    let api: Api | null = null;
    let live = true;
    load()
      .then((t) => {
        if (!live || !box.current) return;
        api = t;
        id = t.render(box.current, { sitekey: siteKey, size: "flexible", appearance: "interaction-only", callback: onToken, "expired-callback": () => onToken(""), "error-callback": () => onToken("") });
      })
      .catch(() => onToken(""));
    return () => {
      live = false;
      if (api && id) api.remove(id);
    };
  }, [siteKey, round, onToken]);
  return <div ref={box} className="empty:hidden" />;
}
