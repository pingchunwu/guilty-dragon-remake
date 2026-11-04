---
title: "Card draws guarantee an SR per ten-pull and an SSR by 300 pulls, as provisional values the owner has not picked"
author: Billy
date: 2026-11-04
branch: gacha-review
cost: { minutes: 10, tokens: 168503 }
id: l-f77bbf9e
scope: repo
status: active
src: agent
touches:
  - docs/gacha-review-plan.md
  - supabase/migrations/20261104180000_gacha_guarantees.sql
  - packages/engine/src/economy.ts
  - apps/web/src/screens/Gacha.tsx
---

## Decided
The owner asked on 2026-11-04 for an architect review of the gacha, then to implement and merge. Two guarantees went in with provisional values, for card draws only: a ten-pull with no SR or better turns its tenth pull into SR or better, and the 300th pull since the last SSR or UR is SSR or better. 300 is 30 days of daily tickets. It catches only the unlucky 7% of players, so SSR supply barely moves. The owner has not picked these values; the spec listed guarantees as open.

## Tried and ruled out
Loading odds with the app's content: a failure there blocks the whole app, and odds are optional. They load on the gacha screen and stay hidden on failure. A use for shards was left out because it needs a product decision on what a shard buys.

## Watch out
The rules exist twice and must change together: the engine draw used by guests and the database draw used by accounts. A pending draw key stays in browser storage until its reveal shows, and it is not tied to an account, so after switching accounts the retry button is a normal charged draw.

In the code: packages/engine/src/economy.ts drawTen, supabase/migrations/20261104180000_gacha_guarantees.sql gacha_draw, apps/web/src/screens/Gacha.tsx readPending, docs/gacha-review-plan.md
