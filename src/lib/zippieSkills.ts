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
    description: "Writes in your brand's voice, using the voice and guidelines Zippie learned from your site.",
    instructions: `- Call get_brand_voice first. It has the voice, the guidelines and a sample of the brand's own writing.
- Read the Knowledge items too, mainly brand guides, tone notes and sample posts. Use read_knowledge for long ones.
- Copy the voice: sentence length, words they use and avoid, how formal they are, how they use humor. Copy the sample's rhythm, never its facts.
- Say only what the guidelines list as proof. No "best", "only" or numbers the brand's pages don't state.
- If the voice says "Not learned yet" and Knowledge has no guide, ask for 2 or 3 pages they like.`,
  },
  {
    key: "brand-guidelines",
    name: "Brand guidelines",
    description: "Learns a brand's voice, messages, writing rules and look from its pages and writes them up.",
    instructions: `- Call get_brand_voice to see what Zippie already learned during onboarding. Build on it.
- Read the brand's homepage, about page and 2 or 3 articles (get_site_content when a CMS is connected, or the pages the person shares).
- Write these sections: who the brand is (one or two sentences), personality ("If the brand were a person..."), what it offers, who it writes for, 3 or 4 key messages, voice and tone (3 to 5 words, each with what it means and an example line from its pages), writing rules (US or UK spelling, heading case, numbers, serial comma, contractions, product names), words to use and avoid, proof it can use word for word, things not to say, the main call to action, and the look (colors and fonts).
- Use only what the pages show. Mark anything you inferred so the person can check it.
- Tell the person they can paste it on the Brand page so Agentic Writing follows it.`,
  },
  {
    key: "humanize",
    name: "Humanize writing",
    description: "Rewrites text so it reads like a careful person wrote it, in the brand's voice.",
    instructions: `- Call get_brand_voice and match its tone and sentence length.
- Remove AI tells: "not X, but Y" contrasts, lists of three for rhythm, staged openers ("Here's the thing:"), one-line closers, dashes, stock words (delve, unlock, leverage, robust, seamless, game-changer), bold labels on every bullet, and filler.
- Keep every fact, number, name and link. Change wording only.
- Most sentences 12 to 25 words, one idea each. Paragraphs of 1 to 3 sentences.`,
  },
  {
    key: "strict-review",
    name: "Strict writing review",
    description: "Audits a draft for AI tells, judgment and weak claims, and returns findings to fix.",
    instructions: `- Check two layers. Words and structure: banned words and phrases, dashes, compound hyphens, rule of three, formulaic transitions ("Furthermore"), weak verbs ("utilize", "serves as"). Discourse: stated takeaways, staged reveals, manufactured closure, epilogue paragraphs, vague references, atmospheric openers.
- Flag lines that judge companies or readers ("most teams get it wrong"). Suggest a neutral line that says what to do.
- Flag claims with no source and numbers that don't add up.
- Reply with a verdict (pass or fix) and a numbered list: the line, the problem, a fixed line.`,
  },
  {
    key: "proofread",
    name: "Proofread",
    description: "A final check that fixes only real slips and says whether the text can go out.",
    instructions: `- Fix only certain errors: spelling, grammar, punctuation, doubled or missing words, a name spelled two ways. Never reword.
- Check counts against lists ("7 tools" lists 7), dates against weekdays, and percentages against their total.
- Find leftovers: TODO, TK, placeholders in brackets, chat or Markdown debris.
- Ask about anything that could change the meaning instead of fixing it.
- End with "Ready to publish" or "Hold" and the reason.`,
  },
];
