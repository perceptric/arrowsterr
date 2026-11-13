// The 20 recorded topics (scripts/writer-record.mjs) as the writer reads them: the research pack and the brand.
// Shared by the tests and scripts/writer-baseline.mjs. Offline: everything comes from tests/fixtures/writer.
import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { DEFAULT_SAMPLE, DEFAULT_VOICE } from "../src/lib/houseRules.ts";
import { toPack, type ResearchPack, type WriterContext } from "../src/lib/writerBrief.ts";
import type { Serp } from "../src/lib/articleResearch.ts";
import type { Source } from "../src/lib/sources.ts";
import { TOPICS } from "./fixtures/writer/topics.mjs";

export type Brand = { name: string; domain: string; reader: string; sitemap: string[] };
export type Topic = { slug: string; keyword: string; kind: "saas" | "store" | "agency" | "local" | "publisher"; stage: "bofu" | "mofu" | "tofu"; volume: number; brand: Brand };
export type RecordedPage = {
  url: string;
  final_url: string | null;
  source: "serp" | "ai";
  position: number | null;
  title: string | null;
  headings: { level: number; text: string }[];
  body: string;
  word_count: number;
  tables: string[][][];
  published_at: string | null;
};
export type Fixture = Topic & {
  v: 1;
  recorded: string;
  serp: Serp;
  answers: { engine: string; question: string; answer: string | null; cited: Source[]; error: string | null }[];
  pages: RecordedPage[];
  skipped: { url: string; source: string; reason: string; error: string }[];
};

const DIR = new URL("./fixtures/writer/", import.meta.url);

export const topics = () => TOPICS as Topic[];
export const fileOf = (slug: string) => new URL(`${slug}.json.gz`, DIR);
export const recorded = (slug: string) => existsSync(fileOf(slug));

export function loadFixture(slug: string): Fixture {
  return JSON.parse(gunzipSync(readFileSync(fileOf(slug))).toString("utf8")) as Fixture;
}

/** The research the way the writer gets it from the database (writerServer.ts, loadResearch). */
export function packOf(f: Fixture): ResearchPack {
  return toPack({ run: { keyword: f.keyword, paa: f.serp.paa, ai_overview: f.serp.aiOverview }, pages: f.pages, answers: f.answers });
}

/** A new brand as the writer sees it after setup: the house voice and sample, a short guideline and the sitemap. */
export function contextOf(f: Fixture): WriterContext {
  return {
    brand: { name: f.brand.name, domain: f.brand.domain },
    voice: { ...DEFAULT_VOICE, naming: f.brand.name, reader: f.brand.reader },
    kit: null,
    guidelines: { body: `${f.brand.name} (${f.brand.domain}) writes for: ${f.brand.reader}.`, links: [] },
    sample: DEFAULT_SAMPLE,
    sitemap: f.brand.sitemap,
    stage: f.stage,
  };
}
