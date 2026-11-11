# Drafts: the plan

The Content Brief goes away. People work with **Drafts** only, and publish a draft to their own CMS with one click: WordPress, Webflow, Framer, Shopify, HubSpot, Ghost, Wix, or any other site through a webhook.

Written November 2026. Prices marked "check" couldn't be confirmed on the vendor's own page.

**Phase 1 shipped (November 2026).** Write draft runs the research and outline in the background and starts the draft on its own (`chainDraft` in `writerDraft.ts`, called from the `writer_brief` job). The Content Brief tab, the brief and outline review screens, the brief API (`/api/research/brief`) and Brief ready are gone; pieces left at Brief ready moved to Planned (`supabase/076_drafts_only.sql`). The Library is Drafts (`/drafts`, with `/library` forwarded). Brand moved into Settings › Brand: Tone of voice, Brand Kit and Guidelines sit next to Publishing sites, and `/brand` forwards there.

**Phase 2 shipped (November 2026).** Publish has Draft, Publish now and Schedule for every site. WordPress keeps its own schedule (`wp_publish`); the other sites go up as a draft right away and a `cms_publish` job puts them live at the time with the article as it is then (`cmsSchedule.ts`, tested on a double run, a moved schedule and a failure that retries). A live post on those sites can only be updated live. Framer connects with its project link and an API key through the Framer Server API (`framer-api`); the blog collection and its fields are found on their own (`cmsMap.ts`), and a live publish publishes the site and deploys it to the custom domain. Webflow connects with Sign in with Webflow when `WEBFLOW_CLIENT_ID` and `WEBFLOW_CLIENT_SECRET` are set (`webflowAuth.ts`), finding the site, blog collection and fields the same way; a pasted site token still works. Settings › Publishing sites uses the same connect wizard. Framer needs `supabase/077_framer_sites.sql`.

---

## 1. Summary

- **No more Content Brief.** The Content Brief tab on a calendar piece, the brief screen in the Library, the brief's Word and PDF export and the "Brief ready" state all go. Generate goes straight to a draft.
- **The Library becomes Drafts.** Every keyword from the Editorial Calendar shows as a draft: Planned, Writing, Ready, Scheduled, Published.
- **Click to publish.** A draft has one Publish button: publish now, schedule, or send it to the CMS as a draft. A published article can be updated from Arrowsterr later.
- **One-click connections** where the CMS allows it.

**How long:** about 4.5 weeks for one engineer (section 5).

**What it costs to run:** about **$0 extra a month at Beta (50 teams)** and **$0 at Growth (500 teams)** (section 6).

---

## 2. What Arrowsterr has today

- The Agentic Writer makes a brief first (research, outline, sources, modules, images), waits for a person to approve it, then writes the draft from it (`writerBrief.ts`, `writerDraft.ts`).
- A calendar piece has its own Content Brief tab (`ContentPiece.tsx`, `BriefView.tsx`, `brief.ts`).
- Publishing calls each CMS's own API with a token people paste (`cms.ts`, `cmsTypes.ts`): WordPress, Webflow, Shopify, HubSpot and Ghost. WordPress already connects in one click: the person approves Arrowsterr in a WordPress window (`wpAuthorize.ts`), and the Arrowsterr Connector plugin adds modules, SEO fields, llms.txt and IndexNow.
- Framer isn't supported. No CMS connects through an MCP.

---

## 3. What changes

### 3.1 Drafts only

- **Generate** runs research and the outline in the background as one step of the draft, with no stop for approval. The outline still guides the writer, so drafts keep their quality and their sources.
- The draft screen shows progress (Researching, Outlining, Writing, Checking) and opens in the editor when it's ready.
- **Removed screens:** the Content Brief tab, `BriefView`, `BriefEditor`, the brief's Word and PDF export, and the brief API route (`/api/research/brief`).
- **Kept for old work:** briefs already in the database stay. An old approved brief that has no draft gets a Write draft button.
- Old links to a brief open its draft.
- Zippie and MCP tools that make briefs make drafts instead.

### 3.2 Click to publish

- One **Publish** button on a draft, with: the site to publish to, publish now or at a time, or send to the CMS as a draft.
- The draft's title, slug, meta description, featured image, category and tags go along. Fields map on their own, and the person can change the mapping once per site.
- Publish state shows on the draft and in the Editorial Calendar. A failed publish shows one line with Retry.
- **Update:** after edits, Update sends the new version to the same post or item.
- Scheduled publishing runs on the jobs queue. A retry never makes a second post: it looks for the post id saved from the first try.

### 3.3 Connections

| CMS | How it connects | Notes |
|---|---|---|
| WordPress | One click: approve Arrowsterr in a WordPress window (have today) | The Arrowsterr Connector plugin adds modules and SEO fields |
| Webflow | One click: sign in with Webflow (OAuth app), pick the site and collection | Create items live or staged, then publish (Data API v2, `cms:write`) |
| Framer | Paste the project link and an API key from Site Settings, with a button that opens the right screen | Framer Server API: write to the CMS collection, then publish. Framer only offers API keys today. Free during beta (check) |
| Shopify | One click: install the Arrowsterr app | Blog articles through the Admin API |
| HubSpot | One click: sign in with HubSpot (OAuth app) | Blog posts through the CMS API |
| Ghost | Paste the Admin API key (have today) | Ghost has no OAuth |
| Wix | One click: install the Arrowsterr app | Wix Blog API (check) |
| Any other site | A webhook: Arrowsterr sends the article as JSON or HTML to the site's address | For custom sites and Zapier or Make |

The tokens people paste today keep working. New connections use the one-click sign-in.

---

## 4. Reliability

- A publish is saved with the CMS's post id the moment it succeeds, so a retry or a double click can't post twice.
- A busy or down CMS is tried again with growing waits. A token that stopped working asks to reconnect.
- Images upload to the CMS before the article, so the article never goes out with broken images.
- Tests: each CMS's real error replies, a publish that fails then works on retry, and a webhook that times out.

---

## 5. Phases

| Phase | Weeks | What ships | Done when |
|---|---|---|---|
| 1. Drafts only | 1.5 | Generate goes straight to a draft; brief screens removed; Library renamed Drafts | Generate on a calendar keyword ends in a full draft with sources, with no approval step |
| 2. Click to publish | 2 | Publish, schedule, update; Webflow sign-in; Framer | A draft publishes to a test Webflow site and a test Framer site and shows live, once each |
| 3. More CMS | 1 | Shopify and HubSpot sign-in, Wix, webhook | A draft publishes to each and the post id is saved |

---

## 6. Running cost

| Line | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| Drafts (the same research and writing tokens as today; the brief step stays inside the draft) | $0 | $0 |
| Webflow, Shopify, HubSpot and Wix apps | $0 | $0 |
| Framer Server API (free during beta, check) | $0 | $0 |
| Scheduled publishing on the existing worker | $0 | $0 |
| **Monthly total** | **$0** | **$0** |

---

## Sources

- [Framer Server API](https://www.framer.com/developers/server-api-introduction) and [its quick start](https://www.framer.com/developers/server-api-quick-start)
- [Framer Server API announcement](https://www.framer.com/updates/server-api)
- [Webflow: create item live](https://developers.webflow.com/data/reference/cms/collection-items/live-items/create-item-live)
- [Webflow: publish item](https://developers.webflow.com/data/reference/cms/collection-items/staged-items/publish-item)
