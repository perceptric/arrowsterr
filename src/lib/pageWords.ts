// Words and addresses for matching pages to topics (src/lib/contentMap.ts). Pure.

const STOP = new Set(
  "a about above after again all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its itself just let like make many may me might more most much must my no nor not now of off on once only or other our ours out over own same she should so some such than that the their theirs them then there these they this those through to too under until up us very was we well were what when where which while who whom why will with would you your yours get got one two use used using way new best top also every need want see go going really thing things lot lots per via vs etc yes don't can't it's you're we're they're isn't aren't doesn't didn't won't".split(
    " ",
  ),
);

/** Lowercase words without stopwords, so "the best CRM" and "best CRMs" read alike. */
export const words = (s: string) => (s.toLowerCase().match(/[a-z0-9][a-z0-9'-]*[a-z0-9]|[a-z]/g) ?? []).map((w) => w.replace(/'s$/, ""));
/** A light stem so plurals match: "pipelines" and "pipeline", "boxes" and "box", "companies" and "company". */
export function stem(w: string): string {
  if (w.length > 4 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.endsWith("sses")) return w.slice(0, -2);
  if (/(x|z|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
  return w;
}
/** The meaningful words of a phrase, stemmed, without stopwords. */
export const keyWords = (keyword: string) => [...new Set(words(keyword).filter((w) => !STOP.has(w)).map(stem))];

/** The same address, however it's written. */
export function pageKeyOf(url: string): string {
  return url.trim().replace(/#.*$/, "").replace(/^https?:\/\/(www\.)?/i, "").replace(/\/+(\?|$)/, "$1").toLowerCase();
}
