import { adminClient } from "@/lib/serverAuth";

// Return addresses of apps we know. Anything else gets a warning on the approval screen,
// since any site can register an app with any name.
const KNOWN_HOSTS = ["claude.ai", "claude.com", "chatgpt.com", "chat.openai.com", "platform.openai.com"];
const KNOWN_SCHEMES = ["cursor:", "vscode:", "vscode-insiders:", "windsurf:"];
function known(redirect: string) {
  try {
    const u = new URL(redirect);
    if (KNOWN_SCHEMES.includes(u.protocol)) return true;
    if (u.protocol === "http:") return ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
    return u.protocol === "https:" && KNOWN_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

// The approval screen asks which app is asking, and checks where it wants to send the person back.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("client_id") ?? "";
  const redirect = url.searchParams.get("redirect_uri") ?? "";
  const db = adminClient();
  const { data } = db && id ? await db.from("oauth_clients").select("name, redirect_uris").eq("id", id).maybeSingle() : { data: null };
  if (!data) return Response.json({ error: "This app is not registered. Start the connection again from the app." }, { status: 404 });
  if (!(data.redirect_uris as string[]).includes(redirect)) return Response.json({ error: "This app sent a return address it did not register." }, { status: 400 });
  const host = (() => {
    try {
      return new URL(redirect).host || redirect;
    } catch {
      return redirect;
    }
  })();
  return Response.json({ name: data.name, host, known: known(redirect) });
}
