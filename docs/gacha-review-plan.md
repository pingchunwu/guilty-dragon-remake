# Gacha design and flow review: plan

Reviewed 2026-11-04 against the live pool (`pool-v2`, 733 cards).

## What is already sound

- **Server authority:** `gacha_draw` is not callable by clients. Players reach it only through `draw_ten` and `draw_items_ten`, which take the player from the session. RLS blocks direct writes.
- **Atomic and idempotent:** one transaction takes a row lock, charges one ticket, grants ten results and stores them. Retrying a key replays the result without a charge.
- **Daily tickets:** accrual is lazy and has a ledger, and an app left open syncs again when the Taipei day changes.
- **Duplicate value:** duplicates raise a level until the cap.

## The numbers

| Rarity | Cards | Weight each | Chance per pull | Chance of a given card |
|---|---|---|---|---|
| N | 209 | 12 | 57.83% | 0.28% |
| R | 273 | 5 | 31.47% | 0.12% |
| SR | 213 | 2 | 9.82% | 0.05% |
| SSR | 38 | 1 | 0.88% | 0.02% |

At one ticket (ten pulls) a day:

- 32% of ten-pulls contain nothing above R.
- 7% of players go a full month (300 pulls) with no SSR, and no choice they make changes that.

## Findings

| # | Severity | Finding | Decision |
|---|---|---|---|
| 1 | High | **A paid reveal can be lost.** Leaving the tab during a draw, or reloading after a lost response, keeps the charge but never shows the results. The retry key lives in component state and dies on unmount. | Fix |
| 2 | High | **A stale script file crashes the reveal.** The 3D seal is a lazy chunk. After a deploy, an old page gets a 404 for it and falls to the app error screen, just after the ticket was spent. | Fix: skip the seal |
| 3 | High | **Odds are not shown anywhere.** The rules text covers tickets and levels only. | Fix: show them, read from the live pool |
| 4 | High | **No protection against bad luck.** See the numbers above. With a daily ticket as the only income, a long dry streak has no way out. | Fix: guarantees below |
| 5 | Medium | **Stale ticket count after a refusal.** If another device spent the ticket, the error appears but the button stays active and the count stays wrong. | Fix: sync after the refusal |
| 6 | Medium | **Dead end at zero tickets.** The button is disabled with no word on when the next ticket comes. | Fix: one line |
| 7 | Medium | **Shards have no use.** Every duplicate past the cap, and every duplicate of a card with no skill, is worth nothing. | Open: product decision |
| 8 | Low | Cards and items share one ticket, and items have no rarity or omen. | Open |
| 9 | Low | No draw history screen. Results are stored in `gacha_requests`, so this can be added later without data loss. | Later |
| 10 | Low | Guests get 100 tickets (existing `shortcut:` comment). | Before launch |

Looked at and left alone: `random()` is enough for a game with no payments, and the double-tap and two-device races are already covered by `disabled` and the row lock.

## Guarantees (new rule, values are provisional)

Applies to card draws only. Items are equal weight and have no rarity.

1. **Ten-pull floor:** a ten-pull with no SR or better turns its tenth pull into SR or better, using the normal weights within those rarities.
2. **SSR pity at 300 pulls:** the 300th pull since the last SSR or UR is SSR or better. That is 30 days of daily tickets. The counter belongs to the player and survives pool changes.

Why these values:

- 300 only catches the unlucky 7%. On its own it moves SSR supply little.
- Corrected 2026-11-04: the floor pull can land on an SSR (8.2% of floor pulls), so the two rules together give about 1 SSR per 83 pulls instead of 1 per 114, roughly 38% more. This review first said 1 per 106, which left the floor out. Simulated: 44 SSRs in a year of daily tickets. See `docs/gacha-economy-events-plan.md`.
- The floor raises the SR-or-better rate from 10.7% to about 14.3% (first stated as 13.9%).

If a pool has no card of the guaranteed rarity, the pull falls back to the whole pool.

## Changes

- **Engine (`economy.ts`):** `drawTen` takes an optional guarantee and returns the new counter. Item draws and existing callers do not change. Regenerate `engine.js`.
- **Database (new migration):**
  - `players.card_pity`
  - `gacha_draw` applies both rules
  - `player_state` returns `pity`
  - new `gacha_rates()` returns the live weight per rarity
- **Services:** `GameService.rarityWeights()`, with guests computing it from their own pool. `PlayerState.pity`.
- **`Gacha.tsx`:**
  - Keep the pending key in `localStorage`, and keep it if the player left during the draw, so 重試 replays that draw at no charge and shows its reveal
  - Sync after a refusal
  - Show odds, guarantee rules, the pity count and the zero-ticket line
- **`GachaReveal.tsx`:** if the seal chunk fails to load, skip to the flip.
- **Tests:** engine tests for both rules and the fallback, database tests for both rules, the counter reset and `gacha_rates`.
- **Docs:** `development-spec.md`.

## Not in this change

- A use for shards (finding 7). It needs a product decision on what a shard buys.
- History screen, item rarity, separate tickets, and multiple pools.
- Any change to the look of the reveal.

## Release order

1. Tests and typecheck pass.
2. Push the migration and redeploy `pvp`. The new columns and fields are additive, so the running client keeps working.
3. Merge.
