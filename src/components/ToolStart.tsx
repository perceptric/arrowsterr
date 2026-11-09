"use client";

import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { instrument, ROUTE, ROUTE_PATH, TOOL_ORDER, TOOLS, type ToolKey } from "@/lib/toolStart";

// The start page of a new SEO tool before it has data (docs/tool-start.md). It explains the tool once: a hero with
// the real action, the example report with numbered parts, the route from first run to fixes, a glossary and the
// questions people ask. The page that owns the tool passes its own form, example report and actions.

const P: Record<string, string> = {
  spark: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z",
  eye: "M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  pin: "M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  chat: "M4 5h16v11H9l-5 4z",
  check: "M4 12.5l5 5L20 6.5",
  siteaudit: "M3 12h4l2-5 4 10 2-5h6",
  onpage: "M4 12.5l5 5L20 6.5",
  backlinks: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  linkbuilding: "M3 5.5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 8 5.5v13A1.5 1.5 0 0 1 6.5 20h-2A1.5 1.5 0 0 1 3 18.5zM10 5.5A1.5 1.5 0 0 1 11.5 4h2A1.5 1.5 0 0 1 15 5.5v7a1.5 1.5 0 0 1-1.5 1.5h-2a1.5 1.5 0 0 1-1.5-1.5zM17 5.5A1.5 1.5 0 0 1 18.5 4h1A1.5 1.5 0 0 1 21 5.5v10a1.5 1.5 0 0 1-1.5 1.5h-1a1.5 1.5 0 0 1-1.5-1.5z",
  contentmap: "M6 8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18 10.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM9 20.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM8.2 7.2l1.2 8.4M8.4 6.4l7.2 1.2M10.8 16.6l5.6-6.8",
  local: "M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
};
export function TsIcon({ name, size = 16 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name] ?? P.spark} />
    </svg>
  );
}

/** Opens another tool through the app's own address handling. */
function openTool(slug: string) {
  window.history.pushState(null, "", slug + window.location.search);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
/** Opens Ask Zippie with a question already sent (App listens for this). */
export function askZippie(text: string) {
  window.dispatchEvent(new CustomEvent("arrowsterr:ask", { detail: text }));
}

type Spot = { x: number; y: number; l: number; t: number; w: number; h: number } | null;

export function ToolStart({ tool, form, below, example, onOpenExample, onCta, error }: { tool: ToolKey; form: ReactNode; below?: ReactNode; example: ReactNode; onOpenExample: () => void; onCta?: () => void; error?: string }) {
  const T = TOOLS[tool];
  const [hot, setHot] = useState(0);
  const [spots, setSpots] = useState<Spot[]>([]);
  const [asked, setAsked] = useState<number[]>([0]);
  const [q, setQ] = useState("");
  const peekRef = useRef<HTMLDivElement>(null);

  // Pins sit on the parts of the example report the page marked with data-tour="1" to "4".
  const measure = useCallback(() => {
    const peek = peekRef.current;
    if (!peek) return;
    const box = peek.getBoundingClientRect();
    if (!box.width) return;
    setSpots(
      T.parts.map((_, i) => {
        const el = peek.querySelector(`[data-tour="${i + 1}"]`);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const l = r.left - box.left, t = r.top - box.top;
        const x = Math.max(4, Math.min(96, ((l + Math.min(r.width, 220) / 2) / box.width) * 100));
        const y = Math.max(5, Math.min(93, ((t + Math.min(r.height, 60) / 2) / box.height) * 100));
        return { x, y, l, t, w: r.width, h: Math.max(24, Math.min(r.height, box.height - t - 8)) };
      }),
    );
  }, [T.parts]);
  useLayoutEffect(() => {
    measure();
    const later = window.setTimeout(measure, 400);
    window.addEventListener("resize", measure);
    return () => {
      window.clearTimeout(later);
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  const spot = spots[hot];
  const tone = { "--ts-c": `var(--ts-${T.tone})`, "--ts-s": `var(--ts-${T.tone}-soft)` } as React.CSSProperties;

  return (
    <div className="ts-root" style={tone}>
      <section className="ts-hero">
        <div className="ts-clouds" aria-hidden="true">
          <i style={{ width: 340, height: 120, left: "6%", top: 120, opacity: 0.35 }} />
          <i style={{ width: 420, height: 140, right: "4%", top: 60, opacity: 0.28 }} />
          <i style={{ width: 260, height: 90, left: "44%", top: 330, opacity: 0.18 }} />
        </div>
        <nav className="ts-nav" aria-label="SEO tools">
          {TOOL_ORDER.map((k) => (
            <a
              key={k}
              href={TOOLS[k].slug}
              aria-current={k === tool ? "page" : undefined}
              onClick={(e) => {
                e.preventDefault();
                if (k !== tool) openTool(TOOLS[k].slug);
              }}
            >
              <TsIcon name={k} size={15} />
              {TOOLS[k].title}
            </a>
          ))}
        </nav>
        <div className="ts-herogrid">
          <div className="ts-copy">
            <span className="ts-kicker">
              <i />
              {T.title}
            </span>
            <h1 className="ts-title">
              <span>{T.lead}</span> {T.payoff}
            </h1>
            <p className="ts-sub">{T.sub}</p>
            <div className="ts-qcard">{form}</div>
            {error ? <p className="ts-err">{error}</p> : null}
            {below}
          </div>
          <div className="ts-inst" aria-hidden="true">
            <svg viewBox="0 0 440 380" dangerouslySetInnerHTML={{ __html: instrument(tool) }} />
            {T.facts.map(([n, l], i) => (
              <div key={l} className={`ts-anno ts-a${i}`}>
                <b>{n}</b>
                <span>{l}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="ts-band">
        <div className="ts-head ts-left">
          <span className="ts-eyebrow">
            <TsIcon name="eye" size={14} />
            Inside the report
          </span>
          <h2>{T.whatTitle}</h2>
          <p>{T.whatSub} Point at a part to find it in the example.</p>
        </div>
        <div className="ts-anat">
          <div className="ts-frame">
            <div className="ts-fbar">
              <i />
              <i />
              <i />
              <span>app.arrowsterr.com{T.slug}</span>
              <span className="aw-status aw-status--pending">Example data</span>
            </div>
            <div className="ts-peekbox">
              <div className="ts-peek" ref={peekRef} inert aria-hidden="true">
                <div>{example}</div>
              </div>
              {spot ? <div className="ts-hl" style={{ left: spot.l - 6, top: spot.t - 6, width: spot.w + 12, height: spot.h + 12 }} /> : null}
              {spots.map((s, i) =>
                s ? (
                  <button key={i} type="button" className={`ts-pin ${hot === i ? "is-hot" : ""}`} style={{ left: `${s.x}%`, top: `${s.y}%` }} onMouseEnter={() => setHot(i)} onFocus={() => setHot(i)} onClick={() => setHot(i)} aria-label={T.parts[i][0]}>
                    {i + 1}
                  </button>
                ) : null,
              )}
            </div>
          </div>
          <div className="ts-notes">
            {T.parts.map(([h, p], i) => (
              <button key={h} type="button" className={`ts-note ${hot === i ? "is-hot" : ""}`} onMouseEnter={() => setHot(i)} onFocus={() => setHot(i)} onClick={() => setHot(i)}>
                <span className="ts-k">{i + 1}</span>
                <span>
                  <b>{h}</b>
                  <span>{p}</span>
                </span>
              </button>
            ))}
            <button type="button" className="ts-btn ts-btn--dark" onClick={onOpenExample}>
              Open the example report <span className="ts-arr">→</span>
            </button>
          </div>
        </div>
      </section>

      <section className="ts-plain">
        <div className="ts-head">
          <span className="ts-eyebrow">
            <TsIcon name="pin" size={14} />
            How it works
          </span>
          <h2>The route, from first run to fixes</h2>
        </div>
        <div className="ts-route">
          <svg viewBox="0 0 1000 300" aria-hidden="true">
            <path className="ts-glow" d={ROUTE_PATH} />
            <path className="ts-path" d={ROUTE_PATH} />
          </svg>
          {T.steps.map(([h, p], i) => (
            <div key={h} className={`ts-stop ts-${ROUTE[i][2]} ${i === 0 ? "ts-first" : ""} ${i === 3 ? "ts-last" : ""}`} style={{ left: `${ROUTE[i][0] / 10}%`, top: `${ROUTE[i][1] / 3}%` }}>
              <span className="ts-dot">{i === 3 ? <TsIcon name="check" size={18} /> : i + 1}</span>
              <div className="ts-lab">
                <b>{h}</b>
                <span>{p}</span>
              </div>
            </div>
          ))}
        </div>
        <ol className="ts-rail">
          {T.steps.map(([h, p], i) => (
            <li key={h}>
              <span className="ts-dot">{i + 1}</span>
              <div>
                <b>{h}</b>
                <span>{p}</span>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="ts-band">
        <div className="ts-dicthead">
          <h2>What the numbers mean</h2>
          <span>
            {T.terms.length} terms, {T.title}
          </span>
        </div>
        <dl className="ts-dict">
          {T.terms.map(([d, p, ex]) => (
            <div key={d} className="ts-entry">
              <dt>
                <b>{d}</b>
                <i>{/\d/.test(ex) ? "number" : "term"}</i>
              </dt>
              <dd>
                {p}
                <span className="ts-eg">
                  For example <span>{ex}</span>
                </span>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="ts-plain">
        <div className="ts-chatwrap">
          <div className="ts-head ts-left">
            <span className="ts-eyebrow">
              <TsIcon name="chat" size={14} />
              Questions
            </span>
            <h2>Ask before you run it</h2>
            <p>Costs, data sources and what happens when something fails. Tap a question.</p>
          </div>
          <div className="ts-chat">
            {asked.map((i) => (
              <div key={i} className="ts-pair">
                <div className="ts-bub ts-me">{T.faq[i][0]}</div>
                <div className="ts-bubrow">
                  <span className="ts-av">
                    <TsIcon name="spark" size={16} />
                  </span>
                  <div className="ts-bub ts-bot">{T.faq[i][1]}</div>
                </div>
              </div>
            ))}
            <div className="ts-sugg">
              {T.faq.some((_, i) => !asked.includes(i))
                ? T.faq.map(([qq], i) =>
                    asked.includes(i) ? null : (
                      <button key={qq} type="button" onClick={() => setAsked((a) => [...a, i])}>
                        {qq}
                      </button>
                    ),
                  )
                : T.ask.map((qq) => (
                    <button key={qq} type="button" onClick={() => askZippie(qq)}>
                      {qq}
                    </button>
                  ))}
            </div>
            <form
              className="ts-ask"
              onSubmit={(e) => {
                e.preventDefault();
                if (q.trim()) askZippie(q.trim());
                setQ("");
              }}
            >
              <input id={`ts-ask-${tool}`} value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Ask Zippie about ${T.title}`} aria-label="Ask Zippie" />
              <button type="submit" className="ts-btn ts-btn--primary ts-btn--sm" disabled={!q.trim()}>
                Ask
              </button>
            </form>
          </div>
        </div>
      </section>

      <section className="ts-end">
        <div className="ts-ctacard">
          <div>
            <h2>{T.cta}</h2>
            <p>{T.sub}</p>
            {onCta ? (
              <button type="button" className="ts-btn ts-btn--spark" onClick={onCta}>
                {T.cta} <span className="ts-arr">→</span>
              </button>
            ) : null}
          </div>
          <div className="ts-fan" aria-hidden="true">
            <div>
              <i style={{ width: "60%" }} />
              <i />
              <i style={{ width: "80%" }} />
            </div>
            <div>
              <span className="ts-t">
                <TsIcon name={tool} size={18} />
              </span>
              <span className="ts-n">{T.facts[0][0]}</span>
              <i style={{ width: "70%" }} />
              <i />
            </div>
            <div>
              <i style={{ width: "50%" }} />
              <i />
              <i style={{ width: "65%" }} />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/** The search card's parts, for pages that build their own form inside the hero. */
export function TsDomain({ domain }: { domain: string }) {
  return (
    <span className="ts-domain">
      <span className="ts-fav">{(domain[0] ?? "?").toUpperCase()}</span>
      {domain}
    </span>
  );
}
