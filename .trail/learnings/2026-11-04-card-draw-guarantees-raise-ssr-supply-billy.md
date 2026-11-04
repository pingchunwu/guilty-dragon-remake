---
title: "Card draw guarantees raise SSR supply by about 38 percent, because the ten-pull floor can land on an SSR"
author: Billy
date: 2026-11-04
branch: main
cost: { minutes: 9, tokens: 41593 }
id: l-f03a1489
scope: repo
status: active
replaces: l-f77bbf9e
src: agent
touches:
  - apps/web/src/game/guestService.ts
  - apps/web/src/game/supabase.ts
  - apps/web/src/game/types.ts
  - apps/web/src/screens/Gacha.tsx
  - apps/web/src/screens/GachaReveal.tsx
  - docs/development-spec.md
  - docs/gacha-review-plan.md
  - packages/engine/src/economy.ts
  - packages/engine/test/economy.test.ts
  - supabase/functions/_shared/engine.js
---

## Decided
Card draws have a ten-pull floor and an SSR pity at 300 pulls, with provisional values the owner has not picked. The combined effect is about 1 SSR per 83 pulls against 1 per 114 with no guarantees, about 38% more. The owner has not yet decided whether the floor should stay able to give an SSR; making it SR only would give about 1 per 106.

## Tried and ruled out
Loading odds with the app's content: a failure there blocks the whole app, and odds are optional. They load on the gacha screen and stay hidden on failure.

## Watch out
An earlier estimate of 1 per 106 left out that the floor pull picks by weight among SR, SSR and UR, so 8.2% of floor pulls are SSR. Simulate the real draw before quoting supply. The rules exist twice and must change together: the engine draw for guests and the database draw for accounts. A pending draw key stays in browser storage until its reveal shows and is not tied to an account, so after switching accounts the retry button is a normal charged draw.

In the code: packages/engine/src/economy.ts drawTen, supabase/migrations/20261104180000_gacha_guarantees.sql gacha_draw, apps/web/src/screens/Gacha.tsx readPending, docs/gacha-economy-events-plan.md
