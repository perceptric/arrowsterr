"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { RunAuth } from "@/lib/runner";
import type { Skill } from "@/lib/skills/format";
import type { WritingPiece } from "@/lib/writingChats";
import { useApi, type Msg } from "./Cards";
import { errorText, httpError } from "@/lib/errors";

// Zippie's chat, shared by everything that shows it (docs/zippie-skills-plan.md): the chat bar on every page, the panel
// that opens on the right and stays open from page to page, the Zippie page, and the Chats list in the sidebar. One
// chat at a time; a reply keeps streaming while you move around the app.

export type Thread = { id: string; title: string; updated_at: string; project_id: string | null; created_by?: string | null; kind?: string | null };
/** The Content writing folder and the Calendar pieces each writing chat worked on (writingChats.ts). */
export type Writing = { projectId: string | null; pieces: Record<string, WritingPiece[]> };
export type KnowledgeRow = { id: string; kind: "file" | "url" | "note"; name: string; source: string; chars: number; scope: "workspace" | "personal"; owner_id: string | null; created_at: string; updated_at: string };
export type Library = { skills: Skill[]; knowledge: KnowledgeRow[]; me: string; setup?: string };
/** Where the person is: the brand picked, the page, and the record on screen (a draft) when there is one. */
export type ZippieWhere = { brand: string | null; page: string; id?: string | null };

type Ctx = {
  auth: RunAuth;
  canEdit: boolean;
  api: ReturnType<typeof useApi>;
  threads: Thread[];
  writing: Writing;
  threadId: string | null;
  messages: Msg[];
  busy: boolean;
  error: string;
  lib: Library;
  where: ZippieWhere;
  /** The panel on the right, open or closed. Remembered on this device. */
  panel: boolean;
  setPanel: (open: boolean) => void;
  send: (text: string, skillKey?: string | null, opts?: { here?: boolean }) => void;
  /** Send the last message again, after it failed: the failed turn comes off the screen first. */
  retry: () => void;
  openThread: (id: string) => void;
  newChat: () => void;
  stop: () => void;
  reloadLib: () => void;
  removeThread: (id: string) => void;
  /** A skill picked from the Skills page, waiting in the composer. */
  pending: Pick<Skill, "key" | "title"> | null;
  setPending: (s: Pick<Skill, "key" | "title"> | null) => void;
  /** The record on screen, set by the page that shows it (the open draft). */
  setRecord: (id: string | null) => void;
};

const ZippieCtx = createContext<Ctx | null>(null);
const PANEL_KEY = "arrowsterr.zippieOpen";
const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* storage blocked */
  }
};

export function ZippieProvider({ auth, canEdit, where, onZippiePage, children }: { auth: RunAuth; canEdit: boolean; where: Omit<ZippieWhere, "id">; onZippiePage: boolean; children: React.ReactNode }) {
  const api = useApi(auth);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [writing, setWriting] = useState<Writing>({ projectId: null, pieces: {} });
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lib, setLib] = useState<Library>({ skills: [], knowledge: [], me: "" });
  const [panel, setPanelState] = useState(() => read(PANEL_KEY) === "1");
  const [pending, setPending] = useState<Pick<Skill, "key" | "title"> | null>(null);
  const [record, setRecord] = useState<string | null>(null);
  const stopRef = useRef<AbortController | null>(null);
  const here: ZippieWhere = useMemo(() => ({ brand: where.brand, page: where.page, id: record }), [where.brand, where.page, record]);

  const setPanel = useCallback((open: boolean) => {
    setPanelState(open);
    write(PANEL_KEY, open ? "1" : null);
  }, []);
  const loadThreads = useCallback(() => {
    api<{ threads: Thread[]; writing?: Writing; setup?: string }>("/api/ask", { action: "threads" })
      .then((r) => {
        setThreads(r.threads);
        setWriting(r.writing ?? { projectId: null, pieces: {} });
      })
      .catch(() => {});
  }, [api]);
  const reloadLib = useCallback(() => {
    api<Library>("/api/ask/library", { action: "list" })
      .then(setLib)
      .catch((e) => setError(errorText(e)));
  }, [api]);
  useEffect(() => {
    loadThreads();
    reloadLib();
    const again = () => reloadLib();
    window.addEventListener("zippie:library", again);
    return () => window.removeEventListener("zippie:library", again);
    // Once per workspace. auth changes identity on every app render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.workspaceId]);

  const newChat = useCallback(() => {
    stopRef.current?.abort();
    setThreadId(null);
    setMessages([]);
    setError("");
  }, []);

  const openThread = useCallback(
    async (id: string) => {
      stopRef.current?.abort();
      setThreadId(id);
      setError("");
      setMessages([]);
      // The chat's pieces may have moved on since the list loaded.
      loadThreads();
      try {
        const r = await api<{ messages: Msg[] }>("/api/ask", { action: "thread", threadId: id });
        setMessages(r.messages);
      } catch (e) {
        setError(errorText(e));
      }
    },
    [api, loadThreads],
  );

  const removeThread = useCallback(
    async (id: string) => {
      try {
        await api("/api/ask", { action: "delete", threadId: id });
        setThreads((t) => t.filter((x) => x.id !== id));
        if (id === threadId) newChat();
      } catch (e) {
        setError(errorText(e));
      }
    },
    [api, threadId, newChat],
  );

  const send = useCallback(
    async (text: string, skillKey: string | null = null, opts: { here?: boolean } = {}) => {
      const message = text.trim();
      if (!message || busy) return;
      if (!onZippiePage) setPanel(true);
      setError("");
      setBusy(true);
      const skill = skillKey ? lib.skills.find((s) => s.key === skillKey) : null;
      const at = opts.here === false ? null : here;
      const reply: Msg = { id: `a${Date.now()}`, role: "assistant", text: "", tools: [], cards: [], working: skill ? `Using ${skill.title}` : "Thinking" };
      setMessages((m) => [...m, { id: `u${Date.now()}`, role: "user", text: message, tools: [], cards: [], skill: skill?.title, context: at && !onZippiePage ? at.page : undefined }, reply]);
      const patch = (f: (m: Msg) => Msg) => setMessages((all) => all.map((m) => (m.id === reply.id ? f(m) : m)));
      const ctrl = new AbortController();
      stopRef.current = ctrl;
      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          signal: ctrl.signal,
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${await auth.token()}` },
          body: JSON.stringify({ action: "send", workspaceId: auth.workspaceId, threadId, message, skill: skillKey, where: at && !onZippiePage ? at : at ? { brand: at.brand, page: at.page === "Writer" ? "Writer" : "Zippie" } : null }),
        });
        if (!res.ok || !res.body) {
          throw httpError(res.status, await res.json().catch(() => ({})));
        }
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += value;
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const e = JSON.parse(line);
            if (e.type === "thread") {
              setThreadId(e.id);
              setThreads((t) => (t.some((x) => x.id === e.id) ? t : [{ id: e.id, title: e.title, updated_at: new Date().toISOString(), project_id: e.projectId ?? null }, ...t]));
            } else if (e.type === "text") patch((m) => ({ ...m, text: m.text + e.text, working: undefined }));
            else if (e.type === "tool") patch((m) => ({ ...m, working: e.label, text: m.text && !m.text.endsWith("\n\n") ? m.text + "\n\n" : m.text }));
            else if (e.type === "tool_done") patch((m) => ({ ...m, tools: e.name === "use_skill" ? m.tools : [...m.tools, e.name], working: "Thinking" }));
            else if (e.type === "skill") patch((m) => ({ ...m, skill: e.title }));
            else if (e.type === "changeset") patch((m) => ({ ...m, cards: [...m.cards, { kind: "changeset", id: e.id }] }));
            else if (e.type === "setup") patch((m) => ({ ...m, cards: [...m.cards, { kind: "setup", id: e.id }] }));
            else if (e.type === "proposal") patch((m) => ({ ...m, cards: [...m.cards, { kind: "proposal", id: `p${Date.now()}${m.cards.length}`, proposal: e.proposal }] }));
            else if (e.type === "writer") {
              patch((m) => ({ ...m, cards: [...m.cards, { kind: "writer", id: `w${Date.now()}${m.cards.length}`, card: e.card }] }));
              // A writer tool just linked a piece to this chat: show it in Working on.
              loadThreads();
            }
            else if (e.type === "error") setError(errorText(e));
          }
        }
      } catch (e) {
        if (!ctrl.signal.aborted) setError(errorText(e));
      } finally {
        patch((m) => ({ ...m, working: undefined, text: m.text || (ctrl.signal.aborted ? "_Stopped._" : m.text) }));
        setBusy(false);
        stopRef.current = null;
        loadThreads();
      }
    },
    [auth, busy, here, lib.skills, loadThreads, onZippiePage, setPanel, threadId],
  );
  const retry = useCallback(() => {
    const at = messages.map((m) => m.role).lastIndexOf("user");
    if (at < 0 || busy) return;
    const last = messages[at];
    setMessages((all) => all.slice(0, at));
    send(last.text, lib.skills.find((s) => s.title === last.skill)?.key ?? null);
  }, [busy, lib.skills, messages, send]);

  const value: Ctx = {
    auth,
    canEdit,
    api,
    threads,
    writing,
    threadId,
    messages,
    busy,
    error,
    lib,
    where: here,
    panel: panel && !onZippiePage,
    setPanel,
    send,
    retry,
    openThread,
    newChat,
    stop: () => stopRef.current?.abort(),
    reloadLib,
    removeThread,
    pending,
    setPending,
    setRecord,
  };
  return <ZippieCtx.Provider value={value}>{children}</ZippieCtx.Provider>;
}

/** Zippie when the page sits inside the app, or null on pages without it. */
export function useZippieMaybe(): Ctx | null {
  return useContext(ZippieCtx);
}

export function useZippie(): Ctx {
  const c = useContext(ZippieCtx);
  if (!c) throw new Error("useZippie needs ZippieProvider.");
  return c;
}

/** Tell Zippie which record is on screen (the open draft), for questions like "review this draft". */
export function useZippieRecord(id: string | null) {
  const c = useContext(ZippieCtx);
  const set = c?.setRecord;
  useEffect(() => {
    if (!set) return;
    set(id);
    return () => set(null);
  }, [set, id]);
}
