# Tool start pages

Site Audit, On-page Audit, Backlinks, Link Building, Content Map and Local Research open on a start page until a brand has its first result. The start page explains the tool once, and the working screens stay free of help text.

## What it shows

- **Hero:** the painted sky with a tab row for the six tools, a two-tone headline, one line on what the tool does and the real action. Brand tools show the brand's domain and one button (Start audit, Load backlinks, Sites AI cites, Build the map). On-page Audit takes a page and a keyword. Local Research takes a business name and city, then lists the matches to pick from.
- **The drawing:** an animated SVG for each tool (linking sites orbiting the brand, a crawl tree, the top 10 ladder, cards crossing the board, topic clusters, the map grid with a radar sweep) with the tool's four key numbers pinned around it.
- **Inside the report:** the tool's real screen on example data (`src/lib/demo.ts`), scaled into a frame. Four numbered pins sit on the parts the page marks with `data-tour="1"` to `"4"` (or `Card tour={n}`). Pointing at a pin or a note spotlights that part. "Open the example report" shows the full screen on example data, with a button back to the start page.
- **The route:** the four steps on a winding dotted line (a plain list on phones).
- **What the numbers mean:** six terms set as a dictionary, each with an example value.
- **Questions:** a chat with Zippie. Tapping a question shows its answer. The Ask box opens Ask Zippie with the question sent (`askZippie`, the `arrowsterr:ask` event that App listens for).
- **Closing card:** a dark card half on the page and half on a night band, with the tool's action again.

Every fact on these pages comes from the tool's own doc. Content lives in `src/lib/toolStart.ts`; the page is `src/components/ToolStart.tsx`; styles are `src/app/tool-start.css`, scoped to `.ts-root`, with a dark theme on `[data-theme="dark"]`. Motion stops for people who ask for reduced motion.

Viewers see the same page without the action buttons.

## Running cost

The start pages run in the browser and call nothing until someone presses the tool's own button, which costs what it already did. Beta (50 teams): $0. Growth (500 teams): $0.
