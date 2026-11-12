import { oauthExchange, oauthReady, oauthSetup } from "@/lib/cmsTokens";
import { readState, stateReady } from "@/lib/google";
import { callbackBase, mayConnect, oauthAnswer, saveSite } from "@/lib/oauthAnswer";
import { adminClient } from "@/lib/serverAuth";

// HubSpot sends people back here after they allow access. Save the account's blog with its tokens, then close.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const base = callbackBase(request);
  const answer = (msg: { ok: boolean; reason?: string; check?: string }) => oauthAnswer(base, "hubspot", msg);
  const state = stateReady() ? readState(url.searchParams.get("state") ?? "") : null;
  if (!state || state.kind !== "hubspot") return answer({ ok: false, reason: "The sign-in link expired. Try again." });
  if (url.searchParams.get("error")) return answer({ ok: false, reason: "HubSpot access was not allowed." });
  if (!oauthReady("hubspot")) return answer({ ok: false, reason: "HubSpot sign-in is not set up on the server." });
  const db = adminClient();
  if (!db) return answer({ ok: false, reason: "Add SUPABASE_SECRET_KEY to the server's settings." });
  try {
    const no = await mayConnect(db, state);
    if (no) return answer({ ok: false, reason: no });
    const tokens = await oauthExchange("hubspot", url.searchParams.get("code") ?? "", base);
    const { name, config, check } = await oauthSetup("hubspot", tokens);
    await saveSite(db, state, "hubspot", name, config, (old) => old.blogId === config.blogId);
    return answer({ ok: true, check });
  } catch (e) {
    return answer({ ok: false, reason: e instanceof Error ? e.message.slice(0, 200) : "Could not connect HubSpot." });
  }
}
