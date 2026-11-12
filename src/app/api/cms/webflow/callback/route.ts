import { readState, stateReady } from "@/lib/google";
import { callbackBase, mayConnect, oauthAnswer, saveSite } from "@/lib/oauthAnswer";
import { adminClient } from "@/lib/serverAuth";
import { webflowReady, webflowSetup, webflowToken } from "@/lib/webflowAuth";

// Webflow sends people back here after they allow access (a window opened by the connect wizard). Save the site,
// then tell the wizard and close. Opened on its own, it goes back to Settings › Publishing sites.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const base = callbackBase(request);
  const answer = (msg: { ok: boolean; reason?: string; check?: string }) => oauthAnswer(base, "webflow", msg);
  const state = stateReady() ? readState(url.searchParams.get("state") ?? "") : null;
  if (!state || state.kind !== "webflow") return answer({ ok: false, reason: "The sign-in link expired. Try again." });
  if (url.searchParams.get("error")) return answer({ ok: false, reason: "Webflow access was not allowed." });
  if (!webflowReady()) return answer({ ok: false, reason: "Webflow sign-in is not set up on the server." });
  const db = adminClient();
  if (!db) return answer({ ok: false, reason: "Add SUPABASE_SECRET_KEY to the server's settings." });
  try {
    const no = await mayConnect(db, state);
    if (no) return answer({ ok: false, reason: no });
    const token = await webflowToken(url.searchParams.get("code") ?? "", base);
    const { name, config, check } = await webflowSetup(token);
    // Signing in again for the same collection refreshes that site instead of adding a second one.
    await saveSite(db, state, "webflow", name, config, (old) => old.collectionId === config.collectionId);
    return answer({ ok: true, check });
  } catch (e) {
    return answer({ ok: false, reason: e instanceof Error ? e.message.slice(0, 200) : "Could not connect Webflow." });
  }
}
