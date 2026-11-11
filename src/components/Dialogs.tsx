"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "./reports/Dialog";

// The app's own questions, in place of the browser's confirm() and prompt(), which look different on every computer.
// `askConfirm` and `askText` return a promise; <DialogHost /> (in the root layout) draws whichever is open.

type Ask =
  | { kind: "confirm"; title: string; text?: string; action: string; danger: boolean; resolve: (ok: boolean) => void }
  | { kind: "text"; title: string; text?: string; value: string; placeholder?: string; action: string; resolve: (v: string | null) => void };

let open: ((a: Ask) => void) | null = null;

/** Ask yes or no. Resolves true on the action button, false on Cancel, Escape or a click outside. */
export function askConfirm(o: { title: string; text?: string; action?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    if (!open) return resolve(false);
    open({ kind: "confirm", title: o.title, text: o.text, action: o.action ?? "OK", danger: o.danger ?? true, resolve });
  });
}

/** Ask for a line of text. Resolves the text (trimmed), or null when cancelled or left empty. */
export function askText(o: { title: string; text?: string; value?: string; placeholder?: string; action?: string }): Promise<string | null> {
  return new Promise((resolve) => {
    if (!open) return resolve(null);
    open({ kind: "text", title: o.title, text: o.text, value: o.value ?? "", placeholder: o.placeholder, action: o.action ?? "Save", resolve });
  });
}

export function DialogHost() {
  const [ask, setAsk] = useState<Ask | null>(null);
  const [value, setValue] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    open = (a) => {
      setAsk((cur) => {
        // A new question cancels one still open.
        if (cur?.kind === "confirm") cur.resolve(false);
        else if (cur) cur.resolve(null);
        return a;
      });
      setValue(a.kind === "text" ? a.value : "");
    };
    return () => {
      open = null;
    };
  }, []);
  useEffect(() => {
    if (ask?.kind === "text") setTimeout(() => input.current?.select(), 0);
  }, [ask]);
  if (!ask) return null;
  const close = () => {
    if (ask.kind === "confirm") ask.resolve(false);
    else ask.resolve(null);
    setAsk(null);
  };
  const done = () => {
    if (ask.kind === "confirm") ask.resolve(true);
    else ask.resolve(value.trim() || null);
    setAsk(null);
  };
  return (
    <Modal title={ask.title} onClose={close} width="max-w-md">
      {ask.text ? <p className="tw-modal__body whitespace-pre-line wrap-break-word">{ask.text}</p> : null}
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          done();
        }}
      >
        {ask.kind === "text" ? <input ref={input} className="aw-input w-full" value={value} placeholder={ask.placeholder} aria-label={ask.title} onChange={(e) => setValue(e.target.value)} /> : null}
        <div className="tw-modal__actions">
          <button type="button" className="aw-btn aw-btn--secondary" onClick={close}>
            Cancel
          </button>
          <button type="submit" autoFocus={ask.kind === "confirm"} className={`aw-btn ${ask.kind === "confirm" && ask.danger ? "aw-btn--danger" : "aw-btn--primary"}`} disabled={ask.kind === "text" && !value.trim()}>
            {ask.action}
          </button>
        </div>
      </form>
    </Modal>
  );
}
