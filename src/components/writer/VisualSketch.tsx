import { Fragment } from "react";
import type { Sketch } from "@/lib/visualSketch";

// A rough drawing of a planned image or interactive module, from the brief's own data (visualSketch.ts), so a person
// sees what it will be before the draft makes it. Used full size on the outline screen and small in Zippie's outline
// card. Styles are the aw-sketch rules in globals.css.

/** What the sketch shows, read aloud. */
export function sketchLabel(s: Sketch): string {
  switch (s.kind) {
    case "steps":
      return `Sketch: ${s.steps.length} numbered steps: ${s.steps.join(", ")}`;
    case "bars":
      return `Sketch: a bar chart of ${s.bars.map((b) => `${b.label} ${b.value}`).join(", ")}`;
    case "grid":
      return `Sketch: a table comparing ${s.cols.join(", ")} by ${s.rows.join(", ")}`;
    case "checks":
      return `Sketch: a checklist of ${s.items.join(", ")}`;
    case "parts":
      return `Sketch: labeled parts: ${s.parts.join(", ")}`;
    case "browser":
      return `Sketch: a screenshot of ${s.url}`;
    case "form":
      return `Sketch: fields for ${s.inputs.join(", ")} and a result, ${s.output}`;
  }
}

export function VisualSketch({ sketch, small = false }: { sketch: Sketch; small?: boolean }) {
  return (
    <div role="img" aria-label={sketchLabel(sketch)} className={`aw-sketch${small ? " aw-sketch--sm" : ""}`}>
      <Body s={sketch} />
    </div>
  );
}

function Body({ s }: { s: Sketch }) {
  switch (s.kind) {
    case "steps":
      return (
        <div className="aw-sketch__steps">
          {s.steps.map((t, i) => (
            <Fragment key={i}>
              {i ? (
                <span className="aw-sketch__arrow" aria-hidden="true">
                  →
                </span>
              ) : null}
              <span className="aw-sketch__box">
                <span className="aw-sketch__num">{i + 1}</span>
                <span className="aw-sketch__text">{t}</span>
              </span>
            </Fragment>
          ))}
        </div>
      );
    case "bars": {
      const top = Math.max(1, ...s.bars.map((b) => Math.abs(b.value)));
      return (
        <div className="aw-sketch__bars">
          {s.bars.map((b, i) => (
            <span key={i} className="aw-sketch__col">
              <span className="aw-sketch__value aw-num">{b.value.toLocaleString("en-US")}</span>
              <span
                className="aw-sketch__bar"
                style={{
                  height: `${Math.max(8, Math.round((Math.abs(b.value) / top) * 100))}%`,
                }}
              />
              <span className="aw-sketch__text">{b.label}</span>
            </span>
          ))}
        </div>
      );
    }
    case "grid":
      return (
        <div
          className="aw-sketch__grid"
          style={{
            gridTemplateColumns: `repeat(${s.cols.length + 1}, minmax(0, 1fr))`,
          }}
        >
          <span className="aw-sketch__cell aw-sketch__cell--head" />
          {s.cols.map((c, i) => (
            <span key={`c${i}`} className="aw-sketch__cell aw-sketch__cell--head">
              {c}
            </span>
          ))}
          {s.rows.map((r, i) => (
            <Fragment key={`r${i}`}>
              <span className="aw-sketch__cell aw-sketch__cell--row">{r}</span>
              {s.cols.map((_, j) => (
                <span key={j} className="aw-sketch__cell">
                  <span className="aw-sketch__line" />
                </span>
              ))}
            </Fragment>
          ))}
        </div>
      );
    case "checks":
      return (
        <ul className="aw-sketch__checks">
          {s.items.map((t, i) => (
            <li key={i}>
              <span className="aw-sketch__tick" aria-hidden="true">
                ✓
              </span>
              <span className="aw-sketch__text">{t}</span>
            </li>
          ))}
        </ul>
      );
    case "parts":
      return (
        <div className="aw-sketch__parts">
          {s.parts.map((t, i) => (
            <span key={i} className="aw-sketch__box">
              <span className="aw-sketch__text">{t}</span>
            </span>
          ))}
        </div>
      );
    case "browser":
      return (
        <div className="aw-sketch__browser">
          <span className="aw-sketch__chrome">
            <i />
            <i />
            <i />
            <span className="aw-sketch__url">{s.url}</span>
          </span>
          <span className="aw-sketch__page">
            <span className="aw-sketch__line aw-sketch__line--wide" />
            <span className="aw-sketch__line" />
            <span className="aw-sketch__line" />
          </span>
        </div>
      );
    case "form":
      return (
        <div className="aw-sketch__form">
          {s.inputs.map((t, i) => (
            <span key={i} className="aw-sketch__input">
              <span className="aw-sketch__text">{t}</span>
              <span className="aw-sketch__field" />
            </span>
          ))}
          <span className="aw-sketch__result">{s.output}</span>
        </div>
      );
  }
}
