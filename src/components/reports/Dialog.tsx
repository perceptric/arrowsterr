"use client";

import { useEffect, useRef } from "react";

/** Tailwind width names the callers pass, as Twenty's modal sizes. */
const MODAL_SIZE: Record<string, string> = { "max-w-sm": "tw-modal--sm", "max-w-md": "", "max-w-lg": "tw-modal--md", "max-w-xl": "tw-modal--md", "max-w-2xl": "tw-modal--lg", "max-w-3xl": "tw-modal--lg", "max-w-4xl": "tw-modal--lg" };

// Open dialogs, newest last.
const stack: object[] = [];

/** The app's dialog, in place of the browser's. Escape or a click outside closes it. */
export function Modal({ title, onClose, children, width = "max-w-lg" }: { title: string; onClose: () => void; children: React.ReactNode; width?: string }) {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    // Only the newest dialog answers Escape, so a question asked from a dialog closes first. On document, so a
    // pop-up inside closes before it (pop-ups stop Escape on the way down), and marked handled, so the Zippie
    // panel under a dialog stays open.
    const me = {};
    stack.push(me);
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || stack[stack.length - 1] !== me) return;
      e.preventDefault();
      close.current();
    };
    document.addEventListener("keydown", esc);
    return () => {
      stack.splice(stack.indexOf(me), 1);
      document.removeEventListener("keydown", esc);
    };
  }, []);
  return (
    <div className="tw-overlay print:hidden" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()} className={`tw-modal ${MODAL_SIZE[width] ?? "tw-modal--md"}`}>
        <div className="flex items-start justify-between gap-4">
          <h2 className="tw-modal__title">{title}</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="aw-icon-btn -mt-1 -mr-1">
            <svg className="aw-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Ask before something that can't be undone. */
export function Confirm({ title, text, action, busy, error, onConfirm, onClose }: { title: string; text: string; action: string; busy?: boolean; error?: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal title={title} onClose={onClose} width="max-w-md">
      <p className="tw-modal__body">{text}</p>
      {error ? <p className="aw-error">{error}</p> : null}
      <div className="tw-modal__actions">
        <button type="button" className="aw-btn aw-btn--secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="button" autoFocus className="aw-btn aw-btn--danger" disabled={busy} onClick={onConfirm}>
          {busy ? "Working..." : action}
        </button>
      </div>
    </Modal>
  );
}
