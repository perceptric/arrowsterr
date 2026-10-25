// Back keeps your place: each history entry remembers how far down the window was, in this browser tab's
// session storage, and going back or forward scrolls there again once the screen is tall enough.
// Browser only. Every storage call is guarded, so blocked storage only loses the remembered place.

const PREFIX = "aw:scroll:";
/** How long a restore waits for the screen to fill before it scrolls as far as it can. */
const WAIT_MS = 1500;

let restoring = 0;
let lastRestore = 0;

const newKey = () => Math.random().toString(36).slice(2, 10);

/** The current entry's key, given one when it has none. Keeps the rest of the entry's state. */
function entryKey(): string {
  const state = (window.history.state ?? null) as Record<string, unknown> | null;
  if (typeof state?.awScroll === "string") return state.awScroll;
  const key = newKey();
  try {
    window.history.replaceState({ ...(state ?? {}), awScroll: key }, "");
  } catch {
    // Some browsers limit replaceState calls. The place is only kept in memory then.
  }
  return key;
}

function save(key: string, y: number) {
  try {
    sessionStorage.setItem(PREFIX + key, String(Math.round(y)));
  } catch {
    // Storage blocked or full.
  }
}

function read(key: string): number | null {
  try {
    const v = sessionStorage.getItem(PREFIX + key);
    return v === null ? null : Number(v) || 0;
  } catch {
    return null;
  }
}

/** Scroll to y once the page is tall enough for it, or after WAIT_MS as far as it goes. */
function restore(y: number) {
  const me = ++lastRestore;
  restoring = me;
  const start = performance.now();
  const step = () => {
    if (restoring !== me) return;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (max >= y || performance.now() - start > WAIT_MS) {
      window.scrollTo(0, Math.min(y, Math.max(0, max)));
      requestAnimationFrame(() => {
        if (restoring === me) restoring = 0;
      });
      return;
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Start keeping the scroll place per history entry. Returns the function that stops it. */
export function keepScroll() {
  try {
    window.history.scrollRestoration = "manual";
  } catch {
    // Older browsers: they restore on their own, less well.
  }
  let frame = 0;
  const onScroll = () => {
    if (restoring || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!restoring) save(entryKey(), window.scrollY);
    });
  };
  const onBack = () => restore(read(entryKey()) ?? 0);
  // The person scrolling or typing during a restore wins.
  const cancel = () => {
    restoring = 0;
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("popstate", onBack);
  window.addEventListener("wheel", cancel, { passive: true });
  window.addEventListener("touchstart", cancel, { passive: true });
  window.addEventListener("keydown", cancel);
  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("popstate", onBack);
    window.removeEventListener("wheel", cancel);
    window.removeEventListener("touchstart", cancel);
    window.removeEventListener("keydown", cancel);
  };
}
