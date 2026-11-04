---
title: "Battle playback shows each draw on the beat a card joins the total, while the engine still draws after all picks"
author: Billy
date: 2026-11-04
branch: battle-polish
cost: { minutes: 22, tokens: 250992 }
id: l-a2d79b74
scope: repo
status: active
src: agent
touches:
  - apps/web/src/game/cardQuery.test.ts
  - apps/web/src/game/cardQuery.ts
  - apps/web/src/game/guestService.ts
  - apps/web/src/screens/DeckEditor.tsx
  - apps/web/src/styles.css
  - packages/engine/src/economy.ts
  - supabase/migrations/20261104000000_card_obtained_at.sql
  - supabase/tests/db.test.ts
  - apps/web/src/screens/Playback.tsx
  - apps/web/src/screens/Duel.tsx
---

## Decided
The product owner asked on 2026-11-04 for a draw to arrive at the same moment a card joins the total, then wait at the end of the queue for its own beat. This changes only the playback timing. The engine rule is unchanged: drawing still stops at the first blocked draw, and the number of draws comes from the engine result.

## Watch out
The earned count in the playback only decides when an engine draw appears; it never adds a draw. A check that reads this as bringing back one draw per joined card is a false match. Blocked cards hold their space until the total stage; counted and purged cards leave on the next beat. For one beat the row holds six cards, so the slots may shrink.

In the code: framesV07 in apps/web/src/screens/Playback.tsx; gone in apps/web/src/screens/Duel.tsx; .charge-slot in apps/web/src/styles.css.
