import { aiContext } from "@/lib/aiSettings";
import { briefDocHtml, htmlToText } from "@/lib/briefDoc";
import type { Brief } from "@/lib/briefTypes";
import { cleanDraftHtml } from "@/lib/library";
import { askClaude } from "@/lib/claude";
import type { Profile } from "@/lib/db";
import { requireWriter, take } from "@/lib/entitlements";
import { guidelineText } from "@/lib/guideline";
import { meteredRoute } from "@/lib/meter";
import { TASK_COST } from "@/lib/plans";
import { requireRole, takeAnswer } from "@/lib/serverAuth";
import { knowledgeText } from "@/lib/writerAgent";
import type { BrandGuideline } from "@/lib/writerTypes";

export const maxDuration = 300;

// Generate a draft from a piece's brief. The brief as it is saved now is the source of truth:
// the edited brief document when there is one, else the brief as generated.
// The browser saves the brief before it calls this, and saves the draft it gets back as its own document.
//   { workspaceId, itemId }  →  { title, html, briefAt }
async function handle(request: Request) {
  const body = await request.json().catch(() => ({}));
  const auth = await requireRole(request, body.workspaceId, "editor");
  if ("denied" in auth) return auth.denied;
  const paid = await requireWriter(body.workspaceId);
  if (paid) return paid;

  const { data: item, error } = await auth.sb
    .from("calendar_items")
    .select("id, site_id, keyword, secondary, action, current_url, brief, brief_status")
    .eq("id", body.itemId)
    .eq("workspace_id", body.workspaceId)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!item) return Response.json({ error: "Keyword not found." }, { status: 404 });
  const brief = item.brief as Brief | null;
  if (!brief || item.brief_status !== "done") return Response.json({ error: "Generate the brief first." }, { status: 400 });

  const { data: site } = await auth.sb.from("sites").select("name, domain, guideline, profile").eq("id", item.site_id).eq("workspace_id", body.workspaceId).maybeSingle();
  if (!site) return Response.json({ error: "Website not found." }, { status: 404 });

  const took = await take(body.workspaceId, "tasks", TASK_COST.draft);
  if (!took.ok) return took.response;
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "ANTHROPIC_API_KEY is not set on the server." }, { status: 500 });
  const limited = await takeAnswer(auth.sb, body.workspaceId);
  if (limited) return limited;

  const guideline = site.guideline as BrandGuideline | null;
  const profile = site.profile as Profile | null;
  const briefHtml = brief.doc ?? briefDocHtml({ keyword: item.keyword, secondary: item.secondary ?? [], action: item.action, current_url: item.current_url }, brief, { name: site.name, country: profile?.country }, guideline);
  const notes = await aiContext(auth.sb, body.workspaceId);
  const know = knowledgeText(profile);

  const prompt = `You write articles inside Arrowsterr for ${site.name} (${site.domain}). Write the full first draft of the article this content brief describes, ready for a human editor.

The brief is the source of truth. A person edited it. Follow its outline section by section, in order, with its headings. Follow its writer guidelines, its LEMA answers and its notes. Where the brief and anything else disagree, the brief wins.

Content brief:
"""
${htmlToText(briefHtml).slice(0, 30000)}
"""

Brand guideline:
${guidelineText(guideline)}
${notes ? `\n${notes}\n` : ""}
${know ? `What we know about ${site.name} (use it, never contradict it):\n${know}\n` : ""}
Rules:
- Target keyword: "${item.keyword}".${item.secondary?.length ? ` Also cover: ${item.secondary.join(", ")}.` : ""}
- Length: about ${brief.brief.wordCount} words.
- Start with one <h1>: ${brief.brief.h1 ? `"${brief.brief.h1}"` : "the article's title"}. Use <h2> for each outline section and <h3> under it where the outline has them.
- Answer the search in the first 2 to 3 sentences.
- Use the brand's voice. Short paragraphs. Lists and tables where they help the reader.
- Never invent facts, numbers, prices, customers or quotes. Use [brackets] for anything only the brand knows.
- Write HTML using only <h1>, <h2>, <h3>, <h4>, <p>, <ul>, <ol>, <li>, <strong>, <em>, <a href>, <blockquote>, <table>, <thead>, <tbody>, <tr>, <th>, <td>. No classes, no styles, no scripts.
- Answer with the HTML only. No other text, no code fences.`;

  try {
    const { text } = await askClaude(prompt, { maxTokens: 16000 });
    const html = cleanDraftHtml(text);
    if (!/<(p|h2|li)\b/i.test(html)) throw new Error("The draft came back empty. Try again.");
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, "").trim();
    return Response.json({ title: (h1 || brief.brief.h1 || item.keyword).slice(0, 200), html, briefAt: brief.docAt ?? brief.at });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("Draft generation failed:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}

export const POST = meteredRoute("draft", handle);
