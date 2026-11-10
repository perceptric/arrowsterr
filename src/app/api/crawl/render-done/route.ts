import { allowed } from "@/lib/cronAuth";
import { saveRender, type RenderResult } from "@/lib/renderQueue";
import { adminClient } from "@/lib/serverAuth";

export const maxDuration = 60;

// The worker sends back a rendered page: its HTML, status, console errors, failed requests and maybe a screenshot.
export async function POST(request: Request) {
  if (!allowed(request)) return Response.json({ error: "Wrong or missing CRON_SECRET." }, { status: 401 });
  const db = adminClient();
  if (!db) return Response.json({ error: "Add SUPABASE_SECRET_KEY to the server's settings." }, { status: 500 });
  const body = (await request.json().catch(() => null)) as RenderResult | null;
  if (!body?.auditId || !body.url) return Response.json({ error: "Missing the page." }, { status: 400 });
  try {
    return Response.json({ saved: await saveRender(db, body) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
