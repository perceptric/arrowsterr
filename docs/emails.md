# Emails

Every email Arrowsterr sends, how it looks and how to set up the sign-in emails.

## The look

All emails share one kit, `src/lib/emailKit.ts`, in the v8 calm look from `docs/brand.md`:

- The logo PNG at 28px (`public/brand/arrowsterr-logo-color.png`, and the white version in dark mode). Gmail blocks SVG, so emails use PNG.
- A #F5F5F5 shell, one white panel with 12px corners and a #EBEBEB ring, Inter, a dark pill button.
- Signal Blue only for your own brand in bars. Green and red 6px tags for changes.
- A hidden preview line, so the inbox shows the point of the email.
- A dark-mode stylesheet for the clients that read one (Apple Mail, iOS Mail, Outlook for Mac).
- A plain-text copy of every email, built from the same blocks.
- A footer that says why the person got it, with Unsubscribe and Choose your emails where they apply.

What each email says lives in `src/lib/emails.ts` (pure builders) and `src/lib/reportEmail.ts`. The senders load the data:

| Email | Sender | Goes to |
|---|---|---|
| Weekly summary | `notify.ts` `sendWeekly` | Members who kept it on, Mondays from 8am |
| Visibility alert | `notify.ts` `emailAlert`, from `integrations.ts` | Members who kept it on |
| Brief ready or failed | `worker/handlers.ts` `brief` | The person who started it |
| Content Plan ready or failed | `worker/handlers.ts` `plan` | The person who started it |
| Trial ending, tasks at 80% | `nudges.ts` | Admins |
| Getting started (9 emails, below) | `nurture.ts`, run from `nudges.ts` | The person who made the workspace, if they kept tips on |
| Scheduled report | `scheduleServer.ts` | The schedule's list |
| Free tools paused | `freeTools.ts` | `FREE_ALERT_EMAIL` |
| Confirm, sign-in link, reset password | The sign-in service | The person signing in |

Failed jobs never show a vendor or database error. `plainError` turns it into one plain line; the raw error stays in the logs.

## Getting started

New workspaces get a short run of emails in their first weeks. Each one asks for one thing and is skipped once that thing is done. Which one goes out when is in `src/lib/nurturePlan.ts` (pure, tested in `tests/nurture.test.ts`); `src/lib/nurture.ts` loads the data and sends.

| Day | Email | Sends when |
|---|---|---|
| 0 | Welcome, with a first-week checklist | 15 minutes after the workspace is made |
| 1 | Two minutes to your first score | Still no brand |
| 2 | Here's who AI recommends instead of you | The first answers are in. Shows the real competitors and one answer that skipped the brand |
| 3 | The questions your buyers ask AI | Fewer than 10 prompts. Suggests prompts from the brand's topics, buyers and rivals |
| 4 | 3 days left on your trial | The existing trial email (`nudges.ts`), unchanged except it now says the workspace moves to Free |
| 5 | Turn your AI gaps into a content plan | On the trial with no Content Plan yet (Free has none) |
| 7+ | You're on the Free plan now | The trial ended in the last 3 days. Compares Trial, Free and Starter |
| 14 | See every AI, every day | On Free and seen in the last 7 days |
| 14 | Want a hand setting it up? | On Free and not seen in the last 7 days. Replies go to support |
| 21+ | Your AI visibility changed while you were away | Not seen for 21 days. At most once every 90 days |

Rules: one a day at most, never on a day the trial email went out, only 9:00 to 18:00 in the workspace's time zone (the welcome goes out right away), and paying workspaces only get the setup emails (days 0 to 3). Someone making a second workspace isn't new, so only their first gets these. Each send is logged in `email_log` as `nurture:<step>`.

Turn on:

1. Run `supabase/099_nurture.sql` (adds the Getting-started tips switch to Settings, then Notifications).
2. Optional settings: `NURTURE_SIGN_NAME` and `NURTURE_SIGN_ROLE` sign the welcome, no-brand and help emails and send them from that person's name. `NURTURE_REPLY_TO` sets where replies go (default support@arrowsterr.com). `NURTURE_START` sets the first workspace date that gets them (default 2026-11-19), so older workspaces never do. `NURTURE_OFF=1` stops them.

The kit has four blocks for these: `steps` (a checklist), `answer` (one AI answer as a card), `compare` (plans side by side) and `sign` (a sign-off).

## Previews

```bash
npm run emails
```

This writes every email with sample data to `email-previews/` (HTML and plain text, ignored by git) and rewrites the three sign-in templates in `supabase/templates/`. Open a preview in a browser and switch the system to dark mode to see the dark version. Before a change to the look ships, send each email to Gmail, Outlook and Apple Mail.

## Sign-in emails

The sign-in service on the VPS sends the confirm, sign-in link and reset password emails. They use its plain default templates until these steps are done in its settings.

1. **Send through Resend.** Turn on custom SMTP:
   - Host `smtp.resend.com`, port `465`, user `resend`, password: a Resend API key with sending access.
   - Sender email `hello@arrowsterr.com`, sender name `Arrowsterr`.
   - Without this, the sign-in service sends from its own address with a low hourly limit (check).
2. **Paste the templates** into its email templates:
   - Confirm signup: `supabase/templates/confirmation.html`
   - Magic link: `supabase/templates/magic_link.html`
   - Reset password: `supabase/templates/recovery.html`
   - Subjects: `supabase/templates/subjects.txt`
3. **Keep the code at 6 digits.** Email OTP length: 6. The sign-in screen takes the code under "We sent a link", so a link opened on another device still works.

Edit the builders in `src/lib/emails.ts` (`authEmail`), run `npm run emails` and paste the templates again. Never edit the HTML files by hand.

## Cost

| Item | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| Resend Pro, already paid for the weekly and report emails (`docs/reports.md`). Sign-in emails add about 150 and 1,500 a month, inside the plan. | $0 (check) | $0 (check) |
| Logo PNGs, static files | $0 | $0 |
| Weekly detail (position, sentiment, prompts gained and lost) from saved runs, once a week per brand | $0 | $0 |
| Alert detail (each AI's move, prompts lost) from saved runs, only on alert days | $0 | $0 |
| Claude tokens (no AI in any email) | $0 | $0 |
| **Added to the monthly bill** | **$0** | **$0** |

The email bill stays at Resend Pro, $20 a month at both stages (check).
