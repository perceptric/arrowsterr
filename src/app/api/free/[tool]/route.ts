import { dfsReady } from "@/lib/dataforseo";
import { cleanDomain, cleanKeyword, cleanUrl } from "@/lib/freeLimits";
import { meta, schemaFill } from "@/lib/freeOnPage";
import { backlinks, gap, rank, snapshot, traffic } from "@/lib/freeResearch";
import { answer, authority, crawlers, links, llms, robots, speed } from "@/lib/freeRunners";
import { cleanTopic } from "@/lib/metaRules";
import { SCHEMA_TYPES, type SchemaType } from "@/lib/schemaGen";
import { cors, freeRun, reply } from "@/lib/freeTools";
import { freeKeyword } from "@/lib/kwReport";
import { MARKETS } from "@/lib/research";

// Free tools for arrowsterr.com (docs/free-tools.md). Public: every tool goes through freeRun's limits.
//   keyword   { keyword, country, focus? }      Keyword Research Tool, Volume Checker, Difficulty Checker
//   crawlers  { domain }                  AI Crawler Checker
//   llms      { domain }                  llms.txt Generator
//   answer    { url }                     AI Answer-Ready Checker
//   authority { domain }                  Domain Authority Checker
//   speed     { url, strategy }           Page Speed Checker
//   links     { url }                     Broken Link and Redirect Checker
//   snapshot  { domain, country }         Domain Overview
//   traffic   { domain, country }         Website Traffic Checker
//   backlinks { target }                  Backlink Checker: a domain, or a page address
//   rank      { domain, keyword, country } Keyword Rank Checker: Google's top 100 and AI Mode
//   gap       { domain, rival, country }  Keyword Gap Tool
//   schema    { url, type }               Schema Markup Generator: Fill from my page (typed fields build in the browser)
//   meta      { url } or { topic, keyword? } Meta Title and Description Generator
//   robots    { domain }                  Robots.txt Tester: fetch (pasted text tests in the browser)
// Every request also carries { token } for Cloudflare Turnstile when it is on.

export const maxDuration = 120;

export function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: cors(request) });
}

const needDomain = (request: Request) => reply(request, { error: "Enter a website, like acme.com." }, 400);
const needUrl = (request: Request) => reply(request, { error: "Enter a page address, like acme.com/pricing." }, 400);
const resting = (request: Request) => reply(request, { error: "This tool is resting. Please try again later." }, 503);
/** A country the research data covers. Global has no single market, so it's left out. */
const countryOf = (v: unknown) => (typeof v === "string" && Object.hasOwn(MARKETS, v) && v !== "Global" ? v : null);

export async function POST(request: Request, { params }: { params: Promise<{ tool: string }> }) {
  const { tool } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  switch (tool) {
    case "keyword": {
      const keyword = cleanKeyword(body.keyword);
      if (!keyword) return reply(request, { error: "Enter a keyword of 2 to 80 characters, like crm for small business." }, 400);
      const country = typeof body.country === "string" && Object.hasOwn(MARKETS, body.country) && body.country !== "Global" ? body.country : null;
      if (!country) return reply(request, { error: "Pick a country." }, 400);
      if (!dfsReady()) return resting(request);
      const focus = body.focus === "volume" || body.focus === "difficulty" ? body.focus : "all";
      return freeRun(request, body, "keyword", focus === "all" ? `${country}:${keyword}` : `${focus}:${country}:${keyword}`, () => freeKeyword(keyword, country, focus));
    }
    case "crawlers": {
      const domain = cleanDomain(body.domain);
      return domain ? freeRun(request, body, "crawlers", domain, () => crawlers(domain)) : needDomain(request);
    }
    case "llms": {
      const domain = cleanDomain(body.domain);
      return domain ? freeRun(request, body, "llms", domain, () => llms(domain)) : needDomain(request);
    }
    case "answer": {
      const url = cleanUrl(body.url);
      return url ? freeRun(request, body, "answer", url, () => answer(url)) : needUrl(request);
    }
    case "authority": {
      const domain = cleanDomain(body.domain);
      return domain ? freeRun(request, body, "authority", domain, () => authority(domain)) : needDomain(request);
    }
    case "speed": {
      const url = cleanUrl(body.url);
      const strategy = body.strategy === "desktop" ? "desktop" : "mobile";
      return url ? freeRun(request, body, "speed", `${strategy}:${url}`, () => speed(url, strategy)) : needUrl(request);
    }
    case "links": {
      const url = cleanUrl(body.url);
      return url ? freeRun(request, body, "links", url, () => links(url)) : needUrl(request);
    }
    case "snapshot":
    case "traffic": {
      const domain = cleanDomain(body.domain);
      const country = countryOf(body.country);
      if (!domain) return needDomain(request);
      if (!country) return reply(request, { error: "Pick a country." }, 400);
      if (!dfsReady()) return resting(request);
      const key = `${country}:${domain}`;
      return tool === "snapshot" ? freeRun(request, body, "snapshot", key, () => snapshot(domain, country)) : freeRun(request, body, "traffic", key, () => traffic(domain, country));
    }
    case "backlinks": {
      // A bare domain checks the whole site; an address with a path checks that one page.
      const url = cleanUrl(body.target);
      if (!url) return needDomain(request);
      const u = new URL(url);
      const target = u.pathname === "/" && !u.search ? u.hostname.replace(/^www\./, "") : url;
      if (!dfsReady()) return resting(request);
      return freeRun(request, body, "backlinks", target, () => backlinks(target));
    }
    case "rank": {
      const domain = cleanDomain(body.domain);
      const keyword = cleanKeyword(body.keyword);
      const country = countryOf(body.country);
      if (!domain) return needDomain(request);
      if (!keyword) return reply(request, { error: "Enter a keyword of 2 to 80 characters, like crm for small business." }, 400);
      if (!country) return reply(request, { error: "Pick a country." }, 400);
      if (!dfsReady()) return resting(request);
      return freeRun(request, body, "rank", `${country}:${keyword}:${domain}`, () => rank(domain, keyword, country));
    }
    case "gap": {
      const domain = cleanDomain(body.domain);
      const rival = cleanDomain(body.rival);
      const country = countryOf(body.country);
      if (!domain || !rival) return reply(request, { error: "Enter your website and a rival's, like acme.com." }, 400);
      if (domain === rival) return reply(request, { error: "Pick a rival with a different website from yours." }, 400);
      if (!country) return reply(request, { error: "Pick a country." }, 400);
      if (!dfsReady()) return resting(request);
      // The order matters: the rival's keywords you're missing.
      return freeRun(request, body, "gap", `${country}:${rival}>${domain}`, () => gap(domain, rival, country));
    }
    case "schema": {
      const url = cleanUrl(body.url);
      const type = SCHEMA_TYPES.find((t) => t.type === body.type)?.type as SchemaType | undefined;
      if (!url) return needUrl(request);
      if (!type) return reply(request, { error: "Pick a schema type." }, 400);
      return freeRun(request, body, "schema", `${type}:${url}`, () => schemaFill(url, type));
    }
    case "meta": {
      if (body.url) {
        const url = cleanUrl(body.url);
        return url ? freeRun(request, body, "meta", `url:${url}`, () => meta({ url })) : needUrl(request);
      }
      const topic = cleanTopic(body.topic);
      if (!topic) return reply(request, { error: "Enter a page address, or a topic of 2 to 120 characters." }, 400);
      const keyword = body.keyword ? cleanKeyword(body.keyword) : null;
      if (body.keyword && !keyword) return reply(request, { error: "Enter a keyword of 2 to 80 characters." }, 400);
      return freeRun(request, body, "meta", `topic:${topic.toLowerCase()}:${keyword ?? ""}`, () => meta({ topic, keyword }));
    }
    case "robots": {
      const domain = cleanDomain(body.domain);
      return domain ? freeRun(request, body, "robots", domain, () => robots(domain)) : needDomain(request);
    }
  }
  return reply(request, { error: "No such tool." }, 404);
}
