"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { addCalendarItems, deleteCalendarItems, listCalendar, restoreCalendarItems, updateCalendarItem, type CalendarItem, type KeywordRun, type Site } from "@/lib/db";
import type { RunAuth } from "@/lib/runner";
import { useStash } from "@/lib/stash";
import { quietly, recordUndo } from "@/lib/undo";
import { canImport, importPatch } from "@/lib/writerImport";
import { snack } from "../Snack";
import type { NewPiece } from "./DayPanel";

/**
 * The Editorial Calendar's pieces for its list and calendar views: load, edit with Undo, add,
 * delete with 10 seconds to undo, and Import to Library. Every view reads the same stash.
 */
export function usePlan({ sb, auth, site }: { sb: SupabaseClient; auth: RunAuth; site: Site }) {
  const [items, setItems] = useStash<CalendarItem[] | null>(`cal:${site.id}:items`, null);
  const [runs] = useStash<KeywordRun[] | null>(`agentic:${site.id}:runs`, null);
  const [error, setError] = useState("");
  const pending = useRef<{ ids: string[]; timer: ReturnType<typeof setTimeout> } | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await listCalendar(sb, site.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setItems([]);
    }
  }, [sb, site.id, setItems]);

  useEffect(() => {
    // Loading from Supabase on first render is the point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // A delete waits 10 seconds for Undo. Leaving the page makes it final.
  const commit = useCallback(() => {
    const p = pending.current;
    if (!p) return;
    clearTimeout(p.timer);
    pending.current = null;
    deleteCalendarItems(sb, p.ids).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [sb]);
  useEffect(() => commit, [commit]);

  async function patch(id: string, p: Partial<CalendarItem>) {
    const was = items?.find((i) => i.id === id);
    if (was) {
      const back = Object.fromEntries(Object.keys(p).map((f) => [f, was[f as keyof CalendarItem]])) as Partial<CalendarItem>;
      recordUndo({ label: `a change to "${was.keyword}"`, undo: () => patch(id, back), redo: () => patch(id, p), key: `plan:${id}:${Object.keys(p).join(",")}` });
    }
    setItems((list) => (list ?? []).map((i) => (i.id === id ? { ...i, ...p } : i)));
    try {
      await updateCalendarItem(sb, id, p);
    } catch (e) {
      // Read the plan again, which puts the piece back as saved.
      snack(`Couldn't save. ${e instanceof Error ? e.message : String(e)}`);
      load();
    }
  }

  async function addOn(keyword: string, due_date: string | null, extra: Omit<NewPiece, "keyword"> = {}) {
    try {
      await addCalendarItems(sb, auth.workspaceId, [
        {
          site_id: site.id,
          keyword,
          secondary: [],
          stage: extra.stage ?? null,
          theme: null,
          volume: extra.volume ?? null,
          difficulty: extra.kd ?? null,
          intent: extra.intent ?? null,
          cpc: null,
          source: extra.notes ? "ai visibility" : "added by hand",
          due_date,
          notes: extra.notes ?? null,
          ...(extra.action === "update" && extra.url ? { action: "update" as const, current_url: extra.url } : {}),
        },
      ]);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  /** Take items off the plan at once, with 10 seconds to undo. done runs once they go. */
  function remove(ids: string[], done?: () => void) {
    if (!items) return;
    drop(ids);
    done?.();
  }
  function drop(ids: string[]) {
    if (!items) return;
    commit();
    const gone = items.filter((i) => ids.includes(i.id));
    setItems(items.filter((i) => !ids.includes(i.id)));
    pending.current = { ids, timer: setTimeout(commit, 10_000) };
    recordUndo({ label: gone.length === 1 ? `deleting "${gone[0].keyword}"` : "deleting pieces", undo: () => bringBack(gone) });
    snack(gone.length === 1 ? `Deleted "${gone[0].keyword}".` : `Deleted ${gone.length} pieces.`, { undo: () => bringBack(gone), ms: 10_000 });
  }
  /** Ctrl + Z after a delete: cancel it while it waits, or put the pieces back once it went through. */
  async function bringBack(gone: CalendarItem[]) {
    const ids = new Set(gone.map((g) => g.id));
    if (pending.current && pending.current.ids.every((id) => ids.has(id))) return undoRemove(gone);
    setItems((list) => [...(list ?? []).filter((i) => !ids.has(i.id)), ...gone]);
    await restoreCalendarItems(sb, gone);
  }
  function undoRemove(gone: CalendarItem[]) {
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current = null;
    setItems((list) => [...(list ?? []), ...gone]);
  }

  /**
   * Import to Library: sets extra.in_writer_at (src/lib/writerImport.ts) and leaves the status alone.
   * Pieces already in the writer, and published ones, are skipped. One step for Undo.
   */
  async function importToWriter(ids: string[]) {
    const todo = (items ?? []).filter((i) => ids.includes(i.id) && canImport(i));
    if (!todo.length) {
      snack("Already in the Library");
      return;
    }
    const at = new Date().toISOString();
    const before = new Map(todo.map((i) => [i.id, i.extra ?? {}]));
    const send = () => Promise.all(todo.map((i) => patch(i.id, importPatch({ extra: before.get(i.id) }, at))));
    recordUndo({
      label: todo.length === 1 ? `importing "${todo[0].keyword}"` : "importing to the Library",
      undo: () => Promise.all(todo.map((i) => patch(i.id, { extra: before.get(i.id)! }))),
      redo: send,
    });
    await quietly(send);
    snack(todo.length === 1 ? `Imported "${todo[0].keyword}" to the Library` : "Imported to the Library");
  }

  return {
    items,
    setItems,
    runs,
    error,
    setError,
    load,
    patch,
    addOn,
    remove,
    importToWriter,
  };
}
