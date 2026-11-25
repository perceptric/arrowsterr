# Arrowsterr

AI visibility tool. The app runs at app.arrowsterr.com. The marketing site stays on WordPress at arrowsterr.com.

## Run on your computer

```bash
npm install
npm run dev      # http://localhost:3000
```

## Deploy on the OVH server

Everything runs on the OVH server (Docker and Traefik): the app (`arrowsterr-web`), the job worker (`arrowsterr-worker`) and the database, a self-hosted Supabase at `db.arrowsterr.com`. Every push to the production branch runs `.github/workflows/build-images.yml`: it builds both images, publishes them to GitHub's container registry, deploys them and then waits until `https://app.arrowsterr.com/api/version` shows the new commit. The run fails if it doesn't, so a deploy that didn't happen shows up as a red run. `.github/workflows/checks.yml` runs the checks.

How the new images get onto the server:

- With the repo variable `DEPLOY_HOST` set, the workflow runs `deploy/deploy.sh` on the server over SSH right away. The script finds the Compose projects that run `arrowsterr-web` and `arrowsterr-worker`, pulls, runs `docker compose up -d` and updates itself from the newest image. It never edits a file on the server.
- Without it, the server's `autodeploy` container pulls new images every 5 minutes and restarts what changed. The workflow waits up to 12 minutes for that.

To turn on the SSH deploy, once:

1. On the server, copy `deploy/deploy.sh` to `/docker/arrowsterr-web/deploy.sh` and `chmod +x` it. The SSH user needs Docker (the `docker` group), a `docker login ghcr.io` that can pull these images, and read access to the apps' Compose folders (`.env` included).
2. Make a key just for this (`ssh-keygen -t ed25519 -f deploy_key -N ""`) and add the public half to that user's `~/.ssh/authorized_keys`, locked to the script: `command="/docker/arrowsterr-web/deploy.sh",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty ssh-ed25519 AAAA... github-deploy`.
3. In GitHub, Settings, Secrets and variables, Actions: secrets `DEPLOY_SSH_KEY` (the private half) and `DEPLOY_KNOWN_HOSTS` (`ssh-keyscan -t ed25519 <server>`), variables `DEPLOY_HOST` and `DEPLOY_USER` (and `DEPLOY_PORT` if not 22).

The database starts from `supabase/schema.sql`, then each numbered file in `supabase/` in order (the folder keeps its old name). Sign-in and file storage still go through the Supabase-style API at `SUPABASE_URL` in the code, so the `SUPABASE_*` variable names stay.

### Migrations run on their own

The app runs them. On each schedule tick (every 10 minutes), `src/lib/migrationsServer.ts` runs each `supabase/NNN_*.sql` file it hasn't run yet, in filename order, one transaction per file, through the database's SQL endpoint (`/pg/query` on `SUPABASE_URL`, with `SUPABASE_SECRET_KEY`). It records each file in `ops.schema_migrations`. If a file fails, it's rolled back, the error goes to the app's logs ("Migration failed"), and the files after it wait for the next tick. The old runner in `/docker/arrowsterr-migrate` stopped on Nov 18 and is no longer needed.

So a new migration file must:

- Run inside a transaction: no `begin`/`commit`, `create index concurrently` or `vacuum`.
- Be safe to run twice: use `if not exists`, `drop policy if exists` and `on conflict do nothing`.
- Work with the code that's already live. It can run a few minutes before the new images do, so drop or rename a column only after the code has stopped using it.

To run a file again, delete its row from `ops.schema_migrations`. The next tick runs it.

Render and Fly are no longer used ([docs/fly.md](docs/fly.md) is kept for its history).

## Stripe

Plans and prices are made by a script and read by lookup key. The app never creates them.

1. Put the secret key on the app on the server as `STRIPE_SECRET_KEY`.
2. In a shell on the server (inside the app's container), run `npm run stripe:setup`. Run it again after changing a price in `src/lib/plans.ts`. Existing customers keep their price.
3. Add a webhook for `https://app.arrowsterr.com/api/billing/webhook` with `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid` and `invoice.payment_failed`. Put its signing secret on the app as `STRIPE_WEBHOOK_SECRET`.

Do all three in test mode, then again in live mode with the live keys.

## Brand

- `src/app/globals.css` is the only stylesheet. Every page is wrapped in `.aw` in `layout.tsx`.
- `src/app/globals.css` maps brand tokens to Tailwind (`bg-brand`, `text-ink-2`, `border-line`, `shadow-aw`).
- Use `<Logo />` from `src/components/Logo.tsx` for the logo.
