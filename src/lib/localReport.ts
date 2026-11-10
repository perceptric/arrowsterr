// Local Research in reports (docs/local-research-plan.md, 4.9): one block per location with each keyword's average
// rank, its change and top 3 share, the rank grid as a picture, reviews and rating, AI Mode's share and the alerts in
// the report's dates. Built only from saved results, so a report never spends tasks. Pure: the client report's SEO
// block, the Local Research PDF and its share link all use it.

import { inCircle, type Location, type ScanResult, type Shape } from "./local.ts";

export type LocalReportKeyword = {
  keyword: string;
  avg: number | null;
  before: number | null;
  top3: number;
  read: number;
  /** The rank at each grid point, for the picture: a number, null when not in the top 20, undefined when it failed. */
  grid: { size: number; shape: Shape; ranks: (number | null | undefined)[] };
  aiShare: number | null;
  leader: { title: string; top3: number } | null;
};
export type LocalReportLoc = {
  name: string;
  title: string;
  address: string | null;
  keywords: LocalReportKeyword[];
  rating: number | null;
  reviews: number | null;
  newReviews: number | null;
  alerts: { title: string; detail: string; at: string }[];
};

export type LocalRaw = {
  start: string; // first day, YYYY-MM-DD
  end: string; // last day
  locations: { id: string; data: Location }[];
  scans: { location_id: string | null; keyword: string; created_at: string; result: ScanResult | null }[];
  profiles: { location_id: string; read_at: string; data: { rating: number | null; reviews: number | null } }[];
  reviews: { location_id: string; posted_at: string | null }[];
  ai: { location_id: string; keyword: string; created_at: string; result: { share: number | null } | null }[];
  alerts: { location_id: string; title: string; detail: string; created_at: string }[];
};

const day = (iso: string) => iso.slice(0, 10);
const newest = <T extends { created_at: string }>(xs: T[]) => [...xs].sort((a, b) => b.created_at.localeCompare(a.created_at));

/** The rank at each point of a scan, by point number. */
export function gridRanks(r: Pick<ScanResult, "size" | "points">): (number | null | undefined)[] {
  const size = r.size ?? 7;
  const out: (number | null | undefined)[] = Array.from({ length: size * size }, () => undefined);
  for (const p of r.points) out[p.i] = p.error ? undefined : p.rank;
  return out;
}

/** Each location's block for these dates. Locations with no scan up to the last day are left out. */
export function localReport(raw: LocalRaw): LocalReportLoc[] {
  const upTo = <T extends { created_at: string }>(xs: T[]) => newest(xs).filter((x) => day(x.created_at) <= raw.end);
  const inDates = (iso: string | null) => Boolean(iso) && day(iso!) >= raw.start && day(iso!) <= raw.end;
  return raw.locations
    .map((l) => {
      const scans = raw.scans.filter((s) => s.location_id === l.id && s.result && s.result.read);
      const keywords = [...new Set([...(l.data.keywords ?? []), ...scans.map((s) => s.keyword)])]
        .map((k): LocalReportKeyword | null => {
          const done = upTo(scans.filter((s) => s.keyword === k));
          const cur = done[0]?.result;
          if (!cur) return null;
          const prev = done.find((s) => day(s.created_at) < raw.start) ?? done[1];
          const ai = upTo(raw.ai.filter((a) => a.location_id === l.id && a.keyword === k && a.result))[0];
          const lead = cur.rivals[0];
          return {
            keyword: k,
            avg: cur.avg,
            before: prev?.result?.avg ?? null,
            top3: cur.top3,
            read: cur.read,
            grid: { size: cur.size ?? 7, shape: cur.shape ?? "square", ranks: gridRanks(cur) },
            aiShare: ai?.result?.share ?? null,
            leader: lead && lead.top3 > cur.top3 ? { title: lead.title, top3: lead.top3 } : null,
          };
        })
        .filter((x): x is LocalReportKeyword => Boolean(x));
      if (!keywords.length) return null;
      const prof = [...raw.profiles].filter((p) => p.location_id === l.id && day(p.read_at) <= raw.end).sort((a, b) => b.read_at.localeCompare(a.read_at))[0];
      const reviewRows = raw.reviews.filter((r) => r.location_id === l.id);
      return {
        name: l.data.name || l.data.title,
        title: l.data.title,
        address: l.data.address,
        keywords,
        rating: prof?.data.rating ?? null,
        reviews: prof?.data.reviews ?? null,
        newReviews: reviewRows.length ? reviewRows.filter((r) => inDates(r.posted_at)).length : null,
        alerts: raw.alerts
          .filter((a) => a.location_id === l.id && inDates(a.created_at))
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .slice(0, 8)
          .map((a) => ({ title: a.title, detail: a.detail, at: a.created_at })),
      };
    })
    .filter((x): x is LocalReportLoc => Boolean(x));
}

/** The rank colors the pictures use: the same bands as the screen. */
export function rankColor(r: number | null | undefined): string {
  if (r === undefined) return "#D9D9D9";
  if (r === null) return "#E5484D";
  if (r <= 3) return "#1F9D55";
  if (r <= 10) return "#F2A20C";
  return "#E8590C";
}

/** Grid points in a round grid's corners are not part of it. */
export const inShape = (i: number, size: number, shape: Shape) => shape !== "circle" || inCircle(Math.floor(i / size), i % size, size);

/** CSV text from a header and rows: quotes where needed, one line per row. */
export function csv(head: string[], rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"` : s;
  };
  return [head, ...rows].map((r) => r.map(cell).join(",")).join("\n");
}
