// Zippie's built-in skills: instructions he loads for one kind of task. Workspaces can turn each one
// off and add their own in the Skills panel.

export type Skill = { key: string; name: string; description: string; instructions: string; builtin: boolean; enabled: boolean };

export const BUILTIN_SKILLS: Omit<Skill, "builtin" | "enabled">[] = [
  {
    key: "ai-visibility-review",
    name: "AI visibility review",
    description: "A clear read of how AI talks about the brand, and the 3 moves that matter most.",
    instructions: `1. Call get_ai_visibility for the last 30 days, then get_visibility_trend.
2. Call get_competitors and get_cited_sources.
3. Report: visibility share, average position, sentiment, and the change versus the period before. Name the AI where the brand is weakest.
4. Name the 2 or 3 competitors that AI names most, and the sources it cites most that never mention the brand.
5. End with 3 moves, most impact first. Each move says what to do, where, and why it should move the numbers.`,
  },
  {
    key: "meta-writer",
    name: "Meta titles and descriptions",
    description: "SEO titles and meta descriptions that earn the click, prepared for your CMS.",
    instructions: `- Titles: 50 to 60 characters, the main keyword near the start, the brand at the end after a separator when it fits.
- Descriptions: 140 to 155 characters, a clear promise and one concrete detail (a number, a feature, a result). No clickbait, no ALL CAPS.
- Match what the page is about. Never promise what the page doesn't deliver.
- To change real pages, use get_site_content, then propose_changes with play "meta". Tell the person the changes wait for their approval.`,
  },
  {
    key: "onpage-fix",
    name: "On-page fix",
    description: "Scores a page against Google's top 10 for its keyword, then prepares the fixes.",
    instructions: `1. Ask for the page and its keyword if the person didn't say. If they only gave a page, ask which search it should win.
2. Call start_onpage_audit, wait about a minute, then call get_onpage_audit with its id. If it's still running, call it again.
3. Report the score next to the top 10 average, where the page ranks, and the 3 biggest gaps, most points first.
4. For fixes a play can make (fix_play meta, schema, faq, alt, links), offer propose_changes for that page. Tell the person the changes wait for their approval.
5. For content gaps, list the missing terms and the length gap, and give the suggested opening paragraph and title from the audit. Never invent facts the page doesn't state.`,
  },
  {
    key: "link-gap-outreach",
    name: "Link gap outreach",
    description: "Finds sites that link to your rivals but not to you, starting with the ones AI cites, and drafts the pitch.",
    instructions: `1. Call get_backlinks. Report linking sites, authority and the last 4 weeks of new and lost sites in one or two lines.
2. If there is no link gap yet, say the rivals it needs, or point to Backlinks, Link gap, in one line.
3. Pick 5 to 10 gap sites: first ones AI cites, then ones that link to more than one rival, then the strongest.
4. For each, say why it fits in one line, and what the brand could offer them: data, a quote, a guide, a tool, a correction.
5. Draft one short pitch per site the person can edit and send. Lead with what helps their readers. No link begging, no flattery.
6. Never send anything yourself.`,
  },
  {
    key: "faq-builder",
    name: "FAQ sections",
    description: "FAQ sections built from the questions buyers ask AI, with FAQ structured data.",
    instructions: `- Start from real questions: get_prompts and get_prompt_answers show what people ask AI about this market.
- 4 to 6 questions per page. Each answer is 2 to 4 sentences, answers the question in the first sentence, and stays true to the page.
- Write the way a helpful expert talks. No sales fluff.
- To add them to real pages, use propose_changes with play "faq". It also adds FAQ structured data when the CMS allows it.`,
  },
  {
    key: "competitor-teardown",
    name: "Competitor teardown",
    description: "Why AI picks a competitor over you, and how to close the gap.",
    instructions: `1. Ask which competitor if the person didn't say. Use get_competitors to see who leads.
2. Use get_prompt_answers to find prompts where the competitor is named and the brand is not. Quote short parts of the answers.
3. Use get_cited_sources to see which pages AI leans on for those answers.
4. Explain the pattern in plain words: what the competitor has (pages, reviews, comparisons, lists) that the brand lacks.
5. End with a short plan: the pages to write or fix, and the sources to get mentioned in.`,
  },
  {
    key: "llms-txt",
    name: "llms.txt writer",
    description: "Writes an llms.txt file that tells AI tools what your site is and where the best pages are.",
    instructions: `- Follow the llms.txt format: an H1 with the site name, a one-paragraph summary in a blockquote, then H2 sections with lists of links in the form "- [Title](url): one line on what it covers".
- Use get_site_content (or the site audit) to find the most useful pages: product, pricing, docs, comparisons, top guides.
- Keep it under 60 links. Plain, factual words.
- Give the file in a code block and say where it goes: the root of the site, at /llms.txt.`,
  },
  {
    key: "community-replies",
    name: "Community replies",
    description: "Drafts helpful Reddit and forum replies that AI tools learn from. You post them yourself.",
    instructions: `- Lead with real help that answers the question even without the brand.
- Mention the brand only where it truly fits, and say plainly that the writer works there.
- Match the community's tone. Short paragraphs. No links unless they help.
- Never post anything yourself. Give drafts the person can edit and post.`,
  },
  {
    key: "brand-voice",
    name: "Brand voice",
    description: "Writes in your brand's voice, using the guides and examples in Knowledge.",
    instructions: `- Read the Knowledge items first, mainly brand guides, tone notes and sample posts. Use read_knowledge for long ones.
- Copy the voice: sentence length, words they use and avoid, how formal they are, how they use humor.
- If Knowledge has no voice guide, ask for one or for 2 or 3 posts they like.`,
  },
];
