# Guilty Dragon Remake

A personal card-building and asynchronous PvP PWA for a small group of friends, inspired by the rules of *Guilty Dragon* with original art and characters.

Planning lives in [`docs/`](docs/):

- [`development-spec.md`](docs/development-spec.md): engineering baseline and the open decisions that must not be invented during implementation.
- [`guilty-dragon-pwa-development-plan.md`](docs/guilty-dragon-pwa-development-plan.md): product plan and original-game research (Traditional Chinese).

## Layout

```text
apps/web/         React + TypeScript + Vite PWA
packages/engine/  Deterministic rule code (deck validation, seeded RNG); no UI or transport
```

The API (`apps/api`) is not scaffolded yet: whether to use NestJS on Vercel Functions is still an open decision (spec §7).

## Commands

```bash
npm install
npm run dev        # web app dev server
npm test           # engine tests
npm run typecheck
npm run build
```

Copy `.env.example` to `.env.local` for local settings. Never commit real secrets.
