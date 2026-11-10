import { readPage } from "./parse.ts";

// What Chromium saw on a crawled page after JavaScript ran, next to the raw HTML the crawler read
// (docs/technical-seo-plan.md, phase 3). Pure: rendered HTML and the browser's notes in, facts out.

export type Rendered = {
  status: number;
  final: string;
  timeout: boolean;
  words: number;
  title: string;
  description: string;
  canonical: string | null;
  noindex: boolean;
  h1: string[];
  headings: number;
  schema: string[];
  internal: number;
  /** Internal links that only exist after JavaScript runs (up to 50). */
  onlyRendered: string[];
  errors: number;
  errorSamples: string[];
  /** Requests the page needed that failed (not images or fonts), up to 20. */
  failed: { url: string; type: string; reason: string }[];
  /** Scripts and stylesheets on the site's own host, for the robots.txt check (up to 50). */
  resources: string[];
};

export type BrowserNotes = { status: number; final: string; timeout: boolean; errors: string[]; failed: { url: string; type: string; reason: string }[]; resources: string[] };

export function renderedFacts(url: string, html: string, rawLinks: string[], notes: BrowserNotes, opts: { root: string; subdomains?: boolean; dropQuery?: boolean }): Rendered {
  const f = readPage(notes.final || url, html, {}, opts);
  const raw = new Set(rawLinks);
  return {
    status: notes.status,
    final: notes.final || url,
    timeout: notes.timeout,
    words: f.words,
    title: f.title,
    description: f.description,
    canonical: f.canonical,
    noindex: f.noindex,
    h1: f.h1,
    headings: f.headings,
    schema: f.schema,
    internal: f.internal.length,
    onlyRendered: f.internal.map((l) => l.url).filter((u) => !raw.has(u)).slice(0, 50),
    errors: notes.errors.length,
    errorSamples: notes.errors.slice(0, 5).map((e) => e.slice(0, 200)),
    failed: notes.failed.filter((x) => !/image|font|media/.test(x.type)).slice(0, 20),
    resources: notes.resources.slice(0, 50),
  };
}

/** The share of the rendered page's main text that the raw HTML already had, 0 to 100. Null when nothing rendered. */
export function rawShare(rawWords: number, rendered: Pick<Rendered, "words"> | null | undefined): number | null {
  if (!rendered || rendered.words < 1) return null;
  return Math.max(0, Math.min(100, Math.round((rawWords / rendered.words) * 100)));
}
