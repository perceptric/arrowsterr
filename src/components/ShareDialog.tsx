"use client";

import { useState } from "react";
import type { RunAuth } from "@/lib/runner";
import { fitSnapshot } from "@/lib/shareSnapshot";
import type { CompetitorsSnapshot, PromptsSnapshot } from "@/lib/reportTypes";
import { CopyButton } from "./CopyButton";
import { Modal } from "./reports/Dialog";
import { LinkSettings, type LinkLock } from "./reports/LinkSettings";
import { errText, post } from "./reports/reportApi";

// Share on Prompts and Competitors (docs/reports.md, section 32.7): the window opens at once, the page is frozen
// into a link, and the link is copied as soon as it is ready.

type State = { busy: boolean; url: string; copied: boolean; error: string; link: LinkLock | null } | null;

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
export function ShareButton({
  auth,
  brandId,
  title,
  secure,
  snapshot,
}: {
  auth: RunAuth;
  brandId: string;
  title: string;
  /** The plan allows a password and an expiry date on links. */
  secure: boolean;
  snapshot: () => Promise<PromptsSnapshot | CompetitorsSnapshot> | PromptsSnapshot | CompetitorsSnapshot;
}) {
  const [state, setState] = useState<State>(null);

  async function share() {
    setState({ busy: true, url: "", copied: false, error: "", link: null });
    try {
      const data = fitSnapshot(await snapshot());
      const { url, id } = await post<{ url: string; id: string }>(auth, "/api/reports/share", { brandId, data });
      const copied = await copy(url);
      setState((s) => s && { ...s, busy: false, url, copied, link: { id, locked: false, expires_at: null } });
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
              {/* A new button once the link is ready, so it opens on "Copied" when the link was copied for you. */}
              <CopyButton key={state.url} text={state.url} className="aw-btn aw-btn--primary shrink-0" disabled={state.busy} startCopied={state.copied} />
            </div>
          )}
          {state.url ? (
            <a href={state.url} target="_blank" rel="noopener noreferrer" className="aw-text-link self-start text-[13px]">
              Open link
            </a>
          ) : null}
          {state.link ? <LinkSettings auth={auth} link={state.link} secure={secure} onSaved={(link) => setState((s) => s && { ...s, link })} /> : null}
        </Modal>
      ) : null}
    </>
  );
}
