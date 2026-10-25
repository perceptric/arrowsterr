import { workerAllowed } from "@/lib/cronAuth";
import { adminClient } from "@/lib/serverAuth";
import { failImage, saveImage } from "@/lib/writerImagesServer";

// The Fly worker sends the image it made: the PNG or JPEG bytes, with ?id, &worker, &w and &h.
// Or, as JSON, why it could not: { error, final } (final for a page that blocked the bot or came back blank).
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!workerAllowed(request)) return Response.json({ error: "Wrong or missing CRON_SECRET." }, { status: 401 });
  const db = adminClient();
  if (!db) return Response.json({ error: "Add SUPABASE_SECRET_KEY to the server's settings." }, { status: 500 });
  const url = new URL(request.url);
  const id = Number(url.searchParams.get("id")) || 0;
  const worker = (url.searchParams.get("worker") ?? "").replace(/[^\w-]/g, "").slice(0, 40);
  try {
    if (/json/i.test(request.headers.get("content-type") ?? "")) {
      const body = (await request.json().catch(() => null)) as { error?: unknown; final?: unknown } | null;
      const out = await failImage(db, worker, id, String(body?.error ?? "This image could not be made."), body?.final === true);
      return Response.json(out, { status: out.ok ? 200 : 409 });
    }
    const bytes = new Uint8Array(await request.arrayBuffer());
    const out = await saveImage(db, worker, id, bytes, { width: Number(url.searchParams.get("w")) || 0, height: Number(url.searchParams.get("h")) || 0 });
    return Response.json(out, { status: out.ok ? 200 : 409 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
