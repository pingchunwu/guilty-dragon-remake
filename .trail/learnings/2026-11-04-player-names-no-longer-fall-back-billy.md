---
title: "Player names no longer fall back to email, and the PvP turn is 90 seconds because it includes the replay"
author: Billy
date: 2026-11-04
branch: flow-fixes
cost: { minutes: 11, tokens: 105834 }
id: l-54665922
scope: repo
status: active
src: agent
touches:
  - apps/web/src/App.tsx
  - apps/web/src/main.tsx
  - apps/web/src/screens/DeckEditor.tsx
  - apps/web/src/screens/Duel.tsx
  - apps/web/src/screens/Playback.test.ts
  - apps/web/src/screens/Playback.tsx
  - apps/web/src/screens/Player.tsx
  - apps/web/src/screens/Pvp.tsx
  - docs/development-spec.md
  - supabase/migrations/20261104120000_pvp_name_and_turn.sql
---

## Decided
On 2026-11-04 the owner said to go ahead with the review's recommended defaults. The default name is now 玩家 plus the friend code, reversing the 2026-10-25 email fallback, because the lobby lists every player to everyone. The turn went from 60 s to 90 s and the clock is hidden during the replay, because the deadline is set when the phase is recorded and the replay takes up to about 27 s.

## Tried and ruled out
A separate playback allowance added only in phase recording: it needs the database function rewritten, and a config change does the job. The first turn also gets 90 s, which is harmless because the opponent is the AI.

## Watch out
Friend codes are only created when a player first opens the lobby, so a player without one shows the start of their ID until then, and their shown name changes once. A replay in a hidden tab jumps to its end on purpose, so briefly switching tabs skips the animation.

In the code: player_name and pvp_turn_seconds in supabase/migrations/20261104120000_pvp_name_and_turn.sql; the replay clock in apps/web/src/screens/Pvp.tsx; skipIfHidden in apps/web/src/screens/Duel.tsx.
