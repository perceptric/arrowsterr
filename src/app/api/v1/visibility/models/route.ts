import { apiAuth } from "@/lib/integrations";
import { brandById } from "@/lib/keyScope";

type Row = { day: string; engine: string; named: string; is_you: boolean; answers: number; mentions: number; position_sum: number; sentiment_sum: number };
type Sum = { answers: number; mentions: number; position: number; sentiment: number };

const round = (n: number) => Math.round(n * 10) / 10;

// Visibility, average position and sentiment from summed rows.
const stats = (s: Sum) => ({
  answers: s.answers,
  mentions: s.mentions,
  visibility: s.answers ? round((s.mentions / s.answers) * 100) : 0,
  position: s.mentions ? round(s.position / s.mentions) : null,
  sentiment: s.mentions ? Math.round(s.sentiment / s.mentions) : null,
});

// AI visibility for a brand split by AI model, in total and by day.  ?brand_id=…&days=30
export async function GET(request: Request) {
  const a = await apiAuth(request, { brandKey: true });
  if ("denied" in a) return a.denied;
  const url = new URL(request.url);
  const brandId = url.searchParams.get("brand_id") || a.brandId || "";
  const days = Math.min(365, Math.max(1, Number(url.searchParams.get("days")) || 30));
  const brand = await brandById<{ id: string; name: string; domain: string }>(a, brandId, "id, name, domain");
  if (!brand) return Response.json({ error: "Brand not found. Get its id from /api/v1/brands." }, { status: 404 });
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  // Read in pages of 1000, since a long period has many rows.
  const rows: Row[] = [];
  for (let from = 0; from < 50000; from += 1000) {
    const { data, error } = await a.db
      .from("daily_metrics")
      .select("day, engine, named, is_you, answers, mentions, position_sum, sentiment_sum")
      .eq("brand_id", brand.id)
      .gte("day", since)
      .order("day")
      .order("engine")
      .order("named")
      .range(from, from + 999);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    rows.push(...((data ?? []) as Row[]));
    if ((data ?? []).length < 1000) break;
  }
  // Answers come from the '' row; the brand's own mentions from its is_you row.
  const total = new Map<string, Sum>();
  const daily = new Map<string, Sum & { day: string; model: string }>();
  for (const r of rows) {
    if (r.named && !r.is_you) continue;
    const k = `${r.day}\n${r.engine}`;
    if (!total.has(r.engine)) total.set(r.engine, { answers: 0, mentions: 0, position: 0, sentiment: 0 });
    if (!daily.has(k)) daily.set(k, { day: r.day, model: r.engine, answers: 0, mentions: 0, position: 0, sentiment: 0 });
    for (const s of [total.get(r.engine)!, daily.get(k)!]) {
      if (!r.named) s.answers += r.answers;
      else {
        s.mentions += r.mentions;
        s.position += Number(r.position_sum);
        s.sentiment += Number(r.sentiment_sum);
      }
    }
  }
  const models = [...total.entries()].map(([model, s]) => ({ model, ...stats(s) })).sort((x, y) => y.visibility - x.visibility);
  const series = [...daily.values()].map((s) => ({ day: s.day, model: s.model, ...stats(s) }));
  return Response.json({ brand, models, days: series });
}
