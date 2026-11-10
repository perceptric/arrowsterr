"use client";

import {
  SampleBars,
  SampleBubbles,
  SampleChange,
  SampleChecks,
  SampleChips,
  SampleGrid,
  SampleLine,
  SampleRing,
  SampleRows,
  SampleSerp,
  SampleStats,
  SampleTags,
  ToolIntro,
} from "./ToolIntro";

// What each SEO tool shows, under its search bar until it has a first result, the same as Keyword Research.
// Every fact comes from the tool's own doc (docs/site-audit.md and the others). Every card has a picture.

export function SiteAuditIntro() {
  return (
    <ToolIntro
      lead="Arrowsterr reads every page up to your plan's limit the way Google and AI crawlers read them, scores the site from 0 to 100 and lists every issue with the pages it hits, so you fix the biggest problems first."
      features={[
        { title: "Health score", text: "A score from 0 to 100 and the change since the last full crawl.", visual: <SampleRing value={82} label="Good" higherIsBetter /> },
        { title: "Facts from the crawl", text: "Pages read, broken links and AI crawlers your robots.txt blocks.", visual: <SampleStats items={[["Pages", "200"], ["Broken", "7"], ["Blocked", "1"]]} /> },
        {
          title: "Issues by priority",
          text: "High, medium and low, each with the share of pages it hits and how it changed since the last crawl.",
          visual: <SampleChips items={[["High", "#E5484D"], ["Medium", "#FEF3C7"], ["Low", "#DCFCE7"]]} />,
        },
        { title: "Score history", text: "The scores of the last 8 full crawls. A drop of 5 points or more sends you an email.", visual: <SampleLine values={[61, 64, 63, 68, 71, 74, 79, 82]} total="82" delta="+5" /> },
        {
          title: "Pages each issue hits",
          text: "Open an issue to see why it matters and every page it hits.",
          visual: <SampleRows rows={[["Missing meta description", 42, "42"], ["Images without alt text", 18, "18"], ["Broken internal link", 7, "7"]]} />,
        },
        {
          title: "Fixes in your CMS",
          text: "Titles, meta descriptions, alt text and structured data go to your connected site as a change you approve or undo.",
          visual: <SampleChange before="Home" after="AI search visibility for B2B brands" />,
        },
      ]}
    />
  );
}

export function OnpageIntro() {
  return (
    <ToolIntro
      lead="Enter a page and the keyword it should rank for. Arrowsterr reads the page and the top 10 results, scores them all with the same rules, and shows what to fix to close the gap."
      features={[
        { title: "Score against the top 10", text: "A score from 0 to 100 next to the top 10 average, split into 5 areas.", visual: <SampleRing value={64} label="Top 10: 79" higherIsBetter /> },
        {
          title: "Five areas",
          text: "Keyword use, content, technical, AI answer-ready and links, 100 points in all.",
          visual: <SampleRows rows={[["Keyword use", 21, "21/25"], ["Technical", 16, "16/20"], ["AI answer-ready", 8, "8/15"]]} />,
        },
        {
          title: "Google preview",
          text: "Your title and description now and a suggested version, with their lengths.",
          visual: <SampleSerp url="yoursite.com/guide" title="The complete guide to AI search" text="How AI answers pick the brands they name, and what to change on your pages." tag="52 chars" />,
        },
        { title: "Fixes with points", text: "Each fix shows the points it adds. A connected CMS can apply it for you.", visual: <SampleStats items={[["Title", "+6"], ["FAQ", "+4"], ["Alt text", "+2"]]} /> },
        { title: "Terms to add", text: "Phrases most top pages share, with how often your page uses each one.", visual: <SampleTags items={[["ai overview", "0"], ["llm", "2"], ["citations", "1"], ["schema", "0"], ["chatgpt", "3"]]} /> },
        {
          title: "AI answer-ready",
          text: "A direct answer early on, stats with a source, an author and a date.",
          visual: <SampleChecks items={[["Direct answer in the first 100 words", true], ["Stats with a source", false], ["Author and date", true]]} />,
        },
      ]}
    />
  );
}

export function BacklinksIntro() {
  return (
    <ToolIntro
      lead="Linking sites, new and lost links by week, the anchors people use, and the sites that link to your competitors but skip you. Links are the strongest signal Google has for trust, and AI answers lean on the same sites."
      features={[
        { title: "Five numbers", text: "Linking sites and backlinks with the change since last week, new and lost sites, authority and spam.", visual: <SampleStats items={[["Sites", "412"], ["Links", "3,960"], ["Authority", "41"]]} /> },
        { title: "New and lost links", text: "New and lost linking sites for each of the last 12 weeks.", visual: <SampleBars values={[380, 384, 386, 390, 389, 395, 398, 401, 404, 406, 409, 412]} total="412" delta="+8" /> },
        {
          title: "Anchors",
          text: "The text people use to link to you, with each anchor's share of linking sites.",
          visual: <SampleRows rows={[["your brand", 34, "34%"], ["this guide", 12, "12%"], ["click here", 6, "6%"]]} />,
        },
        {
          title: "Most linked pages",
          text: "The pages on your site that other sites link to most.",
          visual: <SampleRows rows={[["/blog/ai-search", 96, "96"], ["/pricing", 41, "41"], ["/", 38, "38"]]} />,
        },
        {
          title: "Every linking site",
          text: "All, new, lost, follow, nofollow and spam, with each site's authority.",
          visual: <SampleChips items={[["Follow", "#DCFCE7"], ["Nofollow", "#DBEAFE"], ["Spam", "#E5484D"]]} />,
        },
        {
          title: "Link gap",
          text: "Sites that link to up to 3 competitors and not to you. Sites AI answers cite come first.",
          visual: <SampleRows rows={[["searchengineland.com", 92, "92"], ["g2.com", 88, "88"], ["zapier.com", 81, "81"]]} />,
        },
      ]}
    />
  );
}

export function ContentMapIntro() {
  return (
    <ToolIntro
      lead="Arrowsterr groups your rankings into topics around pillars and adds the topics your competitors win. You see where you're strong, where you're missing, and which of your pages compete with each other."
      features={[
        { title: "Five numbers", text: "Topics, covered, missing, pages competing and in progress.", visual: <SampleStats items={[["Topics", "60"], ["Covered", "31"], ["Missing", "18"]]} /> },
        {
          title: "Topic status",
          text: "Covered, in progress, competing or missing, with a star where AI names you.",
          visual: <SampleChips items={[["Covered", "#DCFCE7"], ["Missing", "#E5484D"], ["In progress", "#DBEAFE"]]} />,
        },
        { title: "The map", text: "Each bubble is a topic sized by searches, grouped under 3 to 8 pillars. Dashed means missing.", visual: <SampleBubbles /> },
        {
          title: "Biggest gaps",
          text: "Topics a competitor ranks top 10 for while you have no page in the top 20, by searches.",
          visual: <SampleRows rows={[["ai search tools", 5400, "5.4K"], ["llm seo", 2900, "2.9K"], ["geo vs seo", 1300, "1.3K"]]} />,
        },
        { title: "Pillars", text: "Your main themes, each with the topics under it and how many are missing.", visual: <SampleTags items={[["AI search", "14"], ["Technical SEO", "11"], ["Content", "9"], ["Links", "6"]]} /> },
        { title: "Internal links", text: "Missing links from each pillar's main page go to your connected site as a change you approve.", visual: <SampleChange before="No link to /llm-seo" after="Link added from /ai-search" /> },
      ]}
    />
  );
}

export function LocalIntro() {
  return (
    <ToolIntro
      lead="Arrowsterr checks the map from 49 points around the business and shows who holds the top 3 at each one, how your reviews compare with competitors, and whether your website agrees with your Google listing."
      features={[
        { title: "A 7 by 7 rank grid", text: "49 points, each coloured by your rank there. Click one to see its map pack.", visual: <SampleGrid /> },
        { title: "Your numbers", text: "Points in the top 3, points in the top 10 and your average rank, for each keyword.", visual: <SampleStats items={[["Top 3", "21"], ["4 to 10", "19"], ["Average", "4.2"]]} /> },
        {
          title: "Local competitors",
          text: "The businesses that hold the top 3 most, with ratings and reviews.",
          visual: <SampleRows rows={[["Smile Studio", 31, "31"], ["City Dental", 24, "24"], ["Bright Care", 12, "12"]]} />,
        },
        { title: "Reviews over time", text: "Your review count against your competitors', scan by scan.", visual: <SampleLine values={[120, 124, 129, 131, 138, 142, 149, 155]} total="155" delta="+35" /> },
        {
          title: "Listing check",
          text: "Name, phone and address on your site against Google, plus LocalBusiness schema and your category.",
          visual: <SampleChecks items={[["Name matches", true], ["Phone matches", false], ["LocalBusiness schema", true]]} />,
        },
        { title: "Keywords and settings", text: "Up to 5 keywords, grid spacing and a weekly scan.", visual: <SampleTags items={[["dentist"], ["emergency dentist"], ["teeth whitening"], ["1 mi"], ["Weekly"]]} /> },
      ]}
    />
  );
}

export function IndexingIntro() {
  return (
    <ToolIntro
      lead="Connect Google Search Console and Arrowsterr inspects your pages every day, tracks clicks by page and template, and ties each indexing problem to the pages and clicks it costs you."
      features={[
        { title: "Index status for every page", text: "Up to 1,500 pages inspected a day, pages with clicks first, so a 5,000-page site is fully checked in about 4 days.", visual: <SampleStats items={[["Indexed", "1,318"], ["Not indexed", "322"], ["Inspected", "1,640"]]} /> },
        { title: "Why pages aren't indexed", text: "Crawled or found but not indexed, noindex, duplicates, Google picking another canonical, soft 404s.", visual: <SampleRows rows={[["Crawled, not indexed", 100, "118"], ["noindex", 70, "82"], ["Discovered, not indexed", 54, "64"]]} /> },
        { title: "Clicks over 16 months", text: "Your site's clicks and impressions by day, from Search Console.", visual: <SampleLine values={[410, 430, 470, 455, 520, 560, 610, 640]} total="640" delta="+5%" /> },
        { title: "Pages losing clicks", text: "The last 28 days against the 28 before, page by page.", visual: <SampleRows rows={[["/products/tracker", 82, "−840"], ["/features/ai", 40, "−220"], ["/blog/2024-guide", 20, "−140"]]} /> },
        { title: "Sitemaps", text: "Each sitemap's submitted and indexed pages, and the errors Google found.", visual: <SampleChecks items={[["sitemap_index.xml", true], ["product-sitemap.xml", false], ["post-sitemap.xml", true]]} /> },
        { title: "Better Site Audit priorities", text: "Site Audit ranks issues by the search clicks on the pages they hit.", visual: <SampleChips items={[["Not indexed", "#E5484D"], ["Other canonical", "#FEF3C7"], ["Rich result errors", "#FEF3C7"]]} /> },
      ]}
    />
  );
}

export function SpeedIntro() {
  return (
    <ToolIntro
      lead="Core Web Vitals from the Chrome UX Report: how real Chrome users on phones and computers experience your site and your most visited pages, with 6 months of history and lab tests that name the fixes."
      features={[
        { title: "Pass or fail", text: "Largest Contentful Paint, Interaction to Next Paint and Cumulative Layout Shift at the 75th percentile, Google's measure.", visual: <SampleStats items={[["LCP", "3.1 s"], ["INP", "180 ms"], ["CLS", "0.04"]]} /> },
        { title: "6 months of history", text: "Each metric week by week, with the line for good.", visual: <SampleLine values={[2.6, 2.7, 2.9, 3.0, 2.9, 3.1, 3.2, 3.1]} total="3.1 s" delta="+0.5" /> },
        { title: "By template", text: "Which kinds of pages are slow: blog posts, products, docs.", visual: <SampleRows rows={[["Blog post", 48, "48% good"], ["Docs", 71, "71% good"], ["Product", 82, "82% good"]]} /> },
        { title: "Slowest pages", text: "Your most visited pages with their real-visitor numbers.", visual: <SampleRows rows={[["/blog/geo-guide", 92, "4.6 s"], ["/blog/ai-search", 82, "4.1 s"], ["/docs/api", 68, "3.4 s"]]} /> },
        { title: "Lab tests with fixes", text: "Run PageSpeed Insights on any page of your site and see the biggest savings.", visual: <SampleChecks items={[["Hero image 1.8 MB", false], ["Render-blocking CSS", false], ["Text compression", true]]} /> },
        { title: "In Site Audit", text: "A site that fails Core Web Vitals, and slow pages, show up as issues there.", visual: <SampleChips items={[["Fails on phones", "#E5484D"], ["Slow LCP", "#FEF3C7"]]} /> },
      ]}
    />
  );
}

export function StructureIntro() {
  return (
    <ToolIntro
      lead="From the latest Site Audit: how many clicks each page sits from the home page, which pages need more internal links, and which pages should link to them."
      features={[
        { title: "Clicks from the home page", text: "How many clicks each page sits from the home page, with the ones that earn search clicks marked.", visual: <SampleRows rows={[["1 click", 30, "48"], ["2 clicks", 100, "640"], ["4+ clicks", 34, "212"]]} /> },
        { title: "Pages that need links", text: "Pages with search clicks that sit deep or have few links in.", visual: <SampleChecks items={[["/blog/geo-guide, 5 clicks deep", false], ["/docs/api, 1 link in", false], ["/pricing", true]]} /> },
        { title: "Link suggestions", text: "Pages on the same topic that should link there, with the anchor text to use.", visual: <SampleChips items={[["geo", "#E0E7FF"], ["search", "#E0E7FF"], ["guide", "#E0E7FF"]]} /> },
        { title: "Orphans and redirects", text: "Pages in your sitemaps with no links, redirect chains and links that point to redirects.", visual: <SampleChips items={[["14 orphans", "#E5484D"], ["6 chains", "#FEF3C7"]]} /> },
      ]}
    />
  );
}

export function AiAccessIntro() {
  return (
    <ToolIntro
      lead="From the latest Site Audit: which AI crawlers your robots.txt and firewall let in, how much of each page needs JavaScript (AI crawlers don't run it), your pages AI cites, and how the competitor pages AI cites are built."
      features={[
        { title: "Every AI crawler", text: "GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot and more, against robots.txt, your firewall and robots meta tags.", visual: <SampleChecks items={[["OAI-SearchBot allowed", true], ["PerplexityBot challenge page", false], ["Bingbot allowed", true]]} /> },
        { title: "Firewall check", text: "Each bot fetches your pages twice, a minute apart, next to a normal browser, so one hiccup never reads as a block.", visual: <SampleChips items={[["Likely blocked", "#E5484D"], ["Allowed", "#D1FAE5"]]} /> },
        { title: "JavaScript dependence", text: "Raw HTML next to the rendered page for each template, with phone screenshots.", visual: <SampleRows rows={[["Blog", 92, "92%"], ["Product", 41, "41%"], ["Docs", 18, "18%"]]} /> },
        { title: "Pages AI cites", text: "Your pages AI answers link to, and any that broke.", visual: <SampleRows rows={[["/pricing", 64, "12%"], ["/blog/geo-guide", 40, "8%"], ["/docs/api", 22, "4%"]]} /> },
        { title: "What they do that you don't", text: "How the competitor pages AI cites are built: text in the HTML, answers up top, FAQ markup.", visual: <SampleStats items={[["FAQ markup", "75%"], ["Yours", "10%"]]} /> },
        { title: "llms.txt and IndexNow", text: "Make llms.txt from your best pages and turn on IndexNow in WordPress.", visual: <SampleChips items={[["llms.txt", "#E0E7FF"], ["IndexNow on", "#D1FAE5"]]} /> },
      ]}
    />
  );
}
