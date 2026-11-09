// The start page every new SEO tool shows before it has data (docs/tool-start.md): what the tool shows, the numbers
// that matter, how it works, what each number means, and the questions people ask before they run it. Content only;
// the page is src/components/ToolStart.tsx. Every fact here comes from the tool's own doc.

export type ToolKey = "siteaudit" | "onpage" | "backlinks" | "linkbuilding" | "contentmap" | "local";
export type Tone = "technical" | "links" | "content" | "research";

export type ToolInfo = {
  title: string;
  slug: string;
  tone: Tone;
  lead: string;
  payoff: string;
  sub: string;
  whatTitle: string;
  whatSub: string;
  parts: [string, string][];
  facts: [string, string][];
  steps: [string, string][];
  terms: [string, string, string][];
  faq: [string, string][];
  ask: string[];
  cta: string;
};

export const TOOL_ORDER: ToolKey[] = ["siteaudit", "onpage", "backlinks", "linkbuilding", "contentmap", "local"];

export const TOOLS: Record<ToolKey, ToolInfo> = {
  siteaudit: {
    title: "Site Audit", slug: "/site-audit", tone: "technical",
    lead: "Find what's holding", payoff: "your site back",
    sub: "Arrowsterr reads up to 200 pages, scores the site from 0 to 100 and lists every issue with the pages it hits.",
    whatTitle: "What the audit shows", whatSub: "One report for the whole site, sorted so the biggest problems come first.",
    parts: [
      ["Health score", "A score from 0 to 100, the change since the last full crawl and the scores of the last 8 crawls."],
      ["Facts from the crawl", "Pages read, broken links and AI crawlers your robots.txt blocks."],
      ["Issues by priority", "High, medium and low, each with the share of pages it hits and how it changed since the last crawl."],
      ["Fixes in your CMS", "Titles, meta descriptions, alt text and structured data go to your connected site as a change you approve or undo."],
    ],
    facts: [["200", "pages read in each crawl"], ["120", "links checked in each crawl"], ["8", "past scores on the chart"], ["5 pts", "drop that sends you an email"]],
    steps: [
      ["Start the audit", "The crawler starts at your homepage and follows its links."],
      ["We crawl the site", "Up to 200 pages and 120 link checks, in a few minutes."],
      ["Fix the high priority issues", "Open an issue to see why it matters and every page it hits."],
      ["It crawls again each week", "You get an email when the score drops 5 points or more."],
    ],
    terms: [
      ["Health score", "The share of checks your pages pass, weighted by priority.", "82"],
      ["Full crawl", "A crawl where the homepage loaded and most pages answered. Only full crawls get a score.", "Full"],
      ["Partial crawl", "A crawl that was cut short. It keeps what it read and shows no score.", "No score"],
      ["Broken link", "A link to a page that answers with an error, such as 404 or 500.", "404"],
      ["robots.txt", "The file that tells crawlers which pages they may read.", "GPTBot"],
      ["Structured data", "Code that tells Google and AI what a page is about, such as an FAQ or a product.", "FAQPage"],
    ],
    faq: [
      ["How many pages does it read?", "Up to 200 pages and 120 link checks per crawl, starting from your homepage."],
      ["Does a crawl use tasks?", "No. Crawls are plain page loads. Fixes count against your plan's tasks, like other Zippie plays."],
      ["Can it change my site?", "Only after you approve. Fix prepares a change set in your connected CMS, and you can apply or undo it."],
      ["Why is there no score?", "The crawl was partial. The homepage didn't load, or more than half the pages didn't answer. Run it again once the site is up."],
      ["How do I stop the weekly crawl?", "Turn off the Weekly crawl switch on the report."],
    ],
    ask: ["Which issue should I fix first?", "Why did my score drop?"],
    cta: "Crawl your site now",
  },
  onpage: {
    title: "On-page Audit", slug: "/onpage-audit", tone: "technical",
    lead: "Score any page against", payoff: "Google's top 10",
    sub: "Enter a page and the keyword it should rank for. Arrowsterr scores it with the same rules it uses on the top 10 results.",
    whatTitle: "What the audit shows", whatSub: "Your page next to the pages Google ranks first, check by check.",
    parts: [
      ["Score against the top 10", "A score from 0 to 100 next to the top 10 average, split into 5 areas."],
      ["Google preview", "Your title and description now and a suggested version, with their lengths."],
      ["Fixes with points", "Each fix shows the points it adds. A connected CMS can apply it for you."],
      ["Terms to add", "Phrases most top pages share, with how often your page uses each one."],
    ],
    facts: [["10", "top results scored the same way"], ["5", "areas, 100 points in all"], ["25", "tasks per audit, refunded on failure"], ["3", "top pages needed to compare"]],
    steps: [
      ["Enter a page and a keyword", "Use the keyword the page should rank for."],
      ["We read the page and the top 10", "Each readable top page gets the same checks as yours."],
      ["Fix the biggest gaps", "Each fix shows the points it adds. A connected CMS can apply it."],
      ["Audit again", "Earlier scores for the same page and keyword stay in its history."],
    ],
    terms: [
      ["Keyword use, 25 pts", "The keyword in the title, H1, URL and opening.", "21/25"],
      ["Content depth, 30 pts", "Length, terms and sections compared with the top 10.", "24/30"],
      ["Technical, 20 pts", "Schema, speed, alt text, canonical tag and indexing.", "16/20"],
      ["AI answer-ready, 15 pts", "A direct answer early on, stats with a source, author and date.", "8/15"],
      ["Links, 10 pts", "Internal links pointing to the page and from it.", "6/10"],
      ["Top 10 average", "The average score of the top pages that could be read.", "79"],
    ],
    faq: [
      ["What does an audit cost?", "25 tasks. A failed audit hands them back."],
      ["What if the top pages can't be read?", "When fewer than 3 load, comparisons show Not checked and there is no top 10 average."],
      ["Where do the suggestions come from?", "One Claude call reads only your page. A title is kept only when it is 30 to 65 characters and uses the keyword."],
      ["Which pages should I audit first?", "Use Find my pages on the All pages tab. It lists the pages with the most Google visits and the keyword that brings the most (10 tasks)."],
    ],
    ask: ["Rewrite my title for this keyword", "What do the top pages have that I don't?"],
    cta: "Audit your first page",
  },
  backlinks: {
    title: "Backlinks", slug: "/backlinks", tone: "links",
    lead: "See every site that", payoff: "links to you",
    sub: "Linking sites, new and lost links by week, anchors, and the sites that link to your rivals but skip you.",
    whatTitle: "What the report shows", whatSub: "Three tabs: Overview, Links and Link gap.",
    parts: [
      ["Five numbers", "Linking sites and backlinks with the change since last week, new and lost sites, authority and spam."],
      ["New and lost links", "New linking sites above the line and lost ones below, for each of the last 12 weeks."],
      ["Anchors", "The text people use to link to you, with each anchor's share of linking sites."],
      ["Link gap", "Sites that link to up to 3 rivals and not to you, on its own tab. Sites AI answers cite come first."],
    ],
    facts: [["12", "weeks of new and lost links"], ["3", "rivals in one link gap"], ["7 days", "each answer stays saved"], ["100", "links per page, strongest first"]],
    steps: [
      ["Load your backlinks", "One click reads every site that links to you."],
      ["We read the link index", "Linking sites come from DataForSEO's backlink index and are saved for 7 days."],
      ["Check new and lost links", "See which sites started or stopped linking to you each week."],
      ["Find the link gap", "Pick up to 3 rivals, then send the sites to Link Building."],
    ],
    terms: [
      ["Authority", "A score from 0 to 100 for how strong a site's own links are. A link from a higher score carries more weight.", "41"],
      ["Linking site", "A website with at least one link to yours. Ten links from one site count as one linking site.", "412"],
      ["Backlink", "One link from one page to your site.", "3,960"],
      ["Follow and nofollow", "Follow links pass ranking value. Nofollow links ask Google to ignore them, but they still send visits.", "Follow"],
      ["Spam score", "How likely a linking site is spam, from 0 to 100. Over 60 is flagged.", "4%"],
      ["Anchor", "The clickable text of a link.", "this guide"],
    ],
    faq: [
      ["Where does the link data come from?", "From DataForSEO's backlink index. Each answer is saved for 7 days, so opening the report again uses no tasks."],
      ["What does it cost?", "An overview uses 20 tasks, each page of 100 links uses 6 and a link gap uses 25."],
      ["Can I check a rival's links?", "The Link gap tab compares you with up to 3 rivals at once and lists the sites that link to them and not to you."],
      ["Why don't I see a link I know about?", "New links can take a few weeks to reach the index. Links on pages that block crawlers may never show."],
      ["How are the weekly arrows worked out?", "Each fresh overview saves that day's numbers, and the arrows compare with the snapshot from a week or more ago."],
    ],
    ask: ["Who linked to me this month?", "Which rival links should I go after?"],
    cta: "Load your backlinks",
  },
  linkbuilding: {
    title: "Link Building", slug: "/link-building", tone: "links",
    lead: "Turn link prospects", payoff: "into won links",
    sub: "A board from prospect to won. Prospects come from the link gap, sites AI cites, dead rival pages and unlinked mentions.",
    whatTitle: "What the board does", whatSub: "Find sites, pitch them from your own email and track every link you win.",
    parts: [
      ["Five numbers", "Prospects, contacted, reply rate, links won and links gone."],
      ["Filter by source", "Link gap, sites AI cites, dead rival pages, unlinked mentions or sites you added."],
      ["One board for every site", "Prospects, Contacted, Replied, Won and Lost. Drag a card or press its arrow."],
      ["Won links checked weekly", "A link counts as gone only after 2 failed checks in a row."],
    ],
    facts: [["4", "ways to find prospects"], ["5", "stages from prospect to lost"], ["120", "words at most in a pitch"], ["2", "failed checks before a link is gone"]],
    steps: [
      ["Find prospects", "Pick a source. Each site is added once, and blocked sites are skipped."],
      ["Draft the pitch", "Each pitch fits why the site is on the board."],
      ["Send it from your own email", "Then mark it as sent and the card moves to Contacted."],
      ["Add the page when you win", "Arrowsterr checks the link every week and flags it if it goes."],
    ],
    terms: [
      ["Prospect", "A site you want a link from.", "3"],
      ["Reply rate", "Replied or won, out of everyone contacted.", "50%"],
      ["Sites AI cites", "Pages AI answers cited in the last 30 days when they named a rival and not you.", "14×"],
      ["Dead rival page", "A page on a rival's site that now answers with an error while other sites still link to it.", "404"],
      ["Unlinked mention", "A page that names your brand without linking to it.", "No link"],
      ["Do not contact", "Blocks an email, its domain or a whole site from every finder.", "Blocked"],
    ],
    faq: [
      ["Does Arrowsterr send the emails?", "You send them from your own email. Replies come to you, and your domain keeps its good name."],
      ["What does it cost?", "Sites AI cites and link gap adds use no tasks here. Dead rival pages and unlinked mentions use 20 tasks each. A pitch uses 3."],
      ["How is a won link checked?", "Each week Arrowsterr reloads the page and looks for a link to any page of your site. A followed link counts first."],
      ["Can a card move to Won without a page?", "No. Won needs the page where the link sits, so it can be checked."],
    ],
    ask: ["Find prospects from sites AI cites", "Draft a pitch for my best prospect"],
    cta: "Start your link board",
  },
  contentmap: {
    title: "Content Map", slug: "/content-map", tone: "content",
    lead: "See every topic you cover", payoff: "and every one you miss",
    sub: "Arrowsterr groups your rankings into topics around pillars and adds the topics your rivals win.",
    whatTitle: "What the map shows", whatSub: "Each bubble is a topic. Its colour says what to do next.",
    parts: [
      ["Five numbers", "Topics, covered, missing, pages competing and in progress."],
      ["Filters", "Show only the missing topics, the pages that compete, what AI names you for or the missing links."],
      ["The map", "Each bubble is a topic sized by searches, grouped under 3 to 8 pillars. Dashed means missing."],
      ["Topic and pillar panel", "Searches, your page, which rivals rank, and Add to Content Plan or Add internal links."],
    ],
    facts: [["60", "topics on one map"], ["3–8", "pillars, grouped for you"], ["2", "rivals compared"], ["40", "tasks per build, refunded on failure"]],
    steps: [
      ["Build the map", "Add competitors with websites to the brand first."],
      ["We read your rankings and 2 rivals'", "Up to 300 of your keywords and 200 for each rival."],
      ["Pick a topic", "See its searches, your page, which rivals rank and if AI names you."],
      ["Add it to your Content Plan", "Or add the missing internal links in your CMS."],
    ],
    terms: [
      ["Pillar", "A main theme with one main page that links to its topics.", "AI Search"],
      ["Covered", "You have a page in the top 20 for it.", "6"],
      ["Missing", "A rival ranks top 10 and you have no page in the top 20.", "9"],
      ["Competing", "Two of your pages share at least 60% of the words in their main keywords.", "2 pages"],
      ["In progress", "The topic is on your Content Plan as a brief or a draft.", "Draft"],
      ["Named by AI", "An AI answer in the last 30 days named you for a prompt on this topic.", "★"],
    ],
    faq: [
      ["What does a build cost?", "40 tasks. A failed build hands them back."],
      ["How are pillars picked?", "One Claude call groups the topics. If it leaves any topic out, topics are grouped by shared words instead."],
      ["How many topics does it show?", "The 60 biggest, half from what you have and half from what you lack."],
      ["Which rivals does it use?", "Up to 2 competitors with websites from the brand profile."],
    ],
    ask: ["Which missing topic should I write first?", "Fix my internal links"],
    cta: "Build your content map",
  },
  local: {
    title: "Local Research", slug: "/local-research", tone: "research",
    lead: "See where you rank", payoff: "on Google Maps, block by block",
    sub: "Arrowsterr checks the map from 49 points around the business and shows who holds the top 3 at each one.",
    whatTitle: "What the scan shows", whatSub: "Rankings across the area your customers search from.",
    parts: [
      ["Keywords and settings", "Up to 5 keywords, grid spacing, a weekly scan and Scan now."],
      ["A 7 by 7 rank grid", "49 points, each coloured by your rank there. Click one to see its map pack."],
      ["Listing check", "Name, phone and address on your site against Google, plus LocalBusiness schema and your category."],
      ["Local rivals", "The businesses that hold the top 3 most, with ratings and reviews."],
    ],
    facts: [["49", "points on the grid"], ["5", "keywords per business"], ["1 min", "for a Scan now"], ["0.5–2", "miles between points"]],
    steps: [
      ["Find the business", "Search by name and city, then pick the right listing."],
      ["Add up to 5 keywords", "Start with your main category, such as dentist."],
      ["Scan the grid", "Scan now takes about a minute. Weekly scans run on their own."],
      ["Fix what holds you back", "Match your phone and category, add schema, and ask for reviews."],
    ],
    terms: [
      ["Map pack", "The 3 businesses Google shows on the map for a search.", "Top 3"],
      ["Average rank", "Your average over all 49 points. A point where you're outside the top 20 counts as 21.", "7.9"],
      ["Top 3 share", "The share of points where you're in the map pack.", "12%"],
      ["Grid spacing", "The distance between points: 0.5, 1 or 2 miles.", "1 mi"],
      ["Listing check", "Compares your website with your Google listing.", "3 of 5"],
      ["Category", "Your main Google Business category. Rivals that win often use a better one.", "Dentist"],
    ],
    faq: [
      ["What does a scan cost?", "Scan now uses 12 tasks. A weekly scan uses 6. A scan where no point answers hands its tasks back."],
      ["Why do some points show a question mark?", "Google Maps didn't answer for that point. It is left out of every number."],
      ["How is my business matched?", "By Google's own ids, so a business with a similar name never counts as you."],
      ["Can I track local prompts in AI answers?", "Yes. Track in AI answers adds prompts like best dentist in Austin under a Local topic in AI Visibility."],
    ],
    ask: ["Why am I not in the top 3 downtown?", "Plan more reviews this month"],
    cta: "Scan your area on Google Maps",
  },
};

/** Where each stop sits on the route drawing (x, y in a 1000 by 300 box) and which side its label goes. */
export const ROUTE: [number, number, "up" | "down"][] = [[60, 230, "down"], [360, 80, "up"], [660, 220, "down"], [940, 70, "up"]];
export const ROUTE_PATH = "M60 230 C 200 230, 220 80, 360 80 S 520 220, 660 220 S 840 70, 940 70";

function rng(seed: number) {
  let s = seed;
  return () => (s = (s * 9301 + 49297) % 233280) / 233280;
}

/** The moving drawing on the right of each hero, as SVG markup in a 440 by 380 box. Static shapes only. */
export function instrument(tool: ToolKey): string {
  if (tool === "backlinks") {
    const r = rng(5);
    let g = `<g fill="none" stroke="rgba(255,255,255,.28)"><circle cx="220" cy="190" r="70"/><circle cx="220" cy="190" r="118"/><circle cx="220" cy="190" r="164" stroke-dasharray="3 6"/></g>`;
    const ring = (R: number, n: number, cls: string, seed: number) => {
      const q = rng(seed);
      let o = `<g class="${cls}">`;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + q(), x = 220 + Math.cos(a) * R, y = 190 + Math.sin(a) * R, s = 3 + q() * 5, kind = q();
        o += kind > 0.86 ? `<circle cx="${x}" cy="${y}" r="${s + 1}" fill="#8ff0c0" class="ts-pul"/>` : kind < 0.06 ? `<circle cx="${x}" cy="${y}" r="${s}" fill="none" stroke="#ffb4a8" stroke-width="1.5" stroke-dasharray="2 2"/>` : `<circle cx="${x}" cy="${y}" r="${s}" fill="rgba(255,255,255,${0.45 + q() * 0.5})"/>`;
      }
      return o + "</g>";
    };
    g += ring(70, 9, "ts-rotA", 11) + ring(118, 16, "ts-rotB", 23) + ring(164, 22, "ts-rotC", 37);
    for (let i = 0; i < 6; i++) {
      const a = r() * Math.PI * 2, R = [70, 118, 164][i % 3];
      g += `<line x1="220" y1="190" x2="${220 + Math.cos(a) * R}" y2="${190 + Math.sin(a) * R}" stroke="rgba(255,255,255,.18)"/>`;
    }
    return g + `<circle cx="220" cy="190" r="34" fill="#ffffff"/><circle cx="220" cy="190" r="42" fill="none" stroke="rgba(255,255,255,.4)"/><text x="220" y="194" text-anchor="middle" style="font:600 12px Inter,system-ui,sans-serif;fill:#0943b0">you</text>`;
  }
  if (tool === "siteaudit") {
    const L = [[220], [90, 175, 265, 350], [55, 100, 140, 185, 210, 250, 290, 330, 370, 400], [40, 70, 95, 120, 150, 175, 205, 235, 260, 285, 315, 345, 375, 405]];
    const Y = [56, 136, 218, 296];
    const col = (i: number, j: number) => { const v = (i * 7 + j * 13) % 11; return v === 3 ? "#ff8a80" : v === 7 || v === 9 ? "#ffd36b" : "#ffffff"; };
    let g = "";
    for (let i = 1; i < L.length; i++) L[i].forEach((x, j) => {
      const p = L[i - 1][Math.min(L[i - 1].length - 1, Math.floor((j * L[i - 1].length) / L[i].length))];
      g += `<path d="M${p} ${Y[i - 1]} C ${p} ${(Y[i - 1] + Y[i]) / 2}, ${x} ${(Y[i - 1] + Y[i]) / 2}, ${x} ${Y[i]}" fill="none" stroke="rgba(255,255,255,.25)"/>`;
    });
    L.forEach((row, i) => row.forEach((x, j) => {
      const c = i === 0 ? "#ffffff" : col(i, j);
      g += `<circle cx="${x}" cy="${Y[i]}" r="${[13, 8, 6, 4.5][i]}" fill="${c}"${c === "#ff8a80" ? ' class="ts-pul"' : ""}/>`;
    }));
    return g + `<defs><linearGradient id="ts-scan" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".25"/></linearGradient></defs><g class="ts-scanl"><rect x="20" y="10" width="400" height="20" fill="url(#ts-scan)"/><rect x="20" y="30" width="400" height="2" fill="#ffffff" opacity=".9"/></g>`;
  }
  if (tool === "onpage") {
    const sc = [88, 84, 81, 79, 77, 74, 64, 70, 66, 61];
    let g = "";
    sc.forEach((v, i) => {
      const y = 42 + i * 31, you = i === 6;
      g += `<text x="150" y="${y + 5}" text-anchor="end" class="ts-dim">#${i + 1}</text><rect x="160" y="${y - 9}" width="${v * 2.6}" height="18" rx="9" fill="${you ? "#ffffff" : "rgba(255,255,255,.22)"}"/>`;
      g += you ? `<text x="172" y="${y + 4}" style="font:600 10.5px Inter,system-ui,sans-serif;fill:#0943b0">your page, 64</text>` : `<text x="${160 + v * 2.6 - 8}" y="${y + 4}" text-anchor="end" class="ts-dim">${v}</text>`;
    });
    return g + `<rect x="158" y="${42 + 2 * 31 - 11}" width="${86 * 2.6 + 4}" height="22" rx="11" fill="none" stroke="#ffffff" stroke-dasharray="4 4" class="ts-pul"/><g class="ts-climb"><path d="M130 236 l0 -40 m-8 8 l8 -8 l8 8" stroke="#8ff0c0" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g><text x="104" y="240" text-anchor="middle" style="font:600 10.5px Inter,system-ui,sans-serif;fill:#8ff0c0">+22</text>`;
  }
  if (tool === "linkbuilding") {
    let g = "";
    ["Prospects", "Contacted", "Replied", "Won"].forEach((l, i) => {
      const x = 40 + i * 120;
      g += `<rect x="${x}" y="40" width="100" height="280" rx="14" fill="rgba(255,255,255,${i === 3 ? 0.16 : 0.08})"/><text x="${x + 12}" y="62" style="font:600 10.5px Inter,system-ui,sans-serif;fill:#fff">${l}</text>`;
    });
    for (let k = 0; k < 5; k++) g += `<g class="ts-flw" style="animation-delay:${-k * 1.4}s"><rect x="48" y="${82 + k * 46}" width="84" height="34" rx="8" fill="#ffffff"/><rect x="58" y="${92 + k * 46}" width="44" height="5" rx="2.5" fill="#c7d4ee"/><rect x="58" y="${103 + k * 46}" width="30" height="4" rx="2" fill="#0943b0" opacity=".5"/></g>`;
    return g + `<circle cx="400" cy="300" r="12" fill="#8ff0c0"/><path d="M394 300l4 4 8-9" stroke="#0b5a3c" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
  }
  if (tool === "contentmap") {
    const P: [number, number, string][] = [[130, 120, "AI Search"], [320, 110, "SEO"], [140, 280, "Content"], [320, 275, "Links"]];
    let g = "";
    P.forEach(([x, y, n], pi) => {
      const r = rng(pi * 9 + 3);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + pi, R = 52 + r() * 18, bx = x + Math.cos(a) * R, by = y + Math.sin(a) * R * 0.8, s = 5 + r() * 9, k = r(), miss = k < 0.3, ov = k > 0.9;
        g += `<line x1="${x}" y1="${y}" x2="${bx}" y2="${by}" stroke="rgba(255,255,255,.22)"${miss ? ' stroke-dasharray="3 4"' : ""}/><circle class="ts-bob" style="animation-delay:${-i * 0.7}s" cx="${bx}" cy="${by}" r="${s}" fill="${miss ? "none" : ov ? "#ffd36b" : "rgba(255,255,255,.85)"}" stroke="${miss ? "#ffb4a8" : "none"}" stroke-width="1.6"${miss ? ' stroke-dasharray="3 3"' : ""}/>`;
      }
      g += `<circle cx="${x}" cy="${y}" r="20" fill="#ffffff"/><text x="${x}" y="${y + 36}" text-anchor="middle" style="font:600 10.5px Inter,system-ui,sans-serif;fill:#fff">${n}</text>`;
    });
    return g;
  }
  let g = `<defs><linearGradient id="ts-sw" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".35"/></linearGradient></defs><g fill="none" stroke="rgba(255,255,255,.2)"><circle cx="220" cy="190" r="60"/><circle cx="220" cy="190" r="115"/><circle cx="220" cy="190" r="165"/></g>`;
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
    const d = Math.hypot(x - 3.3, y - 2.7), v = Math.round(1 + d * 2.4 + ((x * 5 + y * 3) % 4)), c = v <= 3 ? "#8ff0c0" : v <= 10 ? "#ffd36b" : "#ffb4a8";
    g += `<circle cx="${100 + x * 40}" cy="${70 + y * 40}" r="11" fill="${c}" opacity=".95"/><text x="${100 + x * 40}" y="${74 + y * 40}" text-anchor="middle" style="font:600 9.5px Inter,system-ui,sans-serif;fill:#1f2937">${v > 20 ? "20+" : v}</text>`;
  }
  return g + `<path class="ts-sweep" d="M220 190 L220 20 A170 170 0 0 1 367 105 Z" fill="url(#ts-sw)"/><path d="M220 196c-6-7-9-11-9-15a9 9 0 0 1 18 0c0 4-3 8-9 15z" fill="#0943b0" stroke="#fff" stroke-width="1.5"/>`;
}
