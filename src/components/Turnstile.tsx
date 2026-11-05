"use client";

import { useEffect, useRef } from "react";

// Cloudflare Turnstile: the bot check on the sign-in screen. Supabase checks the token on sign-up, sign-in,
// sign-in links and password resets once CAPTCHA is on in its dashboard. A token works once, so the screen
// remounts this (new `key`) after every try.

type Api = {
  render(el: HTMLElement, options: Record<string, unknown>): string;
  remove(id: string): void;
};

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

function loadTurnstile(): Promise<Api> {
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
    tag.addEventListener("load", () => (w.turnstile ? resolve(w.turnstile) : reject(new Error("The bot check did not load."))));
    tag.addEventListener("error", () => reject(new Error("The bot check did not load. Check your connection or ad blocker.")));
  });
}

export function Turnstile({ siteKey, onToken, onError }: { siteKey: string; onToken: (token: string) => void; onError: (message: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  // The latest callbacks, so a new render of the parent doesn't redraw the widget.
  const handlers = useRef({ onToken, onError });
  useEffect(() => {
    handlers.current = { onToken, onError };
  });

  useEffect(() => {
    let live = true;
    let id: string | null = null;
    loadTurnstile()
      .then((api) => {
        if (!live || !box.current) return;
        id = api.render(box.current, {
          sitekey: siteKey,
          size: "flexible",
          theme: "light",
          callback: (token: string) => handlers.current.onToken(token),
          "expired-callback": () => handlers.current.onToken(""),
          "error-callback": () => {
            handlers.current.onToken("");
            handlers.current.onError("The bot check failed. Reload the page and try again.");
          },
        });
      })
      .catch((e) => live && handlers.current.onError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
      const api = (window as unknown as { turnstile?: Api }).turnstile;
      if (id && api) api.remove(id);
    };
  }, [siteKey]);

  return <div ref={box} className="min-h-[65px] w-full" />;
}
