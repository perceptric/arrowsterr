---
slug: robots-txt-tester
target_search: robots.txt tester
seo_title: Robots.txt tester: check Google and AI bots | Arrowsterr
meta_description: Test if a URL is allowed or blocked by robots.txt for Googlebot, Bingbot and AI crawlers like GPTBot. See the exact line that decides it. Free to use.
h1: Robots.txt Tester
---

## What is a robots.txt tester?

A robots.txt tester checks whether a crawler is allowed to visit a page on your site. It reads your robots.txt file, finds the rules that apply to a crawler like Googlebot or GPTBot, and tells you if a path is allowed or blocked. A good tester also shows the exact line that made the decision.

Your robots.txt file is a short text file at the root of your site. It tells crawlers which parts of the site they may visit. Search engines read it before they crawl. So do most AI crawlers.

The file looks simple, and that's the trap. A single line can block your whole site from Google. A group written for one bot can cancel the general rules you thought every bot would follow. These mistakes rarely show up as errors. Your pages just stop getting crawled, and you find out weeks later when traffic drops.

AI crawlers have raised the stakes. Many sites now block some AI bots and allow others. Those choices decide whether ChatGPT or Perplexity can read your pages when they answer questions. Getting them right means knowing which line applies to which bot.

This free tool gives you a clear answer for any path, for search engines and the main AI crawlers at once. You can edit the file on the page and see every answer change as you type.

## How to use the robots.txt tester

You can test a live site or paste in a file you're still writing.

1. **Enter a domain, or paste your robots.txt.** Type a domain like `yoursite.com` and the tool fetches `https://yoursite.com/robots.txt`. Or paste the text of a file to test it before it goes live.

   [SCREENSHOT: the form with the domain field and the paste box]

2. **Enter a URL path.** Type the path you want to test, like `/blog/` or `/products/shoes?color=red`. Start it with a slash.

   [SCREENSHOT: the path field filled in]

3. **Pick a crawler.** Choose the bot you care most about, like Googlebot or GPTBot.

   [SCREENSHOT: the crawler picker open]

4. **Run the test.** You get allowed or blocked for that path and that bot, with the exact line and line number that decides it.

   [SCREENSHOT: the main verdict with the deciding line highlighted]

5. **Check every crawler at once.** Below the main answer, the tool shows the same path tested for search engines and AI crawlers.

   [SCREENSHOT: the table of results for every crawler]

6. **Read the warnings.** The tool flags problems in the file, like rules Google ignores or a block on the whole site.

   [SCREENSHOT: the warnings list]

7. **Edit and re-test.** Change the text right on the page. Every result updates at once in your browser. Copy the fixed file when you're happy with it.

   [SCREENSHOT: the file being edited with results updating]

The tool is free. Fetching a live robots.txt is limited to 20 a day. Testing pasted text, and every re-test after an edit, is unlimited because it runs in your browser.

## How it works

The tool follows RFC 9309, the internet standard for robots.txt, and Google's own documented rules for reading the file.

### Where the file lives

A crawler looks for robots.txt at the root of each host, like `https://yoursite.com/robots.txt`. The file only covers that host and protocol. `blog.yoursite.com` needs its own file, and so does `http://` if you still serve it.

### How the file is built

A robots.txt file is made of groups. Each group starts with one or more `User-agent` lines naming the crawlers it applies to. Then come the rules: `Disallow` lines for paths the crawler shouldn't visit, and `Allow` lines for exceptions. `User-agent: *` is the group for every crawler that has no group of its own.

`Sitemap` lines can go anywhere in the file. They don't belong to any group.

### How a crawler picks its group

A crawler follows only one group: the most specific one that names it. If your file has a `User-agent: Googlebot` group, Googlebot follows that group and ignores the `*` group completely.

This catches a lot of people out. If you add a Googlebot group with one rule, Googlebot no longer follows any of your `*` rules. Copy the general rules into the specific group if you still want them to apply.

If no group names the crawler, it follows the `*` group. If there's no `*` group either, it may crawl everything.

### How a crawler picks its rule

Inside its group, a crawler looks at every rule whose path matches the start of the URL path. Then:

- **The longest matching rule wins.** `Allow: /shop/sale` (10 characters) beats `Disallow: /shop` (5 characters) for `/shop/sale/shoes`.
- **Allow wins a tie.** If an Allow rule and a Disallow rule match with the same length, the page is allowed.
- **No matching rule means allowed.** A crawler can visit any path its group doesn't block.

Paths are case-sensitive, so `/Blog` and `/blog` are different. Two special characters help with patterns: `*` matches any run of characters, and `$` marks the end of the URL. `Disallow: /*.pdf$` blocks every URL that ends in `.pdf`.

### What happens when the file can't be read

The server's response to the robots.txt request matters too:

| Response | What Google does |
|---|---|
| 200 OK | Reads the file and follows it |
| 4xx, like 404 Not Found | Treats the site as having no rules, and may crawl everything |
| 5xx server error | Treats the whole site as blocked for a while |

A broken robots.txt that returns a server error can stop Google crawling your site. A missing one does no harm.

### What Google ignores

Google reads only the first 500 KiB of a robots.txt file. Anything after that is ignored. Google also ignores some lines that other guides still recommend:

- **noindex** in robots.txt. Google stopped supporting it in 2019. Use a `noindex` meta tag or header on the page.
- **crawl-delay**. Google ignores it. Some other crawlers read it.

Google generally caches your robots.txt for up to 24 hours. A change you make today may take a day to reach Googlebot.

### Testing in your browser

The tool fetches the live file once, on our server. All the matching then runs in your browser. That's why edits re-test instantly with no new fetch.

## How to read your results

### The verdict

| What you see | What it means |
|---|---|
| Allowed, with a line | An Allow rule is the longest match for this path |
| Allowed, with no line | No rule in the crawler's group matches this path |
| Blocked, with a line | A Disallow rule is the longest match for this path |

The line number points to the exact rule. Click or find it in the file to see the group it belongs to.

### The crawler table

The tool tests your path for these crawlers at once, and more:

| Crawler | Who runs it | What it's for |
|---|---|---|
| Googlebot | Google | Google Search, including AI Overviews and AI Mode |
| Bingbot | Microsoft | Bing search, which also feeds Copilot |
| GPTBot | OpenAI | Collecting data to train OpenAI's models |
| OAI-SearchBot | OpenAI | Finding pages to show in ChatGPT search |
| ChatGPT-User | OpenAI | Fetching a page when a ChatGPT user asks for it |
| ClaudeBot | Anthropic | Collecting data to train Claude |
| Claude-SearchBot | Anthropic | Finding pages for Claude's search answers |
| PerplexityBot | Perplexity | Building Perplexity's search index |
| Google-Extended | Google | A control token for Gemini's use of your content, with no separate crawler |
| Applebot-Extended | Apple | A control token for Apple's AI training, with no separate crawler |
| CCBot | Common Crawl | An open web archive used by many AI projects |

Look for rows that surprise you. A common one: Googlebot is allowed but OAI-SearchBot is blocked by a `*` rule you forgot about.

### The warnings

| Warning | Why it matters | What to do |
|---|---|---|
| Rules before any user-agent | They belong to no group, so crawlers may ignore them | Move them under a `User-agent` line |
| noindex or crawl-delay for Google | Google ignores these lines | Use a noindex meta tag, and remove the lines if Google is your main concern |
| File over 500 KiB | Google stops reading at 500 KiB | Shorten the file, and use wildcards in place of long lists |
| Relative sitemap address | Sitemap lines need a full address | Write `https://yoursite.com/sitemap.xml` in full |
| Site-wide block | `Disallow: /` blocks the whole site for that group | Remove it unless you mean to hide the whole site |

### The sitemaps

The tool lists every `Sitemap` line in the file. Check each address opens. A sitemap address that returns an error is a wasted hint.

## A worked example

Here's a small, made-up file for acme-example.com. Line numbers are on the left.

```text
1   User-agent: *
2   Disallow: /checkout/
3   Disallow: /search
4   Allow: /search/help
5
6   User-agent: GPTBot
7   Disallow: /
8
9   User-agent: Googlebot
10  Disallow: /checkout/
11  Disallow: /drafts/
12
13  Sitemap: https://acme-example.com/sitemap.xml
```

Now test the path `/search?q=shoes`:

| Crawler | Result | Deciding line | Why |
|---|---|---|---|
| Googlebot | Allowed | None | Googlebot follows its own group (lines 9 to 11), which has no `/search` rule |
| Bingbot | Blocked | Line 3 | Bingbot has no group, so it follows `*`, where `Disallow: /search` matches |
| GPTBot | Blocked | Line 7 | GPTBot's group blocks everything |
| OAI-SearchBot | Blocked | Line 3 | No group of its own, so it follows `*` |

Two lessons are hiding here. First, the owner probably wanted Googlebot to skip search pages too. Because Googlebot has its own group, line 3 never applies to it. The fix is to add `Disallow: /search` to the Googlebot group.

Second, look at OAI-SearchBot. The owner blocked GPTBot on purpose to keep content out of training. But the general `/search` block also keeps OAI-SearchBot off those pages. That may be fine for search pages. Run the same check on `/products/` to be sure your product pages are open to the bots you want.

Test `/search/help/returns` for Bingbot and you get allowed, from line 4. Both line 3 and line 4 match, and `Allow: /search/help` is longer.

Now a real run. [EDITOR: run the tool on a real, well-known domain. Paste the verdict for one path, the crawler table and any warnings here.]

[SCREENSHOT: the full result for the real example]

[EDITOR: point out one result that would surprise the site owner, like an AI crawler blocked by a general rule, and the one-line fix.]

## What to do with your results

### Make sure your important pages are open

Test the paths that matter most: your home page, your main product or service pages, your blog and your pricing page. Each should be allowed for Googlebot and Bingbot.

If one is blocked, find the deciding line and fix it. Edit it on the page, re-test until the answer is right, then copy the fixed file to your server.

### Decide on each AI crawler

Look at the AI rows in the table and decide what you want. Many sites now treat training bots and search bots differently. They block GPTBot or ClaudeBot to keep content out of model training, and allow OAI-SearchBot and Claude-SearchBot so their pages can appear in AI answers.

There's no single right setup. Just make each block a deliberate choice. The [AI Crawler Checker](/free-tools/ai-crawler-checker/) goes further: it shows which AI bots can reach your site, including blocks at the firewall or CDN that robots.txt can't show.

### Repeat your general rules in every named group

If you add a group for a specific bot, that bot drops your `*` rules. Copy any general rules you still want into the new group. Then test the same paths for that bot to confirm.

### Use noindex to keep pages out of search

Robots.txt only controls crawling. A blocked page can still show up in Google if other sites link to it, usually with no description. To keep a page out of search results, allow crawling and add a `noindex` meta tag to the page. Google has to crawl the page to see that tag.

### Fix the warnings

Work through the warnings list. Move stray rules under a user-agent. Delete noindex lines and replace them with meta tags on the pages. Write sitemap addresses in full. Trim the file if it's over 500 KiB. Each fix takes a minute.

Then make sure the file returns a 200 status. A robots.txt that returns a 5xx error can stop Google crawling your whole site for a while.

### Check after every deploy

Robots.txt often breaks during a launch. A staging site's `Disallow: /` gets copied to the live site, and nobody notices until traffic falls.

Run this tool on your live domain after each big release. To have it watched for you, AI Visibility in the [Arrowsterr app](https://app.arrowsterr.com/) runs a daily check and flags a new block.

### Clean up the rest of the crawl path

Robots.txt is the first gate. After that, crawlers follow your links. Find dead links with the [Broken Link Checker](/free-tools/broken-link-checker/) and slow pages with the [Page Speed Checker](/free-tools/page-speed-checker/).

## Common mistakes

### Leaving a staging block on the live site

`User-agent: *` with `Disallow: /` is common on staging sites. When it gets copied to the live site, every crawler is blocked.

**Fix:** test your home page after each launch. The tool's site-wide block warning catches this.

### Thinking robots.txt hides a page

Blocking a page in robots.txt doesn't remove it from Google. If other pages link to it, Google can still list the address.

**Fix:** use a `noindex` meta tag and leave the page crawlable. For private content, use a password.

### Using noindex or crawl-delay for Google

Google ignores both lines in robots.txt. They give a false sense of control.

**Fix:** use a noindex meta tag for indexing. Google adjusts its crawl rate to how your server responds.

### Forgetting that named groups replace the `*` group

You add `User-agent: Googlebot` with one rule, and Googlebot stops following everything in `*`.

**Fix:** repeat your general rules inside each named group, then test each bot.

### Getting the case wrong

`Disallow: /Admin/` doesn't block `/admin/`. Paths in robots.txt are case-sensitive.

**Fix:** copy paths straight from your real URLs, and test them.

### Blocking CSS and JavaScript files

Some older files block folders like `/assets/` or `/js/`. Google needs those files to see your page the way people do.

**Fix:** allow crawlers to fetch the files your pages need to render.

### Putting robots.txt in the wrong place

A file at `yoursite.com/files/robots.txt` does nothing. Crawlers only look at the root.

**Fix:** serve the file at `https://yoursite.com/robots.txt`, and add one for each subdomain.

### Blocking every AI bot without checking

A blanket block on AI crawlers can keep you out of AI search answers too, because some of those bots fetch pages for live answers.

**Fix:** decide bot by bot. Block training bots if you want, and check the search bots separately.

## Glossary

**Robots.txt.** A text file at the root of a site that tells crawlers which paths they may visit. It's defined in RFC 9309.

**RFC 9309.** The internet standard for robots.txt, published in 2022. It wrote down rules crawlers had followed for decades.

**Crawler.** A program that visits web pages to read them. Also called a bot or spider.

**User-agent.** The name a crawler uses for itself, like Googlebot or GPTBot. In robots.txt, a `User-agent` line starts a group.

**Group.** A set of rules under one or more `User-agent` lines. A crawler follows only the most specific group that names it.

**Disallow.** A rule that tells a crawler not to visit paths that start with the given value.

**Allow.** A rule that lets a crawler visit a path inside a blocked folder. When an Allow and a Disallow match with the same length, Allow wins.

**Wildcard.** The `*` character, which matches any run of characters in a path. `$` marks the end of a URL.

**Crawling.** Visiting and reading a page. Robots.txt controls crawling.

**Indexing.** Storing a page so it can appear in search results. A `noindex` tag controls indexing.

**Sitemap.** A file that lists the URLs you want crawled. You can point to it from robots.txt with a `Sitemap` line.

**Product token.** A name like Google-Extended that you can use in robots.txt to control how your content is used, even though no crawler by that name visits your site.

## The AI search angle

Robots.txt is now one of the main ways you control your presence in AI answers. Each AI company runs its own crawlers, and each one reads your file.

The key is to know which bot does which job:

- **Training bots** like GPTBot and ClaudeBot collect content to train models. Blocking them keeps future training runs off your pages. It doesn't remove what was collected before.
- **Search bots** like OAI-SearchBot and PerplexityBot find pages to cite in AI search answers. Blocking them can keep your pages out of those answers.
- **User bots** like ChatGPT-User fetch a page when a person asks the assistant to read it.
- **Google's AI features** follow Googlebot. AI Overviews and AI Mode are part of Google Search. Google-Extended is a separate token for Gemini's use of your content, and Google says it doesn't affect Search.

A setup many sites choose is to block training bots and allow search bots. Whatever you choose, test it here for the paths that matter.

Robots.txt isn't the only gate. A firewall or CDN can block AI bots before they ever read your file. The [AI Crawler Checker](/free-tools/ai-crawler-checker/) tests real access for each AI crawler. Once the bots can get in, make sure your pages are worth citing with the [AI Answer-Ready Checker](/free-tools/ai-answer-ready-checker/). You can also list your best pages for AI tools with the [llms.txt Generator](/free-tools/llms-txt-generator/).

## FAQ

### What is robots.txt used for?

Robots.txt tells crawlers which parts of your site they may visit. Search engines and most AI crawlers check it before they crawl. It's a request, so well-behaved bots follow it and bad bots may not.

### How do I test my robots.txt file?

Enter your domain in this tool, add a path and pick a crawler. You'll see whether the path is allowed or blocked, and the exact line that decides it. You can also paste a file to test it before it goes live.

### How do I check if Google can crawl a page?

Enter the page path and pick Googlebot. If it's blocked, the tool shows the line responsible. You can also use URL Inspection in Google Search Console to see how Google sees the live page.

### Does Google Search Console still have a robots.txt tester?

Search Console now has a robots.txt report in place of its old tester. It shows the robots.txt files Google found and any fetch problems. This tool lets you test any path for any crawler, including AI bots.

### Does robots.txt stop a page from being indexed?

No. It stops crawling, and a blocked page can still be indexed if other sites link to it. To keep a page out of Google, allow crawling and use a `noindex` meta tag.

### Does Google support noindex in robots.txt?

No. Google stopped supporting noindex in robots.txt in 2019. Put a noindex meta tag or HTTP header on the page.

### Does Google follow crawl-delay?

No. Google ignores the crawl-delay line. Some other crawlers do read it.

### Which rule wins when Allow and Disallow both match?

The longest matching rule wins. If an Allow rule and a Disallow rule match with the same length, Allow wins. That's the rule in both RFC 9309 and Google's docs.

### What happens if my robots.txt returns a 404?

Google treats a missing robots.txt as no rules and may crawl everything. That's harmless if you didn't mean to block anything. A 5xx server error is worse: Google treats the site as blocked for a while.

### How big can a robots.txt file be?

Google reads the first 500 KiB and ignores the rest. Most files are far smaller. If yours is near the limit, use wildcards to shorten it.

### How do I block ChatGPT from my site?

Add a group for each OpenAI bot you want to block, like `User-agent: GPTBot` with `Disallow: /`. GPTBot is for training and OAI-SearchBot is for ChatGPT search, so decide on each one. Then test both here.

### Should I block AI crawlers?

It depends on your goals. Many sites block training bots and allow search bots so they can still appear in AI answers. Check what each bot does before you block it.

### Does blocking Google-Extended remove me from Google?

No. Google-Extended controls Gemini's use of your content, and Google says it doesn't affect Google Search. AI Overviews and AI Mode follow your Googlebot rules.

### How long does a robots.txt change take to work?

Google generally caches robots.txt for up to 24 hours. Other crawlers have their own schedules. Test your file here right after you change it, so you know the rules are right before the bots return.

## Related tools

- [AI Crawler Checker](/free-tools/ai-crawler-checker/): see which AI bots can reach your site, including firewall blocks.
- [llms.txt Generator](/free-tools/llms-txt-generator/): point AI tools to your most useful pages.
- [Broken Link Checker](/free-tools/broken-link-checker/): find dead links that waste a crawler's time.

## Keep reading

- [EDITOR: link to post about which AI crawlers to block and which to allow]
- [EDITOR: link to post about the difference between crawling and indexing]
- [EDITOR: link to post about robots.txt mistakes after a site launch]
