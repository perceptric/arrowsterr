// The Meta Title and Description Generator's rules (docs/free-tools.md), the same ones Zippie's meta-writer skill
// follows. Pure, so tests can check that no option outside the rules is ever shown.

export const TITLE = { min: 30, max: 60 };
export const DESCRIPTION = { min: 120, max: 160 };

/** One line as the AI wrote it, without quotes, labels or doubled spaces. */
export function cleanLine(s: string): string {
  return s
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/^\s*(title|description|meta description|option)\s*\d*\s*[:.-]\s*/i, "")
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Why a line breaks the rules, or null when it's fine. */
export function metaProblem(s: string, kind: "title" | "description"): string | null {
  const r = kind === "title" ? TITLE : DESCRIPTION;
  if (s.length < r.min) return "Too short";
  if (s.length > r.max) return "Too long";
  if (/!{2,}|\?{2,}/.test(s)) return "Clickbait";
  if ((s.match(/\b[A-Z]{6,}\b/g) ?? []).length > 0) return "All caps";
  if (/\p{Extended_Pictographic}/u.test(s)) return "Emoji";
  return null;
}

/** Up to n options that follow the rules, without repeats. */
export function pickOptions(lines: unknown, kind: "title" | "description", n = 5): string[] {
  if (!Array.isArray(lines)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of lines) {
    if (typeof raw !== "string") continue;
    const s = cleanLine(raw);
    const key = s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
    if (!s || seen.has(key) || metaProblem(s, kind)) continue;
    seen.add(key);
    out.push(s);
    if (out.length === n) break;
  }
  return out;
}

/** A topic as the tool takes it: 2 to 120 characters, no links or code. Null when it won't do. */
export function cleanTopic(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const t = input.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (t.length < 2 || t.length > 120) return null;
  if (/https?:\/\/|[<>{}[\]\\`]/.test(t)) return null;
  return /\p{L}|\p{N}/u.test(t) ? t : null;
}
