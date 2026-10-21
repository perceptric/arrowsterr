---
slug: schema-generator
target_search: schema markup generator
seo_title: Schema markup generator: free JSON-LD builder | Arrowsterr
meta_description: Build JSON-LD schema for FAQ, Article, Product, Organization and LocalBusiness. See missing Google fields as you type, then copy or download the code.
h1: Schema Markup Generator
---

## What is a schema markup generator?

A schema markup generator turns facts about a page into structured data that search engines can read. You fill in fields like a business name or a product price. The tool writes the code for you in JSON-LD, the format Google recommends. You paste that code into your page.

Search engines are good at reading text. They still have to guess at what some text means. Is "4.8" a rating or a price? Is "Mon to Fri, 9 to 5" a store's hours or a schedule for an event? Schema markup removes the guesswork. It labels each fact with a type from schema.org, a shared list of types that Google and Bing both use.

That clarity matters in 2 ways. First, Google uses structured data to decide whether a page can show a rich result, like product prices or star ratings in the search listing. Second, clear facts are easier for any machine to reuse, including the systems behind AI answers. A page that states its business name and opening hours in plain markup leaves less room for mistakes.

Writing JSON-LD by hand is fiddly. One missing comma breaks the whole block. Field names are case-sensitive. Google's rules about which fields it needs change by type. A generator handles the syntax so you can focus on getting the facts right.

This free tool builds 5 types: FAQ, Article, Product, Organization and LocalBusiness. It checks your fields against Google's structured data docs as you type, and it can fill the form from a live page.

## How to use the schema markup generator

You can build schema from scratch, or let the tool read your page first.

1. **Pick a schema type.** Choose FAQ, Article, Product, Organization or LocalBusiness. Pick the type that matches the main thing on the page. A product page gets Product. Your About page often gets Organization.

   [SCREENSHOT: the type picker with the 5 types]

2. **Fill the fields, or fill from your page.** Type into the form, or enter a page address and click "Fill from my page". The tool reads the page and fills in what it finds.

   [SCREENSHOT: the page address field and the "Fill from my page" button]

3. **Watch the code update.** The JSON-LD on the right changes as you type. Every edit shows up at once, right in your browser.

   [SCREENSHOT: the form on the left and the live JSON-LD on the right]

4. **Fix the flagged fields.** Fields Google requires are flagged when they're empty. Recommended fields are flagged too, with a lighter mark. Fill what you can.

   [SCREENSHOT: a required field flagged as missing]

5. **Check what's already on the page.** If you used "Fill from my page", the tool shows the schema types the page already has. This helps you avoid adding a second block for the same thing.

   [SCREENSHOT: the list of schema types found on the page]

6. **Copy or download the code.** Click copy to put the JSON-LD on your clipboard, or download it as a file.

   [SCREENSHOT: the copy and download buttons]

7. **Test it in Google.** Click the link to Google's Rich Results Test. Paste your code or your live page address there to see what Google reads.

   [SCREENSHOT: the Rich Results Test link]

Building from typed fields is free with no limit. "Fill from my page" reads a live page, so it's limited to 10 a day.

## How it works

The tool follows 2 sources: schema.org for the types and fields, and Google's structured data docs for what Google needs to show rich results.

### The JSON-LD format

JSON-LD stands for JavaScript Object Notation for Linked Data. It's a block of code inside a `<script type="application/ld+json">` tag. It sits apart from your visible content, so you can add it without touching your page design.

Google supports 3 formats for structured data: JSON-LD, Microdata and RDFa. Google recommends JSON-LD because it's the easiest to add and maintain. This tool only writes JSON-LD.

You can place the block in the `<head>` or the `<body>` of your page. Both work.

### Building in your browser

When you type into the form, the code is built right in your browser from a template for that type. Nothing is sent to a server. That's why typed builds are free and unlimited.

### Filling from your page

"Fill from my page" fetches your page and reads it in 3 ways:

- **Existing JSON-LD.** If the page already has schema, the tool reads it and uses those values.
- **Meta tags.** It reads the title, the meta description and Open Graph tags like `og:image`.
- **An AI read of the text.** An AI model reads the main text and pulls out facts like question and answer pairs, an author name, a date or a price.

AI can misread a page. Always check every filled field against your page before you copy the code. The markup has to match what people see.

### The checks

For each type, the tool compares your fields with Google's lists of required and recommended properties. Required fields must be there for a rich result. Recommended fields add detail and can help Google show more.

| Type | Google requires | Google recommends (some of them) |
|---|---|---|
| FAQ (FAQPage) | Each question's text and its answer's text | None beyond the required fields |
| Article | Nothing required | Headline, image, author, date published, date modified |
| Product | Name, plus at least one of offers, review or aggregate rating | Brand, description, SKU, image |
| Organization | Nothing required | Name, URL, logo, sameAs links, address, contact details |
| LocalBusiness | Name and address | Phone, URL, opening hours, geo coordinates, price range |

Google updates these docs from time to time. When the docs and this table disagree, the docs win.

### What schema can't do

Valid schema makes a page eligible for rich results. It doesn't promise them. Google decides case by case whether to show a rich result.

Some rich results have also changed. Since August 2023, Google shows FAQ rich results only for well-known government and health sites. Google removed HowTo rich results entirely. FAQ markup is still valid schema.org, and it still describes your page clearly. Just don't expect the drop-down questions under your listing.

## How to read your results

The tool gives you 3 kinds of feedback: field flags, the list of schema already on the page, and the code itself.

### Field flags

| Flag | What it means | What to do |
|---|---|---|
| Required, missing | Google needs this field for a rich result | Fill it, or the markup won't qualify |
| Recommended, missing | Google can use it, but doesn't need it | Fill it if the fact is on your page |
| No flag | The field is filled | Check that the value matches the page |

A form with no required flags is valid for Google's rich result rules for that type. Recommended flags are a to-do list. Fill the ones you have real data for and leave the rest empty. An empty field is better than a made-up one.

### Schema already on the page

When you fill from a page, the tool lists every schema type it found. Here is how to read that list:

| What you see | What it means |
|---|---|
| No types found | The page has no JSON-LD. Your new block will be the only one. |
| The same type you're building | You may end up with 2 blocks for one thing. Replace the old one. |
| A different type | Fine. A page can have several types, like Organization and Article. |
| A type from a plugin | Your CMS or an SEO plugin adds it. Edit it there, or turn it off before adding yours. |

### The code

The JSON-LD block should start with `"@context": "https://schema.org"` and an `"@type"`. Nested items, like an address or an offer, have their own `@type`. If you edit the code by hand, test it again in the Rich Results Test. One stray comma makes the whole block unreadable.

## A worked example

Here is a small LocalBusiness block for a made-up bakery at acme-example.com. The business, address and phone number are fictional.

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Bakery",
  "name": "Acme Example Bakery",
  "url": "https://acme-example.com/",
  "image": "https://acme-example.com/images/storefront.jpg",
  "telephone": "+1-555-0100",
  "priceRange": "$$",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "123 Example Street",
    "addressLocality": "Springfield",
    "addressRegion": "IL",
    "postalCode": "62701",
    "addressCountry": "US"
  },
  "openingHoursSpecification": [
    {
      "@type": "OpeningHoursSpecification",
      "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      "opens": "07:00",
      "closes": "18:00"
    }
  ]
}
</script>
```

A few things to notice:

- **The type is Bakery.** Bakery is a more specific type of LocalBusiness on schema.org. Use the most specific type that fits. You can swap `LocalBusiness` for a subtype like this in the code after you copy it.
- **Name and address are filled.** Those are the 2 fields Google requires for LocalBusiness.
- **The address is its own object.** It has its own `@type` of PostalAddress, with each part in its own field.
- **Hours use 24-hour time.** "18:00" means 6 pm. Days use their full English names.

Now a real run. [EDITOR: run "Fill from my page" on a real local business page or product page. Paste the filled form, the schema types found on the page and the final JSON-LD here.]

[SCREENSHOT: the filled form after "Fill from my page" on the example page]

[EDITOR: note which fields the tool filled from existing JSON-LD, which came from meta tags and which came from the AI read. Note any field that needed a manual fix.]

[SCREENSHOT: the Rich Results Test result for the final code]

## What to do with your results

### Add the code to the right page

Each block describes the page it sits on. Put your Product schema on the product page and your Article schema on the article. Put Organization schema on your home page or About page.

How you add it depends on your site. Most CMS platforms have a place for custom code in the page head, or a block for raw HTML. In WordPress, many SEO plugins add schema for you, so check what they output first. A developer can add the block to the page template.

### Make it match the visible page

Google's rule is simple: mark up what people can see. If your schema says a product costs $49 and the page says $59, that's a problem. If your FAQ schema has questions that aren't on the page, that's a problem too.

After you paste the code, read the page and the code side by side. Every value in the markup should appear on the page in the same form.

### Test before and after you publish

Test the code in Google's Rich Results Test before it goes live. Then test the live page address once it's published. The second test catches problems from your CMS, like a plugin that strips script tags.

You can also use the Schema Markup Validator at validator.schema.org. It checks your code against all of schema.org, beyond the types Google uses for rich results.

### Watch Search Console

Google Search Console has reports for many of the structured data types it finds on your site. They show valid items and errors across all your pages. Check them a few days after you publish, and after any site redesign.

A sudden drop in valid items often means a template change broke the markup on many pages at once.

### Remove duplicate and conflicting blocks

Many sites end up with 2 blocks for the same thing. A theme adds one Organization block and a plugin adds another, with a different logo. Google has to pick, and it may not pick the one you want.

Use "Fill from my page" to see what's on the page now. Keep one block per thing. If a plugin's output is wrong, fix it in the plugin settings or turn that part off.

### Roll it out across the site

One page is easy. A store with 400 products or a blog with 200 posts is a bigger job. Start with the pages that bring the most search traffic and the pages that sell.

If you'd rather not paste code page by page, Zippie, the AI assistant in the [Arrowsterr app](https://app.arrowsterr.com/), can add schema across your whole site through the CMS sync. You approve the changes before they go live.

### Fix the basics around the schema

Schema works best on a page that's already in good shape. Check that the page has a clear title and description with the [Meta Title and Description Generator](/free-tools/meta-generator/). Make sure the page isn't blocked from crawling with the [Robots.txt Tester](/free-tools/robots-txt-tester/). A page Google can't crawl can't show rich results.

## Common mistakes

### Marking up content that isn't on the page

Some sites add FAQ schema with questions the page doesn't show, or reviews that don't exist. Google treats this as spammy structured data and can ignore it. In serious cases Google can take a manual action against the site.

**Fix:** only mark up content a visitor can see on that page.

### Expecting FAQ rich results

Many guides still promise FAQ drop-downs in Google. Since August 2023, those only appear for well-known government and health sites.

**Fix:** use FAQ schema to describe your page clearly, without counting on a rich result. Put the effort into the answers themselves.

### Broken JSON

A trailing comma or curly "smart" quotes from a word processor will break the block. Google then ignores all of it.

**Fix:** copy the code straight from the tool into your CMS. If you edit by hand, test it again in the Rich Results Test.

### Prices and dates in the wrong format

Prices need a number and a separate currency code, like `"price": "49.00"` and `"priceCurrency": "USD"`. Dates need ISO 8601 format, like `2026-03-14`. A "$49" price or a "March 14th" date may not be read correctly.

**Fix:** use the form fields. The tool writes prices and dates in the format schema.org expects.

### Using the wrong type

An online shop with no storefront isn't a LocalBusiness. A blog post isn't a Product because it mentions one. The wrong type confuses search engines about what the page is.

**Fix:** pick the type for the main thing on the page. For an online-only business, use Organization.

### Reviewing yourself

Google doesn't show star rich results for reviews a business publishes about itself on LocalBusiness or Organization markup. Marking up your own testimonials as ratings won't earn stars.

**Fix:** leave review and rating fields empty unless they come from a real, independent review system that Google's rules allow.

### Setting it and forgetting it

Prices change and products sell out. Old schema then says something the page doesn't, which breaks the "match the page" rule.

**Fix:** make updating the schema part of updating the page. Better yet, generate it from the same data your page uses.

## Glossary

**Structured data.** Code that labels facts on a page so machines can read them without guessing. Schema markup is the most common kind.

**Schema.org.** A shared list of types and properties for structured data. The major search engines started it together in 2011.

**JSON-LD.** A format for structured data written as a block of code in a script tag. Google recommends it over Microdata and RDFa.

**Rich result.** A search listing with extra features, like prices or ratings. Valid schema makes a page eligible, but Google decides whether to show one.

**Type.** The kind of thing you're describing, like Product or LocalBusiness. Each type has its own set of properties.

**Property.** A single fact about a type, like `name`, `price` or `telephone`.

**Required property.** A property Google needs before a page can get a rich result for that type.

**Recommended property.** A property Google can use if it's there. Adding it can help, but it's optional.

**Nested object.** A type inside another type, like a PostalAddress inside a LocalBusiness or an Offer inside a Product.

**sameAs.** A property that lists your official profiles on other sites, like your LinkedIn page. It helps tie your brand to those profiles.

**Rich Results Test.** Google's free tool that shows which rich results a page or code snippet can get, and any errors.

## The AI search angle

AI answers in ChatGPT, Google AI Overviews and Google AI Mode are built from web pages. These systems have to work out what each page says. Clear, consistent facts make that easier.

Schema doesn't guarantee an AI answer will cite you. No markup does that. What schema does well is state facts in one exact form: your business name, your address, your opening hours, your product's price. When those facts match your page text and your profiles elsewhere, a machine has fewer chances to get them wrong.

A few moves help here:

- **Use Organization schema with sameAs.** Link your official profiles. This ties your site to the same brand on other sites.
- **Keep facts the same everywhere.** Your business name and address should match your schema, your page, your Google Business Profile and your directory listings.
- **Write answers people can quote.** FAQ schema won't earn a Google drop-down for most sites now. The question and answer pairs on the page still help. AI answers tend to use pages that answer a question in a clear sentence or 2. Check a page with the [AI Answer-Ready Checker](/free-tools/ai-answer-ready-checker/).
- **Put schema in the HTML from your server.** Google says it can read JSON-LD added by JavaScript. Some other crawlers don't run JavaScript, so markup in the first HTML response is the safer choice.
- **Make sure AI crawlers can reach the page.** Schema is useless on a page a crawler is blocked from. Run the [AI Crawler Checker](/free-tools/ai-crawler-checker/) to see which AI bots can get in.

You can also point AI tools to your key pages with an llms.txt file. Build one with the [llms.txt Generator](/free-tools/llms-txt-generator/).

## FAQ

### What is schema markup?

Schema markup is code that labels the facts on a page using types from schema.org. It tells search engines that a number is a price or that a block of text is an address. Google uses it to understand pages and to decide on rich results.

### Is this schema markup generator free?

Yes. Building schema by typing into the form is free and unlimited, because it runs in your browser. "Fill from my page" reads a live page, so it's limited to 10 a day.

### What is JSON-LD?

JSON-LD is a way to write structured data as a block of code inside a `<script type="application/ld+json">` tag. It sits apart from your visible content. Google supports it and recommends it.

### Where do I put JSON-LD on my page?

You can place it in the `<head>` or the `<body>`. Google reads it in either place. Most sites put it in the head through their CMS or SEO plugin.

### Does schema markup help SEO?

Schema helps Google understand a page and can make it eligible for rich results. Rich results can make your listing stand out. Google hasn't said schema is a direct ranking factor, so think of it as a way to be read correctly.

### Does FAQ schema still work?

FAQ markup is still valid, and Google can still read it. Since August 2023, Google shows FAQ rich results only for well-known government and health sites. Most sites won't see the drop-down questions in search anymore.

### How do I create FAQ schema?

Pick FAQ in the tool and add each question with its answer. The tool writes a FAQPage block with a Question and Answer for each pair. Make sure every question and answer also appears on the page.

### How do I add local business schema?

Pick LocalBusiness and fill in at least the name and address, which Google requires. Add your phone and opening hours too. Then paste the code into your home page or contact page.

### What does "Fill from my page" read?

It reads the page's existing JSON-LD, its meta tags and its main text. An AI model reads the text to find facts like questions, prices, dates and author names. Check every filled field before you use the code.

### How do I test my schema markup?

Click the Rich Results Test link in the tool, then paste your code or your page address. Google shows which rich results the page qualifies for and lists any errors. You can also use the Schema Markup Validator at validator.schema.org.

### Why doesn't my page show a rich result?

Valid schema makes a page eligible, but Google decides whether to show a rich result. The page may also be new, or the type may have limits, like FAQ. Check Search Console's reports for errors first.

### Can a page have more than one schema type?

Yes. An article page can have Article and Organization schema at the same time. Avoid 2 blocks that describe the same thing with different values.

### Do I need a plugin to add schema?

No. You can paste JSON-LD into any page that lets you add custom code. Plugins help when you have many pages, but check their output so you don't end up with duplicates.

### Does schema help with ChatGPT and AI answers?

There's no proof that schema alone gets you cited in AI answers. It does state your facts clearly and in one place. That helps any system that reads your page get your name and prices right.

## Related tools

- [Meta Title and Description Generator](/free-tools/meta-generator/): write the title and description that sit next to your schema in search.
- [AI Answer-Ready Checker](/free-tools/ai-answer-ready-checker/): see if your page answers questions in a way AI tools can quote.
- [Robots.txt Tester](/free-tools/robots-txt-tester/): make sure crawlers can reach the pages you mark up.

## Keep reading

- [EDITOR: link to post about which schema types matter for small businesses]
- [EDITOR: link to post about the 2023 FAQ and HowTo rich result changes]
- [EDITOR: link to post about structured data and AI search]
