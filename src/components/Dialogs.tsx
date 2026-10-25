"use client";

// The app's questions, in place of the browser's confirm(), prompt() and alert().
// Call askConfirm, askText or tell from anywhere; DialogHost (mounted once in App) shows them one at a time.
// Enter confirms, Escape or a click outside cancels. Focus goes to the field, or to the confirm button.
//
//   if (await askConfirm({ title: "Delete Acme?", text: "Its results will be deleted.", action: "Delete", danger: true })) ...
//   const name = await askText({ title: "New workspace", label: "Name", action: "Create" });
//   await tell({ title: "Saved", text: "The report is on its way." });

import { useState, useSyncExternalStore } from "react";
import { Modal } from "./reports/Dialog";

type Body =
  | { kind: "confirm"; title: string; text: string; action: string; danger: boolean; done: (v: boolean) => void }
  | { kind: "text"; title: string; label: string; value: string; action: string; done: (v: string | null) => void }
  | { kind: "tell"; title: string; text: string; done: () => void };
type Ask = Body & { id: number };

let lastId = 0;
const queue: Ask[] = [];
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const push = (a: Body) => {
  queue.push({ ...a, id: ++lastId });
  notify();
};
const settle = (a: Ask) => {
  const i = queue.indexOf(a);
  if (i >= 0) queue.splice(i, 1);
  notify();
};

/** Ask before doing something. Resolves true when the person confirms. danger makes the button red. */
export function askConfirm({ title, text, action, danger = false }: { title: string; text: string; action: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => push({ kind: "confirm", title, text, action, danger, done: resolve }));
}

/** Ask for one line of text. Resolves the trimmed text, or null when cancelled or left empty. */
export function askText({ title, label, value = "", action = "Save" }: { title: string; label: string; value?: string; action?: string }): Promise<string | null> {
  return new Promise((resolve) => push({ kind: "text", title, label, value, action, done: resolve }));
}

/** Tell the person something that needs their attention. Resolves when they close it. */
export function tell({ title, text }: { title: string; text: string }): Promise<void> {
  return new Promise((resolve) => push({ kind: "tell", title, text, done: resolve }));
}

/** Shows the questions. Mount it once, near the top of the app. */
export function DialogHost() {
  const top = useSyncExternalStore(subscribe, () => queue[0] ?? null, () => null);
  if (!top) return null;
  // A new key for each question, so a text field starts from its own value.
  return <Question key={top.id} ask={top} />;
}

function Question({ ask }: { ask: Ask }) {
  const [text, setText] = useState(ask.kind === "text" ? ask.value : "");
  const cancel = () => {
    settle(ask);
    if (ask.kind === "confirm") ask.done(false);
    else if (ask.kind === "text") ask.done(null);
    else ask.done();
  };
  const confirm = () => {
    settle(ask);
    if (ask.kind === "confirm") ask.done(true);
    else if (ask.kind === "text") ask.done(text.trim() || null);
    else ask.done();
  };
  return (
    <Modal title={ask.title} onClose={cancel} width="max-w-md">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          confirm();
        }}
      >
        {ask.kind === "text" ? (
          <label className="flex flex-col gap-1.5">
            <span className="aw-label">{ask.label}</span>
            <input className="aw-input" value={text} onChange={(e) => setText(e.target.value)} autoFocus onFocus={(e) => e.currentTarget.select()} />
          </label>
        ) : (
          <p className="tw-modal__body">{ask.text}</p>
        )}
        <div className="tw-modal__actions">
          {ask.kind === "tell" ? null : (
            <button type="button" className="aw-btn aw-btn--secondary" onClick={cancel}>
              Cancel
            </button>
          )}
          <button
            type="submit"
            autoFocus={ask.kind !== "text"}
            disabled={ask.kind === "text" && !text.trim()}
            className={`aw-btn ${ask.kind === "confirm" && ask.danger ? "aw-btn--danger" : "aw-btn--primary"}`}
          >
            {ask.kind === "tell" ? "Close" : ask.action}
          </button>
        </div>
      </form>
    </Modal>
  );
}
