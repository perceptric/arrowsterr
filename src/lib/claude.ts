import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { jsonrepair } from "jsonrepair";
import { charge, claudeCost } from "./meter";
import { isGrammarError, schemaPrompt } from "./jsonReply";
import type { Source } from "./sources";
import { replyText, requestBody, thinkingFix, type AskOpts, type ThinkingOff } from "./claudeRequest";

/** How each model takes "thinking off", learned from the API's own error the first time (claudeRequest.ts). */
const thinkingOff = new Map<string, ThinkingOff>();

export function claudeModel() {
  return process.env.CLAUDE_MODEL || "claude-sonnet-5-5";
}

/**
 * Ask Claude one question. With `searches` above 0, Claude can search the web that many times.
 * `prefix` is a long, stable start (a brand and its research) sent before the prompt and cached, so calls that
 * share it pay a tenth for those tokens after the first. `system` is a stable system prompt (the writing skills),
 * cached on its own, so it is shared by every call that sends the same text. The request is built in claudeRequest.ts.
 */
export async function askClaude(prompt: string, opts: AskOpts = {}): Promise<{ text: string; sources: Source[] }> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = opts.model ?? claudeModel();
  let off = thinkingOff.get(model) ?? "between_tools";
  let body = requestBody(prompt, opts, model, off);
  const messages = body.messages as Anthropic.MessageParam[];
  let text = "";
  const sources: Source[] = [];
  // A long web search turn can pause. Send it back so Claude can finish (a few times at most).
  for (let turn = 0; turn < 4; turn++) {
    let msg: Anthropic.Message;
    try {
      msg = await client.messages.create({ ...body, messages } as Anthropic.MessageCreateParamsNonStreaming);
    } catch (e) {
      // The model wants thinking turned off another way, and the error says which: remember it and ask again once.
      const fix = opts.schema && (e as { status?: number }).status === 400 ? thinkingFix(String((e as Error).message), off) : null;
      if (!fix) throw e;
      off = fix;
      thinkingOff.set(model, fix);
      body = requestBody(prompt, opts, model, off);
      msg = await client.messages.create({ ...body, messages } as Anthropic.MessageCreateParamsNonStreaming);
    }
    const u = msg.usage;
    charge("claude", claudeCost(model, (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) * 0.1 + (u.cache_creation_input_tokens ?? 0) * 1.25, u.output_tokens ?? 0, u.server_tool_use?.web_search_requests ?? 0));
    text += replyText(msg);
    for (const block of msg.content) {
      if (block.type !== "text") continue;
      for (const c of block.citations ?? []) {
        if (c.type === "web_search_result_location") sources.push({ url: c.url, title: c.title, domain: "" });
      }
    }
    if (msg.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: msg.content });
  }
  return { text, sources };
}

/** Ask Claude for JSON in a fixed shape. No web search: structured replies cannot carry search citations. */
export async function askJson<T>(prompt: string, schema: Record<string, unknown>, opts: Omit<AskOpts, "schema" | "searches"> = {}): Promise<T> {
  if (!tooBig.has(schema)) {
    try {
      const { text } = await askClaude(prompt, { ...opts, schema });
      return parseJson(text) as T;
    } catch (e) {
      if (!isGrammarError(e)) throw e;
      // The API can't compile this schema. Ask for the same JSON in the prompt, and skip the schema from now on.
      tooBig.add(schema);
    }
  }
  const { text } = await askClaude(schemaPrompt(prompt, schema), opts);
  return parseJson(text) as T;
}

/** Schemas the API refused as too large to compile, in this process. */
const tooBig = new WeakSet<object>();

/** Pull the first JSON object out of a reply. */
export function parseJson(text: string): Record<string, unknown> {
  const t = text.replace(/```(?:json)?/g, "");
  const raw = t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1);
  try {
    return JSON.parse(raw);
  } catch {
    // Replies sometimes come back with small mistakes, like a missing quote or comma. Fix them.
    return JSON.parse(jsonrepair(raw));
  }
}
