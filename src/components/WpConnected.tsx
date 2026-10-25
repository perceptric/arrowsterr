"use client";

import { useEffect, useState } from "react";
import { readAnswer, WP_ANSWER_KEY, WP_STATE_KEY } from "@/lib/wpAuthorize";

// The WordPress window, back from "Authorize Application": pass WordPress's answer to the Arrowsterr window that
// opened it (same origin only) and close. When the link back is gone (WordPress opened it in a new tab), the
// answer goes through this browser's storage, which the connect screen reads at once and clears.
// Only an answer carrying the state this browser saved when the connect started is taken (no link from elsewhere).
export function WpConnected() {
  const [text, setText] = useState("Connecting...");
  useEffect(() => {
    let expected: string | null = null;
    try {
      expected = localStorage.getItem(WP_STATE_KEY);
      localStorage.removeItem(WP_STATE_KEY);
    } catch {
      // Storage blocked: no state to match, so the answer is turned away below.
    }
    const answer = readAnswer(new URLSearchParams(window.location.search), expected);
    // The password leaves the address bar at once.
    window.history.replaceState(null, "", window.location.pathname);
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ awWordPress: answer }, window.location.origin);
      window.close();
      return;
    }
    try {
      localStorage.setItem(WP_ANSWER_KEY, JSON.stringify(answer));
    } catch {
      // Storage blocked: the message below still says what happened.
    }
    // Showing the result is the point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setText(answer.ok ? "WordPress approved Arrowsterr. You can close this tab." : answer.error);
  }, []);
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <p className="max-w-md text-center text-[14px] text-body">{text}</p>
    </main>
  );
}
