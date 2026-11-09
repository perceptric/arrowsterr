# Link Building

The Link Building board (Links, Link Building, at `/link-building`) takes a brand from link prospects to won links and keeps checking the links it won. It is step 4 of the new tools plan, after Backlinks (`docs/backlinks.md`).

## What it shows

- **Five numbers:** prospects, contacted, reply rate (replied or won, out of everyone contacted), links won, and links gone.
- **A board with five columns:** Prospects, Contacted, Replied, Won and Lost. Drag a card on desktop, or use the arrow on a card. A filter shows one source at a time.
- **Each card:** the site, its authority, where it came from, why, and its state: pitch ready, email found, do not contact, or for won links Live, Live nofollow, Checking or Link gone.
- **The card panel:**
  - Stage buttons.
  - The contact email.
  - The pitch: draft, edit, save, copy, or open it in the person's own email.
  - Mark as sent, which moves the card to Contacted.
  - For won links: the page where the link is, Check now, and the last result.
  - Do not contact, and a two-step Delete.

## Where prospects come from

| Source | How | Cost |
|---|---|---|
| Link gap | Backlinks, Link gap, Add (step 3) | Paid there |
| Sites AI cites | Sites the brand's AI answers of the last 30 days cite when they name a rival and not the brand. Only editorial, review and company sites: forums, social sites and encyclopedias are left out | Free |
| Dead rival pages | Sites linking to a page on a rival's site that now answers 4xx or 5xx (DataForSEO `is_broken`), one request per rival, up to 3 rivals | 20 tasks |
| Unlinked mentions | Claude searches the web for pages naming the brand, then each page is read and kept only if it names the brand as a word and doesn't link to it | 20 tasks |
| By hand | Type a site | Free |

A site already on the board is never added twice. Sites on the do-not-contact list are never added.

## Pitches and sending

- **Draft pitch (3 tasks):** finds a contact email on the site's contact, write-for-us, about and home pages, then writes a pitch under 120 words that fits the card's source. A dead page pitch offers a replacement, an unlinked mention asks for the link, an AI-cited page offers something useful.
- **Email ranking:** role addresses on the site's own domain (editor, press, hello) come first. Image names, no-reply and error-tracking addresses are dropped.
- **Sending is done by the person, from their own email.** Arrowsterr doesn't send outreach. Cold email from Arrowsterr's own domain would hurt its email reputation and everyone's reports and alerts. "Open in email" starts a message with the pitch filled in, and "Mark as sent" moves the card.

## Reliability

- **Won needs a page.** A card moves to Won only with the page where the link sits, so the link can be checked. Dropping a card on Won without one opens the panel to add it.
- **No false "Link gone".** Each week, Arrowsterr reloads the page and looks for a link to any page of the brand's site, www or a subdomain. A followed link is preferred over a nofollow one. An error is retried once within the check. A link counts as gone only after 2 failed checks in a row (`MISSES_TO_LOSE`), so one slow or flaky page never raises a false alarm.
- **The do-not-contact list always applies.** It matches the email, the email's domain, or the site and its subdomains. A blocked card can't get a pitch, can't be marked as sent, and can't move to Contacted or Replied.
- **Paid finders refund on failure,** through the metered route.
- **Before `064_link_building.sql`:** link gap adds from Backlinks still land on the list.
- Tests: `tests/linkBuilding.test.ts`. The link reader was also run on real pages: Wikipedia's outbound links read as nofollow.

## Data

`supabase/064_link_building.sql` adds to `outreach_targets`:
- `stage`, `source`, `note`, `authority` and `stage_at`.
- For won links: `link_page`, `link_live`, `link_follow`, `link_misses` and `link_checked_at`.

Earlier link gap adds become `source = link_gap`.

- **Route:** `/api/link-building` (metered).
- **Job:** `link_check`, queued by the daily tick for won links not checked in a week.
- **Zippie:** `get_link_building`, `find_link_prospects`, and the "Win links from AI sources" skill.

## Running cost

| Line | Per use | Beta (50 teams) | Growth (500 teams) |
|---|---|---|---|
| Sites AI cites (database only) | $0 | $0 | $0 |
| Dead rival pages, about 1 a team a month (DataForSEO: 3 × $0.024 plus rows) | ~$0.08 | ~$4 | ~$39 |
| Unlinked mentions, about 1 a team a month (Claude web search, 4 searches plus tokens, check) | ~$0.09 | ~$5 | ~$45 |
| Pitch drafts, about 20 a team a month (Claude Sonnet, about 1.5K in and 300 out, check) | ~$0.006 | ~$6 | ~$60 |
| Contact finding and weekly link checks (plain page loads on the worker) | $0 | $0 | $0 |
| **Monthly total added** | | **~$15** | **~$144** |
