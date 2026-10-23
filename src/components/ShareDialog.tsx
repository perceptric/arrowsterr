"use client";

import { useState } from "react";
import type { RunAuth } from "@/lib/runner";
import { fitSnapshot } from "@/lib/shareSnapshot";
import type { CompetitorsSnapshot, PromptsSnapshot } from "@/lib/reportTypes";
import { Modal } from "./reports/Dialog";
import { errText, post } from "./reports/reportApi";

// Share on Prompts and Competitors (docs/reports.md, section 32.7): the window opens at once, the page is frozen
// into a link, and the link is copied as soon as it is ready.

type State = { busy: boolean; url: string; copied: boolean; error: string } | null;

export function ShareIcon() {
  return (
    <svg className="aw-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v12M7 8l5-5 5 5M8 11H5v10h14V11h-3" />
    </svg>
  );
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** The top bar's Share: an icon button next to Download PDF. snapshot builds the frozen page when it is clicked. */
export function ShareButton({ auth, brandId, title, snapshot }: { auth: RunAuth; brandId: string; title: string; snapshot: () => Promise<PromptsSnapshot | CompetitorsSnapshot> | PromptsSnapshot | CompetitorsSnapshot }) {
  const [state, setState] = useState<State>(null);

  async function share() {
    setState({ busy: true, url: "", copied: false, error: "" });
    try {
      const data = fitSnapshot(await snapshot());
      const { url } = await post<{ url: string }>(auth, "/api/reports/share", { brandId, data });
      const copied = await copy(url);
      setState((s) => s && { ...s, busy: false, url, copied });
    } catch (e) {
      setState((s) => s && { ...s, busy: false, error: errText(e) });
    }
  }

  return (
    <>
      <button type="button" className="aw-iconbtn" aria-label="Share" title="Share" onClick={share} disabled={Boolean(state?.busy)}>
        <ShareIcon />
      </button>
      {state ? (
        <Modal title={`Share ${title}`} onClose={() => setState(null)} width="max-w-lg">
          {state.error ? (
            <p className="aw-error">{state.error}</p>
          ) : (
            <div className="flex items-center gap-2">
              <input readOnly value={state.busy ? "Creating link…" : state.url} aria-label="Share link" onFocus={(e) => e.target.select()} className="aw-input min-w-0 flex-1" />
              <button type="button" className="aw-btn aw-btn--primary shrink-0" disabled={state.busy} onClick={async () => {
                const ok = await copy(state.url);
                setState((s) => s && { ...s, copied: ok });
              }}>
                {state.copied ? "Copied" : "Copy link"}
              </button>
            </div>
          )}
          {state.url ? (
            <a href={state.url} target="_blank" rel="noopener noreferrer" className="aw-text-link self-start text-[13px]">
              Open link
            </a>
          ) : null}
        </Modal>
      ) : null}
    </>
  );
}
