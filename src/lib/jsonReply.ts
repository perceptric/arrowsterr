// Structured replies: when the API can't compile a schema into a grammar, ask for the same JSON in the prompt.

/** True when the API refused a schema because its compiled grammar is too large or complex. */
export function isGrammarError(e: unknown): boolean {
  const o = (e && typeof e === "object" ? e : {}) as { status?: number; message?: string };
  if (o.status !== undefined && o.status !== 400) return false;
  const text = `${o.message ?? ""} ${e instanceof Error ? e.message : String(e)}`;
  return /compiled grammar is too large|grammar is too (large|complex)|schema is too (large|complex)|simplify your (tool )?schemas?/i.test(text);
}

/** The prompt with the schema written out, for a reply with no enforced format. */
export function schemaPrompt(prompt: string, schema: Record<string, unknown>): string {
  return `${prompt}\n\nReply with only one JSON object, no other text, that matches this JSON Schema. Fill every required field.\n${JSON.stringify(schema)}`;
}
