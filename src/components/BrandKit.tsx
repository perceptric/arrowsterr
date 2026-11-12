"use client";
/* eslint-disable @next/next/no-img-element -- logos come from any site, like BrandLogo */

import type { SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import { preinit } from "react-dom";
import { cleanKit, contrast, DEFAULT_KIT, kitCss, kitToTheme, readKitStream, type BrandKit, type KitColors, type KitPart, type KitRow } from "@/lib/brandKit";
import { FONTS, fontStack, fontsUrl, type Font } from "@/lib/reportTheme";
import type { RunAuth } from "@/lib/runner";
import { Copy } from "./InstallGuide";
import { Dropdown } from "./Pickers";
import { EmptyScreen } from "./Drawing";
import { Zippie } from "./Zippie";

// Brand Kits (docs/reports.md, section 31): the learning animation shown in onboarding and Settings,
// and the Settings → Brand Kit page.

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const NOT_RUN = "Run supabase/045_brand_kits.sql in Supabase to save Brand Kits.";

/** Learn a kit. onPart gets each part as the agent finds it; the promise ends with the finished kit. */
export async function streamKit(auth: RunAuth, website: string, brandId: string | null, onPart: (p: KitPart) => void) {
  const res = await fetch("/api/brand-kit", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await auth.token()}` },
    body: JSON.stringify({ workspaceId: auth.workspaceId, website, brandId }),
  });
  if (!res.ok || !res.body) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || `The server returned ${res.status}.`);
  }
  return readKitStream(res.body.pipeThrough(new TextDecoderStream()), onPart);
}

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// The show runs in this order. Each stage waits for its real data, and stays on screen long enough to read.
const STAGES = ["scan", "colors", "fonts", "logo", "cover", "saved"] as const;
type Got = { title?: string; colors?: string[]; fonts?: string[]; logo?: { logo: string; onDark: boolean }; done?: Extract<KitPart, { part: "done" }> };

function useStage(got: Got) {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const next = stage + 1;
    if (next >= STAGES.length) return;
    const finished = Boolean(got.done);
    // Colors and fonts may never come (a site with no CSS to read). The logo means they are not coming.
    const ready = [true, Boolean(got.colors || got.logo || finished), Boolean(got.fonts || got.logo || finished), Boolean(got.logo || finished), finished, finished][next];
    if (!ready) return;
    // With reduced motion the finished kit shows at once. Skipped stages pass at once too.
    const jump = reducedMotion() && finished;
    const skip = (next === 1 && !got.colors) || (next === 2 && !got.fonts);
    const t = setTimeout(() => setStage(jump ? STAGES.length - 1 : next), jump || skip ? 0 : next === STAGES.length - 1 ? 1300 : 850);
    return () => clearTimeout(t);
  }, [stage, got]);
  return STAGES[stage];
}

/**
 * Zippie reads a website and builds its Brand Kit on screen: the site, its colors, its fonts, its logo, then a
 * report cover that turns from Arrowsterr's look into theirs. onDone gets the saved kit.
 */
export function KitLearn({ auth, website, brandId = null, onDone, onAnother, onSkip }: { auth: RunAuth; website: string; brandId?: string | null; onDone: (kit: BrandKit, saved: boolean) => void; onAnother?: () => void; onSkip?: () => void }) {
  const [got, setGot] = useState<Got>({});
  const [error, setError] = useState("");
  const [tries, setTries] = useState(0);
  const started = useRef("");
  const stage = useStage(got);
  const at = STAGES.indexOf(stage);
  const domain = website.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLowerCase();

  useEffect(() => {
    const key = `${website}|${brandId}|${tries}`;
    if (started.current === key) return; // once per try, also under React's double effects in development
    started.current = key;
    setGot({});
    setError("");
    streamKit(auth, website, brandId, (p) =>
      setGot((g) => {
        if (p.part === "site") return { ...g, title: p.title };
        if (p.part === "colors") return { ...g, colors: p.colors };
        if (p.part === "fonts") return { ...g, fonts: p.fonts };
        if (p.part === "logo") return { ...g, logo: { logo: p.logo, onDark: p.onDark } };
        if (p.part === "done") return { ...g, done: p };
        return g;
      }),
    ).catch((e) => setError(message(e)));
  }, [auth, website, brandId, tries]);

  const kit = got.done?.kit;
  const say = error
    ? "We could not read that site."
    : {
        scan: `Scanning ${domain}…`,
        colors: "Nice color palette.",
        fonts: "Reading your fonts.",
        logo: got.logo?.logo ? "Found your logo." : "No logo found. We set your name instead.",
        cover: "Putting your brand on a report.",
        saved: got.done?.saved === false ? NOT_RUN : "Brand Kit saved.",
      }[stage];
  const swatches = kit && at >= 4 ? [kit.colors.primary, kit.colors.secondary, kit.colors.ink, kit.colors.paper] : (got.colors ?? []);

  return (
    <section className="aw-kit" aria-label="Brand Kit">
      <p className="aw-kit__say" aria-live="polite">
        {say}
      </p>
      <div className={`aw-kit__card ${error ? "is-failed" : ""}`}>
        <div className="aw-kit__mark">
          {at >= 3 && got.logo?.logo ? (
            <img key="logo" className={`aw-kit__logo ${got.logo.onDark ? "is-on-dark" : ""}`} src={got.logo.logo} alt={`${kit?.name || got.title || domain} logo`} />
          ) : at >= 3 ? (
            <span key="name" className="aw-kit__name" style={{ fontFamily: kit ? fontStack(kit.fonts.heading) : undefined }}>
              {kit?.name || got.title || domain}
            </span>
          ) : (
            <Zippie key="zippie" size={56} mood={error ? "idle" : "thinking"} />
          )}
        </div>

        <ul className="aw-kit__swatches" aria-label="Colors">
          {at >= 1
            ? swatches.map((c, i) => (
                <li key={`${at >= 4 ? "kit" : "site"}-${c}-${i}`} style={{ background: c, animationDelay: `${i * 80}ms` }}>
                  <span className="aw-num">{c}</span>
                </li>
              ))
            : null}
        </ul>

        <div className="aw-kit__fonts" aria-label="Fonts">
          {kit && at >= 4 ? (
            <>
              <FontSample font={kit.fonts.heading} role="Headings" />
              <FontSample font={kit.fonts.body} role="Text" />
            </>
          ) : at >= 2 ? (
            (got.fonts ?? []).map((f, i) => (
              <span key={f} className="aw-kit__font" style={{ animationDelay: `${i * 80}ms` }}>
                {f}
              </span>
            ))
          ) : null}
        </div>

        <KitCover kit={at >= 4 && kit ? kit : null} />
      </div>

      {error ? (
        <div className="aw-kit__actions">
          <p className="aw-error">{error}</p>
          <button type="button" className="aw-btn aw-btn--accent" onClick={() => setTries((n) => n + 1)}>
            Try again
          </button>
          {onAnother ? (
            <button type="button" className="aw-text-link" onClick={onAnother}>
              Use another website
            </button>
          ) : null}
          {onSkip ? (
            <button type="button" className="aw-text-link text-muted!" onClick={onSkip}>
              Skip for now
            </button>
          ) : null}
        </div>
      ) : stage === "saved" && got.done ? (
        <div className="aw-kit__actions">
          <button type="button" className="aw-btn aw-btn--accent aw-btn--lg" onClick={() => onDone(got.done!.kit, got.done!.saved)}>
            Looks right →
          </button>
          {onAnother ? (
            <button type="button" className="aw-text-link" onClick={onAnother}>
              Use another website
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function FontSample({ font, role }: { font: Font; role: string }) {
  return (
    <span className="aw-kit__sample">
      <b style={{ fontFamily: fontStack(font) }}>Aa</b>
      <span>
        {font}
        <small>{role}</small>
      </span>
    </span>
  );
}

/** A small report cover in a kit's look. With no kit it shows Arrowsterr's own, ready to turn into theirs. */
export function KitCover({ kit }: { kit: BrandKit | null }) {
  const k = kit ?? { ...DEFAULT_KIT, name: "Your brand" };
  const t = kitToTheme(k);
  // Load the kit's fonts once into <head>.
  if (kit) preinit(fontsUrl(t), { as: "style", precedence: "default" });
  const vars = {
    "--k-hero": t.heroBg,
    "--k-hero-text": t.heroText,
    "--k-paper": t.paper,
    "--k-surface": t.surface,
    "--k-ink": t.ink,
    "--k-text": t.text,
    "--k-muted": t.muted,
    "--k-line": t.line,
    "--k-accent": t.accent,
    "--k-accent2": t.accent2,
    "--k-radius": `${Math.min(t.radius, 14)}px`,
    "--k-heading": fontStack(t.heading),
    "--k-body": fontStack(t.body),
  } as React.CSSProperties;
  return (
    <div className={`aw-kit__cover ${kit ? "is-theirs" : ""}`} style={vars} aria-hidden="true">
      <div className="aw-kit__hero">
        {kit?.logo ? <img src={kit.logo} alt="" /> : <b>{k.name}</b>}
        <span>AI visibility report</span>
      </div>
      <div className="aw-kit__body">
        <div className="aw-kit__kpis">
          <span>
            <small>Visibility</small>
            <b>64%</b>
          </span>
          <span>
            <small>Share of voice</small>
            <b>38%</b>
          </span>
        </div>
        <div className="aw-kit__bars">
          {[82, 64, 48, 31].map((w, i) => (
            <i key={i} style={{ width: `${w}%`, background: i ? "var(--k-accent2)" : "var(--k-accent)" }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────── Settings → Brand Kit ───────────────────────────────

const COLOR_FIELDS: { id: keyof KitColors; label: string }[] = [
  { id: "primary", label: "Main color" },
  { id: "secondary", label: "Second color" },
  { id: "ink", label: "Headings" },
  { id: "text", label: "Text" },
  { id: "muted", label: "Small notes" },
  { id: "paper", label: "Page" },
  { id: "surface", label: "Cards" },
  { id: "line", label: "Borders" },
];

type BrandLite = { id: string; name: string; domain: string };

/** Load the workspace's kits. null means the table is missing. */
function useKits(sb: SupabaseClient, workspaceId: string) {
  const [rows, setRows] = useState<KitRow[] | null | undefined>(undefined);
  const load = () =>
    sb
      .from("brand_kits")
      .select("key, brand_id, website, kit, learned_at, confirmed_at")
      .eq("workspace_id", workspaceId)
      .then(({ data, error }) => setRows(error ? (/brand_kits/.test(error.message) ? null : []) : ((data ?? []) as KitRow[]).map((r) => ({ ...r, kit: cleanKit(r.kit) }))));
  useEffect(() => {
    void load();
    // Once per workspace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);
  return { rows, reload: load };
}

/** Learn a kit from a website: one field and one button. */
function LearnForm({ website, canEdit, label, onLearn }: { website: string; canEdit: boolean; label: string; onLearn: (site: string) => void }) {
  const [site, setSite] = useState(website);
  return (
    <form
      className="flex flex-wrap gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (site.trim()) onLearn(site.trim());
      }}
    >
      <input value={site} onChange={(e) => setSite(e.target.value)} placeholder="acme.com" aria-label="Website" className="aw-input w-64!" disabled={!canEdit} />
      <button type="submit" className="aw-btn aw-btn--accent" disabled={!canEdit || !site.trim()}>
        {label}
      </button>
    </form>
  );
}

/** Mark a kit as looked at and right, after it was learned. */
const confirm = (sb: SupabaseClient, workspaceId: string, key: string) => sb.from("brand_kits").update({ confirmed_at: new Date().toISOString() }).eq("workspace_id", workspaceId).eq("key", key);

/**
 * The Workspace Brand Kit: the workspace's own look, used on its reports. Every workspace has one
 * (supabase/058_workspace_kits.sql); if the starter kit is missing, an editor's visit makes it.
 * Until it is learned or saved, a bar on top offers to learn it from a website.
 */
export function WorkspaceKitPanel({ sb, auth, canEdit, website, name }: { sb: SupabaseClient; auth: RunAuth; canEdit: boolean; website: string; name: string }) {
  const { rows, reload } = useKits(sb, auth.workspaceId);
  const [learning, setLearning] = useState<string | null>(null);
  const making = useRef(false);
  const own = rows?.find((r) => r.key === "workspace");
  useEffect(() => {
    if (!rows || own || !canEdit || making.current) return;
    making.current = true;
    void sb
      .from("brand_kits")
      .upsert({ workspace_id: auth.workspaceId, key: "workspace", kit: cleanKit({ name }) }, { onConflict: "workspace_id,key", ignoreDuplicates: true })
      .then(() => reload());
  }, [rows, own, canEdit, sb, auth.workspaceId, name, reload]);

  if (rows === undefined) return <p className="aw-small">Loading…</p>;
  if (rows === null) return <p className="aw-callout max-w-xl text-[15px]!">{NOT_RUN}</p>;
  if (learning)
    return (
      <KitLearn
        key={learning}
        auth={auth}
        website={learning}
        brandId={null}
        onDone={async () => {
          await confirm(sb, auth.workspaceId, "workspace");
          setLearning(null);
          void reload();
        }}
        onSkip={() => setLearning(null)}
      />
    );
  if (!own) return canEdit ? <p className="aw-small">Loading…</p> : <p className="aw-callout max-w-xl text-[15px]!">No Workspace Brand Kit yet.</p>;
  const starter = !own.learned_at && !own.confirmed_at;
  return (
    <div className="flex flex-col gap-6">
      {starter && canEdit ? (
        <div className="aw-frame flex flex-wrap items-center justify-between gap-3 p-4">
          <span className="font-medium text-ink">Learn {name}&apos;s brand from its website</span>
          <LearnForm website={own.website || website} canEdit={canEdit} label="Learn" onLearn={setLearning} />
        </div>
      ) : null}
      <KitEditor key={`ws-${own.learned_at ?? ""}`} sb={sb} workspaceId={auth.workspaceId} row={own} canEdit={canEdit} onLearn={() => setLearning(own.website || website)} />
    </div>
  );
}

/** Settings → Brand Kit: the Workspace Brand Kit, then each client brand's kit on white label plans. */
export function BrandKitSettings({ sb, auth, canEdit, website, brands, clientKits, name }: { sb: SupabaseClient; auth: RunAuth; canEdit: boolean; website: string; brands: BrandLite[]; clientKits: boolean; name: string }) {
  const { rows, reload } = useKits(sb, auth.workspaceId);
  const [learning, setLearning] = useState<{ website: string; brandId: string } | null>(null);
  if (learning)
    return (
      <KitLearn
        key={`${learning.website}|${learning.brandId}`}
        auth={auth}
        website={learning.website}
        brandId={learning.brandId}
        onDone={async () => {
          await confirm(sb, auth.workspaceId, learning.brandId);
          setLearning(null);
          void reload();
        }}
        onSkip={() => setLearning(null)}
      />
    );
  return (
    <div className="flex flex-col gap-10">
      <WorkspaceKitPanel sb={sb} auth={auth} canEdit={canEdit} website={website} name={name} />
      {clientKits && brands.length && rows ? (
        <section className="flex flex-col gap-3">
          <h3 className="aw-h4 mb-0!">Client brands</h3>
          <div className="aw-frame overflow-x-auto">
            <table className="aw-table aw-table--compact">
              <tbody>
                {brands.map((b) => {
                  const r = rows.find((x) => x.brand_id === b.id);
                  return (
                    <tr key={b.id}>
                      <td className="font-medium text-ink">{b.name}</td>
                      <td>
                        {r ? (
                          <span className="aw-kit__mini">
                            {[r.kit.colors.primary, r.kit.colors.secondary, r.kit.colors.ink].map((c, i) => (
                              <i key={i} style={{ background: c }} />
                            ))}
                          </span>
                        ) : (
                          <span className="aw-status aw-status--pending">Not learned</span>
                        )}
                      </td>
                      <td className="text-right">
                        {canEdit ? (
                          <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => setLearning({ website: r?.website || b.domain, brandId: b.id })}>
                            {r ? "Learn again" : "Learn"}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

/**
 * Brand › Brand Kit: the brand's own kit. Without one, learn it from the brand's site, or start from a copy of the
 * Workspace Brand Kit. The writer still falls back to the workspace kit for a one-brand workspace (kitRowForBrand).
 */
export function BrandKitPanel({ sb, auth, canEdit, brand }: { sb: SupabaseClient; auth: RunAuth; canEdit: boolean; brand: BrandLite }) {
  const { rows, reload } = useKits(sb, auth.workspaceId);
  const [learning, setLearning] = useState<string | null>(null);
  const [error, setError] = useState("");
  if (rows === undefined) return <p className="aw-small">Loading…</p>;
  if (rows === null) return <p className="aw-callout max-w-xl text-[15px]!">{NOT_RUN}</p>;
  const row = rows.find((r) => r.key === brand.id);
  const ws = rows.find((r) => r.key === "workspace" && (r.learned_at || r.confirmed_at));

  if (learning)
    return (
      <KitLearn
        key={learning}
        auth={auth}
        website={learning}
        brandId={brand.id}
        onDone={async () => {
          await confirm(sb, auth.workspaceId, brand.id);
          setLearning(null);
          void reload();
        }}
        onSkip={() => setLearning(null)}
      />
    );

  if (!row)
    return (
      <EmptyScreen
        drawing="palette"
        title="Give reports your brand's look"
        fill={false}
        action={
          <div className="flex flex-col items-center gap-3">
            {error ? <p className="aw-error">{error}</p> : null}
            <LearnForm website={brand.domain} canEdit={canEdit} label="Learn the brand" onLearn={setLearning} />
            {ws && canEdit ? (
              <button
                type="button"
                className="aw-text-link"
                onClick={async () => {
                  const now = new Date().toISOString();
                  const { error: e } = await sb
                    .from("brand_kits")
                    .upsert({ workspace_id: auth.workspaceId, key: brand.id, brand_id: brand.id, website: ws.website, kit: ws.kit, learned_at: ws.learned_at, confirmed_at: now, updated_at: now }, { onConflict: "workspace_id,key" });
                  if (e) setError(e.message);
                  else void reload();
                }}
              >
                Start from the Workspace Brand Kit
              </button>
            ) : null}
          </div>
        }
      >
        Arrowsterr reads {brand.name}&apos;s site for its colors, fonts and logo.
      </EmptyScreen>
    );

  return <KitEditor key={`${row.key}-${row.learned_at ?? ""}`} sb={sb} workspaceId={auth.workspaceId} row={row} canEdit={canEdit} onLearn={() => setLearning(row.website || brand.domain)} />;
}

const TYPE_ROWS: { id: keyof BrandKit["type"]; label: string }[] = [
  { id: "h1", label: "Heading 1" },
  { id: "h2", label: "Heading 2" },
  { id: "h3", label: "Heading 3" },
  { id: "body", label: "Body" },
];
const hexOk = (v: string) => /^#[0-9a-f]{6}$/i.test(v);

/** A color as a swatch picker and its hex, in one framed tile. */
function ColorField({ label, value, disabled, onChange }: { label: string; value: string; disabled: boolean; onChange: (v: string) => void }) {
  return (
    <label className="aw-kit__color">
      <input type="color" value={hexOk(value) ? value : "#000000"} disabled={disabled} onChange={(e) => onChange(e.target.value)} aria-label={label} />
      <span>
        <small>{label}</small>
        <input className="aw-num tw-bare" value={value} maxLength={7} disabled={disabled} onChange={(e) => onChange(e.target.value.trim())} aria-label={`${label} hex`} />
      </span>
    </label>
  );
}

/** A small number field with its unit. */
function NumField({ label, value, min, max, step = 1, disabled, onChange }: { label: string; value: number; min: number; max: number; step?: number; disabled: boolean; onChange: (v: number) => void }) {
  return (
    <input type="number" className="aw-input aw-num w-full" aria-label={label} title={label} value={value} min={min} max={max} step={step} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} />
  );
}

/** A section of the editor: a mono label in brackets, then its fields. */
function Part({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="aw-kit__part">
      <legend className="aw-kit__legend">[ {title} ]</legend>
      {children}
    </fieldset>
  );
}

/** Google Fonts for the site's own font names, when Google has them. Others fall back to the closest report font. */
function siteFontsUrl(kit: BrandKit) {
  const names = [...new Set([kit.siteFonts.heading, kit.siteFonts.body])].filter((n) => n && !FONTS.includes(n as Font));
  if (!names.length) return null;
  return `https://fonts.googleapis.com/css2?${names.map((n) => `family=${encodeURIComponent(n).replace(/%20/g, "+")}:wght@300;400;500;600;700;800`).join("&")}&display=swap`;
}

/** A small page in the kit's look: headings, text, a link, both buttons and a card. Shows every style at once. */
export function KitSpecimen({ kit }: { kit: BrandKit }) {
  const t = kitToTheme(kit);
  preinit(fontsUrl(t), { as: "style", precedence: "default" });
  const site = siteFontsUrl(kit);
  if (site) preinit(site, { as: "style", precedence: "default" });
  const stack = (site: string, near: Font) => (site && site !== near ? `'${site.replace(/'/g, "")}', ${fontStack(near)}` : fontStack(near));
  const head = stack(kit.siteFonts.heading, kit.fonts.heading);
  const body = stack(kit.siteFonts.body, kit.fonts.body);
  const type = (x: BrandKit["type"]["h1"], scale: number) =>
    ({ fontSize: Math.max(11, Math.round(x.size * scale)), fontWeight: x.weight, lineHeight: x.lineHeight, letterSpacing: `${x.tracking}em`, textTransform: x.upper ? "uppercase" : undefined }) as React.CSSProperties;
  const btn = (b: BrandKit["buttons"]["primary"]) =>
    ({ background: b.bg, color: b.text, border: `1px solid ${b.border}`, borderRadius: b.radius, fontWeight: b.weight, padding: `${Math.round(b.padY * 0.7)}px ${Math.round(b.padX * 0.7)}px`, textTransform: b.upper ? "uppercase" : undefined, fontFamily: body }) as React.CSSProperties;
  const c = kit.colors;
  return (
    <div className="aw-kit__spec" style={{ background: c.paper, color: c.text, fontFamily: body }} aria-hidden="true">
      <div className="aw-kit__spec-top" style={{ borderColor: c.line }}>
        {kit.logo ? <img src={kit.logo} alt="" className={kit.logoOnDark ? "is-on-dark" : ""} style={kit.logoOnDark ? { background: t.heroBg } : undefined} /> : <b style={{ fontFamily: head, color: c.ink }}>{kit.name || "Brand"}</b>}
        <span style={{ ...btn(kit.buttons.primary), fontSize: 11, padding: "5px 10px" }}>Get started</span>
      </div>
      <div className="aw-kit__spec-body">
        <p style={{ ...type(kit.type.h1, 0.5), fontFamily: head, color: c.ink }}>{kit.name || "Your brand"}, said your way</p>
        <p style={{ ...type(kit.type.h2, 0.55), fontFamily: head, color: c.ink }}>A clear second heading</p>
        <p style={{ ...type(kit.type.body, 0.85), color: c.text }}>
          Body text in your font and color, with <span style={{ color: kit.link.color, textDecoration: kit.link.underline ? "underline" : "none" }}>a link</span> and a{" "}
          <span style={{ color: c.muted }}>small note</span>.
        </p>
        <div className="flex flex-wrap gap-2">
          <span style={btn(kit.buttons.primary)}>Book a demo</span>
          <span style={btn(kit.buttons.secondary)}>Learn more</span>
        </div>
        <div className="aw-kit__spec-card" style={{ background: c.surface, border: `1px solid ${c.line}`, borderRadius: kit.radius, boxShadow: kit.shadow === "none" ? undefined : kit.shadow }}>
          <p style={{ ...type(kit.type.h3, 0.7), fontFamily: head, color: c.ink }}>A card</p>
          <p style={{ fontSize: 12, color: c.muted }}>Cards, corners and shadow</p>
        </div>
      </div>
    </div>
  );
}

/** Every field of a kit, grouped, with a live page and report next to it. Saves on the button. */
function KitEditor({ sb, workspaceId, row, canEdit, onLearn }: { sb: SupabaseClient; workspaceId: string; row: KitRow; canEdit: boolean; onLearn: () => void }) {
  const [kit, setKit] = useState<BrandKit>(row.kit);
  const [saved, setSaved] = useState<BrandKit>(row.kit);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const changed = JSON.stringify(kit) !== JSON.stringify(saved);
  const off = !canEdit;
  const set = (patch: Partial<BrandKit>) => setKit((k) => ({ ...k, ...patch }));
  const setColor = (id: keyof KitColors, v: string) => set({ colors: { ...kit.colors, [id]: v } });
  const setType = (id: keyof BrandKit["type"], patch: Partial<BrandKit["type"]["h1"]>) => set({ type: { ...kit.type, [id]: { ...kit.type[id], ...patch } } });
  const setButton = (id: keyof BrandKit["buttons"], patch: Partial<BrandKit["buttons"]["primary"]>) => set({ buttons: { ...kit.buttons, [id]: { ...kit.buttons[id], ...patch } } });
  // Text that will not read on the cards. Saving swaps it for a color that does.
  const weak = (["ink", "text", "muted"] as const).filter((k) => hexOk(kit.colors[k]) && hexOk(kit.colors.surface) && contrast(kit.colors[k], kit.colors.surface) < 4.5);
  const live = cleanKit(kit, row.kit);

  async function save() {
    setBusy(true);
    setError("");
    const clean = cleanKit(kit, row.kit);
    const now = new Date().toISOString();
    const { error: e } = await sb.from("brand_kits").update({ kit: clean, confirmed_at: now, updated_at: now }).eq("workspace_id", workspaceId).eq("key", row.key);
    if (e) setError(e.message);
    else {
      setKit(clean);
      setSaved(clean);
    }
    setBusy(false);
  }

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
      <form
        className="flex min-w-0 flex-col gap-8"
        onSubmit={(e) => {
          e.preventDefault();
          if (changed) void save();
        }}
      >
        {error ? <p className="aw-error">{error}</p> : null}

        <Part title="Identity">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="aw-label">Name</span>
              <input className="aw-input" value={kit.name} maxLength={60} disabled={off} onChange={(e) => set({ name: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="aw-label">Logo address</span>
              <input className="aw-input" value={kit.logo.startsWith("data:") ? "Logo from the site" : kit.logo} disabled={off || kit.logo.startsWith("data:")} placeholder="https://" onChange={(e) => set({ logo: e.target.value.trim() })} />
            </label>
          </div>
          <label className="flex items-center gap-2 text-[14px] text-ink">
            <input type="checkbox" className="h-4 w-4" checked={kit.logoOnDark} disabled={off} onChange={(e) => set({ logoOnDark: e.target.checked })} />
            Light logo on a dark background
          </label>
        </Part>

        <Part title="Colors">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {COLOR_FIELDS.map((f) => (
              <ColorField key={f.id} label={f.label} value={kit.colors[f.id]} disabled={off} onChange={(v) => setColor(f.id, v)} />
            ))}
          </div>
          {weak.length ? <p className="aw-small text-warn!">{weak.map((k) => COLOR_FIELDS.find((f) => f.id === k)?.label).join(" and ")} hard to read on cards. Saving picks a darker color.</p> : null}
        </Part>

        <Part title="Typography">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="aw-label">Heading font on the site</span>
              <input className="aw-input" value={kit.siteFonts.heading} maxLength={60} disabled={off} onChange={(e) => set({ siteFonts: { ...kit.siteFonts, heading: e.target.value } })} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="aw-label">Text font on the site</span>
              <input className="aw-input" value={kit.siteFonts.body} maxLength={60} disabled={off} onChange={(e) => set({ siteFonts: { ...kit.siteFonts, body: e.target.value } })} />
            </label>
            <div className="flex flex-col gap-1.5">
              <span className="aw-label">Heading font in reports</span>
              <Dropdown label="Heading font in reports" value={kit.fonts.heading} disabled={off} onChange={(v) => set({ fonts: { ...kit.fonts, heading: v } })} options={FONTS.map((f) => ({ id: f, label: f }))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="aw-label">Text font in reports</span>
              <Dropdown label="Text font in reports" value={kit.fonts.body} disabled={off} onChange={(v) => set({ fonts: { ...kit.fonts, body: v } })} options={FONTS.map((f) => ({ id: f, label: f }))} />
            </div>
          </div>
          <div className="aw-frame overflow-x-auto">
            <table className="aw-table aw-table--compact aw-kit__scale">
              <thead>
                <tr>
                  <th>Style</th>
                  <th>Size (px)</th>
                  <th>Weight</th>
                  <th>Line height</th>
                  <th>Tracking (em)</th>
                  <th>Caps</th>
                </tr>
              </thead>
              <tbody>
                {TYPE_ROWS.map((r) => {
                  const x = kit.type[r.id];
                  return (
                    <tr key={r.id}>
                      <td className="font-medium text-ink">{r.label}</td>
                      <td>
                        <NumField label={`${r.label} size`} value={x.size} min={10} max={120} disabled={off} onChange={(v) => setType(r.id, { size: v })} />
                      </td>
                      <td>
                        <NumField label={`${r.label} weight`} value={x.weight} min={100} max={900} step={100} disabled={off} onChange={(v) => setType(r.id, { weight: v })} />
                      </td>
                      <td>
                        <NumField label={`${r.label} line height`} value={x.lineHeight} min={0.9} max={2.2} step={0.05} disabled={off} onChange={(v) => setType(r.id, { lineHeight: v })} />
                      </td>
                      <td>
                        <NumField label={`${r.label} tracking`} value={x.tracking} min={-0.1} max={0.3} step={0.005} disabled={off} onChange={(v) => setType(r.id, { tracking: v })} />
                      </td>
                      <td>
                        <input type="checkbox" className="h-4 w-4" aria-label={`${r.label} in capitals`} checked={x.upper} disabled={off} onChange={(e) => setType(r.id, { upper: e.target.checked })} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Part>

        <Part title="Buttons and links">
          <div className="flex flex-col gap-6">
            {(["primary", "secondary"] as const).map((id) => {
              const b = kit.buttons[id];
              const name = id === "primary" ? "Main button" : "Second button";
              return (
                <div key={id} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="aw-label">{name}</span>
                    <span className="aw-kit__spec aw-kit__btn-sample" aria-hidden="true">
                      <span style={{ background: b.bg, color: b.text, border: `1px solid ${b.border}`, borderRadius: b.radius, fontWeight: b.weight, padding: `${Math.round(b.padY * 0.6)}px ${Math.round(b.padX * 0.7)}px`, textTransform: b.upper ? "uppercase" : undefined }}>
                        {id === "primary" ? "Book a demo" : "Learn more"}
                      </span>
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <ColorField label="Fill" value={b.bg} disabled={off} onChange={(v) => setButton(id, { bg: v })} />
                    <ColorField label="Label" value={b.text} disabled={off} onChange={(v) => setButton(id, { text: v })} />
                    <ColorField label="Border" value={b.border} disabled={off} onChange={(v) => setButton(id, { border: v })} />
                  </div>
                  <div className="grid grid-cols-4 items-end gap-2">
                    <label className="flex flex-col gap-1">
                      <small className="text-muted">Corners</small>
                      <NumField label={`${name} corners`} value={b.radius} min={0} max={999} disabled={off} onChange={(v) => setButton(id, { radius: v })} />
                    </label>
                    <label className="flex flex-col gap-1">
                      <small className="text-muted">Weight</small>
                      <NumField label={`${name} weight`} value={b.weight} min={100} max={900} step={100} disabled={off} onChange={(v) => setButton(id, { weight: v })} />
                    </label>
                    <label className="flex flex-col gap-1">
                      <small className="text-muted">Padding</small>
                      <NumField label={`${name} side padding`} value={b.padX} min={8} max={48} disabled={off} onChange={(v) => setButton(id, { padX: v })} />
                    </label>
                    <label className="flex h-9 items-center gap-2 text-[13px] text-ink">
                      <input type="checkbox" className="h-4 w-4" checked={b.upper} disabled={off} onChange={(e) => setButton(id, { upper: e.target.checked })} />
                      Caps
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="grid items-end gap-2 sm:grid-cols-4">
            <ColorField label="Links" value={kit.link.color} disabled={off} onChange={(v) => set({ link: { ...kit.link, color: v } })} />
            <label className="flex h-9 items-center gap-2 text-[13px] text-ink">
              <input type="checkbox" className="h-4 w-4" checked={kit.link.underline} disabled={off} onChange={(e) => set({ link: { ...kit.link, underline: e.target.checked } })} />
              Underlined
            </label>
          </div>
        </Part>

        <Part title="Shape">
          <div className="grid gap-4 sm:grid-cols-[160px_minmax(0,1fr)]">
            <label className="flex flex-col gap-1.5">
              <span className="aw-label">Corners (px)</span>
              <input type="number" min={0} max={28} className="aw-input aw-num" value={kit.radius} disabled={off} onChange={(e) => set({ radius: Number(e.target.value) })} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="aw-label">Card shadow</span>
              <input className="aw-input aw-num" value={kit.shadow} maxLength={160} disabled={off} placeholder="none" onChange={(e) => set({ shadow: e.target.value })} />
            </label>
          </div>
        </Part>

        <Part title="Voice">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="aw-label">Tone of voice</span>
              <input className="aw-input" value={kit.voice.tone.join(", ")} disabled={off} placeholder="Clear, warm, expert" onChange={(e) => set({ voice: { ...kit.voice, tone: e.target.value.split(",").map((t) => t.trim()).slice(0, 3) } })} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="aw-label">Footer line</span>
              <input className="aw-input" value={kit.footer} maxLength={140} disabled={off} placeholder="hello@acme.com, acme.com" onChange={(e) => set({ footer: e.target.value })} />
            </label>
          </div>
        </Part>

        <Part title="Stylesheet">
          <div className="aw-frame flex flex-col">
            <div className="flex items-center justify-between gap-3 border-b border-rule-faint px-4 py-2">
              <span className="aw-small">brand.css</span>
              <Copy text={kitCss(live)} label="Copy CSS" />
            </div>
            <pre className="aw-kit__css">{kitCss(live)}</pre>
          </div>
        </Part>

        {canEdit ? (
          <div className="aw-kit__save">
            <button type="submit" className="aw-btn aw-btn--primary" disabled={busy || !changed}>
              Save
            </button>
            {changed ? (
              <button type="button" className="aw-btn aw-btn--secondary" onClick={() => setKit(saved)}>
                Discard changes
              </button>
            ) : null}
            <button type="button" className="aw-text-link ml-auto" onClick={onLearn}>
              Learn again{row.website ? ` from ${row.website}` : ""}
            </button>
          </div>
        ) : null}
      </form>
      <div className="flex flex-col gap-4 xl:sticky xl:top-6 xl:self-start">
        <KitSpecimen kit={live} />
        <KitCover kit={live} />
      </div>
    </div>
  );
}
