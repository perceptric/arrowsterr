# AI Shopping: the plan

Track a brand's products in the shopping cards AI answers show: which products appear, where, at what price, sold by whom, and next to which rivals. The demo is at the AI Shopping artifact; this is how it works underneath.

Written November 2026. Prices marked "check" couldn't be confirmed on the vendor's own page. Field names marked "check" come from a summary of the vendor's docs, not a verbatim read, and are confirmed by recording real responses before any parser is written (section 11, step 1).

---

## 1. What can be measured

| Engine | Product cards available | How | Status |
|---|---|---|---|
| ChatGPT | Yes | DataForSEO ChatGPT LLM Scraper, item type `chat_gpt_products` (the real ChatGPT app, the same endpoint Arrowsterr already uses for answers) | Fields confirmed from 40 real answers |
| Google AI Mode | Yes | DataForSEO Google AI Mode SERP, `ai_overview_shopping` blocks inside `ai_overview` (already used for answers) | Fields confirmed verbatim and from 40 real answers |
| Gemini | No | The Gemini LLM Scraper documents only `gemini_text`, `gemini_table`, `gemini_images` | Text mentions only |
| Perplexity | No | DataForSEO has no Perplexity scraper; the API answers carry no shopping cards | Text mentions only |
| Amazon Rufus | No | No provider; it runs inside Amazon's signed-in app | Left out |

So AI Shopping measures **ChatGPT and AI Mode cards**. Gemini and Perplexity count only when they name a product in their text. The demo showed Perplexity and Rufus tabs; the build won't.

Every answer is non-personalized and signed out, at one location and language per brand (`location_code`, `language_code`). That's what the numbers describe, and the screen says so once on its first screen.

---

## 2. The raw data

### 2.1 Google AI Mode (confirmed from DataForSEO's docs, verbatim)

`result.items[]` holds `ai_overview`; its `items[]` hold blocks, one of which is `ai_overview_shopping` (`position`: left or right, `title`, `markdown`, `items[]`). Each `ai_overview_shopping_element`:

| Field | Meaning | Use |
|---|---|---|
| `gid` | Google's global product ID. Equals the `gpcid` in the element's `url` | **Product identity across runs and sellers** |
| `product_id` | Google Shopping product ID. Equals the `catalogid` in the `url` | Second identity |
| `data_docid` | The element's ID in that page (`productDocid` in the `url`) | Changes per run; not identity |
| `title` | Product name as shown | Matching |
| `seller` | Seller shown, e.g. "Argos" | Store |
| `snippet` | e.g. "Argos & more" | "& more" means other sellers too |
| `price.current`, `price.regular`, `price.currency`, `price.is_price_range`, `price.displayed_price` | Price shown | Price checks |
| `rating.value`, `rating.votes_count`, `rating.rating_max`, `rating.rating_type` | Stars and reviews | Shown |
| `marketplace`, `marketplace_url` | Marketplace host when there is one | Store |
| `image_url` | Picture (DataForSEO's copy) | Image check |
| `text`, `markdown` | The AI's words about the product, with citation links | Reasons, sources |

The `url` also carries `mid` (Google's merchant ID of the headline offer) and `headlineOfferDocid`, parsed from its `prds=` parameter.

### 2.2 ChatGPT (confirmed from 40 real answers)

`items[]` of type `chat_gpt_products` (one row per answer when there is one; `rank_absolute` is its place among the answer's parts) with `items[]` of `chat_gpt_products_element`. Filled in the 161 cards recorded:

| Field | Filled | Holds | Use |
|---|---|---|---|
| `title` | 161 | Product name | Matching |
| `images` | 148 | 1 to 3 picture links on `images.openai.com` | Image check |
| `price`, `currency` | 134 | A number and "USD" | Price checks |
| `url`, `domain` | 116 | The store's product page, tagged `utm_source=chatgpt.com` | Store, own-store link |
| `product_id` | 91 | **The store's own ID**: a SKU (`SAUQ0B5-FIEBLA-S110`), a Shopify product ID (`gid://shopify/p/...`) or a Google ID. Not the same across stores | Own-store match for Shopify stores |
| `merchants` | 91 | One store name, a string ("Backcountry") | Store |
| `tag` | 84 | ChatGPT's label ("Best overall") | Shown |
| `rating` | 8 | `value`, `votes_count`, `rating_max` | Shown when there |
| `product_ids`, `id_to_token_map` | 0 | Always empty | Not used |

What this changes:

- **ChatGPT cards carry no Google product ID.** `product_ids` (with `gpcid`) is in DataForSEO's docs but came back empty on every card. A product's ChatGPT cards are matched by title, brand, price and picture (section 5.2), then remembered by store and `product_id`. A product has a Google ID on AI Mode only.
- **45 of 161 ChatGPT cards are name and picture only:** no store, link or price. They count for card rate, product share and position, and are left out of store and price numbers.
- **A link tagged `utm_campaign=openai_catalog`** means the store sends its products to ChatGPT through OpenAI's product feed. The Stores tab shows which stores do.
- **No ads were seen** in 40 ChatGPT answers. `chat_gpt_ad` is never read as a card if it appears.

Also kept from ChatGPT: `chat_gpt_text` (`markdown`, `sources`, `brand_entities`) for text mentions and sources.

**AI Mode, from the same 40 prompts:** 98 cards. `gid` was filled on 97, and the 98th carried it in the link's `rds` value (`PC_<gpcid>`), so the parser reads it from there. `gid` always equals the link's `gpcid`, and `product_id` its `catalogid`. `mid` was in 92 links. `marketplace` and `price.max_value` were always empty. `snippet` ends in "& more" on 87 cards. Ads come as `ai_overview_paid`, a separate block, and are never cards.

**How often cards show:** ChatGPT showed cards on 33 of 35 buying prompts, AI Mode on 20 of 35. Neither showed cards on the 5 prompts about software, services or training.

The parser is `src/lib/shopParse.ts` (`readCards`), tested on all 80 answers in `tests/shopParse.test.ts`.

---

## 3. The catalog

Opened from the Catalog side panel. One brand, one catalog.

- **Shopify:** the store already connected in Publishing sites, plus the `read_products` scope (one more scope on the Shopify app; existing stores sign in again once). GraphQL `products(first: 25, query: "status:active")` paged, 30 variants each to stay under Shopify's query cost: `id`, `title`, `vendor`, `productType`, `handle`, `onlineStoreUrl`, `featuredImage { url }`, `variants { sku barcode price availableForSale }` (`inventoryQuantity` needs another scope).
- **Google Merchant Center:** sign in with Google (scope `https://www.googleapis.com/auth/content`), then the Merchant API v1: `accounts/v1/accounts` to pick the account and `products/v1/accounts/{id}/products` (1,000 a page) for `offerId`, `productAttributes` (`title`, `brand`, `gtins`, `mpn`, `link`, `price`, `salePrice`, `availability`, `imageLink`, `itemGroupId`). Variants that share an `itemGroupId` fold into one product. Paths and field names are from Google's docs (check: confirm on the first real account). Preferred when both exist: it's the feed AI shopping reads.
- **CSV:** for anyone else: title, brand, URL, price, SKU, GTIN.

Each product is stored once with its variants folded in: `title`, `brand` (plus the aliases people add), `skus[]`, `gtins[]`, `mpns[]`, `url`, `price_min`, `price_max`, `currency`, `in_stock`, `image_hash` (section 5.3), and its match tokens (section 5.2). The catalog syncs daily, and keeps each day's price, because a card is always compared with the price on the day it was read.

### 3.1 Which brands get it

AI Shopping is on or off per brand. ChatGPT and AI Mode show product cards for things people buy online, so a software company, an agency or a law firm would only ever see an empty tab. Brands that don't sell products keep the normal AI Visibility pages and run no shopping checks; they cost only the weekly detection, about $0.01 a month.

**Three kinds of brand:**

| Kind | Example | AI Shopping |
|---|---|---|
| Sells online from its own store | A shoe brand on Shopify | On. Everything in this plan |
| Sells only through other stores | A brand sold only on Amazon, Walmart and REI | On. Catalog from Merchant Center or CSV; matching skips the own-store link (section 5.1, step 2); the retailer list is the main view |
| Doesn't sell products | SaaS, agencies, services, B2B | Off. Tab hidden, no runs |

**How it's decided.** A `shop_detect` job looks for these signals, in order. The first one found turns AI Shopping on and is saved as the reason:

1. **A store is connected:** Shopify, Merchant Center, or a CSV upload in the Catalog panel.
2. **The site sells things:** the job reads the homepage, up to 6 product or collection pages linked from it, and Shopify's public `/products.json`. Any Shopify products, `Product` JSON-LD with a price on at least 3 pages, or a priced `Product` page plus a cart (a `/cart`, `/basket` or `/bag` link, an add-to-cart form, or an "Add to cart" button) turns it on. A `Product` without a price, a `SoftwareApplication`, or a `/checkout` link alone doesn't count, because software sites use them too.
3. **"Buy <brand>" answers show products:** one AI Mode and one ChatGPT question through the standard queue. Any Google product link in the AI Mode answer (a Google Shopping page with a `gpcid`), a link to the brand's own site tagged `srsltid` (Google Merchant Center's tag), or a ChatGPT card from the brand's own site turns it on. Cards that only carry the brand's name don't count here: "buy Intercom" shows door intercoms.
4. **Tracked cards name the brand:** the normal tracking runs return product cards next to the answer at no extra cost, and the check job now counts the ones that name the brand (a whole word in the title, the store's name, or the brand's own site) into `shop_seen`. 3 in 14 days turn it on. This is how a retailer like REI is found: its own site blocks readers, and "buy REI" shows no products, but REI is the store on cards in its outdoor prompts.

None of them means off. The job runs when a brand is set to Auto and once a week. Once on, Auto turns it off only after 3 weekly checks in a row find nothing, so one bad day never hides the tab.

**Tested on 30 real brands** (`tests/shopDetect.test.ts`, recorded November 2026): Allbirds, Gymshark, Glossier, Brooks Running, HOKA, Warby Parker, Casper, Patagonia, Bombas, Away, Oura, Brooklinen, REI, Fenty Beauty and Ninja all turn on; HubSpot, Notion, Ahrefs, Stripe, McKinsey, Deloitte, Webflow, Figma, Slack, Salesforce, Zapier, Intercom, Asana, Mailchimp and Linear all stay off, and no signal fires for any of them. 6 of the 15 shops block the site reader (403, 429 or no answer); the answers find all 6. The site reader identifies itself as ArrowsterrBot and never poses as a browser.

**A person decides last.** Settings › Brand has an AI Shopping switch with three states: Auto (the default, follows the job), On and Off. A switch set by hand is never changed by the job.

**When it's off:** the sidebar hides AI Shopping for that brand. Opening `/ai-shopping` directly shows the empty screen with the shopping drawing, "Track your products in AI answers" and one button, Connect a store, which opens the Catalog side panel. Connecting a store turns it on.

**When it turns off after being on:** runs stop that day; the history stays and shows again if it turns back on.

---

## 4. Prompts and sampling

### 4.1 Prompts

Shopping questions, per brand: up to 40 to start. Claude Haiku suggests them from the catalog's categories crossed with buyer modifiers ("best", "under $X", "for <use>", "vs <rival>", "for <person>"). Duplicates are merged (same words after stemming and sorting), and a person picks which to track. Each prompt keeps its category, so results roll up by category.

### 4.2 Why several runs

The same question gives different cards from run to run. One run is an anecdote; the numbers are rates over many runs.

- **Default:** each prompt runs **2 times a day on each engine** (ChatGPT and AI Mode), through DataForSEO's standard queue. That's 28 runs per prompt and engine a week.
- **Deep check:** 20 runs at once for one prompt, on demand, from its page.
- Runs of the same prompt on the same day are spread across the day, so they don't all land on one cached answer.

### 4.3 How sure the numbers are

Every share is a proportion `k / n`, shown with its **95% Wilson interval**:

```
center = (k + z²/2) / (n + z²)
margin = z · sqrt(k(n − k)/n + z²/4) / (n + z²)          with z = 1.96
```

- A prompt's weekly share at n = 28 runs carries about ±17 points at p = 0.3. So one prompt's number is shown with its range, and the brand total (40 prompts × 2 engines × 2 runs × 7 days ≈ 1,100 runs a week) carries about ±3 points.
- **A change is called a change** only when two weeks differ by a two-proportion z-test at p < 0.05 with at least 30 runs on each side. Otherwise the trend line shows it, but no alert fires and the arrow is gray.
- A share with fewer than 10 runs behind it shows "Too few runs" instead of a number.

---

## 5. Matching a card to a product

The core step: each card is either one of the brand's products, a rival's product, or unknown. A wrong match is worse than no match (`docs` reliability rule), so matching only says yes when it's sure, and asks a person when it isn't.

Built in `src/lib/shopMatch.ts` (pure) and `src/lib/shopMatchServer.ts` (jobs). What follows is how it works now.

### 5.1 Models

Real stores list each color, shade or gender as its own product: "The Medium in Coast Blue", "Pro Filt'r Soft Matte Longwear Foundation — #485", "Men's Wool Runner - Natural Grey". Products that differ only in that are one **model**, and cards match models.

- **Variant part:** anything after " - ", " — ", " – " or " | " is a variant. " in " counts only when the name before it has several variants, the part after it follows several names, or it is all common colors and sizes.
- **Same model:** titles with the same words in any order ("Classic Core Percale" and "Classic Percale Core"); men's and women's merge, kids' don't.
- **Never the same model:** bundles, "set of 2", packs, duos, kits, samples, minis and refurbished. These are **markers**, and a card and a model must carry the same markers. "Dream" and "Dream Bundle" are two models.
- **Left out:** $0 products (checkout helpers, content pages).
- **The brand's name** comes off both sides: the brand, its other names (Settings › Brand › AI Shopping › Other names) and the catalog's vendor names.

### 5.2 The order of checks

1. **Remembered key.** Each card has keys, most exact first: Google's `gid` (AI Mode), the store and its product ID (ChatGPT), the link, then the card's product words. If a person, or an earlier sure match, decided a key, that decides the card. A key marked not ours makes the card another brand's.
2. **Brand.** The card is the brand's only if its title names the brand (or another name), the store's name starts with it, or it links to the brand's own site (its domain, or wherever its catalog's product pages live). Otherwise it's a rival's or unknown.
3. **Own store link.** A link to one of the catalog's `/products/<handle>` pages is that model. Confidence 1.
4. **Words.**
   - Colors, shades, sizes and amounts the catalog uses as variants come off the card ("Coast Blue", "1.08 oz", "#485", "Size 10").
   - A model fits when all its words are on the card, the generations agree ("3", "2.0", "v2", "7\"" must be on both sides), and the markers agree.
   - The most specific fitting model wins, unless the card carries a word that sets a more specific sibling apart without fitting it: "Glide 3 Wide" against Glide 3.
   - When no model fits fully, a card naming only part of exactly one model is a question, and part of several is unclear.
5. **Price.** A card under half or over twice the model's price loses 0.2. It never gains.
6. **Picture** (section 5.3) for close calls.
7. **Google product lookup** for AI Mode cards still in doubt (section 5.5).

### 5.3 Picture

The card's picture and the model's main picture become 64-bit difference hashes (9 by 8 grayscale) with `sharp`, cached per picture address in `shop_image_hashes`. 10 bits apart or fewer adds 0.1; over 24 subtracts 0.1. Run only when words gave 0.8 to 0.99, so a far picture can turn a match into a question and a close one can settle a question. Without `sharp` on the server, matching works the same without pictures.

### 5.4 The decision

| Score | Result |
|---|---|
| 0.90 and up | Matched. Its exact keys are remembered (never its words). |
| 0.60 to 0.90 | In doubt. Counts toward the **brand**, not a product, and goes to "Is this yours?" in the Catalog panel. Yes (the suggested product, or one picked from the list) or Not ours is saved for every key of the card, and the last 30 days are matched again. |
| Under 0.60, brand present | The brand's product, not in the catalog (an old model, a bundle, an either-or card). Counts toward the brand. |
| No brand | A rival's or unknown. |

Scores: all of a model's words on the card 0.95, less 0.03 for each word from a close sibling (one sharing half the model's words), at most 0.09; two models equally specific 0.70 and part of several 0.65, both asked without a suggestion (you pick the product); part of one model 0.60 to 0.85 by how much of it the card names, asked with it as the suggestion.

### 5.5 Google product lookup (confirmed November 2026)

DataForSEO Merchant Google `product_info` (task_post, then task_get/advanced) with the card's `product_id`. It costs $0.001 a product and takes up to 45 minutes in the standard queue. The result's `product_info_element` has `title`, `url`, `specifications[]` (`specification_name`, `specification_value`), `sellers[]` (`title`, `url`) and `variations`. The product tried returned no GTIN in its specifications, so the lookup settles a card only with one of these:

- a seller link to one of the brand's own product pages;
- a GTIN, UPC or EAN, or a model or part number, that is in exactly one model.

`shop_lookup` asks about at most 20 products a run, each once.

### 5.6 Rivals

A rival card's brand is the longest leading run of words (up to 3) that starts at least 3 different titles in the brand's last 30 days of cards, or the store when the title starts with its name. Otherwise Claude Haiku names it, up to 40 titles a run, and the name must appear in the title letter for letter, or it's left empty. Merging rival names comes with the Competitors view in phase 4.

### 5.7 Tests (shipped)

`tests/shopMatch.test.ts`, 14 tests:

- **Real data:** 7 real Shopify stores' public catalogs (Allbirds, Glossier, Casper, Brooklinen, Away, Gymshark, Fenty Beauty; 5,462 products, 1,854 models) and 81 real ChatGPT and AI Mode answers plus their "buy" answers. That's 266 cards, all labeled by hand: 55 the brand's own (42 with a product, 13 that must not match one) and 211 other brands'.
- **Results:** no wrong matches; 38 of the 42 products matched without asking (90%); the other 4 went to "Is this yours?" (a price far off, or a name that fits several products).
- **Two labels were corrected after the first run,** both mistakes in the labels, checked against the catalog: Casper does sell "The One Mattress", and the towel card links to Brooklinen's own product page.
- **Hard cases:** Glide 3 against Glide 3 Wide and Glide 2; a reseller's long title; a lookalike from another brand; no brand; two-packs, refurbished and bundles; telling words; price; the store's own link; one `gid` from three stores; a rejected key; pictures; the lookup; rival names.

---

## 6. The numbers

For prompt q, engine e and run r, let C(q, e, r) be its cards in order. Positions start at 1, in the order the answer shows them; with two blocks, the first block's cards come first. Ads (`ai_overview_paid`, and `chat_gpt_ad` if it ever appears) are a separate block and never counted.

| Number | Definition |
|---|---|
| **Card rate** | Runs with at least one card ÷ all runs |
| **Product share** (brand) | Runs with at least one of the brand's cards ÷ runs with cards |
| **Product share** (one product) | Runs showing that product ÷ runs with cards |
| **Shelf share** | The brand's cards ÷ all cards, over runs with cards |
| **Avg card position** | Mean position over the runs where it's shown |
| **Visibility score** | Σ 1 / log₂(1 + position) over runs where shown ÷ runs with cards. Position 1 counts 1, position 3 counts 0.5 |
| **Prompts you're in** | Prompts where at least one of the brand's cards showed in the range |
| **Products seen** | Catalog products matched at least once in the range |

- Totals over prompts weight every prompt the same. A switch weights them by monthly search volume (DataForSEO keyword data, already used in Keyword Research).
- Runs without cards are left out of shares on purpose: an engine that often shows no cards would otherwise pull every brand down the same. The card rate is shown beside it.

---

## 7. Stores and prices

- **Store:** AI Mode `seller` and `marketplace`, ChatGPT `merchants`, normalized by domain and name to one store ("Amazon", "Amazon.com", "amazon.com" become Amazon). The brand's own store is its store domain or store name.
- **Resellers:** stores not on the brand's list of authorized retailers (set in the Catalog panel) are shown as "Not on your retailer list". Arrowsterr doesn't call them wrong; it shows who they are.
- **Price checks**, per matched card, against the catalog price that day, same currency only:
  - **Your store, different price:** the card shows the brand's own store at a price more than 2% and $1 away from the catalog. That's stale data on the brand's side (feed or page), so it's flagged.
  - **Another store, different price:** shown as a price gap ("Walmart $129, your store $119"), never as an error. It's that store's price.
  - **Below your floor:** when the brand sets a minimum advertised price, a card under it is flagged with the store.
  - Price ranges and "& more prices" (`is_price_range`, `displayed_price`) compare `current`, the lowest offer shown.
- **Out of stock:** a card for a product the catalog says is out of stock is flagged, since it sends buyers to an empty page.

---

## 8. Reasons and sources

- **Why AI picks it:** the element's `text` (AI Mode) or the answer text around the product's name (ChatGPT) gives the reason. Claude Haiku shortens it to one line, and the line must be made of words from that text, checked in code. No quote, no reason shown.
- **Sources:** the links cited in the product's own text first (`markdown` citations next to the product), then the answer's other sources (`chat_gpt_text.sources`, AI Mode `references`). Each page counts once per run per product. The Sources tab ranks pages by how many runs they backed the brand's cards.

---

## 9. Data

| Table | Holds |
|---|---|
| `shop_catalog` | One row per product: the fields in section 3, `source`, `external_id`, `synced_at` |
| `shop_catalog_prices` | Product, day, price, currency, in stock |
| `shop_prompts` | Brand, prompt, category, engines, active |
| `shop_runs` | Prompt, engine, run time, sample number, cards shown or not, the raw response (compressed, kept 30 days so a better parser can read it again) |
| `shop_cards` | Brand, day, engine, prompt, block, position, title, seller, store, link, price fields, `gid`, store product ID, image, keys, verdict, matched product and model, score, how, why, rival (phase 3 saves the cards from the daily tracking answers of brands with AI Shopping on; phase 4 adds its own runs) |
| `shop_ids` | A card key (`g:` Google ID, `s:` store and product ID, `u:` link, `t:` product words) to a product, or to "not ours", with who decided and when |
| `shop_image_hashes` | Picture address to its difference hash |
| `shop_daily` | Brand, prompt, engine, day: runs, runs with cards, and per brand and product the counts behind section 6 |

`brands` gets `shop_mode` (`auto`, `on`, `off`), `shop_on` (what Auto decided), `shop_reason` (section 3.1) and `shop_aliases` (section 5.1). Every row carries `brand_id`. The screens read `shop_daily`, so they stay fast.

---

## 10. The jobs

| Job | When | Does |
|---|---|---|
| `shop_detect` | When a brand is added, after each site crawl, weekly | Section 3.1: sets `shop_on` and `shop_reason` for brands on Auto |
| `shop_catalog_sync` | Daily, and on connect | Reads Shopify or Merchant Center into `shop_catalog` and the day's prices |
| `shop_runs_post` | 4 times a day | Posts the day's runs to DataForSEO's standard queue, tagged with run IDs (key prompt + engine + day + sample, so a retry never posts twice) |
| `shop_runs_collect` | Every 15 minutes | Collects finished tasks, saves the raw response, parses the cards |
| `shop_match` | Every 10 minutes for brands with new cards; all of the last 30 days after a decision, a catalog sync or new other names | Matches cards (section 5); phase 4 adds `shop_daily` and alerts |
| `shop_lookup` | After a match leaves AI Mode cards in doubt | Section 5.5 |

All run on the existing jobs queue and worker.

---

## 11. Phases

| Phase | Weeks | Ships | Done when |
|---|---|---|---|
| 1. Real data first (shipped) | 0.5 | 40 test prompts run on both engines; every raw response saved as a test fixture; parsers written against those fixtures | Every `chat_gpt_products` and `ai_overview_shopping` field in section 2 is confirmed from real responses, and the parser tests pass on all of them |
| 2. Catalog (shipped) | 1 | Shopify `read_products`, Merchant Center sign-in, CSV, the Catalog side panel, `shop_detect` and the Settings switch | A Shopify store's 42 products load with variants folded in and daily prices; on 30 hand-labeled brands (15 that sell, 15 that don't), detection turns on every brand that sells and none that don't |
| 3. Matching (shipped) | 1.5 | Section 5 with its tests, "Is this yours?" | On 200 hand-labeled cards: no wrong matches, and at least 85% matched without asking |
| 4. Numbers and screens | 1.5 | Sections 6 to 8, Overview, Products, Prompts, Stores, Sources, alerts | The numbers on 3 test brands match a hand count of the same runs |

About 4.5 weeks for one engineer.

---

## 12. Running cost

Phase 1 cost $0.32 once (80 live tasks at $0.004) and adds nothing a month. Phase 3's test data cost $0.32 once (81 live answers, one lookup); its lookups and rival names are the two lines in the table below: the parser runs on the worker that already exists. To record again: `NODE_USE_ENV_PROXY=1 node scripts/shop-record.mjs --again` (needs `DFS_LOGIN` and `DFS_PASSWORD`, or a proxy that adds them). `node scripts/shop-fields.mjs` lists every field and how often it's filled.

**Assumptions:** 1.3 brands per team; 30% of brands sell products and turn it on (20 brands at Beta, 195 at Growth); the other 70% run no shopping checks, only the weekly detection (section 3.1); 40 prompts, 2 engines, 2 runs a day each; DataForSEO standard queue at $0.0012 per run for both endpoints; product lookups for under 5% of new cards.

| Line | Per brand a month | Beta (50 teams) | Growth (500 teams) |
|---|---|---|---|
| Card runs: 40 × 2 × 2 × 30 = 4,800 runs | $5.76 | $115 | $1,123 |
| Deep checks (about 10 a month, 20 runs each, on 1 engine) | $0.24 | $5 | $47 |
| Google product lookups ($0.001 each, about 100 a brand a month) | ~$0.10 | $2 | $20 |
| Claude Haiku: prompt ideas, brand names, one-line reasons | ~$0.15 | $3 | $29 |
| Detection for every brand on Auto: 2 "buy <brand>" questions a week at $0.0012 (65 brands at Beta, 650 at Growth) | $0.01 | $1 | $7 |
| Merchant Center and Shopify APIs | $0 | $0 | $0 |
| Servers: the jobs on the existing worker; raw responses about 40 MB per brand a month on the VPS disk | $0 | $0 | $0 |
| **Monthly total** | **~$6.26** | **~$126** | **~$1,226** |

Plan tasks cover it the way they cover Keyword Research: each run and deep check takes tasks, so heavy use pays for itself.

---

## 13. What it can't do

- Signed-in, personalized answers: every run is signed out, at the brand's one location.
- Gemini, Perplexity and Rufus cards (section 1).
- Why a card is missing: the numbers show where the brand isn't; the Sources tab shows which pages the cards that win are built on.

## Sources

- DataForSEO Google AI Mode SERP: `docs.dataforseo.com/v3/serp/google/ai_mode/task_get/advanced` (read verbatim)
- [DataForSEO ChatGPT LLM Scraper](https://docs.dataforseo.com/v3/ai_optimization/chat_gpt/llm_scraper/live/advanced/)
- [DataForSEO Gemini LLM Scraper](https://docs.dataforseo.com/v3/ai_optimization/gemini/llm_scraper/live/advanced/)
- [DataForSEO LLM Scraper pricing](https://dataforseo.com/pricing/ai-optimization/llm-scraper)
- [DataForSEO AI Mode pricing](https://dataforseo.com/pricing/google-serp/google-ai-mode-serp-api)
- [DataForSEO Google Shopping (Merchant) pricing](https://dataforseo.com/pricing/merchant/google-shopping-api)
- [DataForSEO Merchant products, task_get advanced](https://docs.dataforseo.com/v3/merchant/google/products/task_get/advanced/)
