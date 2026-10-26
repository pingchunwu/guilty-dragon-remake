# Guilty Dragon Remake

A personal card-building and asynchronous PvP PWA for a small group of friends, inspired by the rules of *Guilty Dragon* with original art and characters.

Planning lives in [`docs/`](docs/):

- [`development-spec.md`](docs/development-spec.md): engineering baseline and the open decisions that must not be invented during implementation.
- [`guilty-dragon-pwa-development-plan.md`](docs/guilty-dragon-pwa-development-plan.md): product plan and original-game research (Traditional Chinese).

## Layout

```text
apps/web/         React + TypeScript + Vite PWA (sign-in, collection, deck editor, gacha)
packages/engine/  Deterministic rule code: deck validation, seeded RNG, ten-pull, shards, Taipei dates
supabase/         SQL migrations (schema, RLS, database functions) and their tests (PGlite, no Docker)
```

Server logic runs entirely in Supabase: players can only read their own rows, and every write goes through a database function (`sync_player`, `draw_ten`, `save_deck`) that checks the signed-in user. Friend PvP battles are resolved by the `pvp` Supabase Edge Function, which runs the same engine (`packages/engine`, bundled into `supabase/functions/_shared/engine.js` by `npm run gen:engine`).

All cards, odds, the default deck and the starting ticket count are **placeholders** (`packages/engine/src/catalog.ts` and `economy.ts`). After changing them, run `npm run gen:seed` to regenerate the content migration.

## Commands

```bash
npm install
npm run dev        # web app dev server
npm test           # engine + database tests
npm run typecheck
npm run build
```

## Running without Supabase

With no Supabase settings the app runs in guest mode only: everything works in memory and is lost on reload.

## Connecting Supabase

1. Create a Supabase project.
2. Apply the migrations in `supabase/migrations/` in order (Supabase CLI `supabase db push`, or paste them into the SQL editor), then deploy the PvP function with `npx supabase functions deploy pvp --use-api`. Run `npm run gen:engine` and redeploy it whenever the engine changes.
3. In Authentication → Emails: set up a custom SMTP provider (the built-in sender is heavily rate-limited and locks the templates), then add the sign-in code `{{ .Token }}` to both the **Magic Link** and **Confirm signup** templates. The code length is a Supabase setting (this project uses 8 digits). With Resend's `onboarding@resend.dev` sender, mail only reaches your own Resend account address; verify a domain before inviting friends.
4. Copy `.env.example` to `apps/web/.env.local` and fill in the project URL and anon/publishable key. Never commit real values.

## CI/CD

`.github/workflows/ci.yml` runs typecheck, tests and build on every pull request and push to `main`. After the checks pass on `main`, it pushes the migrations, deploys the `pvp` function and publishes the web app to GitHub Pages. To set it up:

- Repo secrets: `SUPABASE_ACCESS_TOKEN` (a personal access token), `SUPABASE_PROJECT_REF` and `SUPABASE_DB_PASSWORD`.
- Repo variables (these are public by design): `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Settings → Pages → Source: **GitHub Actions**.
- Supabase Authentication → URL Configuration: add `https://<owner>.github.io/<repo>/` as the Site URL or a Redirect URL.
