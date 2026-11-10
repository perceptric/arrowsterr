"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BL_SCOPES, guessScope, type BlScope } from "@/lib/backlinks";
import type { RunAuth } from "@/lib/runner";
import { setUrl, urlParams } from "@/lib/researchUrl";
import { scopeOf } from "@/lib/scope";
import { Dropdown } from "./Pickers";
import { SearchBar, SearchButton } from "./SearchBar";
import { BAR_FIELD, BAR_INPUT } from "./research/shared";
import { favicon } from "./ui";
import { useApi } from "./ZippiePage";
import { AiTab } from "./backlinks/Ai";
import { BrokenTab } from "./backlinks/Broken";
import { CompareTab } from "./backlinks/Compare";
import { DomainsTab, NetworkTab, ToxicTab } from "./backlinks/Domains";
import { GapTab } from "./backlinks/Gap";
import { LinksTab } from "./backlinks/Links";
import { AnchorsTab, OverviewTab, PagesTab } from "./backlinks/Overview";
import type { Memo, Open, TabProps } from "./backlinks/shared";

// Backlinks (docs/backlinks.md): who links to any site, subdomain or page. Overview (totals, a year of growth, new and
// lost by week, authority spread, anchor mix, link attributes, endings, site types, where links sit), every linking
// site, every backlink with its words around it, anchors, linked pages, broken links to win back, the sites AI answers
// cite, the link gap against up to 10 competitors, up to 200 sites compared, the link network and toxic links with a
// disavow file. The search lives in the address bar (/backlinks?q=acme.com&view=domains), so it can be shared and Back
// steps through searches. Opening the page shows saved answers only; a search or a tab someone picks loads fresh ones
// for editors, which cost tasks.

type Brand = { id: string; name: string; domain: string };
type Tab = "overview" | "domains" | "links" | "anchors" | "pages" | "broken" | "ai" | "gap" | "compare" | "network" | "toxic";
type Q = { q: string; scope: BlScope; n: number };

const TABS: { id: Tab; label: string; isNew?: boolean }[] = [
  { id: "overview", label: "Overview" },
  { id: "domains", label: "Referring domains" },
  { id: "links", label: "Backlinks" },
  { id: "anchors", label: "Anchors" },
  { id: "pages", label: "Linked pages" },
  { id: "broken", label: "Broken" },
  { id: "ai", label: "AI-cited links", isNew: true },
  { id: "gap", label: "Link gap" },
  { id: "compare", label: "Compare" },
  { id: "network", label: "Network" },
  { id: "toxic", label: "Toxic links" },
];
const bare = (x: string) => x.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
const hostOf = (x: string) => bare(x).replace(/[/?#].*$/, "");

export function BacklinksPage({ brand, auth, canEdit }: { brand: Brand; auth: RunAuth; canEdit: boolean }) {
  const api = useApi(auth);
  const own = hostOf(brand.domain);
  const [tab, setTab] = useState<Tab>("overview");
  const [active, setActive] = useState<Q>({ q: own, scope: "domain", n: 0 });
  const [input, setInput] = useState(own);
  const [scope, setScope] = useState<BlScope>("domain");
  // Opening the page only reads saved answers. Once someone searches or picks a tab, editors load fresh ones.
  const [armed, setArmed] = useState(false);
  const [peers, setPeers] = useState<string[]>([]);
  const [error, setError] = useState("");
  const call = useCallback(
    <T,>(action: string, extra: Record<string, unknown> = {}) => api<T>("/api/backlinks", { action, brandId: brand.id, target: active.q, scope: active.scope, ...extra }),
    [api, brand.id, active.q, active.scope],
  );

  // Show what the address bar asks for, on open and on Back.
  useEffect(() => {
    const sync = () => {
      const p = urlParams();
      const q = p.get("q")?.trim() || own;
      const sc = (BL_SCOPES.some((x) => x.id === p.get("scope")) ? p.get("scope") : (p.get("q") ? guessScope(q, scopeOf) : null) ?? "domain") as BlScope;
      const v = TABS.some((t) => t.id === p.get("view")) ? (p.get("view") as Tab) : "overview";
      setInput(q);
      setScope(sc);
      setTab(v);
      setActive((a) => (bare(a.q) === bare(q) && a.scope === sc ? a : { q, scope: sc, n: a.n + 1 }));
    };
    sync();
    window.addEventListener("popstate", sync);
    api<{ competitors: string[] }>("/api/backlinks", { action: "peers", brandId: brand.id })
      .then((r) => setPeers(r.competitors ?? []))
      .catch(() => {});
    return () => window.removeEventListener("popstate", sync);
  }, [api, brand.id, own]);

  const address = (q: string, sc: BlScope, v: Tab) => ({ q: bare(q) === own && sc === "domain" ? null : q, scope: sc === "domain" ? null : sc, view: v === "overview" ? null : v });
  const open: Open = (q, sc) => {
    const next = tab === "compare" ? "overview" : tab;
    setError("");
    setArmed(true);
    setInput(q);
    setScope(sc);
    setTab(next);
    setActive((a) => ({ q: q.trim(), scope: sc, n: a.n + 1 }));
    setUrl(address(q.trim(), sc, next), true);
  };
  const pickTab = (v: Tab) => {
    setError("");
    setArmed(true);
    setTab(v);
    setUrl(address(active.q, active.scope, v), true);
  };

  const key = `${active.scope}:${active.q}:${active.n}`;
  // Answers already fetched for each search, so moving between tabs doesn't ask again.
  const [memos] = useState(() => new Map<string, Memo>());
  const memoKey = `${active.scope}:${bare(active.q)}`;
  const memo = useMemo(() => {
    if (!memos.has(memoKey)) memos.set(memoKey, new Map());
    return memos.get(memoKey)!;
  }, [memos, memoKey]);
  const isOwn = active.scope === "domain" && bare(active.q) === own;
  const label = bare(active.q);
  const hint = BL_SCOPES.find((x) => x.id === scope)!.hint;
  const props: TabProps = { call, memo, canEdit, armed, label, isOwn, onError: setError, onOpen: open };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="aw-h2 mb-0!">Backlinks</h1>
      {tab !== "compare" ? (
        <div className="flex flex-col gap-3">
          <SearchBar onSubmit={() => input.trim() && open(input, scope)}>
            <Dropdown<BlScope> label="Look at" value={scope} onChange={setScope} className={BAR_FIELD} options={BL_SCOPES.map((x) => ({ id: x.id, label: x.label }))} />
            <input
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                const g = guessScope(e.target.value, scopeOf);
                if (g) setScope(g);
              }}
              placeholder={hint}
              aria-label="Domain or URL"
              className={BAR_INPUT}
            />
            <SearchButton label="Analyze" busyLabel="Analyzing" busy={false} disabled={!input.trim()} />
          </SearchBar>
          <div className="flex flex-wrap items-center gap-2">
            {[own, ...peers].slice(0, 7).map((d) => (
              <button key={d} type="button" className="aw-chip aw-chip--btn inline-flex items-center gap-1.5" aria-pressed={active.scope === "domain" && bare(active.q) === d} onClick={() => open(d, "domain")}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={favicon(d)} alt="" width={14} height={14} className="h-3.5 w-3.5" />
                {d}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {error ? <p className="aw-error">{error}</p> : null}
      <div role="tablist" aria-label="Backlinks view" className="flex gap-1 overflow-x-auto border-b border-[var(--aw-rule)]">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => pickTab(t.id)}
            className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-[14px] font-medium whitespace-nowrap transition-colors ${tab === t.id ? "border-[var(--signal)] text-ink" : "border-transparent text-muted hover:text-ink"}`}
          >
            {t.label}
            {t.isNew ? <span className="rounded-full bg-[var(--aw-brand-pale)] px-1.5 py-px text-[10.5px] font-semibold text-[var(--signal)]">New</span> : null}
          </button>
        ))}
      </div>
      {tab === "overview" ? (
        <OverviewTab key={key} {...props} brandName={brand.name} onTab={pickTab} />
      ) : tab === "domains" ? (
        <DomainsTab key={key} {...props} />
      ) : tab === "links" ? (
        <LinksTab key={key} {...props} />
      ) : tab === "anchors" ? (
        <AnchorsTab key={key} {...props} brandName={brand.name} />
      ) : tab === "pages" ? (
        <PagesTab key={key} {...props} />
      ) : tab === "broken" ? (
        <BrokenTab key={key} {...props} />
      ) : tab === "ai" ? (
        <AiTab key={key} {...props} />
      ) : tab === "gap" ? (
        <GapTab key={key} {...props} />
      ) : tab === "network" ? (
        <NetworkTab key={key} {...props} />
      ) : tab === "toxic" ? (
        <ToxicTab key={key} {...props} brandId={brand.id} />
      ) : (
        <CompareTab brandId={brand.id} own={own} peers={peers} call={call} canEdit={canEdit} onError={setError} onOpen={open} />
      )}
    </div>
  );
}
