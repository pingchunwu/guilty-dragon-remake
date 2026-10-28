---
title: "A fresh worktree needs npm install before gen:seed, or the seed is built from stale engine source"
author: Billy
date: 2026-10-28
branch: claude/ssr-rarity-35b22f
cost: { minutes: 1, tokens: 4911 }
id: l-dd50f0d0
scope: repo
status: active
src: agent
touches:
  - docs/card-spec.md
  - docs/og-data/build-specs.py
  - packages/engine/src/catalog.ts
  - packages/engine/src/og-cards.ts
  - packages/engine/src/skills.ts
  - supabase/functions/_shared/engine.js
  - supabase/migrations/20261028200000_rarity_ssr.sql
  - supabase/migrations/20261028200100_og_ssr_content.sql
  - supabase/scripts/gen-placeholder-content.ts
---

## Watch out
A new git worktree has no node_modules, so `@gdr/engine` resolves to another checkout's source. `npm run gen:seed` then runs without error but writes a seed with the old rarities (no SSR), and typecheck can pass against the wrong engine.

In the code: run `npm install` in the worktree first, then `npm run gen:seed` and `npm run gen:engine -w @gdr/supabase`. Check the seed has the expected rows, for example `grep -c "'SSR'"` on the generated migration.

## Decided
SR+ cards are SSR (38). N+ and R+ stay folded into N and R. SSR draw weight is 1, taken from the spec's SR+ value.
