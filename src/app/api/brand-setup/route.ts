import { after } from "next/server";
import { ensureBrandSetup } from "@/lib/brandSetupServer";
import { enqueue, queueReady } from "@/lib/jobs";
import { metered, meteredRoute } from "@/lib/meter";
import { requireRole } from "@/lib/serverAuth";

export const maxDuration = 300;

// Onboarding calls this once a brand is added: Zippie learns its Brand Kit, voice and guidelines from its own site
// (brandSetupServer.ts), so Agentic Writing sounds like the brand from the first article. Runs on the queue, or
// right after the reply when the queue tables are missing.
//   { workspaceId, brandId }   editors
async function handle(request: Request) {
  const body = await request.json().catch(() => ({}));
  const auth = await requireRole(request, body.workspaceId, "editor");
  if ("denied" in auth) return auth.denied;
  const ws = String(body.workspaceId);
  const { data: brand } = await auth.sb.from("brands").select("id").eq("id", String(body.brandId ?? "")).eq("workspace_id", ws).maybeSingle();
  if (!brand) return Response.json({ error: "That brand is not in this workspace." }, { status: 404 });
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "ANTHROPIC_API_KEY is not set on the server." }, { status: 500 });

  if (await queueReady()) {
    await enqueue("brand_setup", { brandId: brand.id }, { workspaceId: ws, key: `brand_setup:${brand.id}`, maxAttempts: 2 });
    return Response.json({ queued: true });
  }
  after(async () => {
    await metered(ws, "brand setup", () => ensureBrandSetup(auth.sb, brand.id)).catch((e) => console.error("Brand setup failed:", e instanceof Error ? e.message : e));
  });
  return Response.json({ queued: true });
}

export const POST = meteredRoute("brand setup", handle);
