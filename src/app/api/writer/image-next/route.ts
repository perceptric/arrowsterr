import { allowed } from "@/lib/cronAuth";
import { adminClient } from "@/lib/serverAuth";
import { leaseNextImage } from "@/lib/writerImagesServer";

// The Fly worker asks for the next image a draft needs (docs/agentic-writing.md, section 5): a screenshot of a page
// (url, and the frame page in html) or a drawn image (its page in html). Leased to that worker for 90 seconds.
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!allowed(request)) return Response.json({ error: "Wrong or missing CRON_SECRET." }, { status: 401 });
  const db = adminClient();
  if (!db) return Response.json({ error: "Add SUPABASE_SECRET_KEY to the server's settings." }, { status: 500 });
  const worker = (new URL(request.url).searchParams.get("worker") ?? "image").replace(/[^\w-]/g, "").slice(0, 40) || "image";
  try {
    const task = await leaseNextImage(db, worker);
    return Response.json(task ?? { idle: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
