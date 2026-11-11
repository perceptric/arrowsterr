"use client";

import {
  SampleBubbles,
  SampleChange,
  SampleChecks,
  SampleChips,
  SampleGrid,
  SampleLine,
  SampleRows,
  SampleStats,
  SampleTags,
  ToolIntro,
} from "./ToolIntro";

// What each SEO tool shows, under its search bar until it has a first result, the same as Keyword Research.
// Every fact comes from the tool's own doc (docs/content-map.md and docs/local-research.md). Every card has a picture.

export function ContentMapIntro() {
  return (
    <ToolIntro
      title="See every topic you cover and every one you miss"
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
      title="See where you rank on Google Maps, block by block"
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
