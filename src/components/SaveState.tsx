"use client";

// The save line at the top of a settings page: the error when a save failed, or what was just saved.

export function SaveState({ error, saved }: { error: string; saved: string }) {
  if (error)
    return (
      <p className="aw-error" role="alert">
        {error}
      </p>
    );
  if (saved)
    return (
      <p className="aw-callout text-[15px]!" role="status">
        {saved}
      </p>
    );
  return null;
}
