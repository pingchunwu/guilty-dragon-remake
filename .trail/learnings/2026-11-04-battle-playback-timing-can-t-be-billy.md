---
title: "Battle playback timing can't be measured in a hidden browser pane, and it uses up about 25 seconds of the PvP turn clock"
author: Billy
date: 2026-11-04
branch: main
cost: { minutes: 9, tokens: 167104 }
id: l-d8b6b20f
scope: repo
status: active
src: agent
touches:
  - apps/web/src/screens/BattleParts.tsx
  - apps/web/src/screens/DeckEditor.tsx
  - apps/web/src/screens/Duel.tsx
  - apps/web/src/screens/Playback.test.ts
  - apps/web/src/screens/Playback.tsx
  - apps/web/src/styles.css
  - supabase/migrations/20261025000400_friend_pvp.sql
  - apps/web/src/App.tsx
  - apps/web/src/screens/Battle.tsx
  - apps/web/src/screens/Pvp.tsx
---

## Decided
Nothing changed yet. The game flow review of 2026-11-04 found that an unskipped phase playback takes about 23-27 s, worked out from the code's constants, while the 60 s PvP clock starts when the server records the phase. A fix is proposed and awaits the owner's decision.

## Tried and ruled out
Timing a practice phase live in the built-in browser pane: while the pane is hidden, requestAnimationFrame barely runs, so GSAP timelines stall at the end of the leader reveal. It looks like a game hang but is not one; a screenshot unfroze it. setTimeout beats keep running, so only the GSAP steps stop.
Float rounding in the attack scene's combo step: it matched the engine on every total from 0 to 20000 for all combo multipliers, so it is not a bug.

## Watch out
A real hidden tab freezes the same way while the PvP clock keeps running. To time playback, show the pane first or calculate it from the constants.

In the code: REVEAL_MS, REVEAL_EXIT_S and HP_SETTLE_MS in apps/web/src/screens/Duel.tsx; BEAT_MS, STEP and rushAt in apps/web/src/screens/Playback.tsx; deadline in pvp_record_phase in supabase/migrations/20261025000400_friend_pvp.sql.
