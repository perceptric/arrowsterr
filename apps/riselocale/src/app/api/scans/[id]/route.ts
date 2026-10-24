import { NextResponse } from "next/server";
import { getCtx } from "@/lib/auth";
import { loadView, scanById } from "@/lib/view";

export const dynamic = "force-dynamic";

/** The scan as the scan screen reads it, for polling while it runs. Members, or anyone with its link. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scan = await scanById(id);
  if (!scan) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const token = new URL(req.url).searchParams.get("t");
  let allowed = Boolean(token && scan.share_token && token === scan.share_token);
  if (!allowed && scan.workspace_id) {
    const ctx = await getCtx();
    allowed = ctx?.workspace.id === scan.workspace_id;
  }
  if (!allowed) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(await loadView(scan), { headers: { "Cache-Control": "no-store" } });
}
