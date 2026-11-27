import { forgetEntitlement } from "@/lib/entitlements";
import { dailyAnswers, limitsFor, TRACKS, type Extras, type Track } from "@/lib/plans";
import { adminClient, requireRole } from "@/lib/serverAuth";
import { errorResponse } from "@/lib/errorsServer";

const MONTH = 30 * 864e5;

// Pick the toolset a v5 Starter plan opens: AI Visibility or SEO Research. It can change once every 30 days.
//   { track: "visibility" | "seo" }
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const auth = await requireRole(request, body.workspaceId, "admin");
  if ("denied" in auth) return auth.denied;
  const db = adminClient();
  if (!db) return Response.json({ error: "Add SUPABASE_SECRET_KEY to the server's settings." }, { status: 500 });
  const track = body.track as Track;
  if (!TRACKS[track]) return Response.json({ error: "Pick AI Visibility or SEO Research." }, { status: 400 });

  const { data: w, error } = await db.from("workspaces").select("plan, extras").eq("id", body.workspaceId).maybeSingle();
  if (error || !w) return errorResponse(error ?? new Error("Workspace not found."), "api/billing/track");
  const extras = (w.extras ?? {}) as Extras;
  if (extras.track === track) return Response.json({ track });
  // Only a v5 Starter switches for free. A v7 plan's toolsets are what was paid for: change them on Billing.
  if (!(w.plan === "foundation" && extras.limitsFrom === "v5")) return Response.json({ error: "Change your toolsets on the Billing page." }, { status: 400 });
  if (w.plan === "foundation" && extras.track && extras.trackAt && Date.now() - Date.parse(extras.trackAt) < MONTH) {
    const next = new Date(Date.parse(extras.trackAt) + MONTH).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return Response.json({ error: `You can switch toolsets once a month. Next switch: ${next}. Or get both on Pro.` }, { status: 400 });
  }
  const next: Extras = { ...extras, track, trackAt: new Date().toISOString() };
  const limits = limitsFor(w.plan, next);
  const { error: e2 } = await db.from("workspaces").update({ extras: next, prompt_limit: limits.prompts, daily_answer_limit: dailyAnswers(limits) }).eq("id", body.workspaceId);
  if (e2) return errorResponse(e2, "api/billing/track");
  forgetEntitlement(body.workspaceId);
  return Response.json({ track });
}
