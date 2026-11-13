// Helpers: create a skill and add to Knowledge, both ending in a card the person saves.

import { def, SKILL_TOOLS, type Def } from "./shared.ts";

export const HELPERS: Def[] = [
  def({
    slug: "create-a-skill",
    title: "Create a skill",
    group: "helpers",
    speed: "quick",
    result: "Card you save",
    tools: ["propose_skill"],
    description: 'Writes a new skill as a SKILL.md and shows it on a card to save in Skills, Personal or for the whole Workspace. Use it when someone says "create a skill", "make a skill", "teach Zippie to", "save this as a skill", "every time I ask for this" or "do it this way from now on". Do not use it to save facts about the business (use Add to Knowledge).',
    intro: "Writes a skill for the person to review and save: when to use it, the steps, the rules and the shape of the answer.",
    use: ["Someone wants Zippie to do a job the same way every time.", "Someone just walked Zippie through a job and says save this."],
    notFor: ["Facts about the business: use Add to Knowledge."],
    steps: [
      "If it isn't clear what the skill does and when, ask one short question.",
      "Pick a name in lowercase words joined by dashes and a title that starts with a verb.",
      'Write the description: what it does, then "Use it when" and the phrases people say.',
      "Write the steps from what the person described, each naming the tool it uses.",
      "Write the rules and the output.",
      "Call propose_skill with the whole SKILL.md. If problems come back, fix them and call it again.",
    ],
    rules: [`Name only these tools: ${SKILL_TOOLS.join(", ")}.`],
    output: ["One line on what the skill does. The person saves it with the card's Save button."],
  }),
  def({
    slug: "add-to-knowledge",
    title: "Add to Knowledge",
    group: "helpers",
    speed: "quick",
    result: "Card you save",
    tools: ["read_knowledge", "crawl_page", "propose_knowledge"],
    description: 'Turns a page, a file or a note into Knowledge pages by kind (Brand, Product, Competitor, Proof, Persona, Style) and shows a card to save them. Use it when someone says "add this to Knowledge", "remember this", "save our pricing", "learn this page" or "teach Zippie about".',
    intro: "Keeps Knowledge short and sorted: one page per kind, each fact once.",
    use: ["Someone shares a link, a file or facts to remember."],
    notFor: ["A way of doing a job: use Create a skill."],
    steps: [
      "Read the source: crawl_page for a link, or the text in the chat.",
      "Check Knowledge with read_knowledge for a page of the same kind, so facts aren't saved twice.",
      'Write each page with a title that starts with its kind, like "Competitor: Acme" or "Proof: customer results". Keep each under 3,000 characters.',
      "Call propose_knowledge once per page. To update a page, send the whole new page with replaces set to the old title.",
    ],
    rules: ["Keep every number with the URL it came from."],
    output: ["One line per page, then the cards to save."],
  }),
];
