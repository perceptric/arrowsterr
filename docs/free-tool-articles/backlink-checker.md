---
slug: backlink-checker
target_search: backlink checker
seo_title: Backlink Checker: Free Tool to Check Backlinks | Arrowsterr
meta_description: Check backlinks for any website or page for free. See live backlinks, referring domains, dofollow share and the top 20 links with anchor text.
h1: Backlink Checker
---

## What is a backlink checker?

A backlink checker finds the links from other websites that point to a site or a page. It shows how many live backlinks there are, how many different websites they come from, which ones pass ranking value and which pages they point to. Use it to judge link strength and find new link chances.

A backlink is a link on someone else's site that points to yours. If a news site writes about your product and links to your homepage, that is a backlink. If a blogger links to your guide as a source, that is another.

Backlinks matter because Google uses links as a ranking signal. Its original ranking system, PageRank, was built on the idea that a link works like a vote. Google's systems have grown far more complex since then, and links still count. A page with strong, relevant links from trusted sites usually has an easier time ranking than an identical page with none.

Links also matter on their own. They send visitors, and they reveal how your competitors earned their spot in Google.

Two numbers sit at the center of every backlink check:

- **Backlinks:** the total count of links pointing to the target.
- **Referring domains:** the number of different websites those links come from.

The second one usually matters more. 500 links from one site often count for less than 50 links from 50 different sites. One site can link to you from every page of its footer, which adds thousands of backlinks and only one referring domain.

## How to use the Backlink Checker

The tool checks a whole website or a single page. What you type decides which.

1. **Choose what to check.** Type a bare domain like `example.com` to check every link to the whole site. Type a full page address like `https://example.com/blog/guide` to check links to that one page.
   `[SCREENSHOT: the form with a domain typed in, and a second shot with a page URL]`

2. **Run the check.** Press "Run check" and complete the bot check if one appears. A progress bar shows while the data loads.
   `[SCREENSHOT: the progress bar]`

3. **Read the summary.** At the top: total live backlinks, referring domains and the share of dofollow and nofollow links.
   `[SCREENSHOT: the summary numbers]`

4. **Look at the breakdowns.** One chart splits links by type. Another splits referring domains by top-level domain, like .com, .org or .edu.
   `[SCREENSHOT: the link type and top-level domain breakdowns]`

5. **Go through the top 20 backlinks.** The table lists the strongest link from each of 20 different sites. Each row shows the linking page, the anchor text, the page it points to, follow or nofollow, the date it was first seen and the linking domain's rank.
   `[SCREENSHOT: the top 20 backlinks table]`

6. **Check authority next.** For the same domain, the [Domain Authority Checker](/free-tools/domain-authority-checker/) gives a single strength score you can compare across sites.
   `[SCREENSHOT: the link to the Domain Authority Checker under the result]`

You can run 3 checks a day for free. Results are saved for 7 days. Checking the same domain or page again within that time shows the saved result and does not use a check.

## Where the numbers come from

The data comes from the DataForSEO Backlinks index. DataForSEO runs its own web crawler. It visits pages across the web, records every link it finds and stores them in a large database. When you run a check, the tool asks that database for links pointing to your target.

**How fresh is it?** The crawler keeps visiting pages, so the index changes all the time. New links appear once the crawler finds the page they sit on. Links that get removed drop out once the crawler visits that page again and sees them gone. That can take days for busy sites and much longer for small, rarely updated ones.

`[EDITOR: confirm DataForSEO's stated recrawl and update rate for the Backlinks index and add it here]`

**How complete is it?** No backlink index sees every link. That includes Google's. Here is why counts are always partial:

- **The web is too big.** No crawler visits every page. Small sites and deep pages get crawled less often.
- **Some sites block crawlers.** A robots.txt rule or a firewall can keep a crawler out, so links on those sites go unseen.
- **Some links need JavaScript or a login.** Links inside apps, private forums or members-only pages are often missed.
- **Spam gets filtered.** Indexes drop or hide low-quality pages, and different tools filter in different ways.

That is why two backlink tools give two different totals for the same site. Neither is wrong. Each one counts what its own crawler found. Pick one tool and stick with it when you compare sites or track change over time.

**What about Google's own data?** Google Search Console has a Links report for your own site. It shows a sample of the links Google knows about, straight from Google. It is a good cross-check. It only covers sites you own. A backlink checker covers any site, including your competitors.

## How to read your results

Each number tells you something different about a link profile.

**Total live backlinks.** Every link the index currently sees pointing to the target. A raw count. It can swing a lot from a single site that adds or removes a sitewide link.

**Referring domains.** The number of separate websites linking. This is the better guide to how widely a site is referenced.

**Dofollow and nofollow share.** Dofollow links are normal links that can pass ranking value. Nofollow links carry a tag asking search engines not to pass value. Since 2019, Google treats nofollow as a hint, so it may still use some of them. Most natural link profiles have both kinds.

**Link types.** How the links are built. Most are plain text links. Others can be image links or redirects, among other kinds. `[EDITOR: confirm the exact type labels shown in the result]`

**Top-level domains.** Where referring domains sit by ending, such as .com, .org, .edu, .gov or a country ending like .de. A spread that matches your market is normal. A large share from unrelated country endings can point to spam.

**Top 20 backlinks.** One link per site, strongest first. For each:

- **Linking page:** where the link lives.
- **Anchor text:** the clickable words.
- **Target page:** the page on your site it points to.
- **Follow or nofollow:** whether it asks to pass value.
- **First seen:** when the index first found it.
- **Domain rank:** DataForSEO's score for the linking site's strength, based on its own links. Higher is stronger. `[EDITOR: confirm the scale shown, for example 0 to 1000]`

The ranges below are rules of thumb. A brand-new site and a 20-year-old publisher can't be judged on one scale, and some niches link far more than others. Compare against 2 or 3 sites that rank for the same keywords as you.

| Signal | Good | Average | Weak |
|---|---|---|---|
| Referring domains vs top-ranking rivals | Equal to or above them | Within about half | Far below them |
| Backlinks per referring domain | Low to moderate | High, from a few sitewide links | Very high, from one or two sites |
| Anchor text in the top 20 | Mostly brand names and page titles | Some keyword-rich anchors | Mostly exact-match keywords |
| Dofollow share | A clear majority, with some nofollow | Almost all one kind | Almost no dofollow at all |
| Topic of linking sites | Mostly related to yours | Mixed | Mostly unrelated |

`[EDITOR: check these ranges against real runs on 5 sites in different niches]`

The anchor text row deserves a second look. Natural links use your brand name or plain words like "this guide". If most of your anchors are your exact target keyword, it can look like someone built them on purpose. Google's spam policies warn against links made to manipulate rankings.

## A worked example

Here is a check on a real site. We ran `[EDITOR: domain, for example hubspot.com]` as a whole domain on `[EDITOR: date]`.

`[SCREENSHOT: full result for the example domain]`

**Summary.** The index found `[EDITOR: total backlinks]` live backlinks from `[EDITOR: referring domains]` referring domains. That is about `[EDITOR: backlinks divided by referring domains]` links per site. `[EDITOR: dofollow share]` of links are dofollow.

**Link types and endings.** Most links are `[EDITOR: top link type]`. By ending, `[EDITOR: top endings with shares]`.

`[SCREENSHOT: the breakdown charts for the example]`

**Top 20.** The strongest link comes from `[EDITOR: linking domain]`, pointing to `[EDITOR: target page]` with the anchor text `[EDITOR: anchor]`. `[EDITOR: one line on what kinds of sites appear in the top 20, for example news, universities, software directories]`.

**Where the links point.** Of the top 20, `[EDITOR: number]` point to the homepage and `[EDITOR: number]` point to deeper pages, mostly `[EDITOR: page type, for example free tools or research reports]`.

`[SCREENSHOT: the top 20 table for the example]`

**What it tells us.** `[EDITOR: 2 or 3 sentences on what earned this site its strongest links]`.

**What a rival could do.** `[EDITOR: 2 concrete moves, for example publish a similar research page; pitch the same directories]`.

Then run the same domain through the [Domain Authority Checker](/free-tools/domain-authority-checker/) to see its overall strength score. `[EDITOR: add the score]`.

## What to do with your results

Here are 7 moves, starting with the ones that protect what you already have.

### Fix links that point to dead pages

Look at the target page column in the top 20. Open each target. If one returns a 404 or redirects somewhere odd, you are wasting a strong link.

Set up a 301 redirect from the dead page to the closest live page. The link starts working for you again, and you didn't have to ask anyone. For a full sweep of dead pages and redirect chains on your own site, run the [Broken Link Checker](/free-tools/broken-link-checker/).

### Learn what earns links in your market

Run your top 2 or 3 competitors. In each top 20, look at which of their pages get linked.

You will often see a pattern. Original research, free tools, templates and clear definitions tend to attract links. Product pages rarely do. If a rival's best links all point to a yearly survey, the market wants data. Plan a page that gives people something worth citing.

### Turn competitor links into an outreach list

The top 20 shows the sites that already link to pages like yours. Those sites cover your topic and are open to linking out.

Visit each linking page. Read why it linked. If it's a list of resources, a roundup or a "best tools" post, your page may fit too. Write a short, specific note to the author explaining what your page adds. Skip any site that only lists paid placements.

### Check that your anchor text looks natural

Read the anchor text column for your own site. Most anchors should be your brand name or plain descriptive words.

If you see many exact-match keyword anchors from sites you don't know, look closer. They may be left over from an old SEO campaign. If they come from obvious spam sites and you have a manual action in Search Console, Google's disavow tool exists for that case. Most sites never need it.

### Point strong links toward pages that need help

Your strongest links often land on the homepage. Your money pages may have none.

You can pass some of that strength along with internal links. Add clear links from your most-linked pages to the pages you want to rank. Use descriptive anchor text. Then watch those pages' rankings over the next few weeks with the [Keyword Rank Checker](/free-tools/keyword-rank-checker/), or set them up in the [Arrowsterr app](https://app.arrowsterr.com/) and track this daily.

### Vet a site before you swap or buy anything

Before you trade a guest post or accept a partnership, run the other site through the checker. Look at its referring domains, its link topics and its endings.

A site with many links from unrelated, low-quality domains is a risk to be tied to. Also run it through the [Website Traffic Checker](/free-tools/website-traffic-checker/). Real sites with real readers have some organic traffic. Link farms often have almost none.

### Check one page, then compare it with the winner

Search your target keyword and note the #1 result. Run its exact URL through the backlink checker. Then run your own page.

If the winning page has 40 referring domains and yours has 2, content changes alone may not close the gap. If the counts are close, the difference is more likely the content itself. Either way, you now know which kind of work to do. Check the keyword's overall difficulty with the [Keyword Difficulty Checker](/free-tools/keyword-difficulty-checker/) too.

## Common mistakes

Each of these leads to wasted work or wrong conclusions.

### Chasing total backlinks

A single sitewide footer link can add thousands of backlinks overnight. It is still one site.

**Fix:** Track referring domains as your main number. Treat total backlinks as background.

### Thinking nofollow links are worthless

Nofollow links can send real visitors. Google has said it treats them as hints. A natural profile has plenty of them.

**Fix:** Judge a link by the site and the page it is on first. The tag is a secondary detail.

### Expecting every link to show up

A link you know exists may be missing. The crawler may not have reached that page yet, or the site may block crawlers.

**Fix:** Give new links a few weeks. For your own site, cross-check with the Links report in Search Console.

### Comparing totals across different tools

Tool A says 12,000 links. Tool B says 4,000. Both counted what their own crawler found.

**Fix:** Use one tool for all your comparisons and over time.

### Checking the domain when you meant the page

A site-wide check tells you about the whole site. It can't tell you why one article ranks.

**Fix:** For a ranking question, enter the full page URL. For a strength question, enter the domain.

### Buying links to close the gap

Paid links that pass ranking value break Google's spam policies. They can lead to links being ignored or a manual action.

**Fix:** Build pages people want to cite, then reach out to the sites that already link to similar ones.

### Disavowing in a panic

Every site gets spammy links it never asked for. Google ignores most of them.

**Fix:** Only consider the disavow tool when you have a manual action or know of paid links you built in the past.

## Glossary

**Backlink:** A link on another website that points to your site or page.

**Referring domain:** A separate website that links to you at least once. 10 links from one site count as 1 referring domain.

**Anchor text:** The clickable words of a link. It tells readers and search engines what the target page is about.

**Dofollow link:** A normal link with no tag limiting it. It can pass ranking value.

**Nofollow link:** A link with `rel="nofollow"`, asking search engines not to pass ranking value. Google treats it as a hint.

**Sponsored and UGC:** Link tags Google added in 2019. `rel="sponsored"` marks paid links. `rel="ugc"` marks links in user content like comments.

**Top-level domain (TLD):** The ending of a domain, such as .com, .org or .de.

**Sitewide link:** A link that appears on every page of a site, often in the footer or sidebar.

**First seen:** The date the index first found a link.

**Domain rank:** DataForSEO's strength score for a site, based on the links pointing to it.

**Link equity:** The ranking value a link may pass from one page to another.

**Disavow:** A Google Search Console tool that asks Google to ignore certain links to your site.

## The AI search angle

Links were built for a web of pages and clicks. AI answers add a new question: when someone asks ChatGPT or Google's AI about your topic, which sources does it trust?

Nobody outside these companies knows exactly how they choose sources. You can still observe what they cite, and that tells you a lot.

**Google AI Overviews.** The AI-written summary at the top of many Google searches cites a handful of pages. Those pages are often ones that already rank well, and strong links help pages rank. Check which sites an Overview cites for your keyword with the [AI Overview Checker](/free-tools/ai-overview-checker/). Those cited sites make a good outreach list, since a mention there puts you next to the sources Google picks.

**Google AI Mode.** AI Mode writes a longer answer and lists more sources. The [Keyword Rank Checker](/free-tools/keyword-rank-checker/) shows whether AI Mode cites your domain for a keyword and which other sites it cites.

**ChatGPT.** ChatGPT often names brands without linking to them. What it says reflects the pages it has read or found in search. If many trusted sites mention your brand when they discuss your category, you have a better shot at being named. That means unlinked mentions start to matter too. The [ChatGPT Rank Checker](/free-tools/chatgpt-rank-checker/) tells you whether ChatGPT names you for a buyer question and who it names instead.

One technical point comes first. If your robots.txt or firewall blocks AI crawlers, none of this helps. Test your site with the [AI Crawler Checker](/free-tools/ai-crawler-checker/).

In the [Arrowsterr app](https://app.arrowsterr.com/), AI Visibility shows the sources AI answers cite for your topics, checked every day. That gives you a second outreach list next to your backlink data.

## FAQ

### How do I check backlinks to my website?

Enter your domain in the Backlink Checker and run the check. You'll see total live backlinks, referring domains, the dofollow share and your top 20 links. For a second view straight from Google, open the Links report in Search Console.

### Is this backlink checker free?

Yes. You get 3 checks a day with no sign-up. Results are saved for 7 days, and checking the same domain or page again in that time is free.

### Can I check a competitor's backlinks?

Yes. Enter any public domain or page. That is one of the most useful ways to use the tool, since it shows how rivals earned their links.

### What is the difference between backlinks and referring domains?

Backlinks are every individual link. Referring domains are the separate websites those links come from. One site linking 100 times counts as 100 backlinks and 1 referring domain.

### Why doesn't the tool show all my backlinks?

No index sees every link on the web. The crawler may not have reached a page yet, or the site may block crawlers. New links can take a while to appear.

### Why do different backlink checkers show different numbers?

Each tool runs its own crawler and its own spam filters. They find and keep different links. Use one tool consistently when you compare.

### Do nofollow links help SEO?

Google treats nofollow as a hint, so some may still count. They can also send real visitors and show that people talk about you. A natural profile includes both kinds.

### How many backlinks do I need to rank?

There is no fixed number. It depends on the keyword and the sites already ranking. Check the backlinks of the current top results and aim to match their referring domains.

### What makes a backlink good?

A good backlink comes from a real, trusted site on a related topic, on a page people read. It uses natural anchor text and points to a relevant page. One such link can be worth more than many weak ones.

### Can bad backlinks hurt my site?

Google says it ignores most spammy links. Problems mostly arise when a site has built or bought manipulative links. In that case Google may take manual action, which shows in Search Console.

### Should I disavow spammy backlinks?

Most sites never need to. Google suggests the disavow tool mainly when you have a manual action or know of paid links you built. Removing good links by mistake can hurt.

### Can I check backlinks to a single page?

Yes. Enter the full page address instead of the domain. The tool then shows links to that one page only.

### What does "first seen" mean?

It is the date the index first found that link. It helps you spot new links and see when a site started linking to you.

### What is domain rank in the results?

It is DataForSEO's strength score for the linking site, based on the links pointing to it. Use it to sort which links matter most. It is separate from Google's own systems.

## Related tools

- [Domain Authority Checker](/free-tools/domain-authority-checker/)
- [Broken Link Checker](/free-tools/broken-link-checker/)
- [Keyword Difficulty Checker](/free-tools/keyword-difficulty-checker/)

## Keep reading

- [EDITOR: link to post about how to build backlinks without buying them]
- [EDITOR: link to post about dofollow vs nofollow links]
- [EDITOR: link to post about link reclamation and fixing dead pages]
