"use client";

import type { ReactNode } from "react";
import { BAR_BUTTON, BAR_INPUT } from "./research/shared";
import { favicon } from "./ui";

// The search bar a tool shows above its results, the same as Keyword Research's: the fields, then one button.
// Before a tool has data, its screen is the title and this bar, nothing else.

export function SearchBar({ onSubmit, children }: { onSubmit: () => void; children: ReactNode }) {
  return (
    <form
      className="aw-frame flex flex-wrap items-center gap-3 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {children}
    </form>
  );
}

/** The brand's own site, for tools that always run on it. Looks like the search box, but can't be typed in. */
export function DomainField({ domain }: { domain: string }) {
  return (
    <span className={`${BAR_INPUT} flex items-center gap-2.5 text-[15px] text-ink`} aria-label="Site">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={favicon(domain)} alt="" width={16} height={16} className="h-4 w-4" />
      <span className="min-w-0 wrap-anywhere">{domain}</span>
    </span>
  );
}

/** The bar's one button. */
export function SearchButton({ label, busyLabel, busy, disabled = false }: { label: string; busyLabel: string; busy: boolean; disabled?: boolean }) {
  return (
    <button type="submit" className={BAR_BUTTON} disabled={busy || disabled}>
      {busy ? busyLabel : label}
    </button>
  );
}
