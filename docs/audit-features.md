# Audit: the features

Every feature of the two Audit parts, what it does for the person, and when it's done. The how (crawler, data, jobs, cost) is in `docs/audit-plan.md`. Section numbers like "plan 6.2" point there.

Written November 2026.

**Releases:**

- **v1:** ships first. Each part is useful on its own with only these.
- **v2:** the next round, right after v1 is in use.
- **Later:** worth doing once v2 has shipped and we see how people use it.

**Scope:**

- Audit is Internal Links and Content Decay. Technical SEO stays out of the app: no technical checks, no health score, no rendering, no speed data.
- The Live Writer is built in its own track. Audit only sends it a refresh request (D9) and shows the result. Nothing in Audit waits on its screens.

---

## 1. Shared features

These sit under both parts.

| Id | Feature | Release |
|---|---|---|
| A1 | Audit home and sidebar group | v1 |
| A2 | Overview with Fix first | v1 |
| A3 | Page value | v1 |
| A4 | Connections panel | v1 |
| A5 | Crawl settings | v1 |
| A6 | Crawl now, weekly crawl and live progress | v1 |
| A7 | Pages sheet | v1 |
| A8 | Page panel | v1 |
| A9 | Change sets: approve, apply, undo | v1 |
| A10 | Roles | v1 |
| A11 | Alerts and digest | v2 |
| A12 | Writers for Webflow, Shopify and HubSpot | v2 |
| A13 | Audit in the PDF report | v2 |
| A14 | Zippie and MCP tools | v2 |
| A15 | Share a read-only audit link | Later |

### A1. Audit home and sidebar group

- A new **Audit** group in the sidebar: Overview, Internal links, Content decay, Pages.
- Old addresses forward: `/site-structure` and `/content-map` to Internal links; `/publish/refresh` to Content decay.
- Opens with the Organic Research toolset, like Research.
- Before the first crawl, each tab shows its title, the search bar with the brand's domain filled in, and what the tool shows (`ToolIntros.tsx`), the same as Keyword Research.
- **Done when:** every Audit address loads for a brand with the toolset, and a brand without it gets the upgrade screen.

### A2. Overview with Fix first

- Two scores, Link health and Content freshness, each with its change since the last full crawl and a line of the last 8.
- **Fix first:** the top 10 findings across both parts, ordered by page value times need. Each row: one line on what's wrong, the clicks at stake, and its button.
- **Since the last crawl:** new orphans, pages that got links, pages added and gone, pages that started or stopped decaying.
- The three-sentence summary (plan 4.5).
- **Done when:** on a test brand, the first row of Fix first is the finding with the most clicks at stake, and every row's button opens the right fix.

### A3. Page value

- Every page gets a value from clicks, impressions, AI citations, conversions and link score (plan 4.2).
- Shown as a small bar on every page row, with the numbers behind it on hover.
- Every list in Audit sorts by it unless the person picks another column.
- Missing data drops out and the other parts take its share. The hover says which data was used.
- **Done when:** `pageValue` is tested with and without Search Console and GA4, and a page with 0 clicks and 0 citations never outranks one with clicks.

### A4. Connections panel

- Search Console, GA4 and the CMS, each with its state (Connected, Needs sign-in again, Not connected) and Connect.
- Says what each one unlocks: "Search Console turns on Content decay."
- A connection that breaks shows on every Audit screen as one line with Reconnect.
- **Done when:** disconnecting Search Console in Google shows Reconnect within one sync, and nothing on the screen shows stale numbers as current.

### A5. Crawl settings

- Start URL, and whether to include subdomains.
- Include and exclude patterns (`/blog/*`, `!/tag/*`).
- Speed: Gentle (1 a second), Normal (2), Fast (5, only for sites the brand owns: CMS or Search Console connected).
- Page limit, up to the plan's limit.
- robots.txt is always respected for our bot.
- Saved per brand in `brands.audit_settings`.
- **Done when:** each setting changes what the test-site crawl reads, and an exclude pattern keeps those pages out of every list.

### A6. Crawl now, weekly crawl and live progress

- **Crawl now** on every tab. A second click while one runs opens the one running.
- **Weekly crawl:** on by default after the first crawl, spread across the day. An editor can turn it off.
- **Live progress** while a crawl runs: pages found, pages read, the URL it's on, and a time left once 10% is done. Polls every 3 seconds.
- A partial crawl says why (plan 10.1). A crawl the firewall blocked says so with the allow-list steps.
- **Done when:** progress moves on a 2,000-page crawl, a worker restart mid-crawl resumes with no page read twice, and a blocked crawl shows the firewall message.

### A7. Pages sheet

- Every crawled URL in the sheet component (`Sheet.tsx`), at `/audit/pages`.
- Columns: URL, status, title, words, depth, links in, links out, link score, clicks, impressions, position, AI citations, value, decay state, findings.
- Filters on any column, plus quick views: Orphans, Deep pages, Starved, Decaying, Written by Arrowsterr.
- Saved views per person.
- Handles 50,000 rows by reading pages of 200 from `audit_pages` with the filter in the query.
- **Done when:** a 50,000-row test crawl scrolls and filters in under a second a page.

### A8. Page panel

One panel for any URL, opened from any list in either part.

| Tab | Shows |
|---|---|
| Overview | Status, final URL, page value, depth, link score, last modified, decay state |
| Links | Links in and out with anchor and place (body, nav, footer), open suggestions to and from it |
| Search | Clicks, impressions, position and CTR over 16 months, the top queries |
| AI | AI answers that cite the page, by engine, over 90 days |
| Decay | Shown when the page is decaying (D6) |

- **Done when:** every tab fills for a page on the test site, and a tab without its data says what would fill it.

### A9. Change sets: approve, apply, undo

- Every change in Audit (a link added, a link fixed, a redirect, a refreshed page) is a change set (`plays.ts`) for exactly the pages it lists.
- The side panel shows each page's before and after. People can untick pages before Apply.
- **Apply** writes through the CMS. **Undo** puts the before copy back, and refuses a page someone edited since.
- After Apply: the changed pages are recrawled within 5 minutes, and IndexNow is pinged where the connector plugin has it on.
- A brand without a CMS we can write to gets the change as HTML to copy, and Connect website.
- **Done when:** a change set applies and undoes on a test WordPress site and a test Ghost site.

### A10. Roles

- Viewers read everything.
- Editors run crawls, change settings, apply and undo changes, add links, pick decay actions and start refreshes.
- Admins connect and disconnect Search Console, GA4 and the CMS.
- **Done when:** each action is refused for the role below it, in the API and on the screen.

### A11. Alerts and digest (v2)

- Emails to people with alerts on, at most one per brand per day (plan 9): link health drops 5 or more, a page with value starts answering 4xx or 5xx, 3 or more pages start decaying in one week.
- **Weekly digest:** one email on Monday with the two scores, Fix first, and the pages refreshed last week with their results.
- Slack and webhooks: `audit.done`, `audit.alert`, `decay.new`.
- **Done when:** a test brand gets each alert once, and a partial crawl never sends one.

### A12. Writers for Webflow, Shopify and HubSpot (v2)

- `listItems`, `getItem` and `writeItem` for each in `cmsEdit.ts`: Webflow items through Data API v2, Shopify articles and pages through GraphQL, HubSpot blog posts.
- So adding links (L5), fixing links (L8) and updating refreshed pages (D10) work there too.
- **Done when:** a link applies and undoes on a test site on each.

### A13. Audit in the PDF report (v2)

- A new section in Reports: the two scores with trends, Fix first, links added this month, and the decay pages with their actions and results.
- **Done when:** a scheduled report shows the section with the same numbers as the Overview on that day.

### A14. Zippie and MCP tools (v2)

- Read: `get_audit`, `get_link_suggestions`, `get_decaying_pages`.
- Editors: `start_audit`, `add_links` (makes a change set, approved in the app).
- A built-in skill, "Fix what matters", walks Fix first.
- **Done when:** Zippie answers "what should I fix first?" with the Overview's top 3 and opens their change sets.

### A15. Share a read-only audit link (Later)

- A link for a client with the Overview and either part, using the existing report links (`reportLinks.ts`).

---

## 2. Internal Linking Audit

| Id | Feature | Release |
|---|---|---|
| L1 | Link graph | v1 |
| L2 | Link health score and numbers | v1 |
| L3 | Problems lists | v1 |
| L4 | Link opportunities | v1 |
| L5 | Add, Add all, Skip | v1 |
| L6 | Get links to this page | v1 |
| L7 | Link score per page | v1 |
| L8 | Fix bad links | v1 |
| L9 | Anchor text report | v2 |
| L10 | Clusters and pillar coverage | v2 |
| L11 | Links to new posts | v2 |
| L12 | Link rules | v2 |
| L13 | Link map | Later |
| L14 | Outbound link report | Later |

### L1. Link graph

- Every link from every crawled page: target, anchor, `rel` and place (body, nav, footer).
- Links in the nav and footer are counted once per page for scores, so a 2,000-page site's menu doesn't drown the body links.
- Click depth by shortest path from the home page.
- **Done when:** on the test site, links in, depth and place match the hand count for 20 pages.

### L2. Link health score and numbers

- Score from 0 to 100 (plan 6.3), with its parts shown as bars: deep pages, orphans, starved pages, bad links, missing pillar links.
- Numbers: pages crawled, average depth, pages 4+ deep, orphans, pages with 1 link in, links to redirects or broken pages.
- History of the last 8 crawls.
- **Done when:** the test site's score matches the hand-worked number.

### L3. Problems lists

One list per problem, each sorted by page value, each row opening the page panel.

| List | Rule |
|---|---|
| Orphans | In a sitemap, Search Console or GA4, with no links in from crawled pages |
| Too deep | Value in the top half and 4+ clicks deep |
| Starved | Value in the top 20% and links in under the site median |
| One link in | Exactly 1 link in |
| Too many links out | Over 150 |
| Nofollowed internal links | `rel=nofollow` on a link to our own page |
| Links to redirects | With the final URL to point to |
| Links to broken pages | With the page they were found on |

- Orphans, Too deep, Starved and One link in each have **Get links** (L6).
- Links to redirects and broken pages have **Fix all** (L8).
- **Done when:** each list matches its rule on the test site, and an orphan that's only in GA4 still shows.

### L4. Link opportunities

- The main list: one row per suggested link, grouped by the page that needs it (plan 6.2).
- Each row: the target page and its value, the source page and its clicks, the paragraph with the anchor highlighted, and why ("Both cover CRM pricing. The source has 1,200 clicks.").
- The anchor is always words already in the paragraph. The model picks them; code checks them.
- At most 3 new links per source page per run, 1 per paragraph.
- Filters: target page, source folder, cluster, Only pages with clicks.
- Rebuilt after each crawl. A suggestion whose paragraph changed turns stale and is checked again.
- **Done when:** on 3 real sites, every suggestion's anchor is in its paragraph and outside headings and links, and a person rates at least 8 of 10 random suggestions as ones they'd add.

### L5. Add, Add all, Skip

- **Add** on one row: a change set with the link put in the source page (`addLink`), through A9.
- **Add all for this page:** every open suggestion for one target in one change set.
- **Skip,** with an optional reason. A skipped pair never comes back.
- On a site we can't write to: the paragraph with the link in place, and the HTML to copy.
- **Done when:** Add puts the link in the live WordPress post with Undo, and Add all for 10 links makes one change set.

### L6. Get links to this page

- Type or pick any URL on the site, often a money page or a new post: **Get links**.
- Runs the suggestion steps for that one target right away and shows its opportunities.
- Also a button in the page panel, on every row of Orphans, Too deep and Starved, and on decaying pages whose reason is lost links (D5).
- **Done when:** for a page with no links in, it returns suggestions within 60 seconds on a 2,000-page site.

### L7. Link score per page

- Internal PageRank on a log scale from 0 to 10 (plan 4.5), as a column everywhere pages are listed.
- In the page panel: "Gets most of its link score from" the top 5 pages linking to it.
- **Done when:** the home page scores about 10 and a page with one link from a deep page scores near 0 on the test site.

### L8. Fix bad links

- Links to a redirect: the `href` is swapped to the final URL.
- Links to a page that's gone with nowhere to point: the link is removed and its text kept.
- **Fix all** on either list makes one change set for every page it touches.
- **Done when:** on the test site, Fix all clears both lists on the next crawl, and Undo brings every link back.

### L9. Anchor text report (v2)

- Per target page: every anchor pointing to it with counts.
- Flags: generic anchors ("click here", "read more"), one anchor pointing at different pages, and a page where over half its anchors are the same exact phrase.
- **Done when:** the test site's planted conflicts and generic anchors all show.

### L10. Clusters and pillar coverage (v2)

- Uses the brand's clusters from Opportunities (`content_clusters`) when it has them, else groups pages by shared terms.
- A grid per cluster: pillar, pages, and for each page whether it links to the pillar and whether the pillar links to it.
- **Fix this cluster:** one change set with every missing pillar link that has a good anchor.
- **Done when:** a cluster with 2 missing pillar links shows both, and Fix this cluster adds them.

### L11. Links to new posts (v2)

- When a post goes live (Arrowsterr publish or found new in a crawl), Audit runs L6 for it and shows "New post: 6 pages could link here" on the Overview.
- **Done when:** publishing a test post shows its suggestions within 10 minutes of the next sync.

### L12. Link rules (v2)

- Pages and folders never to add links in (legal pages, landing pages).
- Pages never to link to.
- Most links Audit may add to one page.
- A preferred anchor per target, used when it's in the paragraph.
- **Done when:** a page in the never-add list never shows as a source.

### L13. Link map (Later)

- Every page as a dot (up to 2,000), folder as the angle, depth as the ring, colored by link score. Orphans outside the rings.

### L14. Outbound link report (Later)

- Every outside site linked, with counts, and nofollow and sponsored use.

---

## 3. Content Decay

| Id | Feature | Release |
|---|---|---|
| D1 | Search Console connect, backfill and nightly sync | v1 |
| D2 | Decay detection | v1 |
| D3 | Noise guards | v1 |
| D4 | Decay list | v1 |
| D5 | Reasons | v1 |
| D6 | Page panel for a decaying page | v1 |
| D7 | Actions | v1 |
| D8 | Refresh plan | v1 |
| D9 | Hand-off to the writer | v1 |
| D10 | Update the live page | v1 |
| D11 | Watching | v1 |
| D12 | Results after a refresh | v1 |
| D13 | AI citation decay | v1 |
| D14 | Without Search Console | v2 |
| D15 | Cannibalization view | v2 |
| D16 | Chart notes and Google updates | v2 |
| D17 | Decay forecast | Later |

### D1. Search Console connect, backfill and nightly sync

- Connect asks Google for read-only Search Console access, picks the brand's property and asks to confirm (plan 4.3).
- Backfill 16 months by page and day, and weekly by page and query for the top 1,000 pages.
- Nightly sync of the last 5 days, replacing rows by day.
- Shows "Backfilling 16 months: 40%" while it runs. The decay list waits for it.
- **Done when:** a connected brand has 16 months of rows, the site's total clicks match Search Console's own total within 1%, and syncing a day twice changes nothing.

### D2. Decay detection

- Nightly after the sync, on every page with value (plan 7.2).
- Signals: click decline against the page's own 12-month best, three falling windows in a row, rank slip, CTR drop with steady rank, impressions drop, old year in the title, old page.
- Each page gets the signals that fired and the clicks lost against its best 28 days.
- **Done when:** on recorded data from 3 real sites, every page with a real two-week slide is found.

### D3. Noise guards

- Two weekly checks in a row before a page joins the list (old year shows at once).
- Seasonal: down from its peak but up on the same weeks last year goes to Watching as Seasonal.
- Site-wide: when the whole site drops 20% or more, pages are measured against the site, and the Overview shows one banner.
- Small pages under 50 clicks at their best skip the click rules.
- The last 3 days are never used.
- **Done when:** in the recorded data, a seasonal page, a one-week dip and a site-wide drop each behave as described, and none reach the main list.

### D4. Decay list

- One row per page, sorted by clicks lost.
- Each row: a weekly clicks line over 16 months with the peak marked, clicks and position now against then, AI citations now against before, the reason sentence, the action, and its button.
- The total clicks lost at the top.
- Filters: reason, action, cluster, Written by Arrowsterr, Content Plan stage.
- **Done when:** the list's total clicks lost equals the sum of its rows, and every row's line matches Search Console's chart for that page.

### D5. Reasons

Code finds the reasons; one Haiku call writes the sentence using only the numbers code gives it (plan 7.3).

| Reason | Release |
|---|---|
| Page broke (now 4xx or 5xx, redirects, noindex, or dropped from Google's index) | v1 |
| Cannibalized (another of our pages took its queries) | v1 |
| Outranked by newer pages (new pages in the top 5 since the peak) | v1 |
| SERP changed (AI Overview, AI Mode, video or People Also Ask above it) | v1 |
| Out of date (old year, old page, prices or dates that disagree with the top pages) | v1 |
| Lost AI citations | v1 |
| Lost internal links (fewer links in than at its peak) | v1 |
| Intent shifted (the top 5 are now a different kind of page) | v2 |
| Less demand (impressions and search volume down, rank steady) | v2 |

- A page can have more than one, listed by how much of the loss each explains.
- **Done when:** every number in every sentence matches a number code passed in (checked in code), and on recorded data the first reason matches a person's call for at least 8 of 10 pages.

### D6. Page panel for a decaying page

The A8 panel gains a Decay tab:

- Clicks, impressions and position over 16 months with the peak and the start of the slide marked.
- The queries that lost the most clicks, each with position then and now.
- The SERP for the top query, then and now, with new pages marked.
- AI engines that stopped citing the page, and what they cite instead.
- Links in at the peak against now.
- Page facts that matter here: last modified, the year in the title, words against the top 5's average.
- **Done when:** every part fills for a recorded decaying page.

### D7. Actions

| Action | Button |
|---|---|
| Fix the page | Shows what broke and the steps to fix it by hand |
| Add links | Opens Get links for the page (L6) |
| Refresh | Opens the refresh plan (D8) |
| Merge | A refresh of the stronger page that folds in the weaker one, plus a 301 from the weaker page |
| Redirect | A change set with the 301 to the closest page |
| Rework intent | Adds a planned piece to the Content Plan with the new format, linked to this page |
| Leave | Moves the page to Watching with a note |

- Audit picks the action from the first reason. Editors can change it, and the choice holds across runs.
- **Done when:** every action's button works on a test WordPress site, and a changed action survives the next nightly run.

### D8. Refresh plan

Before anything is written, the person sees what the refresh will change.

- A list of changes, each with its reason, built in code from the reasons and one Sonnet call:
  - "Update the 2025 prices (the top 3 pages show 2026 prices)"
  - "Add a section on AI CRMs (4 of the top 5 cover it)"
  - "Answer 'is HubSpot free' near the top (the AI Overview asks it)"
  - "Fix 2 links to pages that now redirect"
  - "Link to 3 newer posts in the same cluster"
- Each change can be unticked or edited, and the person can add their own.
- Keep as is: the URL always, the title and meta unless ticked.
- **Start refresh** sends the plan to the writer (D9).
- **Done when:** every listed change points to a number or a page it came from, and unticked changes never reach the writer.

### D9. Hand-off to the writer

The writer is built in its own track. Audit only sends a request and reads the result.

- **Request:** `startRefresh` in `src/lib/audit/refresh.ts` queues the writer's job with:

```ts
type RefreshRequest = {
  brandId: string;
  url: string;              // the live page, kept as the first source
  docId?: string;           // set when Arrowsterr wrote the page
  cms?: { connectionId: string; type: "post" | "page"; id: string }; // when we can write it back
  keyword: string;          // the page's top query
  changes: { id: string; text: string; reason: string; source?: string }[]; // the ticked plan
  keep: { title: boolean; meta: boolean; slug: true };
  links: { url: string; anchorHint: string }[]; // cluster pages to link
};
```

- **Result:** the writer saves a new version of the doc and sets `decay_pages.doc_id` and `state = 'refreshing'`. Audit reads the doc's status as it does for drafts.
- **Until the Live Writer ships,** `startRefresh` runs the existing `writer_brief` and `writer_draft` jobs with the live page as a source and the changes as the outline's notes, so refreshes work from day one.
- A refresh counts as one of the month's drafts.
- **Done when:** the same request works against both the current writer and the Live Writer with no change on the Audit side.

### D10. Update the live page

- **Update** sends the refreshed doc to the same post.
- A page Arrowsterr wrote: a new doc version, pushed with the existing update path (`doc_publications`, `wpSync`).
- Any other WordPress or Ghost page: imported into a new doc on first refresh, then written back with `writeItem`. The before copy goes in a change set, so Undo puts the old page back.
- Other CMSs: Copy HTML until A12.
- The URL never changes.
- After Update: recrawl, IndexNow where it's on, and the page moves to Done.
- **Done when:** a refresh updates a live WordPress post that Arrowsterr didn't write, and Undo restores it byte for byte.

### D11. Watching

- Pages with one week of decay, seasonal pages, and pages set to Leave.
- Each shows why it's here and when it would move to the list.
- **Done when:** a page moves from Watching to the list on the second week of a slide, and back off it when clicks recover for 2 weeks.

### D12. Results after a refresh

- A Done tab: pages refreshed in the last 90 days.
- Each row: refresh date, clicks 28 days before against 28 days after (once 28 days have passed), position before and after, AI citations before and after.
- The page's chart marks the refresh date.
- A total at the top: clicks won back across all refreshes.
- **Done when:** a recorded refresh shows the right before and after numbers on day 29.

### D13. AI citation decay

- From the brand's tracked AI answers: pages whose citations fell by half over 4 weeks against the 4 before, with 3 or more before.
- By engine: "ChatGPT stopped citing this page on Nov 2. It now cites rival.com/guide."
- Works without Search Console, since it uses our own data.
- **Done when:** a page whose recorded citations stop on one engine shows that engine and what replaced it.

### D14. Without Search Console (v2)

- GA4 organic landing-page sessions stored nightly when GA4 is connected.
- Rank checks for tracked keywords: the ranking URL and position each day.
- DataForSEO estimated traffic per page once a month as the last fallback.
- The screen says which data it used and what Search Console would add.
- **Done when:** a brand with only GA4 and rank tracking gets a decay list, labeled with its source.

### D15. Cannibalization view (v2)

- Queries where 2 or more of the brand's pages get impressions, with each page's clicks and position over time.
- The page Google prefers now, and when it switched.
- Actions: Merge, or tell the pages apart (adds a note to each one's refresh plan).
- **Done when:** a recorded site with two competing pages shows the switch date.

### D16. Chart notes and Google updates (v2)

- Known Google core and spam update dates drawn on every chart, from a list we keep in `src/lib/audit/googleUpdates.ts`.
- Our own events: the page's refresh, links added, publish date.
- People can add a note on a date ("Redesign went live").
- **Done when:** the notes show on the Overview and page charts at the right dates.

### D17. Decay forecast (Later)

- For pages on a steady slide, the clicks expected in 90 days if nothing changes, to rank which to refresh first.

---

## 4. What ships in v1, in order

| Order | Ships | Features | Weeks |
|---|---|---|---|
| 1 | Link crawler and Audit home | A1, A3, A5, A6, A7, A8, A10, L1 | 2.5 |
| 2 | Search Console | A4, D1 | 1.5 |
| 3 | Internal Linking | A9, L2 to L8 | 2 |
| 4 | Content Decay | D2 to D13 | 2.5 |
| 5 | Overview | A2 | 0.5 |

About 9 weeks for v1. v2 follows: A11 to A14, L9 to L12, D14 to D16, about 4 weeks more.

Each step ships on its own behind the Organic Research toolset, and each step's "Done when" lines are its definition of done.

---

## 5. How it fits with the Live Writer track

- Audit owns: finding decay, the reasons, the refresh plan, the hand-off request, updating the live page, and the results.
- The writer owns: the research, the rewrite, and its own screen.
- The only shared parts are the `RefreshRequest` shape (D9) and the doc it returns. Both tracks agree on that first and change it only together.
- The writer's `site_pages` tool can read Audit's page terms (`audit_pages.terms`) for internal links once both have shipped.
