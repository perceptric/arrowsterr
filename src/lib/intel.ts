// Content Intelligence tags: how a page is doing, with their help text and colors, for the report.

/** How a page is doing, from best to worst. */
export type Tag = "Top performer" | "Striking distance" | "Steady" | "Underperforming" | "No traction";
export const TAG_HELP: Record<Tag, string> = {
  "Top performer": "Among your top fifth for visits, with a keyword in Google's top 3.",
  "Striking distance": "Its best keyword sits at #4 to #20 with real search volume. A content update can push it up.",
  Steady: "Gets visits and holds its spots. Keep it fresh.",
  Underperforming: "Ranks for keywords, but none in the top 10.",
  "No traction": "No visits and no keywords on Google.",
};
// One hue, darker for better pages, since the tags run in order.
export const TAG_COLOR: Record<Tag, string> = {
  "Top performer": "#0943B0",
  "Striking distance": "#3B6AD0",
  Steady: "#7E9BDD",
  Underperforming: "#B9C8EC",
  "No traction": "#DDE4F5",
};
