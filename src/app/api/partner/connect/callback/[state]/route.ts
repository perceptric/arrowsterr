import { finishConnect, liveConnectDeps } from "@/lib/partnerConnect";
import { adminClient } from "@/lib/serverAuth";

type Params = { params: Promise<{ state: string }> };

// Where the provider sends a partner's customer after signing in. Never a page: a 302 back to the partner's return_url.
export async function GET(request: Request, { params }: Params) {
  const { state } = await params;
  const db = adminClient();
  if (!db) return new Response("Not set up on the server.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  return finishConnect(state, new URL(request.url).searchParams, await liveConnectDeps(db));
}
