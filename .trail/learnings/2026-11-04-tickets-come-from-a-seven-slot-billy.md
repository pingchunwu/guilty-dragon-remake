---
title: "Tickets come from a seven-slot login bonus instead of a daily grant, and cards and gear have separate tickets"
author: Billy
date: 2026-11-04
branch: login-bonus
cost: { minutes: 6, tokens: 58461 }
id: l-e4574b1e
scope: repo
status: active
src: agent
touches:
  - docs/gacha-review-plan.md
  - docs/gacha-economy-events-plan.md
  - apps/web/src/screens/LoginBonus.tsx
  - packages/engine/src/economy.ts
---

## Decided
On 2026-11-04 the owner replaced the daily ticket with a login bonus: the first login of each Taipei day checks the next of 7 slots and grants its item, days need not be consecutive, and missed days pay nothing. After the seventh, the panel restarts. Cards and gear now have separate tickets. The owner said the items are a card ticket and a gear ticket; alternating them (card first, 4 card and 3 gear per panel) is an assumption until confirmed.

## Tried and ruled out
A fixed weekly gear ticket: replaced by this panel.

## Watch out
The bonus is claimed inside sync, so if the response is lost the tickets stay granted but that day's popup never shows. The database push and the merge must go together: on the database alone, the live client grants tickets with no popup and its gear tab shows the card count.

In the code: supabase/migrations/20261104200000_login_bonus.sql claim_login_bonus, packages/engine/src/economy.ts LOGIN_BONUS_PANEL, apps/web/src/screens/LoginBonus.tsx
