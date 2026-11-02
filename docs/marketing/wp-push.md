# Push the 15 blog posts to WordPress

The Markdown in `docs/marketing/blog/` is the approved copy (Nov 2, 2026): no price math, keyword-led headings, anti-AI pass done. The live posts on arrowsterr.com still have the old text.

## Credentials

Environment variables `WP_URL`, `WP_USER`, `WP_APP_PASSWORD` (application password for `AdminArrowsterr`). Check with:

```bash
curl -s -u "$WP_USER:$WP_APP_PASSWORD" "$WP_URL/wp-json/wp/v2/users/me?_fields=id,name"
```

## How to push

The live posts use the site's own HTML parts (`aw-table`, `aw-logo`, `aw-shot`, `aw-bar`, `mbar` charts, the Arrowsterr demo widget). Converting the Markdown back to HTML would lose them. So edit the live HTML and keep those parts.

For each of the 15 slugs:

1. Back up the raw post first: `GET /wp-json/wp/v2/posts?slug=<slug>&context=edit`. Save `content.raw`, `title.raw` and `excerpt.raw` to the scratchpad.
2. Compare the live text with `docs/marketing/blog/<slug>.md` and make the same text changes in `content.raw`. That means headings, sentences, removed sections (price math, cost tables, calculators, yearly % savings) and FAQ answers. Keep the markup, classes, images and links. Delete a removed section's whole HTML, chart included.
3. Update title, excerpt and the Yoast meta description from the Markdown front matter. Keep the slug.
4. `POST /wp-json/wp/v2/posts/<id>` with `content`, `title`, `excerpt`. Keep the status the same.
5. Open the live URL and check the page renders and the removed numbers are gone.

Slugs: best-ai-visibility-tools, best-chatgpt-rank-tracker, best-geo-tools, best-llm-tracking-tools, best-aeo-tools, best-ai-seo-tools, best-content-planning-tools-for-seo, best-seo-tools-for-startups, best-social-listening-tools-for-small-business, best-ai-search-tools-for-saas, best-ai-visibility-tools-for-agencies, otterly-ai-alternatives, peec-ai-alternatives, profound-alternatives, semrush-ai-toolkit-alternative.
