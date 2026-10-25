"use client";

// The one snackbar at the bottom of the screen: "Deleted 3 prompts. Undo."
// Call snack() from anywhere; SnackHost (mounted once in App) shows it. One at a time: a new one replaces the old.
// It stays 6 seconds, Escape closes it, and Undo shows when an undo is given.
//
//   snack("Deleted 3 prompts.", { undo: () => restore(rows) });

import { useEffect, useSyncExternalStore } from "react";

type Item = { id: number; message: string; undo?: () => void | Promise<void>; ms: number };

let lastId = 0;
let current: Item | null = null;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const show = (item: Item | null) => {
  current = item;
  listeners.forEach((fn) => fn());
};
const dismiss = (id: number) => {
  if (current?.id === id) show(null);
};

/** Show a short message at the bottom of the screen, with Undo when undo is given. */
export function snack(message: string, opts: { undo?: () => void | Promise<void>; ms?: number } = {}) {
  show({ id: ++lastId, message, undo: opts.undo, ms: opts.ms ?? 6000 });
}

/** Shows the snackbar. Mount it once, near the top of the app. */
export function SnackHost() {
  const item = useSyncExternalStore(subscribe, () => current, () => null);
  useEffect(() => {
    if (!item) return;
    const timer = setTimeout(() => dismiss(item.id), item.ms);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && dismiss(item.id);
    window.addEventListener("keydown", esc);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", esc);
    };
  }, [item]);

  async function undo(it: Item) {
    dismiss(it.id);
    try {
      await it.undo?.();
    } catch (e) {
      snack(`Couldn't undo: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <div role="status" aria-live="polite" className="print:hidden">
      {item ? (
        <div key={item.id} className="aw-undo tw-snack">
          <span>{item.message}</span>
          {item.undo ? (
            <button type="button" onClick={() => undo(item)}>
              Undo
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
