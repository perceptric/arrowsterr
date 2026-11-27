"use client";

import { useEffect, useState } from "react";
import { Dropdown } from "../Pickers";

export type PropertyOption = { id: string; label: string; sub?: string };

/**
 * Pick one property from a Google account: a GA4 property or a Search Console site. Loads the list once,
 * starts on `initial` (or the first), and calls `choose` with the pick. Used by the Analytics page and GA4 connect.
 */
export function PropertyPicker({ label, load, choose, initial, action = "Use this property", empty }: { label: string; load: () => Promise<PropertyOption[]>; choose: (id: string) => Promise<void>; initial?: string | null; action?: string; empty: string }) {
  const [list, setList] = useState<PropertyOption[] | null>(null);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    load()
      .then((l) => {
        if (!live) return;
        setList(l);
        setPick(l.find((o) => o.id === initial)?.id ?? l[0]?.id ?? "");
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
    // Load once: the list comes from Google.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function go() {
    setBusy(true);
    setError("");
    try {
      await choose(pick);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="aw-error">{error}</p>;
  if (!list) return <p className="aw-small">Loading from Google...</p>;
  if (!list.length) return <p className="aw-small">{empty}</p>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Dropdown label={label} value={pick} onChange={setPick} className="aw-dropdown--field h-11! min-w-72" options={list} />
      <button type="button" className="aw-btn aw-btn--primary h-11! py-0!" onClick={go} disabled={busy || !pick}>
        {busy ? "Saving..." : action}
      </button>
    </div>
  );
}
