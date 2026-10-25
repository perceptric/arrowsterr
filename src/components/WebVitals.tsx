"use client";

// Page timings (docs/analytics.md): how fast each screen answers a click (INP), shows its main content (LCP)
// and how much it shifts (CLS), sent to PostHog as web_vital with the screen's name. One browser tab session
// in ten sends them, which keeps the events inside PostHog's free tier.

import { useReportWebVitals } from "next/web-vitals";
import { track } from "@/lib/analytics";
import { screenOf } from "@/lib/routes";

const SAMPLE = 0.1;
const KEY = "aw:vitals";
const WANT = new Set(["INP", "LCP", "CLS"]);

/** Chosen once per browser tab session, so a session sends all its timings or none. */
function sampled() {
  try {
    let v = sessionStorage.getItem(KEY);
    if (v === null) {
      v = Math.random() < SAMPLE ? "1" : "0";
      sessionStorage.setItem(KEY, v);
    }
    return v === "1";
  } catch {
    return false;
  }
}

// Outside the component, so the hook gets the same function each render and reports each timing once.
function report(m: { name: string; value: number; rating?: string; navigationType?: string }) {
  if (!WANT.has(m.name) || !sampled()) return;
  track("web_vital", {
    metric: m.name,
    value: m.name === "CLS" ? Math.round(m.value * 1000) / 1000 : Math.round(m.value),
    rating: m.rating,
    screen: screenOf(window.location.pathname),
    navigation: m.navigationType,
  });
}

/** Mounted once in the root layout. Draws nothing. */
export function WebVitals() {
  useReportWebVitals(report);
  return null;
}
