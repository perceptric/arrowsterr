"use client";

import { useCallback, useEffect, useState, type SetStateAction } from "react";

// Remembers what someone was doing in each tool: their search, results and tab.
// Kept in memory while the app is open and in this browser tab's session storage, so switching
// pages or reloading brings it back. Cleared on sign out.

const PREFIX = "aw:";
const mem = new Map<string, unknown>();
// Every mounted useStash, by key, so a write in one part of the page reaches the others reading the same key.
const listeners = new Map<string, Set<() => void>>();

function read<T>(key: string): T | undefined {
  if (mem.has(key)) return mem.get(key) as T;
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    if (raw !== null) {
      const v = JSON.parse(raw) as T;
      mem.set(key, v);
      return v;
    }
  } catch {
    // Storage blocked or full. Memory still works.
  }
  return undefined;
}

function write(key: string, v: unknown) {
  mem.set(key, v);
  try {
    const s = JSON.stringify(v);
    if (s.length < 1_500_000) sessionStorage.setItem(PREFIX + key, s);
    else sessionStorage.removeItem(PREFIX + key);
  } catch {
    // Storage blocked or full. Memory still works.
  }
  // After the current render, so one component's update never sets another's state mid-render.
  const subs = listeners.get(key);
  if (subs?.size) queueMicrotask(() => subs.forEach((f) => f()));
}

/** Fill a stash before any page asks for it, so the page opens with data. Never overwrites what is there. */
export function primeStash(key: string, v: unknown) {
  if (read(key) === undefined) write(key, v);
}

/** Like useState, but the value survives page switches and reloads. Use a key that names the tool and the website. */
export function useStash<T>(key: string, init: T | (() => T)) {
  const [v, setV] = useState<T>(() => {
    const saved = read<T>(key);
    return saved !== undefined ? saved : typeof init === "function" ? (init as () => T)() : init;
  });
  const set = useCallback(
    (next: SetStateAction<T>) =>
      setV((prev) => {
        const val = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        write(key, val);
        return val;
      }),
    [key],
  );
  // Stay in step with every other part of the page that reads or writes this key.
  useEffect(() => {
    const sync = () => {
      if (mem.has(key)) setV(mem.get(key) as T);
    };
    let subs = listeners.get(key);
    if (!subs) listeners.set(key, (subs = new Set()));
    subs.add(sync);
    sync();
    return () => {
      subs.delete(sync);
    };
  }, [key]);
  return [v, set] as const;
}

/** Set a saved value from outside the tool, like opening a draft from the calendar. */
export const putStash = (key: string, v: unknown) => write(key, v);

/** A saved value outside React, for loaders that want to skip a fetch. */
export const peek = <T,>(key: string) => read<T>(key);

/** Forget everything, for sign out. */
export function clearStash() {
  mem.clear();
  try {
    for (const k of Object.keys(sessionStorage)) if (k.startsWith(PREFIX)) sessionStorage.removeItem(k);
  } catch {
    // Nothing to clear.
  }
}
