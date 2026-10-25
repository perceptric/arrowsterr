// Address checks for anything that fetches an address from outside. Pure, so tests can cover every range.
// scripts/worker.mjs keeps a copy of privateIp, since it runs alone. Change both together.
import { isIP } from "node:net";

function privateV4(ip: string): boolean {
  const [a, b, c] = ip.split(".").map(Number);
  return (
    a === 0 || // this network
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier NAT
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) || // protocol and test ranges
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224 // multicast and reserved
  );
}

/** The 8 groups of an IPv6 address, or null when it isn't one. Takes [brackets], zones and a dotted IPv4 tail. */
export function v6Groups(ip: string): number[] | null {
  let s = ip.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  const tail = s.match(/^(.*:)(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (tail) {
    const p = tail.slice(2).map(Number);
    if (p.some((n) => n > 255)) return null;
    s = `${tail[1]}${((p[0] << 8) | p[1]).toString(16)}:${((p[2] << 8) | p[3]).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const parts = (x: string) => (x ? x.split(":") : []);
  const head = parts(halves[0]);
  const rest = halves.length === 2 ? parts(halves[1]) : [];
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  if (fill < 0) return null;
  const all = [...head, ...Array<string>(fill).fill("0"), ...rest];
  if (all.length !== 8 || all.some((h) => !/^[0-9a-f]{1,4}$/.test(h))) return null;
  return all.map((h) => parseInt(h, 16));
}

const v4Of = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;

function privateV6(g: number[]): boolean {
  const zeros = (n: number) => g.slice(0, n).every((x) => x === 0);
  if (zeros(5) && g[5] === 0xffff) return privateV4(v4Of(g[6], g[7])); // ::ffff:a.b.c.d, IPv4 mapped
  if (zeros(4) && g[4] === 0xffff && g[5] === 0) return privateV4(v4Of(g[6], g[7])); // ::ffff:0:a.b.c.d
  if (zeros(6)) return true; // ::, ::1 and the old IPv4 compatible ::a.b.c.d, never public
  if (g[0] === 0x64 && g[1] === 0xff9b) return true; // NAT64 64:ff9b::/96 and 64:ff9b:1::/48 reach IPv4 inside
  if (g[0] === 0x2002) return true; // 6to4 hides an IPv4 address
  if (g[0] === 0x2001 && g[1] === 0) return true; // Teredo hides one too
  if (g[0] === 0x2001 && g[1] === 0xdb8) return true; // documentation
  if (g[0] === 0x100 && zeros(4)) return true; // discard
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local, Fly's fdaa:: included
  if ((g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xffc0) === 0xfec0) return true; // link-local and old site-local
  return (g[0] & 0xff00) === 0xff00; // multicast
}

/** True for addresses inside a private network, the machine itself, or cloud metadata services. */
export function privateIp(ip: string): boolean {
  const v = ip.trim().replace(/^\[|\]$/g, "");
  if (isIP(v) === 4) return privateV4(v);
  const g = v6Groups(v);
  // Something that isn't an address can't be trusted.
  return g ? privateV6(g) : true;
}

/** True for a host name that must never be fetched: a private address, or a name that only means something inside a network. */
export function privateHost(host: string): boolean {
  const h = host.trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!h) return true;
  if (isIP(h) || h.includes(":")) return privateIp(h);
  return !h.includes(".") || /(^|\.)(localhost|local|localdomain|internal|intranet|lan|home|corp|flycast|arpa)$/.test(h);
}

/** True for an http(s) address whose host isn't private on its face. DNS is still checked when it connects. */
export function publicAddress(url: string): boolean {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) && !u.username && !u.password && !privateHost(u.hostname);
  } catch {
    return false;
  }
}
