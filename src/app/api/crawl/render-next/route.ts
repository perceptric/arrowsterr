import { allowed } from "@/lib/cronAuth";
import { leaseRender } from "@/lib/renderQueue";
import { adminClient } from "@/lib/serverAuth";

// The worker asks for the next crawled page to render with JavaScript (docs/technical-seo-plan.md, phase 3).
export async function POST(request: Request) {
  if (!allowed(request)) return Response.json({ error: "Wrong or missing CRON_SECRET." }, { status: 401 });
  const db = adminClient();
  if (!db) return Response.json({ error: "Add SUPABASE_SECRET_KEY to the server's settings." }, { status: 500 });
  const worker = (new URL(request.url).searchParams.get("worker") ?? "render").replace(/[^\w-]/g, "").slice(0, 40) || "render";
  try {
    return Response.json((await leaseRender(db, worker)) ?? { idle: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Before 069_render.sql there's nothing to render.
    if (/render_state|render_lease/.test(msg)) return Response.json({ idle: true });
    return Response.json({ error: msg }, { status: 500 });
  }
}
