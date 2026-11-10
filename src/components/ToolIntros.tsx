"use client";

import { SampleBars, SampleChips, SampleLine, SampleRing, SampleRows, SampleStats, ToolIntro } from "./ToolIntro";

// What each SEO tool shows, under its search bar until it has a first result, the same as Keyword Research.
// Every fact comes from the tool's own doc (docs/site-audit.md and the others).

export function SiteAuditIntro() {
  return (
    <ToolIntro
      title="Find what's holding your site back"
      lead="Arrowsterr reads up to 200 pages the way Google and AI crawlers read them, scores the site from 0 to 100 and lists every issue with the pages it hits, so you fix the biggest problems first."
      features={[
        { title: "Health score", text: "A score from 0 to 100, the change since the last full crawl and the scores of the last 8 crawls.", visual: <SampleRing value={82} label="Good" /> },
        { title: "Facts from the crawl", text: "Pages read, broken links and AI crawlers your robots.txt blocks.", visual: <SampleStats items={[["Pages", "200"], ["Broken", "7"], ["Blocked", "1"]]} /> },
        {
          title: "Issues by priority",
          text: "High, medium and low, each with the share of pages it hits and how it changed since the last crawl.",
          visual: <SampleChips items={[["High", "#FEF3C7"], ["Medium", "#DBEAFE"], ["Low", "#DCFCE7"]]} />,
        },
        { title: "Score history", text: "The scores of the last 8 full crawls. A drop of 5 points or more sends you an email.", visual: <SampleLine values={[61, 64, 63, 68, 71, 74, 79, 82]} total="82" delta="+5" /> },
        {
          title: "Pages each issue hits",
          text: "Open an issue to see why it matters and every page it hits.",
          visual: <SampleRows rows={[["Missing meta description", 42, "42"], ["Images without alt text", 18, "18"], ["Broken internal link", 7, "7"]]} />,
        },
        { title: "Fixes in your CMS", text: "Titles, meta descriptions, alt text and structured data go to your connected site as a change you approve or undo." },
      ]}
    />
  );
}

export function OnpageIntro() {
  return (
    <ToolIntro
      title="Score any page against Google's top 10"
      lead="Enter a page and the keyword it should rank for. Arrowsterr reads the page and the top 10 results, scores them all with the same rules, and shows what to fix to close the gap."
      features={[
        { title: "Score against the top 10", text: "A score from 0 to 100 next to the top 10 average, split into 5 areas.", visual: <SampleRing value={64} label="Top 10: 79" /> },
        {
          title: "Five areas",
          text: "Keyword use, content, technical, AI answer-ready and links, 100 points in all.",
          visual: <SampleRows rows={[["Keyword use", 21, "21/25"], ["Technical", 16, "16/20"], ["AI answer-ready", 8, "8/15"]]} />,
        },
        { title: "Google preview", text: "Your title and description now and a suggested version, with their lengths." },
        { title: "Fixes with points", text: "Each fix shows the points it adds. A connected CMS can apply it for you.", visual: <SampleStats items={[["Title", "+6"], ["FAQ", "+4"], ["Alt text", "+2"]]} /> },
        { title: "Terms to add", text: "Phrases most top pages share, with how often your page uses each one." },
        { title: "All pages", text: "Your pages with the keyword each one ranks for, ready to audit in one click." },
      ]}
    />
  );
}

export function BacklinksIntro() {
  return (
    <ToolIntro
      title="See every site that links to you"
      lead="Linking sites, new and lost links by week, the anchors people use, and the sites that link to your rivals but skip you. Links are the strongest signal Google has for trust, and AI answers lean on the same sites."
      features={[
        { title: "Five numbers", text: "Linking sites and backlinks with the change since last week, new and lost sites, authority and spam.", visual: <SampleStats items={[["Sites", "412"], ["Links", "3,960"], ["Authority", "41"]]} /> },
        { title: "New and lost links", text: "New and lost linking sites for each of the last 12 weeks.", visual: <SampleBars values={[380, 384, 386, 390, 389, 395, 398, 401, 404, 406, 409, 412]} total="412" delta="+8" /> },
        {
          title: "Anchors",
          text: "The text people use to link to you, with each anchor's share of linking sites.",
          visual: <SampleRows rows={[["your brand", 34, "34%"], ["this guide", 12, "12%"], ["click here", 6, "6%"]]} />,
        },
        { title: "Most linked pages", text: "The pages on your site that other sites link to most." },
        { title: "Every linking site", text: "All, new, lost, follow, nofollow and spam, with each site's authority." },
        { title: "Link gap", text: "Sites that link to up to 3 rivals and not to you. Sites AI answers cite come first, and each one goes to Link Building in a click." },
      ]}
    />
  );
}

export function LinkBuildingIntro() {
  return (
    <ToolIntro
      title="Turn link prospects into won links"
      lead="A board from prospect to won. Prospects come from the link gap, sites AI cites, dead rival pages and unlinked mentions. Pitches are drafted here and sent from your own email."
      features={[
        { title: "Five numbers", text: "Prospects, contacted, reply rate, links won and links gone.", visual: <SampleStats items={[["Prospects", "24"], ["Replies", "50%"], ["Won", "6"]]} /> },
        {
          title: "Find prospects",
          text: "Link gap, sites AI cites, dead rival pages, unlinked mentions or sites you add. Each site is added once.",
          visual: <SampleChips items={[["Sites AI cites", "#FEF3C7"], ["Dead rival pages", "#DBEAFE"], ["Unlinked mentions", "#DCFCE7"]]} />,
        },
        { title: "One board for every site", text: "Prospects, Contacted, Replied, Won and Lost. Drag a card or press its arrow." },
        { title: "Pitches", text: "Each pitch fits why the site is on the board. Send it from your own email, then mark it as sent." },
        { title: "Won links checked weekly", text: "A link counts as gone only after 2 failed checks in a row." },
        { title: "Do not contact", text: "Block an email, its domain or a whole site from every finder." },
      ]}
    />
  );
}

export function ContentMapIntro() {
  return (
    <ToolIntro
      title="See every topic you cover and every one you miss"
      lead="Arrowsterr groups your rankings into topics around pillars and adds the topics your rivals win. You see where you're strong, where you're missing, and which of your pages compete with each other."
      features={[
        { title: "Five numbers", text: "Topics, covered, missing, pages competing and in progress.", visual: <SampleStats items={[["Topics", "60"], ["Covered", "31"], ["Missing", "18"]]} /> },
        {
          title: "Topic status",
          text: "Covered, in progress, competing or missing, with a star where AI names you.",
          visual: <SampleChips items={[["Covered", "#DCFCE7"], ["Missing", "#FEF3C7"], ["In progress", "#DBEAFE"]]} />,
        },
        { title: "The map", text: "Each bubble is a topic sized by searches, grouped under 3 to 8 pillars. Dashed means missing." },
        {
          title: "Biggest gaps",
          text: "Topics a rival ranks top 10 for while you have no page in the top 20, by searches.",
          visual: <SampleRows rows={[["ai search tools", 5400, "5.4K"], ["llm seo", 2900, "2.9K"], ["geo vs seo", 1300, "1.3K"]]} />,
        },
        { title: "Topic and pillar panel", text: "Searches, your page, which rivals rank, and Add to Content Plan or Add internal links." },
        { title: "Internal links", text: "Missing links from each pillar's main page go to your connected site as a change you approve." },
      ]}
    />
  );
}

export function LocalIntro() {
  return (
    <ToolIntro
      title="See where you rank on Google Maps, block by block"
      lead="Arrowsterr checks the map from 49 points around the business and shows who holds the top 3 at each one, how your reviews compare with rivals, and whether your website agrees with your Google listing."
      features={[
        { title: "A 7 by 7 rank grid", text: "49 points, each coloured by your rank there. Click one to see its map pack.", visual: <SampleStats items={[["Top 3", "21"], ["4 to 10", "19"], ["Average", "4.2"]]} /> },
        { title: "Keywords and settings", text: "Up to 5 keywords, grid spacing, a weekly scan and Scan now." },
        {
          title: "Local rivals",
          text: "The businesses that hold the top 3 most, with ratings and reviews.",
          visual: <SampleRows rows={[["Rival dental", 31, "31"], ["City smiles", 24, "24"], ["Bright care", 12, "12"]]} />,
        },
        { title: "Reviews over time", text: "Your review count against your rivals', scan by scan.", visual: <SampleLine values={[120, 124, 129, 131, 138, 142, 149, 155]} total="155" delta="+35" /> },
        { title: "Listing check", text: "Name, phone and address on your site against Google, plus LocalBusiness schema and your category." },
        { title: "Local prompts", text: "Track the questions people ask AI about businesses like yours, under the topic Local in AI Visibility." },
      ]}
    />
  );
}
