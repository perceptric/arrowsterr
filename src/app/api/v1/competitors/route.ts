import { apiAuth } from "@/lib/integrations";
import { brandById } from "@/lib/keyScope";
import { errorResponse } from "@/lib/errorsServer";

type Row = { named: string; is_you: boolean; answers: number; mentions: number; position_sum: number; sentiment_sum: number };

const round = (n: number) => Math.round(n * 10) / 10;

// Every brand AI names next to this one over a period, with the brand itself.  ?brand_id=…&days=30&limit=15
export async function GET(request: Request) {
  const a = await apiAuth(request, { brandKey: true });
  if ("denied" in a) return a.denied;
  const url = new URL(request.url);
  const brandId = url.searchParams.get("brand_id") || a.brandId || "";
  const days = Math.min(365, Math.max(1, Number(url.searchParams.get("days")) || 30));
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 15));
  const brand = await brandById<{ id: string; name: string; domain: string }>(a, brandId, "id, name, domain");
  if (!brand) return Response.json({ error: "Brand not found. Get its id from /api/v1/brands." }, { status: 404 });
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  // Read in pages of 1000, since a long period has many rows.
  const rows: Row[] = [];
  for (let from = 0; from < 50000; from += 1000) {
    const { data, error } = await a.db
      .from("daily_metrics")
      .select("named, is_you, answers, mentions, position_sum, sentiment_sum")
      .eq("brand_id", brand.id)
      .gte("day", since)
      .order("day")
      .order("engine")
      .order("named")
      .range(from, from + 999);
    if (error) return errorResponse(error, "api/v1/competitors");
    rows.push(...((data ?? []) as Row[]));
    if ((data ?? []).length < 1000) break;
  }
  let answers = 0;
  const named = new Map<string, { name: string; you: boolean; mentions: number; position: number; sentiment: number }>();
  for (const r of rows) {
    if (!r.named) {
      answers += r.answers;
      continue;
    }
    const x = named.get(r.named.toLowerCase()) ?? { name: r.named, you: false, mentions: 0, position: 0, sentiment: 0 };
    x.mentions += r.mentions;
    x.position += Number(r.position_sum);
    x.sentiment += Number(r.sentiment_sum);
    x.you ||= r.is_you;
    named.set(r.named.toLowerCase(), x);
  }
  const list = [...named.values()]
    .map((x) => ({
      name: x.name,
      you: x.you,
      mentions: x.mentions,
      visibility: answers ? round((x.mentions / answers) * 100) : 0,
      position: x.mentions ? round(x.position / x.mentions) : null,
      sentiment: x.mentions ? Math.round(x.sentiment / x.mentions) : null,
    }))
    .sort((x, y) => y.visibility - x.visibility);
  // Keep the brand itself even when it falls outside the limit.
  const shown = list.filter((x, i) => x.you || i < limit);
  return Response.json({ brand, days, answers, competitors: shown });
}
