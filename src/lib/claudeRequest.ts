// The one place a Claude request is put together, and its reply read (used by claude.ts and the writer baseline).
// Pure, so tests cover it with no network.
//
// JSON replies turn thinking off. Sonnet 5.5 can think on its own, and on a long brief it can spend the whole
// max_tokens thinking and return no text at all (seen on the Phase 0 baseline run, November 2026). A JSON reply needs
// its tokens for the answer. Models name "off" differently: Sonnet 5.5 wants "between_tools" and refuses "disabled",
// with an error that names the right one. Haiku 5.5 takes "disabled" and refuses "between_tools". Opus 5.5 and Fable
// refuse both, so they get no thinking field. thinkingOffFor picks the start, thinkingFix reads a refusal, and claude.ts
// remembers the answer per model.

/** "omit" sends no thinking field at all. */
export type ThinkingOff = "between_tools" | "disabled" | "omit";

/** How a model takes "thinking off", as far as we know before asking. */
export function thinkingOffFor(model: string): ThinkingOff {
  if (/sonnet-5-5/.test(model)) return "between_tools";
  if (/opus-5-5|fable|mythos/.test(model)) return "omit";
  return "disabled";
}

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
export function requestBody(prompt: string, opts: AskOpts, model: string, off: ThinkingOff = thinkingOffFor(model)) {
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
    ...(opts.schema && off !== "omit" ? { thinking: { type: off } } : {}),
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

/**
 * When the API refuses how thinking was turned off, the type to try next: the one the error names, or else the next
 * one down ("between_tools", then "disabled", then no thinking field). Otherwise null.
 */
export function thinkingFix(message: string, tried: ThinkingOff): ThinkingOff | null {
  if (!/thinking/i.test(message) || tried === "omit") return null;
  const named = /send\s+\\?"thinking\\?"\s*:\s*\{\s*\\?"type\\?"\s*:\s*\\?"(between_tools|disabled)\\?"/i.exec(message)?.[1] as ThinkingOff | undefined;
  if (named) return named !== tried ? named : null;
  // e.g. "thinking.type.between_tools" is not supported for this model.
  if (new RegExp(`thinking\\.type\\.${tried}\\\\?"? is not supported`, "i").test(message)) return tried === "between_tools" ? "disabled" : "omit";
  return null;
}

/**
 * Earlier turns of a saved chat, ready to send again: thinking blocks come out. Each one is tied to the system prompt
 * it was made under, and Zippie's prompt changes from message to message (the page, a picked skill), so the API
 * refuses an old one ("bound to a different conversation"). Claude doesn't need them once a turn is over.
 */
export function withoutThinking<T extends { role: string; content: unknown }>(turns: T[]): T[] {
  return turns.map((t) => {
    if (t.role !== "assistant" || !Array.isArray(t.content)) return t;
    const blocks = t.content as { type: string }[];
    const kept = blocks.filter((b) => b.type !== "thinking" && b.type !== "redacted_thinking");
    if (kept.length === blocks.length) return t;
    return { ...t, content: kept.length ? kept : [{ type: "text", text: "(no reply)" }] };
  });
}
