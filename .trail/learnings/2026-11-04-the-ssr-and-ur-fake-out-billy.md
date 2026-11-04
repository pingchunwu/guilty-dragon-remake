---
title: "The SSR and UR fake-out loses signal like an old TV, then the screen breaks as clear glass with no white flash"
author: Billy
date: 2026-11-04
branch: main
cost: { minutes: 55, tokens: 213604 }
id: l-f4569e6d
scope: repo
status: active
replaces: l-573085df
src: agent
touches:
  - apps/web/src/screens/GachaSeal3D.tsx
  - apps/web/src/screens/gachaOmen.test.ts
  - apps/web/src/screens/gachaOmen.ts
  - claude.md
  - apps/web/src/game/guestService.ts
  - apps/web/src/screens/GachaReveal.tsx
  - apps/web/seal-test.html
  - apps/web/src/__sealtest.tsx
  - packages/engine/src/economy.ts
---

## Decided
On 2026-11-04 the owner chose this sequence through several rounds of feedback. Every SSR and UR pull plays the SR look up to its swell to white, because every card draw is a ten-pull with an SR floor, so SR is the lowest look a player sees and the plain seal only shows for item draws. The picture then loses signal like an analog TV until only static is left. At the hit the static cuts out and clear cracked glass stands over the seal, then the pieces fall away over the gold spell. UR keeps gold first, then the rainbow.

## Tried and ruled out
Digital glitch with torn blocks and pink and green corruption: the owner said it looked awful. A jagged white crack and a white flash after the shatter: too cheap, and the owner asked for the light to go. Static on the shards, even only until they let go: the owner wants the glass clear. Drawn white and dark edge lines: looked like flat 2D paint, so shards now have real thickness and a chamfer lit by light direction.

## Watch out
A pull runs about 11.5 seconds for SSR and 14.5 for UR, and motion and phone performance were not checked at real speed. No UR cards exist yet, so a UR pack cannot be drawn in the game. To capture the seal when the preview pane is hidden, requestAnimationFrame stops, timers throttle and document.hidden makes the render loop skip. A temporary test page that overrides those and seeks the timeline gives exact frames. Do not put a trailing comment on a temporary capture line, one swallowed the next constant and broke the seal.

In the code: apps/web/src/screens/GachaSeal3D.tsx (GLITCH_SHADER, SHARD_FRAG, makeShatter, SHARD_THICKNESS, SR_FINAL, GLITCH, CRACK, SPELL), apps/web/src/screens/gachaOmen.ts, packages/engine/src/economy.ts drawTen for the floor.
