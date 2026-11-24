import "server-only";

// The brand a Zippie tool is about, shared by zippieTools.ts and zippieWriter.ts (kept apart so neither imports the other).

import { ToolError } from "./mcp/protocol";
import type { ToolCtx } from "./zippieTools";

const str = (v: unknown, n = 300) => (typeof v === "string" ? v.trim().slice(0, n) : "");

/** The brand a tool is about: the one named, else the one picked in the app, else the only one. */
export async function brandOf(ctx: ToolCtx, arg: unknown): Promise<{ id: string; name: string; domain: string }> {
  const { data } = await ctx.db.from("brands").select("id, name, domain").eq("workspace_id", ctx.ws).order("created_at");
  const all = (data ?? []) as { id: string; name: string; domain: string }[];
  if (!all.length) throw new ToolError("This workspace has no brands yet.");
  const want = (str(arg, 200) || ctx.where?.brand || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  const hit = want ? all.find((b) => b.name.toLowerCase() === want || b.domain.toLowerCase() === want || b.domain.toLowerCase().includes(want)) : null;
  if (hit) return hit;
  if (all.length === 1 || !want) return all[0];
  throw new ToolError(`Say which brand: ${all.map((b) => `${b.name} (${b.domain})`).join(", ")}.`);
}
