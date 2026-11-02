---
title: "Drawing stops at the first blocked draw, stricter than the original game on purpose"
author: Billy
date: 2026-11-02
branch: duel-rules
cost: { minutes: 12, tokens: 238736 }
id: l-8d75b2ca
scope: repo
status: active
src: agent
touches:
  - packages/engine/src/battle.ts
  - apps/web/src/screens/Playback.tsx
---

## Decided
A new card is drawn only after a card joined the attack: the first blocked draw ends the drawing, even with DRAW and spaces left. The product owner asked for this on 2026-11-03. It is stricter than the OG sources.

## Tried and ruled out
Giving one draw per joined card. The engine already behaved that way, because free spaces always equal joined cards minus draws so far, so it would have changed nothing and three off-colour draws in a row would stay.

## Watch out
The OG clip (DRAW 3, three off-colour draws) and the wiki line only end drawing when blockers fill the spaces, so if the owner wants OG back, remove the earned check in the charge loop. 肅清 had to move too: it now fires on a blocked draw, or it would almost never fire. 選民主義 reaches the charge picks first, because this game submits leader and picks together, while the original fires it before picks.

In the code: runCharge in packages/engine/src/battle.ts; framesV07 in apps/web/src/screens/Playback.tsx.
