"use client";

import { useEffect, useRef, useState } from "react";
import { Zippie } from "../Zippie";
import { I, Icon, Reply } from "./Cards";
import { Composer } from "./Composer";
import { WorkingOn } from "./WritingChats";
import { useZippie } from "./ZippieContext";
import { ErrorNote } from "../ui";

// Zippie on every page, the way Lightfield and Omniscient do it: a chat box floating at the bottom of the page names
// what's on screen; sending opens Zippie as a panel on the right that stays open from page to page. The Zippie page
// shows the same chat full width.

/** What to suggest on each page, by the page's name in the sidebar. */
const SUGGEST: Record<string, string[]> = {
  Drafts: ["Run the anti-AI review on this draft", "Link this post from older posts", "Proofread this draft"],
  Calendar: ["What should we write next?", "Plan internal links for my top cluster", "Find pages fighting for one keyword"],
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

const NEAR = 100; // px from the bottom that still counts as "at the bottom"

/**
 * Stick to the bottom, the way Claude's chat does: while the person is at the bottom, the chat stays there as anything
 * grows (the reply's words, its steps, cards that fill in as the writer works). Scrolling up stops following and shows
 * Jump to latest; sending a message always goes back down. `box` is the element that scrolls (the side panel's body),
 * or null for the page itself (the Zippie and Writer pages).
 */
function useStickToBottom(box: React.RefObject<HTMLElement | null>, content: React.RefObject<HTMLElement | null>, count: number, lastIsMine: boolean, live: boolean, chat: string | null) {
  const pinned = useRef(true);
  const [away, setAway] = useState(false);
  // `live`: the thread is on screen (and, in the panel, the panel is open), so the refs point at real elements.
  useEffect(() => {
    if (!live) return;
    const target: HTMLElement | Window = box.current ?? window;
    const onScroll = () => {
      const el = scrollerOf(box.current);
      const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR;
      pinned.current = near;
      setAway(!near);
    };
    target.addEventListener("scroll", onScroll, { passive: true });
    return () => target.removeEventListener("scroll", onScroll);
  }, [box, live]);
  // Anything that grows the thread keeps it at the bottom while pinned. Opening a chat starts at its bottom.
  useEffect(() => {
    const el = content.current;
    if (!live || !el) return;
    pinned.current = true;
    toBottom(box.current);
    const ro = new ResizeObserver(() => {
      if (pinned.current) toBottom(box.current);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [box, content, live, chat]);
  // A message just sent: back to the bottom, following again (the scroll that follows hides Jump to latest).
  useEffect(() => {
    if (!lastIsMine) return;
    pinned.current = true;
    toBottom(box.current);
  }, [box, count, lastIsMine]);
  return {
    away,
    jump: () => {
      pinned.current = true;
      setAway(false);
      toBottom(box.current, true);
    },
  };
}

/** What scrolls: the panel's body, or the page. */
const scrollerOf = (box: HTMLElement | null) => box ?? document.scrollingElement ?? document.documentElement;
const toBottom = (box: HTMLElement | null, smooth = false) => {
  const el = scrollerOf(box);
  el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
};

/** Jump to latest, floating just above the box while the person has scrolled up. */
function JumpToLatest({ show, onJump }: { show: boolean; onJump: () => void }) {
  if (!show) return null;
  return (
    <button type="button" className="zp-jump" onClick={onJump}>
      <Icon d={I.arrowDown} size={14} /> Jump to latest
    </button>
  );
}

/** The messages of the open chat. `content` measures the thread so the chat can stick to the bottom. */
function Thread({ compact = false, content }: { compact?: boolean; content: React.RefObject<HTMLDivElement | null> }) {
  const z = useZippie();
  return (
    <div ref={content} className={`zp-thread ${compact ? "zp-thread--compact" : ""}`}>
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
      {z.error ? <ErrorNote error={z.error} onRetry={z.retry} /> : null}
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
  const body = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const stick = useStickToBottom(body, content, z.messages.length, z.messages[z.messages.length - 1]?.role === "user", z.panel && z.messages.length > 0, z.threadId);
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
      <WorkingOn compact />
      <div ref={body} className="zp-panel__body">
        {z.messages.length ? (
          <Thread compact content={content} />
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
        <JumpToLatest show={stick.away && z.messages.length > 0} onJump={stick.jump} />
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
/** A suggestion under the box: plain text, or text sent with a skill. */
export type Suggestion = string | { text: string; skill: string };

/** The Zippie page, and the Writer (Plan & Create › Writer) with its own hello, suggestions and a line under them. */
export function ZippieHome({
  hello = "What should Zippie do?",
  intro = "Zippie reads your Arrowsterr data, checks your site and drafts, and prepares fixes for your CMS. You approve every change.",
  start = START,
  footer,
}: { hello?: string; intro?: string; start?: Suggestion[]; footer?: React.ReactNode } = {}) {
  const z = useZippie();
  // The page itself scrolls here (no box): the thread sticks to the bottom of the window.
  const page = useRef<HTMLElement | null>(null);
  const content = useRef<HTMLDivElement>(null);
  const stick = useStickToBottom(page, content, z.messages.length, z.messages[z.messages.length - 1]?.role === "user", z.messages.length > 0, z.threadId);
  if (z.lib.setup) return <div className="aw-callout m-6 max-w-xl">{z.lib.setup}</div>;
  if (!z.messages.length)
    return (
      <div className="zp-home">
        <Zippie size={84} mood="happy" />
        <h1 className="zp-hello">{hello}</h1>
        <p className="max-w-md text-center text-[14px] text-muted">{intro}</p>
        <div className="w-full max-w-2xl">
          <Composer skills={z.lib.skills} busy={z.busy} pending={z.pending} onPending={z.setPending} onStop={z.stop} onSend={(t, k) => z.send(t, k)} big autoFocus />
        </div>
        <div className="zp-sugg">
          {start.map((s) => {
            const text = typeof s === "string" ? s : s.text;
            return (
              <button key={text} type="button" onClick={() => (typeof s === "string" ? z.send(s) : z.send(s.text, s.skill))}>
                {text}
              </button>
            );
          })}
        </div>
        {footer}
        {z.error ? <ErrorNote error={z.error} onRetry={z.retry} className="w-full max-w-2xl" /> : null}
      </div>
    );
  return (
    <div className="zp-full">
      <WorkingOn />
      <div className="zp-full__scroll">
        <Thread content={content} />
      </div>
      <div className="zp-full__foot">
        <JumpToLatest show={stick.away} onJump={stick.jump} />
        <Composer skills={z.lib.skills} busy={z.busy} pending={z.pending} onPending={z.setPending} onStop={z.stop} onSend={(t, k) => z.send(t, k)} />
      </div>
    </div>
  );
}
