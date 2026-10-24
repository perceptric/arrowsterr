import { band } from "@/lib/metrics";

/** A small dot preview of a grid scan for lists. */
export default function MiniGrid({ ranks, size }: { ranks: (number | null | undefined)[]; size: number }) {
  return (
    <div className="mini-grid" style={{ gridTemplateColumns: `repeat(${size}, 12px)` }} aria-hidden="true">
      {ranks.map((r, i) => (
        <i key={i} className={r === undefined ? "b-wait" : `b-${band(r)}`} />
      ))}
    </div>
  );
}
