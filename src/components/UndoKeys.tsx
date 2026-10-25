"use client";

import { useEffect } from "react";
import { onUndoMessage, ownUndo, redoLast, undoLast } from "@/lib/undo";
import { snack } from "./Snack";

/** Ctrl or Cmd + Z anywhere in the app. What it did shows in the one snackbar. */
export function UndoKeys() {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.defaultPrevented || ownUndo(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        void undoLast();
      } else if ((k === "z" && e.shiftKey) || k === "y") {
        e.preventDefault();
        void redoLast();
      }
    };
    window.addEventListener("keydown", key);
    const off = onUndoMessage((m) => snack(m));
    return () => {
      window.removeEventListener("keydown", key);
      off();
    };
  }, []);

  return null;
}
