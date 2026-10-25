"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";
import type { RunAuth } from "@/lib/runner";
import { ToolIntro } from "../ToolIntro";
import { Thinking } from "../ui";
import { Confirm, Modal } from "./Dialog";
import { LinkSettings, type LinkLock } from "./LinkSettings";
import { ago, errText, post } from "./reportApi";

// Reports → Links (docs/reports.md, section 32.7): every link shared from the app, with its views. Editors add a
// password or an expiry date, or revoke a link so it stops opening at once.

type LinkRow = LinkLock & { token: string | null; mode: "live" | "frozen"; brand_id: string | null; kind: string | null; revoked_at: string | null; views: number; last_viewed_at: string | null; created_at: string };
const expired = (l: LinkLock, now: number) => Boolean(l.expires_at && Date.parse(l.expires_at) < now);
// The kind is read from inside the snapshot, so the snapshot itself (up to a few MB) never loads here.
const COLS = "id, token, mode, brand_id, kind:snapshot->>kind, locked, expires_at, revoked_at, views, last_viewed_at, created_at";
const TITLES: Record<string, string> = { prompts: "AI Visibility by Prompt", competitors: "Competitive Analysis in AI Answers", intel: "Content Performance" };
const day = (t: string) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export function LinksTab({ sb, auth, brands, canEdit, secure }: { sb: SupabaseClient; auth: RunAuth; brands: { id: string; name: string }[]; canEdit: boolean; secure: boolean }) {
  const [links, setLinks] = useState<LinkRow[] | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [editing, setEditing] = useState<LinkRow | null>(null);
  const [revoking, setRevoking] = useState<LinkRow | null>(null);
  const [busy, setBusy] = useState(false);
  // When the list loaded, for telling which links have expired.
  const [now, setNow] = useState(0);

  const load = useCallback(async () => {
    const { data, error: e } = await sb.from("report_links").select(COLS).eq("workspace_id", auth.workspaceId).order("created_at", { ascending: false }).limit(200);
    if (e) setError(/report_links/.test(e.message) ? "Run supabase/043_reports.sql in Supabase." : e.message);
    else {
      setNow(Date.now());
      setLinks((data ?? []) as unknown as LinkRow[]);
    }
  }, [sb, auth.workspaceId]);
  useEffect(() => {
    // Loading the links when the tab opens is the point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const url = (l: LinkRow) => `${window.location.origin}/r/${l.token}`;
  const patch = (id: string, p: Partial<LinkRow>) => setLinks((x) => x?.map((l) => (l.id === id ? { ...l, ...p } : l)) ?? null);

  async function copy(l: LinkRow) {
    try {
      // Links made after tokens were hashed have no token saved: the server rebuilds the address.
      const link = l.token ? url(l) : (await post<{ url: string }>(auth, "/api/reports/links", { action: "url", id: l.id })).url;
      await navigator.clipboard.writeText(link);
      setCopied(l.id);
    } catch {
      setError("The link could not be copied. Open it and copy it from the address bar.");
    }
  }

  async function revoke(l: LinkRow) {
    setBusy(true);
    try {
      await post(auth, "/api/reports/links", { action: "revoke", id: l.id });
      patch(l.id, { revoked_at: new Date().toISOString() });
      setRevoking(null);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  if (!links) return error ? <p className="aw-error max-w-2xl">{error}</p> : <Thinking text="Loading your links..." />;
  const brandName = (id: string | null) => brands.find((b) => b.id === id)?.name ?? "–";
  const state = (l: LinkRow) =>
    l.revoked_at ? (
      <span className="aw-status aw-status--missed">Revoked</span>
    ) : expired(l, now) ? (
      <span className="aw-status aw-status--warn">Expired</span>
    ) : (
      <span className="aw-status aw-status--ranked">Open</span>
    );

  return (
    <>
      {error ? <p className="aw-error">{error}</p> : null}
      {!links.length ? (
        <ToolIntro eyebrow="Links" title="Links you share land here" lead="Click Share on Prompts or Competitors. Each link shows here with its views, and you can add a password, set an expiry date or revoke it." />
      ) : (
        <section className="aw-frame overflow-x-auto">
          <table className="aw-table aw-table--compact">
            <thead>
              <tr>
                <th>Report</th>
                <th>Brand</th>
                <th>Shared</th>
                <th className="text-right">Views</th>
                <th>Expires</th>
                <th>State</th>
                <th className="w-56" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {links.map((l) => {
                const open = !l.revoked_at;
                return (
                  <tr key={l.id}>
                    <td className="font-medium text-ink">
                      {TITLES[l.kind ?? ""] ?? "Client report"}
                      {l.locked ? <span className="aw-status aw-status--pending ml-2 align-middle">Password</span> : null}
                    </td>
                    <td>{brandName(l.brand_id)}</td>
                    <td className="text-[13px] text-muted">{day(l.created_at)}</td>
                    <td className="aw-num text-right text-[13px]" title={l.last_viewed_at ? `Last viewed ${ago(l.last_viewed_at)}` : undefined}>
                      {l.views.toLocaleString("en-US")}
                    </td>
                    <td className="text-[13px] text-muted">{l.expires_at ? day(l.expires_at) : "Never"}</td>
                    <td>{state(l)}</td>
                    <td className="text-right">
                      <span className="inline-flex items-center gap-2">
                        {open ? (
                          <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => copy(l)}>
                            {copied === l.id ? "Copied" : "Copy link"}
                          </button>
                        ) : null}
                        {open && canEdit ? (
                          <>
                            <button type="button" className="aw-btn aw-btn--ghost aw-btn--sm" onClick={() => setEditing(l)}>
                              Settings
                            </button>
                            <button type="button" className="aw-btn aw-btn--ghost aw-btn--sm" onClick={() => setRevoking(l)}>
                              Revoke
                            </button>
                          </>
                        ) : null}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
      {editing ? (
        <Modal title="Link settings" onClose={() => setEditing(null)} width="max-w-lg">
          <input readOnly value={url(editing)} aria-label="Share link" onFocus={(e) => e.target.select()} className="aw-input w-full" />
          <LinkSettings
            auth={auth}
            link={editing}
            secure={secure}
            onSaved={(l) => {
              patch(l.id, l);
              setEditing((x) => (x ? { ...x, ...l } : x));
            }}
          />
        </Modal>
      ) : null}
      {revoking ? (
        <Confirm title="Revoke this link?" text="It stops opening for everyone at once. Share the page again for a new link." action="Revoke" busy={busy} onConfirm={() => revoke(revoking)} onClose={() => setRevoking(null)} />
      ) : null}
    </>
  );
}
