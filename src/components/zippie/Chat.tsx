"use client";

import { useEffect, useRef } from "react";
import { Zippie } from "../Zippie";
import { I, Icon, Reply } from "./Cards";
import { Composer } from "./Composer";
import { useZippie } from "./ZippieContext";

// Zippie on every page, the way Lightfield and Omniscient do it: a chat box floating at the bottom of the page names
// what's on screen; sending opens Zippie as a panel on the right that stays open from page to page. The Zippie page
// shows the same chat full width.

/** What to suggest on each page, by the page's name in the sidebar. */
const SUGGEST: Record<string, string[]> = {
  Drafts: ["Run the anti-AI review on this draft", "Link this post from older posts", "Proofread this draft"],
  Opportunities: ["Plan internal links for my top cluster", "Find pages fighting for one keyword", "Which cluster should we start with?"],
  Calendar: ["What should we publish next?", "Write a brief for the next post"],
  Research: ["Find content gaps against my competitors", "Write a brief for this keyword"],
  Traffic: ["Why did my rankings drop?", "Run a site health check"],
  Prompts: ["How visible are we in AI this month?", "Suggest new prompts to track"],
  Competitors: ["Why does AI pick my top competitor?", "Run a competitor teardown"],
  Sources: ["Which sources should we pitch?", "Draft replies for the threads AI cites"],
  Integrations: ["Fix missing meta descriptions on my site", "Add alt text to my images"],
  Skills: ["Create a skill from how we write", "Which skills fix technical SEO?"],
  Knowledge: ["Build our writer persona", "Add our pricing page to Knowledge"],
};
const START = ["Run a site health check", "Audit my homepage", "Can ChatGPT read my site?", "Write our monthly SEO report"];

/** The messages of the open chat. */
function Thread({ compact = false }: { compact?: boolean }) {
  const z = useZippie();
  const end = useRef<HTMLDivElement>(null);
  const last = z.messages[z.messages.length - 1];
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [z.messages.length, last?.text.length, last?.working, last?.cards.length]);
  return (
    <div className={`zp-thread ${compact ? "zp-thread--compact" : ""}`}>
      {z.messages.map((m) =>
        m.role === "user" ? (
          <div key={m.id} className="flex flex-col items-end gap-1">
            {m.skill || m.context ? (
              <span className="flex flex-wrap justify-end gap-1">
                {m.skill ? (
                  <span className="zp-chip zp-chip--skill">
                    <Icon d={I.box} size={12} /> {m.skill}
                  </span>
                ) : null}
                {m.context ? (
                  <span className="zp-chip">
                    <Icon d={I.doc} size={12} /> {m.context}
                  </span>
                ) : null}
              </span>
            ) : null}
            <div className="zp-user">{m.text}</div>
          </div>
        ) : (
          <Reply key={m.id} m={m} api={z.api} auth={z.auth} canEdit={z.canEdit} onSend={(t, k) => z.send(t, k ?? null)} />
        ),
      )}
      {z.error ? <div className="aw-error">{z.error}</div> : null}
      <div ref={end} />
    </div>
  );
}

/** The chat box floating at the bottom of every page. offset moves it right of a page's own list (Skills, Knowledge). */
export function ZippieDock({ offset = 0 }: { offset?: number }) {
  const z = useZippie();
  if (z.panel) return null;
  return (
    <div className="zp-dock-wrap print:hidden" style={{ ["--zp-offset" as string]: `${offset}px` }}>
      <div className="zp-dock-in">
        <Composer
          skills={z.lib.skills}
          busy={z.busy}
          here={z.where.page ? `${z.where.page}${z.where.brand ? `: ${z.where.brand}` : ""}` : null}
          pending={z.pending}
          onPending={z.setPending}
          onStop={z.stop}
          onSend={(t, k, withHere) => z.send(t, k, { here: withHere })}
          slim
        />
      </div>
    </div>
  );
}

/** Zippie on the right of the page. It stays open as people move around the app. */
export function ZippiePanel({ onOpenFull }: { onOpenFull: () => void }) {
  const z = useZippie();
  useEffect(() => {
    if (!z.panel) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented && !(e.target as HTMLElement | null)?.closest?.(".zp-cbox")) z.setPanel(false);
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [z]);
  if (!z.panel) return null;
  const title = z.threads.find((t) => t.id === z.threadId)?.title ?? "Zippie";
  return (
    <aside className="zp-panel print:hidden" aria-label="Zippie">
      <header className="zp-panel__head">
        <Zippie size={22} mood={z.busy ? "thinking" : "idle"} />
        <h2 className="min-w-0 flex-1 text-[13.5px] font-semibold text-ink wrap-break-word">{title}</h2>
        <button type="button" className="zp-icon-btn" onClick={z.newChat} aria-label="New chat" title="New chat">
          <Icon d={I.plus} size={16} />
        </button>
        <button type="button" className="zp-icon-btn" onClick={onOpenFull} aria-label="Open in Zippie" title="Open in Zippie">
          <Icon d={I.expand} size={15} />
        </button>
        <button type="button" className="zp-icon-btn" onClick={() => z.setPanel(false)} aria-label="Close" title="Close (Esc)">
          <Icon d={I.x} size={16} />
        </button>
      </header>
      <div className="zp-panel__body">
        {z.messages.length ? (
          <Thread compact />
        ) : (
          <div className="zp-panel__empty">
            <h3 className="text-[15px] font-semibold text-ink">{z.where.page ? `Ask about ${z.where.page}` : "What can Zippie do?"}</h3>
            <div className="zp-sugg zp-sugg--left">
              {(SUGGEST[z.where.page] ?? START).map((s) => (
                <button key={s} type="button" onClick={() => z.send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="zp-panel__foot">
        <Composer
          skills={z.lib.skills}
          busy={z.busy}
          here={z.where.page ? `${z.where.page}${z.where.brand ? `: ${z.where.brand}` : ""}` : null}
          pending={z.pending}
          onPending={z.setPending}
          onStop={z.stop}
          onSend={(t, k, withHere) => z.send(t, k, { here: withHere })}
        />
      </div>
    </aside>
  );
}

/** The Zippie page: the chat full width. */
export function ZippieHome() {
  const z = useZippie();
  if (z.lib.setup) return <div className="aw-callout m-6 max-w-xl">{z.lib.setup}</div>;
  if (!z.messages.length)
    return (
      <div className="zp-home">
        <Zippie size={84} mood="happy" />
        <h1 className="zp-hello">What should Zippie do?</h1>
        <p className="max-w-md text-center text-[14px] text-muted">Zippie reads your Arrowsterr data, checks your site and drafts, and prepares fixes for your CMS. You approve every change.</p>
        <div className="w-full max-w-2xl">
          <Composer skills={z.lib.skills} busy={z.busy} pending={z.pending} onPending={z.setPending} onStop={z.stop} onSend={(t, k) => z.send(t, k)} big autoFocus />
        </div>
        <div className="zp-sugg">
          {START.map((s) => (
            <button key={s} type="button" onClick={() => z.send(s)}>
              {s}
            </button>
          ))}
        </div>
        {z.error ? <div className="aw-error w-full max-w-2xl">{z.error}</div> : null}
      </div>
    );
  return (
    <div className="zp-full">
      <div className="zp-full__scroll">
        <Thread />
      </div>
      <div className="zp-full__foot">
        <Composer skills={z.lib.skills} busy={z.busy} pending={z.pending} onPending={z.setPending} onStop={z.stop} onSend={(t, k) => z.send(t, k)} />
      </div>
    </div>
  );
}
