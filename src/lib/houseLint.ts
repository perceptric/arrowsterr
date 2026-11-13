// The Perceptric house lint (perceptric-writer/scripts/lint.py), ported for the writer (docs/zippie-skills-plan.md,
// section 2). Its FAIL lists of banned words, phrases and structures run on every sentence and list item, next to the
// checks houseRules.ts already had. Two house rules win where they disagree with lint.py:
//   - A feeling adverb now and then is a house rule ("Thankfully,", "Honestly,"), so those words are not banned here.
//     houseRules.ts still flags one used twice.
//   - Curly quotes are straightened in code (tidy.ts), so they are never a finding.
// Words that are part of the article's own topic (its keyword or an example's name) are never flagged: an article
// about "customer journey mapping" has to say "journey".
// Pure, shared by the server, the browser and tests.

export type LintHit = { rule: string; why: string };

const WORDS = `delve\\w* tapestry realm paradigm\\w* embark\\w* beacon testament robust comprehensive
cutting[-\\s]?edge leverag\\w* pivotal underscor\\w* meticulous\\w* seamless\\w* game[-\\s]?chang\\w* utiliz\\w*
watershed nestled vibrant thriving showcas\\w* unpack\\w* bustling intricate intricacies ever[-\\s]?evolving
daunting holistic actionable impactful learnings synerg\\w* interplay commence\\w* ascertain endeavou?r\\w*
myriad plethora cornerstone unparalleled harness\\w* elevat\\w* garner\\w* foster\\w* breathtaking stunning
renowned unlock\\w* unleash\\w* empower\\w* groundbreaking revolution\\w* transformative paramount
streamlin\\w* spearhead\\w* bolster\\w* landscape ecosystem crucial multifaceted quietly moreover
furthermore additionally genuinely best-in-class world-class`
  .split(/\s+/)
  .filter(Boolean); // lint.py's "thankfully", "luckily" and "honestly" are left out: the house rules want a feeling adverb now and then

const PHRASES = [
  "in today'?s",
  "in an era",
  "now more than ever",
  "let'?s (dive|explore|break)",
  "dive into",
  "deep dive",
  "here'?s the (thing|kicker)",
  "here'?s what you need to know",
  "(it'?s|it is) worth noting",
  "important to note",
  "needless to say",
  "in conclusion",
  "to summari[sz]e",
  "in summary",
  "at the end of the day",
  "the future looks bright",
  "move the needle",
  "low[- ]hanging fruit",
  "(take|takes) it to the next level",
  "at its core",
  "the real question",
  "plays? an? (crucial|vital|key|pivotal) role",
  "\\bserves as\\b",
  "\\bstands as\\b",
  "\\bacts as\\b",
  "a testament to",
  "unpopular opinion",
  "hot take",
  "let that sink in",
  "read that again",
  "what nobody tells you",
  "nobody'?s (talking|naming)",
  "i hope this helps",
  "great question",
  "\\bin order to\\b",
  "due to the fact",
  "could potentially",
  "might possibly",
  "stop the scroll",
  "on autopilot",
  "falls? through the cracks",
  "customer journey",
  "pain points?",
  "value proposition",
  "navigat\\w+ the",
  "\\bjourney\\b",
  "agree\\? disagree",
  "the lesson here",
  "the takeaway is",
  "it goes to show",
  "this highlights the importance",
];

const STRUCT: { re: RegExp; why: string }[] = [
  { re: /—/, why: "an em dash" },
  { re: /–/, why: "an en dash" },
  { re: /\s--\s|\w--\w/, why: "a double hyphen" },
  { re: /\w \- \w/, why: "a spaced hyphen used as a dash" },
  { re: /\b(it'?s|this is|that'?s|this isn'?t|it isn'?t)\s+(not|n'?t)?\s*(just|only|merely|about)?[^.!?\n]{0,60}[,;]\s+(it'?s|but|this is)\b/i, why: 'a "not X, it\'s Y" contrast' },
  { re: /\bnot (only|just|merely)\b[^.!?\n]{0,80}\bbut( also)?\b/i, why: 'a "not only X but Y" contrast' },
  { re: /(^|[.!?]\s+)(Not|No) [^.!?\n]{1,40}\.\s+(Not|No) [^.!?\n]{1,40}\./, why: 'stacked "Not X. Not Y." fragments' },
  { re: /!/, why: "an exclamation mark" },
];

const wordRes = WORDS.map((w) => ({ w, re: new RegExp(`\\b${w}\\b`, "i") }));
const phraseRes = PHRASES.map((p) => ({ p, re: new RegExp(p, "i") }));
const plain = (t: string) =>
  t
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*?([^*]+)\*\*?/g, "$1")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"');

/** Allowed terms, lower case: the article's keyword and its examples' names, and every word in them. */
export function allowedTerms(terms: (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const t of terms) {
    const low = (t ?? "").toLowerCase().trim();
    if (!low) continue;
    out.add(low);
    for (const w of low.split(/[^a-z0-9'-]+/)) if (w.length > 3) out.add(w);
  }
  return [...out];
}

/** lint.py's FAIL checks on one sentence or list item. allow: terms from the article's own topic, never flagged. */
export function houseLint(text: string, allow: string[] = []): LintHit[] {
  const t = plain(text);
  const low = t.toLowerCase();
  const allowed = (hit: string) => {
    const h = hit.toLowerCase();
    return allow.some((a) => a === h || a.includes(h) || (h.includes(a) && a.length > 3));
  };
  const out: LintHit[] = [];
  for (const { re } of wordRes) {
    const m = low.match(re);
    if (m && !allowed(m[0])) out.push({ rule: "words", why: `"${m[0]}"` });
  }
  for (const { re } of phraseRes) {
    const m = low.match(re);
    if (m && !allowed(m[0].trim())) out.push({ rule: /in conclusion|to summari|in summary|the takeaway|the lesson/.test(m[0]) ? "ending" : "words", why: `"${m[0].trim()}"` });
  }
  for (const { re, why } of STRUCT) if (re.test(t)) out.push({ rule: "dashes", why });
  return out;
}

/** A sentence too long to read in one go (lint.py warns above 35 words). */
export const LONG_SENTENCE = 35;
