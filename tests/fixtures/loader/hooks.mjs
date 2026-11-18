// Test-only module hooks, so a test can load server code: "server-only" becomes an empty module,
// "@/x" points at src/x, and extensionless relative imports find their .ts file.
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const SRC = new URL("../../../src/", import.meta.url);
const EMPTY = "data:text/javascript,export default {}";

export async function resolve(specifier, context, next) {
  if (specifier === "server-only") return { url: EMPTY, shortCircuit: true };
  let spec = specifier;
  if (spec.startsWith("@/")) spec = new URL(spec.slice(2), SRC).href;
  const relative = spec.startsWith("./") || spec.startsWith("../") || spec.startsWith("file:");
  if (relative && context.parentURL?.startsWith("file:")) {
    const base = new URL(spec, context.parentURL);
    const path = fileURLToPath(base);
    if (!existsSync(path) || !/\.[a-z]+$/.test(path)) {
      for (const ext of [".ts", ".tsx", "/index.ts"]) {
        if (existsSync(path + ext)) return next(pathToFileURL(path + ext).href, context);
      }
    }
    return next(base.href, context);
  }
  return next(spec, context);
}
