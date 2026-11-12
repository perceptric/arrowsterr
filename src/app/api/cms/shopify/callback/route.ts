import { shopDomain, shopifyHmacOk } from "@/lib/cmsOauth";
import { oauthExchange, oauthReady, oauthSetup } from "@/lib/cmsTokens";
import { readState, stateReady } from "@/lib/google";
import { callbackBase, mayConnect, oauthAnswer, saveSite } from "@/lib/oauthAnswer";
import { adminClient } from "@/lib/serverAuth";

// Shopify sends people back here after they install the app on their store. The callback is checked twice: Shopify's
// signature over its values, and our own signed state, which names the same store. Then the store and its blog are saved.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const base = callbackBase(request);
  const answer = (msg: { ok: boolean; reason?: string; check?: string }) => oauthAnswer(base, "shopify", msg);
  const state = stateReady() ? readState(url.searchParams.get("state") ?? "") : null;
  if (!state || state.kind !== "shopify") return answer({ ok: false, reason: "The sign-in link expired. Try again." });
  if (!oauthReady("shopify")) return answer({ ok: false, reason: "Shopify sign-in is not set up on the server." });
  if (!shopifyHmacOk(url.searchParams, process.env.SHOPIFY_CLIENT_SECRET!.trim())) return answer({ ok: false, reason: "Shopify's answer didn't check out. Try again." });
  const shop = shopDomain(url.searchParams.get("shop") ?? "");
  if (!shop || shop !== state.shop) return answer({ ok: false, reason: "That's a different store from the one you typed. Try again." });
  const db = adminClient();
  if (!db) return answer({ ok: false, reason: "Add SUPABASE_SECRET_KEY to the server's settings." });
  try {
    const no = await mayConnect(db, state);
    if (no) return answer({ ok: false, reason: no });
    const tokens = await oauthExchange("shopify", url.searchParams.get("code") ?? "", base, shop);
    const { name, config, check } = await oauthSetup("shopify", tokens, shop);
    await saveSite(db, state, "shopify", name, config, (old) => old.shop === shop);
    return answer({ ok: true, check });
  } catch (e) {
    return answer({ ok: false, reason: e instanceof Error ? e.message.slice(0, 200) : "Could not connect Shopify." });
  }
}
