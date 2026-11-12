# AI Shopping: the plan

Track a brand's products in the shopping cards AI answers show: which products appear, where, at what price, sold by whom, and next to which rivals. The demo is at the AI Shopping artifact; this is how it works underneath.

Written November 2026. Prices marked "check" couldn't be confirmed on the vendor's own page. Field names marked "check" come from a summary of the vendor's docs, not a verbatim read, and are confirmed by recording real responses before any parser is written (section 11, step 1).

---

## 1. What can be measured

| Engine | Product cards available | How | Status |
|---|---|---|---|
| ChatGPT | Yes | DataForSEO ChatGPT LLM Scraper, item type `chat_gpt_products` (the real ChatGPT app, the same endpoint Arrowsterr already uses for answers) | Fields check |
| Google AI Mode | Yes | DataForSEO Google AI Mode SERP, `ai_overview_shopping` blocks inside `ai_overview` (already used for answers) | Fields confirmed verbatim |
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

### 2.2 ChatGPT (fields check)

`items[]` of type `chat_gpt_products`, each with `rank_group`, `rank_absolute` and `items[]` of `chat_gpt_products_element`: `product_id`, `title`, `price`, `currency`, `rating` (`value`, `votes_count`, `rating_max`, `rating_type`), `merchants`, `url`, `domain`, `images`, `tag`, and `product_ids[]` of type `chat_gpt_google_shopping_product` with `gpcid`, `catalog_id`, `mid`, `headline_offer_docid`. If confirmed, ChatGPT cards carry the same Google `gpcid` as AI Mode, so one product has one ID on both engines.

Also kept from ChatGPT: `chat_gpt_text` (`markdown`, `sources`, `brand_entities`) for text mentions and sources, and `chat_gpt_ad` so sponsored cards are never counted as recommendations.

---

## 3. The catalog

Opened from the Catalog side panel. One brand, one catalog.

- **Shopify:** the store already connected in Publishing sites, plus the `read_products` scope (one more scope on the Shopify app; existing stores sign in again once). GraphQL `products(first: 250)` paged: `id`, `title`, `vendor`, `productType`, `handle`, `onlineStoreUrl`, `featuredImage { url }`, `variants { sku barcode price inventoryQuantity }`.
- **Google Merchant Center:** sign in with Google (Merchant API, read only): `offerId`, `title`, `brand`, `gtin`, `mpn`, `link`, `price`, `availability`, `imageLink`. Preferred when both exist: it's the feed AI shopping reads.
- **CSV:** for anyone else: title, brand, URL, price, SKU, GTIN.

Each product is stored once with its variants folded in: `title`, `brand` (plus the aliases people add), `skus[]`, `gtins[]`, `mpns[]`, `url`, `price_min`, `price_max`, `currency`, `in_stock`, `image_hash` (section 5.3), and its match tokens (section 5.2). The catalog syncs daily, and keeps each day's price, because a card is always compared with the price on the day it was read.

### 3.1 Which brands get it

AI Shopping is on or off per brand. ChatGPT and AI Mode show product cards for things people buy online, so a software company, an agency or a law firm would only ever see an empty tab. Brands that don't sell products keep the normal AI Visibility pages and run no shopping checks, so they add $0.

**Three kinds of brand:**

| Kind | Example | AI Shopping |
|---|---|---|
| Sells online from its own store | A shoe brand on Shopify | On. Everything in this plan |
| Sells only through other stores | A brand sold only on Amazon, Walmart and REI | On. Catalog from Merchant Center or CSV; matching skips the own-store link (section 5.1, step 2); the retailer list is the main view |
| Doesn't sell products | SaaS, agencies, services, B2B | Off. Tab hidden, no runs |

**How it's decided.** A `shop_detect` job looks for these signals, in order. The first one found turns AI Shopping on and is saved as the reason:

1. **A store is connected:** Shopify in Publishing sites, Merchant Center, or a CSV upload.
2. **The site sells things:** the crawl Arrowsterr already runs finds `Product` JSON-LD with an `offers` price on at least 3 pages, or a cart or checkout link (`/cart`, `/checkout`, `add-to-cart`). `Product` without a price doesn't count, because software sites use it too. `pageFacts.ts` already reads the JSON-LD types; it also keeps whether `offers` is there.
3. **Cards already name the brand:** the normal tracking runs return product items next to the answer at no extra cost (ChatGPT `chat_gpt_products`, AI Mode `ai_overview_shopping`), and `read()` in `dataforseo.ts` drops them today. It starts counting them per brand, and 3 cards with the brand's name in 14 days turn AI Shopping on.

None of the three means off. The job runs when a brand is added, after each site crawl, and once a week.

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

### 5.1 The order of checks

1. **Remembered ID.** If the card's `gid` (or ChatGPT `gpcid`) was matched before, it's that product. Confidence 1. This is how most cards are matched after the first week.
2. **Own store link.** If the card's link or seller domain is the brand's store domain and its path is a catalog product's `handle` or `url`, it's that product. Confidence 1, and its `gid` is remembered.
3. **Title, brand and price** (section 5.2), plus the picture when it's close (section 5.3).
4. **Google product lookup**, only for cards still in doubt: DataForSEO Merchant Google product info by `product_id` returns specifications that can include a GTIN or MPN, matched against the catalog's (cost check, used for under 5% of cards).

### 5.2 Title, brand and price

- **Normalize:** lowercase; unify units ("10 oz", "10oz"); split letters from digits ("glide3" to "glide 3"); drop sizes and colors (a fixed list plus every value of the catalog's size and color options); drop words like "men's", "women's", "shoe", "running" that every product shares (any word in over 40% of the catalog's titles).
- **Brand:** the card's title must start with, or contain, the brand or one of its aliases. Without the brand, it's not ours, however close the rest is.
- **Model words must agree exactly.** Words with a digit ("3", "v2", "gen 2") and the words that tell sibling products apart are required on both sides. For each product, its **telling words** are the words it has that its nearest siblings (titles sharing over 60% of words) don't: "wide" for Glide 3 Wide, "trail" for Trail X, "kids" for Kids Dash. A card missing a telling word, or carrying another sibling's, can't match.
- **Score:** TF-IDF cosine of the remaining words against each candidate in the same brand, weights from the catalog. The best candidate must beat the second by at least 0.15, or the card is in doubt.
- **Price sanity:** a card priced under half or over twice the product's catalog range lowers the score by 0.2 (bundles, refurbished, wrong product). It never raises it.

### 5.3 Picture

The card's `image_url` and the catalog's main image are reduced to a 64-bit difference hash (9 by 8 grayscale, adjacent-pixel comparison). A Hamming distance of 10 or under adds 0.1; over 24 subtracts 0.1. Pictures are fetched once per `gid` and cached.

### 5.4 The decision

| Score | Result |
|---|---|
| 0.90 and up, and clear of the runner-up | Matched. Its `gid` is remembered. |
| 0.60 to 0.90 | In doubt. Counts toward the **brand** (it carries the brand's name) but not toward any product, and goes to the Catalog panel's "Is this yours?" list. One click confirms (the `gid` is remembered) or rejects (remembered as not ours). |
| Under 0.60, brand present | The brand's product, not in the catalog (an old model, a bundle). Counts toward the brand. |
| No brand | A rival's or unknown. |

### 5.5 Rivals

A rival card's brand is the longest leading run of words that has started at least 3 different product titles across all runs (a dictionary built from the data), or the `seller` when the title starts with it. When that fails, Claude Haiku names the brand and the name must appear in the title, letter for letter, or it's left "Unknown". People can merge rival names ("Northpeak", "Northpeak Running").

### 5.6 Tests

Every rule has a test with the hard cases: "Glide 3" against "Glide 3 Wide" and "Glide 2"; a reseller title like "Stride Men's Glide 3 Running Shoe - Black/White Size 10 D(M) US"; a two-pack; "refurbished"; a lookalike from another brand with the same model words; a card with no brand; the same `gid` sold by three sellers; a remembered `gid` that a person later rejects.

---

## 6. The numbers

For prompt q, engine e and run r, let C(q, e, r) be its cards in order. Positions start at 1, in the order the answer shows them; with two blocks, the first block's cards come first. Sponsored cards (`chat_gpt_ad`, `ai_overview_paid`) are kept apart and never counted.

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
| `shop_cards` | Run, block, position, title, seller, store, price fields, rating, `gid`, `product_id`, `mid`, image, matched product, score, how it matched, brand, sponsored |
| `shop_ids` | `gid` to product, or to "not ours", with who decided and when |
| `shop_daily` | Brand, prompt, engine, day: runs, runs with cards, and per brand and product the counts behind section 6 |

`brands` gets `shop_mode` (`auto`, `on`, `off`), `shop_on` (what Auto decided) and `shop_reason` (section 3.1). Every row carries `brand_id`. The screens read `shop_daily`, so they stay fast.

---

## 10. The jobs

| Job | When | Does |
|---|---|---|
| `shop_detect` | When a brand is added, after each site crawl, weekly | Section 3.1: sets `shop_on` and `shop_reason` for brands on Auto |
| `shop_catalog_sync` | Daily, and on connect | Reads Shopify or Merchant Center into `shop_catalog` and the day's prices |
| `shop_runs_post` | 4 times a day | Posts the day's runs to DataForSEO's standard queue, tagged with run IDs (key prompt + engine + day + sample, so a retry never posts twice) |
| `shop_runs_collect` | Every 15 minutes | Collects finished tasks, saves the raw response, parses the cards |
| `shop_match` | After collect | Matches cards (section 5), fills `shop_daily`, raises alerts |
| `shop_rematch` | When a person confirms or rejects an ID, or the catalog changes | Matches the affected cards again and rebuilds those days |

All run on the existing jobs queue and worker.

---

## 11. Phases

| Phase | Weeks | Ships | Done when |
|---|---|---|---|
| 1. Real data first | 0.5 | 40 test prompts run on both engines; every raw response saved as a test fixture; parsers written against those fixtures | Every `chat_gpt_products` and `ai_overview_shopping` field in section 2 is confirmed from real responses, and the parser tests pass on all of them |
| 2. Catalog | 1 | Shopify `read_products`, Merchant Center sign-in, CSV, the Catalog side panel, `shop_detect` and the Settings switch | A Shopify store's 42 products load with variants folded in and daily prices; on 30 hand-labeled brands (15 that sell, 15 that don't), detection turns on every brand that sells and none that don't |
| 3. Matching | 1.5 | Section 5 with its tests, "Is this yours?" | On 200 hand-labeled cards: no wrong matches, and at least 85% matched without asking |
| 4. Numbers and screens | 1.5 | Sections 6 to 8, Overview, Products, Prompts, Stores, Sources, alerts | The numbers on 3 test brands match a hand count of the same runs |

About 4.5 weeks for one engineer.

---

## 12. Running cost

**Assumptions:** 1.3 brands per team; 30% of brands sell products and turn it on (20 brands at Beta, 195 at Growth); the other 70% run no shopping checks and add $0 (section 3.1); 40 prompts, 2 engines, 2 runs a day each; DataForSEO standard queue at $0.0012 per run for both endpoints; product lookups for under 5% of new cards.

| Line | Per brand a month | Beta (50 teams) | Growth (500 teams) |
|---|---|---|---|
| Card runs: 40 × 2 × 2 × 30 = 4,800 runs | $5.76 | $115 | $1,123 |
| Deep checks (about 10 a month, 20 runs each, on 1 engine) | $0.24 | $5 | $47 |
| Google product lookups (cost per product check) | ~$0.10 | $2 | $20 |
| Claude Haiku: prompt ideas, brand names, one-line reasons | ~$0.15 | $3 | $29 |
| Merchant Center and Shopify APIs | $0 | $0 | $0 |
| Servers: the jobs on the existing worker; raw responses about 40 MB per brand a month on the VPS disk | $0 | $0 | $0 |
| **Monthly total** | **~$6.25** | **~$125** | **~$1,219** |

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
