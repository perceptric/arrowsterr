// Made-up rank data for trying the app without a DataForSEO account (RL_DATA=demo). Every page
// shows a Demo data banner while it's on, and scans made with it are marked demo.
// Results are deterministic: the same pin and keyword always give the same ranks.

import { metersBetween, offset, type LatLng } from "./geo.ts";
import type { Listing, OrganicItem } from "./match.ts";
import type { Fetched, Kind, Posted, Provider, TaskSpec } from "./provider.ts";

/** A small seeded random number generator (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const PREFIX = ["Main Street", "Corner", "Prime", "Golden", "Riverside", "Uptown", "Family", "City", "Express", "Elite", "Sunset", "Oakwood", "Liberty", "Metro", "Lakeside", "Summit", "Heritage", "Harbor", "Union", "Parkway", "North Shore", "Westside"];
const DIRECTORIES = ["yelp.com", "yellowpages.com", "facebook.com", "bbb.org", "tripadvisor.com", "angi.com", "nextdoor.com", "mapquest.com"];
const DEFAULT_CENTER: LatLng = { lat: 41.8781, lng: -87.6298 };

function subject(keyword: string) {
  const words = keyword
    .toLowerCase()
    .replace(/\b(near me|best|top|cheap|affordable|emergency|24 hour|open now|in|the|a|downtown|nearby)\b/g, " ")
    .replace(/[^a-z ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  const s = words.map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
  return s || "Shop";
}

type Biz = Listing & { pos: LatLng; pull: number };

function world(keyword: string, target: TaskSpec["target"]): Biz[] {
  const center = target ? { lat: target.lat, lng: target.lng } : DEFAULT_CENTER;
  const seed = hash(`${keyword}|${center.lat.toFixed(2)}|${center.lng.toFixed(2)}`);
  const rand = rng(seed);
  const noun = subject(keyword);
  const list: Biz[] = PREFIX.slice(0, 20).map((p, i) => {
    const pos = offset(center, (rand() - 0.5) * 9000, (rand() - 0.5) * 9000);
    const slug = `${p} ${noun}`.toLowerCase().replace(/[^a-z]+/g, "");
    return {
      rank: 0,
      title: `${p} ${noun}`,
      domain: `${slug}.example`,
      cid: String(1000000 + ((seed + i * 7919) % 8999999)),
      place_id: `demo-${seed}-${i}`,
      rating: Math.round((3.6 + rand() * 1.4) * 10) / 10,
      reviews: Math.round(10 + rand() * 900),
      category: noun,
      address: `${100 + Math.round(rand() * 8000)} ${p} Ave`,
      lat: pos.lat,
      lng: pos.lng,
      pos,
      pull: rand() * 3.5,
    };
  });
  if (target) {
    list.push({
      rank: 0,
      title: target.name,
      domain: target.domain,
      cid: target.cid,
      place_id: "",
      rating: 4.6,
      reviews: 212,
      category: noun,
      address: "",
      lat: target.lat,
      lng: target.lng,
      pos: { lat: target.lat, lng: target.lng },
      pull: 1.1,
    });
  }
  return list;
}

function ranked(keyword: string, at: LatLng, target: TaskSpec["target"], salt: string): Biz[] {
  const rand = rng(hash(`${keyword}|${at.lat}|${at.lng}|${salt}`));
  return world(keyword, target)
    .map((b) => ({ b, score: metersBetween(at, b.pos) / 1000 + b.pull + rand() * 1.6 }))
    .sort((x, y) => x.score - y.score)
    .map(({ b }, i) => ({ ...b, rank: i + 1 }));
}

const strip = ({ pos: _pos, pull: _pull, ...l }: Biz): Listing => l;

function results(kind: Kind, s: TaskSpec): Fetched {
  const at = { lat: s.lat, lng: s.lng };
  if (kind === "maps") return { state: "done", maps: ranked(s.keyword, at, s.target, "maps").slice(0, 20).map(strip) };
  const pack = ranked(s.keyword, at, s.target, "pack").slice(0, 3).map(strip);
  const rand = rng(hash(`${s.keyword}|${s.lat}|${s.lng}|organic`));
  const domains = [...DIRECTORIES, ...ranked(s.keyword, at, s.target, "organic").map((b) => b.domain)].sort(() => rand() - 0.5);
  const organic: OrganicItem[] = domains.slice(0, 20).map((d, i) => ({ rank: i + 1, domain: d, url: `https://${d}/`, title: d }));
  return { state: "done", pack, organic };
}

const encode = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const decode = (s: string) => JSON.parse(Buffer.from(s, "base64url").toString()) as { k: Kind; s: TaskSpec; t: number };

export function demoProvider(opts: { delayMs?: number; now?: () => number } = {}): Provider {
  const delay = opts.delayMs ?? 1500;
  const now = opts.now ?? Date.now;
  return {
    name: "demo",
    async post(kind, specs): Promise<Posted[]> {
      return specs.map((s) => ({ id: `demo.${encode({ k: kind, s, t: now() })}` }));
    },
    async get(kind, id): Promise<Fetched> {
      if (!id.startsWith("demo.")) return { state: "failed", error: "Not a demo task." };
      const task = decode(id.slice(5));
      if (now() - task.t < delay) return { state: "waiting" };
      return results(kind, task.s);
    },
    async search(query) {
      const rand = rng(hash(query.toLowerCase()));
      const name = query.split(/,| in | near /i)[0].trim() || "Your business";
      return Array.from({ length: 3 }, (_, i) => {
        const pos = offset(DEFAULT_CENTER, (rand() - 0.5) * 6000, (rand() - 0.5) * 6000);
        const title = i === 0 ? name : `${name} ${["Downtown", "North", "West"][i]}`;
        return {
          rank: i + 1,
          title,
          domain: `${title.toLowerCase().replace(/[^a-z]+/g, "")}.example`,
          cid: String(hash(title)),
          place_id: "",
          rating: 4.5,
          reviews: 120 + i * 40,
          category: "Demo business",
          address: `${200 + i * 100} W Madison St, Chicago, IL`,
          lat: pos.lat,
          lng: pos.lng,
        };
      });
    },
  };
}
