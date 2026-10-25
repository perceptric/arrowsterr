import "server-only";
import { lookup } from "node:dns";
import { lookup as lookupAll } from "node:dns/promises";
import { isIP } from "node:net";
import { Agent, fetch as ufetch } from "undici";
import { privateHost, privateIp } from "./netCheck.ts";

// Fetching any address that came from outside: typed into a tool, found on a page, or saved by a customer.
// The server must never reach its own network: every connection, including each redirect, is checked at
// connect time against the addresses DNS gave, so DNS tricks can't slip past. Use this, never plain fetch().

// Tests only: point every name at one local address. It can never turn on in production.
const TEST_RESOLVE = process.env.NODE_ENV !== "production" ? process.env.FREE_TEST_RESOLVE?.trim() : undefined;

const agent = new Agent({
  connect: {
    timeout: 10_000,
    lookup(host, options, cb) {
      if (TEST_RESOLVE) {
        const list = [{ address: TEST_RESOLVE, family: 4 }];
        if ((options as { all?: boolean }).all) return (cb as unknown as (e: null, a: typeof list) => void)(null, list);
        return cb(null, TEST_RESOLVE, 4);
      }
      lookup(host, { ...options, all: true }, (err, addresses) => {
        if (err) return cb(err, "", 4);
        const list = Array.isArray(addresses) ? addresses : [{ address: addresses as unknown as string, family: 4 }];
        const bad = list.find((a) => privateIp(a.address));
        if (!list.length || bad) return cb(Object.assign(new Error("That address points to a private network."), { code: "EPRIVATE" }), "", 4);
        // undici asks for all addresses when options.all is set.
        if ((options as { all?: boolean }).all) return (cb as unknown as (e: null, a: typeof list) => void)(null, list);
        cb(null, list[0].address, list[0].family);
      });
    },
  },
});

export const UA = "Mozilla/5.0 (compatible; ArrowsterrBot/1.0; +https://arrowsterr.com/)";

export type Fetched = { ok: boolean; status: number; url: string; chain: { url: string; status: number }[]; headers: Headers; body: string; ms: number; error?: string; bytes?: Buffer };

export type SafeOptions = {
  method?: string;
  ua?: string;
  /** Redirects to follow. Reads follow 5 by default; anything that sends data follows none. */
  hops?: number;
  timeout?: number;
  maxBytes?: number;
  accept?: string;
  raw?: boolean;
  /** More headers, like Authorization. They are dropped when a redirect goes to another site. */
  headers?: Record<string, string>;
  body?: string | Uint8Array;
};

/** True when the host can be fetched: a public name or address, checked against DNS now. Connecting checks again. */
export async function publicHost(host: string): Promise<boolean> {
  const h = host.replace(/^\[|\]$/g, "");
  if (isIP(h)) return !privateIp(h);
  if (TEST_RESOLVE) return true;
  if (privateHost(h)) return false;
  try {
    const list = await lookupAll(h, { all: true });
    return list.length > 0 && !list.some((a) => privateIp(a.address));
  } catch {
    return false;
  }
}

/**
 * Fetch a public address. Redirects are followed by hand, up to `hops`, and each hop is checked and recorded.
 * The body is read as text up to maxBytes. Never throws: failures come back with status 0 and an error.
 */
export async function safeFetch(url: string, opts: SafeOptions = {}): Promise<Fetched> {
  const start = Date.now();
  const chain: { url: string; status: number }[] = [];
  let current = url;
  let method = (opts.method ?? "GET").toUpperCase();
  let body = opts.body;
  let extra = opts.headers ?? {};
  const hops = opts.hops ?? (method === "GET" || method === "HEAD" ? 5 : 0);
  const fail = (error: string, status = 0, headers = new Headers()): Fetched => ({ ok: false, status, url: current, chain, headers, body: "", ms: Date.now() - start, error });
  for (let i = 0; i <= hops; i++) {
    let u: URL;
    try {
      u = new URL(current);
    } catch {
      return fail("Not a valid address.");
    }
    // Names like localhost and private addresses typed as numbers never get as far as DNS.
    const host = u.hostname.replace(/^\[|\]$/g, "");
    if (!/^https?:$/.test(u.protocol) || u.username || u.password || (isIP(host) ? privateIp(host) : !TEST_RESOLVE && privateHost(host))) return fail("That address can't be checked.");
    try {
      const res = await ufetch(current, {
        method,
        redirect: "manual",
        dispatcher: agent,
        headers: { "User-Agent": opts.ua ?? UA, Accept: opts.accept ?? "text/html,application/xhtml+xml,*/*;q=0.8", ...extra },
        body: body ?? undefined,
        signal: AbortSignal.timeout(opts.timeout ?? 15_000),
      });
      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location && i < hops) {
        chain.push({ url: current, status: res.status });
        await res.body?.cancel().catch(() => {});
        const next = new URL(location, current);
        // Keys never follow a redirect to another site.
        if (next.origin !== u.origin) extra = {};
        // Like browsers: 303, and 301 or 302 after a POST, turn into a plain GET.
        if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === "POST")) {
          if (method !== "HEAD") method = "GET";
          body = undefined;
        }
        current = next.toString();
        continue;
      }
      let text = "";
      if (method !== "HEAD" && res.body) {
        const max = opts.maxBytes ?? 3_000_000;
        const reader = res.body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          chunks.push(value);
          size += value.byteLength;
          if (size >= max) {
            await reader.cancel().catch(() => {});
            // raw: a file cut short is useless, so it fails instead.
            if (opts.raw) return fail("It is too large.", res.status, res.headers as unknown as Headers);
            break;
          }
        }
        if (opts.raw) return { ok: res.ok, status: res.status, url: current, chain, headers: res.headers as unknown as Headers, body: "", bytes: Buffer.concat(chunks), ms: Date.now() - start };
        text = new TextDecoder().decode(Buffer.concat(chunks)).slice(0, max);
      } else await res.body?.cancel().catch(() => {});
      return { ok: res.ok, status: res.status, url: current, chain, headers: res.headers as unknown as Headers, body: text, ms: Date.now() - start };
    } catch (e) {
      const err = e as { code?: string; cause?: { code?: string; message?: string }; name?: string; message?: string };
      const code = err.cause?.code ?? err.code;
      return fail(code === "EPRIVATE" ? "That address points to a private network." : err.name === "TimeoutError" ? "It took too long to answer." : code === "ENOTFOUND" ? "That domain doesn't exist." : "It couldn't be reached.");
    }
  }
  return fail("Too many redirects.");
}
