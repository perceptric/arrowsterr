// Domain check for the ChatGPT app directory. OpenAI shows a token when you connect the MCP server;
// put it in OPENAI_APPS_CHALLENGE on the server and this address returns it as plain text.
export function GET() {
  const token = process.env.OPENAI_APPS_CHALLENGE?.trim();
  if (!token) return new Response("Not set up.", { status: 404, headers: { "Content-Type": "text/plain" } });
  return new Response(token, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
