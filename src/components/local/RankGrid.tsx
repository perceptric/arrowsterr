import { inShape, rankColor } from "@/lib/localReport";
import type { Shape } from "@/lib/local";

/** A scan's rank grid as a small picture for reports and PDFs: one dot per point in its rank band, numbers inside. */
export function RankGrid({ size, shape, ranks, px = 168, label }: { size: number; shape: Shape; ranks: (number | null | undefined)[]; px?: number; label: string }) {
  const cell = px / size;
  const r = Math.min(13, cell * 0.42);
  return (
    <svg viewBox={`0 0 ${px} ${px}`} width={px} height={px} role="img" aria-label={label} style={{ display: "block", flexShrink: 0 }}>
      <rect width={px} height={px} rx={10} fill="#F4F4F2" />
      {Array.from({ length: size * size }, (_, i) =>
        inShape(i, size, shape) ? (
          <g key={i}>
            <circle cx={cell * (i % size) + cell / 2} cy={cell * Math.floor(i / size) + cell / 2} r={r} fill={rankColor(ranks[i])} stroke="#FFFFFF" strokeWidth={1.5} />
            {cell >= 18 ? (
              <text x={cell * (i % size) + cell / 2} y={cell * Math.floor(i / size) + cell / 2} textAnchor="middle" dominantBaseline="central" fontSize={Math.min(10, r * 0.95)} fontWeight={600} fill={ranks[i] === undefined ? "#8A8A8A" : "#FFFFFF"} fontFamily="Inter, Arial, sans-serif">
                {ranks[i] === undefined ? "?" : ranks[i] === null ? "–" : ranks[i]}
              </text>
            ) : null}
          </g>
        ) : null,
      )}
    </svg>
  );
}
