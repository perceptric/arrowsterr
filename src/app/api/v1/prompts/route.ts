import { apiAuth } from "@/lib/integrations";

type Topic = { name?: string; prompts?: string[] };

// A brand's tracked prompts, by topic.  ?brand_id=…
export async function GET(request: Request) {
  const a = await apiAuth(request);
  if ("denied" in a) return a.denied;
  const brandId = new URL(request.url).searchParams.get("brand_id") ?? "";
  const { data } = await a.db.from("brands").select("id, name, prompts, topics").eq("id", brandId).eq("workspace_id", a.ws).maybeSingle();
  if (!data) return Response.json({ error: "Brand not found. Get its id from /api/v1/brands." }, { status: 404 });
  const prompts: string[] = data.prompts ?? [];
  const topics: Topic[] = (data.topics ?? []).filter((t: Topic) => t?.name);
  // One row per prompt with its topic, for sheets and dashboards. Prompts outside a topic go under "Other prompts".
  const inTopic = new Set(topics.flatMap((t) => t.prompts ?? []));
  const rows = [
    ...topics.flatMap((t) => (t.prompts ?? []).map((prompt) => ({ topic: t.name as string, prompt }))),
    ...prompts.filter((p) => !inTopic.has(p)).map((prompt) => ({ topic: "Other prompts", prompt })),
  ];
  return Response.json({ brand: { id: data.id, name: data.name }, prompts, topics: data.topics ?? [], rows });
}
