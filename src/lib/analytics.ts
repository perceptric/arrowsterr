// Product analytics with PostHog (docs/analytics.md): who uses which part of Arrowsterr, funnels from brief to
// publish, and session replays with every input masked. Off until NEXT_PUBLIC_POSTHOG_KEY is set; it is read at
// build time, so on Fly it goes in fly.toml under [build.args]. Events go through /ingest on our own address
// (next.config.ts), so ad blockers don't drop them. Browser only; every call is a no-op when it's off.
import posthog from "posthog-js";

export const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim() ?? "";
const on = () => Boolean(POSTHOG_KEY) && typeof window !== "undefined" && posthog.__loaded;

/** Start PostHog. Called once from instrumentation-client.ts. */
export function startAnalytics() {
  if (!POSTHOG_KEY || typeof window === "undefined") return;
  posthog.init(POSTHOG_KEY, {
    api_host: "/ingest",
    ui_host: process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || "https://us.posthog.com",
    person_profiles: "identified_only",
    capture_pageview: "history_change",
    capture_pageleave: true,
    // Replays never record what people type, API keys and passwords included.
    session_recording: { maskAllInputs: true, maskTextSelector: "[data-private]" },
  });
}

/** The signed-in person. */
export function identify(userId: string, props: { email: string; name?: string }) {
  if (on()) posthog.identify(userId, props);
}

/** The workspace the person is in, so usage reads per team as well as per person. */
export function inWorkspace(id: string, props: { name: string; plan?: string }) {
  if (on()) posthog.group("workspace", id, props);
}

/** Something worth counting, named object_verb in the past tense: brief_generated, article_synced. */
export function track(event: string, props: Record<string, string | number | boolean | null | undefined> = {}) {
  if (on()) posthog.capture(event, props);
}

/** Signed out: the next person on this browser starts fresh. */
export function resetAnalytics() {
  if (on()) posthog.reset();
}
