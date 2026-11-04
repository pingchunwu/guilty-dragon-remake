---
title: "SSR and UR always fake out from the SR seal look, then glitch into the gold spell"
author: Billy
date: 2026-11-04
branch: main
cost: { minutes: 11, tokens: 131515 }
id: l-573085df
scope: repo
status: active
src: agent
touches:
  - apps/web/src/App.tsx
  - apps/web/src/game/guestService.ts
  - apps/web/src/game/types.ts
  - apps/web/src/screens/Gacha.tsx
  - apps/web/src/screens/LoginBonus.tsx
  - apps/web/src/styles.css
  - docs/development-spec.md
  - docs/gacha-economy-events-plan.md
  - docs/gacha-review-plan.md
  - packages/engine/src/economy.ts
---

## Decided
On 2026-11-04 the owner asked for high rarity draws to start as the low rarity animation, glitch, then break through light into the big spell. It now plays on every SSR and UR, replacing the old 50 percent smooth violet to gold tease, because a seal that sometimes goes gold straight away still gives the result away. The fake-out starts from the SR look, not the plain seal: every card draw is a ten-pull and the floor guarantees SR or better, so the plain seal only shows for item draws. UR keeps gold first, then the rainbow, as a second surprise.

## Watch out
A pull now runs about 11 seconds for SSR and 14 for UR, up from about 8 and 10. The break lands exactly when the SR ending has swelled to white and would fade, so changing the SR ending timing also changes the fake-out. To time or capture the seal in the built-in browser, the pane must be visible or requestAnimationFrame stops; a temporary test page with a setTimeout frame loop works around it.

In the code: apps/web/src/screens/GachaSeal3D.tsx (GLITCH_SHADER, SR_FINAL, GLITCH, CRACK, SPELL), apps/web/src/screens/gachaOmen.ts (tease removed), packages/engine/src/economy.ts drawTen for the floor.
