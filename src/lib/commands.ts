// What the ⌘K command bar finds: screens, settings, brands, actions, prompts and Editorial Calendar keywords.
// Pure, so tests can cover the ranking.

export type CommandGroup = "Actions" | "Screens" | "Settings" | "Brands" | "Prompts" | "Editorial Calendar";

export type Command = {
  id: string;
  label: string;
  group: CommandGroup;
  /** Other words that find it: "visibility" finds Prompts. */
  words?: string;
  /** A short line on the right, like the topic a prompt is in. */
  hint?: string;
  /** Only shown once something is typed, so long lists (prompts, keywords) stay out of the first view. */
  searchOnly?: boolean;
};

/** The order groups show in when scores tie. */
export const GROUP_ORDER: CommandGroup[] = ["Actions", "Screens", "Brands", "Settings", "Prompts", "Editorial Calendar"];

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** How well one typed word matches a text: whole text, start, a word's start, anywhere, or letters in order. */
function wordScore(text: string, q: string): number {
  if (!q) return 0;
  if (text === q) return 100;
  if (text.startsWith(q)) return 80;
  if (text.split(/[\s/,.()-]+/).some((w) => w.startsWith(q))) return 60;
  if (text.includes(q)) return 40;
  // Letters in order, like "edcal" for Editorial Calendar. Only for 3 letters or more, so short typing stays exact.
  if (q.length >= 3) {
    let i = 0;
    for (const ch of text) if (ch === q[i] && ++i === q.length) return 10;
  }
  return 0;
}

/** A command's score for the typed text: every word must match the label or its other words. 0 means no match. */
export function scoreCommand(c: Command, query: string): number {
  const q = norm(query);
  if (!q) return c.searchOnly ? 0 : 1;
  const label = norm(c.label);
  const words = norm(`${c.words ?? ""} ${c.hint ?? ""}`);
  // The whole query against the label first, so "domain research" beats two loose matches.
  const whole = wordScore(label, q);
  if (whole >= 40) return whole + 50;
  let total = 0;
  for (const t of q.split(" ")) {
    const s = Math.max(wordScore(label, t), wordScore(words, t) * 0.6);
    if (!s) return 0;
    total += s;
  }
  return total / q.split(" ").length;
}

/** The commands that match, best first; ties keep the group order, then the list's own order. */
export function rankCommands<T extends Command>(list: T[], query: string, limit = 60): T[] {
  return list
    .map((c, i) => ({ c, i, s: scoreCommand(c, query) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || GROUP_ORDER.indexOf(a.c.group) - GROUP_ORDER.indexOf(b.c.group) || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.c);
}
