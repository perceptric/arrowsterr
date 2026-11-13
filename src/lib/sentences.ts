// Splitting text into sentences, the one way every part of the writer does it (lint, ids for findings, tidy, polish,
// the persona's stats). A sentence ends at . ! ? or … (with its closing quote or bracket kept), before a space and a
// capital letter or digit, but never after an initial ("A.O. Smith"), an abbreviation ("U.S.", "e.g.", "Inc.") or a
// number's decimal point. Joining the pieces with single spaces gives back the text. Pure.

const BOUNDARY = /([.!?…]["”)\]]?)(\s+)(?=["“(\[]?[A-Z0-9])/g;
const ABBREVIATIONS = new Set(["e.g", "i.e", "vs", "etc", "dr", "mr", "mrs", "ms", "jr", "sr", "st", "inc", "co", "corp", "ltd", "no", "fig", "approx", "est", "dept", "mt", "ft", "u.s", "u.k", "u.n", "a.m", "p.m"]);

/** The word right before a full stop at end (the text up to and including it), lower case, without brackets. */
function wordBefore(text: string, end: number): string {
  let i = end;
  while (i > 0 && !/[\s([]/.test(text[i - 1])) i--;
  return text.slice(i, end).replace(/^[[("“]+/, "").toLowerCase();
}

/** True when the full stop at index dot ends an initial or an abbreviation, not a sentence. */
function notAnEnd(text: string, dot: number): boolean {
  if (text[dot] !== ".") return false;
  const w = wordBefore(text, dot);
  if (/^[a-z]$/.test(w)) return true; // an initial: "A." in "A.O. Smith", "J." in "J. Smith"
  if (/^([a-z]\.)+[a-z]$/.test(w)) return true; // "U.S", "A.O"
  return ABBREVIATIONS.has(w);
}

/** The sentences of a text, trimmed, in order. */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (const m of text.matchAll(BOUNDARY)) {
    const dot = m.index!;
    if (notAnEnd(text, dot)) continue;
    const end = dot + m[1].length;
    const piece = text.slice(start, end).trim();
    if (piece) out.push(piece);
    start = end + m[2].length;
  }
  const last = text.slice(start).trim();
  if (last) out.push(last);
  return out;
}
