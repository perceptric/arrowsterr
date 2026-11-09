# Arrowsterr

AI visibility tool. The app runs at app.arrowsterr.com. The marketing site stays on WordPress at arrowsterr.com.

## Run on your computer

```bash
npm install
npm run dev      # http://localhost:3000
```

## Deploy on the Hostinger VPS

Everything runs on the Hostinger VPS: the app (`arrowsterr-web`), the job worker (`arrowsterr-worker`) and the Postgres database. Every push to the production branch builds both images through `.github/workflows/build-images.yml` and publishes them to GitHub's container registry; the VPS pulls them. `.github/workflows/checks.yml` runs the checks.

The database starts from `supabase/schema.sql`, then each numbered file in `supabase/` in order, run with `psql "$DATABASE_URL" -f <file>` (the folder keeps its old name). Sign-in and file storage still go through the Supabase-style API at `SUPABASE_URL` in the code, so the `SUPABASE_*` variable names stay.

Render and Fly are no longer used ([docs/fly.md](docs/fly.md) is kept for its history).

## Stripe

Plans and prices are made by a script and read by lookup key. The app never creates them.

1. Put the secret key on the app on the VPS as `STRIPE_SECRET_KEY`.
2. In a shell on the VPS (inside the app's container), run `npm run stripe:setup`. Run it again after changing a price in `src/lib/plans.ts`. Existing customers keep their price.
3. Add a webhook for `https://app.arrowsterr.com/api/billing/webhook` with `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid` and `invoice.payment_failed`. Put its signing secret on the app as `STRIPE_WEBHOOK_SECRET`.

Do all three in test mode, then again in live mode with the live keys.

## Brand

- `src/app/brand.css` holds the brand CSS. Every page is wrapped in `.aw` in `layout.tsx`.
- `src/app/globals.css` maps brand tokens to Tailwind (`bg-brand`, `text-ink-2`, `border-line`, `shadow-aw`).
- Use `<Logo />` from `src/components/Logo.tsx` for the logo.
