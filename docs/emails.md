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
| Scheduled report | `scheduleServer.ts` | The schedule's list |
| Free tools paused | `freeTools.ts` | `FREE_ALERT_EMAIL` |
| Confirm, sign-in link, reset password | Supabase Auth | The person signing in |

Failed jobs never show a vendor or database error. `plainError` turns it into one plain line; the raw error stays in the logs.

## Previews

```bash
npm run emails
```

This writes every email with sample data to `email-previews/` (HTML and plain text, ignored by git) and rewrites the three Supabase templates in `supabase/templates/`. Open a preview in a browser and switch the system to dark mode to see the dark version. Before a change to the look ships, send each email to Gmail, Outlook and Apple Mail.

## Sign-in emails (Supabase)

Supabase sends the confirm, sign-in link and reset password emails. They use its plain default templates until these steps are done in the Supabase dashboard.

1. **Send through Resend.** Authentication → Emails → SMTP Settings → Enable custom SMTP:
   - Host `smtp.resend.com`, port `465`, user `resend`, password: a Resend API key with sending access.
   - Sender email `hello@arrowsterr.com`, sender name `Arrowsterr`.
   - Without this, Supabase sends from its own address with a low hourly limit (check).
2. **Paste the templates.** Authentication → Emails → Templates:
   - Confirm signup: `supabase/templates/confirmation.html`
   - Magic link: `supabase/templates/magic_link.html`
   - Reset password: `supabase/templates/recovery.html`
   - Subjects: `supabase/templates/subjects.txt`
3. **Keep the code at 6 digits.** Authentication → Providers → Email → Email OTP length: 6. The sign-in screen takes the code under "We sent a link", so a link opened on another device still works.

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
