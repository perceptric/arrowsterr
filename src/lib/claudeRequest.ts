// The one place a Claude request is put together, and its reply read (used by claude.ts and the writer baseline).
// Pure, so tests cover it with no network.
//
// JSON replies turn thinking off. Sonnet 5.5 can think on its own, and on a long brief it can spend the whole
// max_tokens thinking and return no text at all (seen on the Phase 0 baseline run, November 2026). A JSON reply needs
// its tokens for the answer. Models name "off" differently: Sonnet 5.5 wants "between_tools" and refuses "disabled",
// with an error that names the right one. thinkingFix reads that error, and claude.ts remembers the answer per model.

export type ThinkingOff = "between_tools" | "disabled";

export type AskOpts = {
  searches?: number;
  maxTokens?: number;
  model?: string;
  effort?: "low" | "medium" | "high";
  schema?: Record<string, unknown>;
  prefix?: string;
  system?: string;
};

export const SEARCH_TOOL = "web_search_20260209" as const;

type Text = { type: "text"; text: string; cache_control?: { type: "ephemeral" } };

/** The request body for messages.create, before any pause_turn messages are added. */
export function requestBody(prompt: string, opts: AskOpts, model: string, off: ThinkingOff = "between_tools") {
  const content: string | Text[] = opts.prefix ? [{ type: "text", text: opts.prefix, cache_control: { type: "ephemeral" } }, { type: "text", text: prompt }] : prompt;
  return {
    model,
    max_tokens: opts.maxTokens ?? 16000,
    ...(opts.system ? { system: [{ type: "text" as const, text: opts.system, cache_control: { type: "ephemeral" as const } }] } : {}),
    messages: [{ role: "user" as const, content }],
    // With a schema, the API makes sure the reply is valid JSON in that shape.
    ...(opts.effort || opts.schema
      ? { output_config: { ...(opts.effort ? { effort: opts.effort } : {}), ...(opts.schema ? { format: { type: "json_schema" as const, schema: opts.schema } } : {}) } }
      : {}),
    ...(opts.schema ? { thinking: { type: off } } : {}),
    ...(opts.searches ? { tools: [{ type: SEARCH_TOOL, name: "web_search" as const, max_uses: opts.searches }] } : {}),
  };
}

type Block = { type: string; text?: string };

/**
 * The text of a finished reply. A reply that ran out of tokens before writing any text throws a clear error, so the
 * job retries it, rather than failing later on an empty JSON parse.
 */
export function replyText(msg: { content: Block[]; stop_reason: string | null; usage?: { output_tokens?: number } }): string {
  const text = msg.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
  if (!text.trim() && msg.stop_reason === "max_tokens") {
    throw new Error(`Claude used all ${msg.usage?.output_tokens ?? "its"} reply tokens before writing an answer (${msg.content.map((b) => b.type).join(", ") || "nothing"}).`);
  }
  return text;
}

/** When the API refuses how thinking was turned off and names the type it wants, that type. Otherwise null. */
export function thinkingFix(message: string, tried: ThinkingOff): ThinkingOff | null {
  if (!/thinking/i.test(message)) return null;
  const named = /send\s+\\?"thinking\\?"\s*:\s*\{\s*\\?"type\\?"\s*:\s*\\?"(between_tools|disabled)\\?"/i.exec(message)?.[1] as ThinkingOff | undefined;
  if (named && named !== tried) return named;
  return null;
}
