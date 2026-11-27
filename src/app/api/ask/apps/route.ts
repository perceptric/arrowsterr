import { APP_GROUPS, APPS, appLogo, composioReady, connectLink, connections, disconnect, isApp } from "@/lib/composio";
import { entitlement } from "@/lib/entitlements";
import { requireRole } from "@/lib/serverAuth";
import { appUrl } from "@/lib/emailKit";
import { errorResponse } from "@/lib/errorsServer";

const err = (error: string, status = 400) => Response.json({ error }, { status });

// Apps for Zippie, connected through Composio (src/lib/composio.ts).
//   list: {}                 viewers: every app we offer, and which ones this workspace connected
//   connect: { slug }        admins: a sign-in link; the person comes back to Settings → Integrations
//   disconnect: { id }       admins
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const auth = await requireRole(request, body.workspaceId, body.action === "list" ? "viewer" : "admin");
  if ("denied" in auth) return auth.denied;
  const ws = String(body.workspaceId);
  const e = await entitlement(ws);
  const allowed = e.limits.mcp;

  if (body.action === "list") {
    if (!composioReady()) return Response.json({ ready: false, allowed, apps: [] });
    let rows: Awaited<ReturnType<typeof connections>> = [];
    try {
      rows = await connections(ws, true);
    } catch (x) {
      return errorResponse(x, "api/ask/apps", { status: 502, hint: "Couldn't load your apps." });
    }
    return Response.json({
      ready: true,
      allowed,
      groups: APP_GROUPS,
      apps: APPS.map((a) => {
        const mine = rows.filter((r) => r.slug === a.slug);
        const live = mine.find((r) => r.status === "ACTIVE");
        return { ...a, logo: appLogo(a.slug), connection: live ? { id: live.id, status: live.status } : null, stale: mine.filter((r) => r.status !== "ACTIVE").map((r) => r.id) };
      }),
    });
  }
  if (!composioReady()) return err("Apps for Zippie are not set up on the server yet.", 503);
  if (!allowed) return Response.json({ error: "Apps for Zippie are on Starter and up.", limit: true, boost: "foundation" }, { status: 429 });

  if (body.action === "connect") {
    const slug = String(body.slug ?? "");
    if (!isApp(slug)) return err("Pick an app from the list.");
    try {
      return Response.json({ url: await connectLink(ws, slug, `${appUrl()}/settings/integrations?app=${slug}`) });
    } catch (x) {
      return errorResponse(x, "api/ask/apps", { status: 502 });
    }
  }
  if (body.action === "disconnect") {
    try {
      if (!(await disconnect(ws, String(body.id ?? "")))) return err("That app isn't connected to this workspace.", 404);
    } catch (x) {
      return errorResponse(x, "api/ask/apps", { status: 502 });
    }
    return Response.json({ ok: true });
  }
  return err("Unknown action.");
}
