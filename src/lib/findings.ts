// The one line under a screen's title that says what its data means. Pure, so tests can cover them.

type PromptVis = { prompt: string; visibility: number | null };

/**
 * Prompts: how many prompts no model names, or the prompt with the biggest drop when every prompt is named.
 * now and before are each prompt's visibility this period and the period before. null when there's nothing to say.
 */
export function promptFinding(now: PromptVis[], before: PromptVis[] = []): string | null {
  const seen = now.filter((r) => r.visibility !== null);
  if (!seen.length) return null;
  const missed = seen.filter((r) => r.visibility === 0).length;
  if (missed) return `${missed} of ${seen.length} prompts ${missed === 1 ? "isn't" : "aren't"} named by any model.`;
  const was = new Map(before.filter((r) => r.visibility !== null).map((r) => [r.prompt, r.visibility as number]));
  let worst: { prompt: string; from: number; to: number } | null = null;
  for (const r of seen) {
    const from = was.get(r.prompt);
    if (from === undefined) continue;
    const to = r.visibility as number;
    if (Math.round(from) - Math.round(to) >= 1 && (!worst || from - to > worst.from - worst.to)) worst = { prompt: r.prompt, from, to };
  }
  if (worst) return `Every prompt is named. The biggest drop: "${worst.prompt}", ${Math.round(worst.from)}% to ${Math.round(worst.to)}%.`;
  return `${seen.length === 1 ? "Your 1 prompt is" : `All ${seen.length} prompts are`} named by at least one model.`;
}

type Stat = { name: string; isYou: boolean; visibility: number };
type TopicLead = { leader: string | null };

/**
 * Competitors: the rival AI names most, next to you, and how many topics it leads.
 * "HubSpot is named in 41% of answers, you in 23%; it leads on 5 of 8 topics."
 */
export function competitorFinding(stats: Stat[], topics: TopicLead[]): string | null {
  const you = stats.find((s) => s.isYou);
  const rival = stats.filter((s) => !s.isYou).sort((a, b) => b.visibility - a.visibility)[0];
  if (!you || !rival) return null;
  const head = `${rival.name} is named in ${Math.round(rival.visibility)}% of answers, you in ${Math.round(you.visibility)}%`;
  const led = topics.filter((t) => t.leader !== null);
  if (!led.length) return `${head}.`;
  const wins = led.filter((t) => t.leader!.toLowerCase() === rival.name.toLowerCase()).length;
  return `${head}; it leads on ${wins} of ${led.length} ${led.length === 1 ? "topic" : "topics"}.`;
}
