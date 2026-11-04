# Gacha economy and events: plan

Written 2026-11-04. Nothing here is built yet. Prices and rates are proposals. The numbers come from simulating the current engine (60 players per length for cards, 200 for gear) on the live pool of 733 cards and 42 placeholder items.

## Decisions needed

| # | Decision | Recommendation |
|---|---|---|
| 1 | How often gear tickets arrive | One a week. Daily maxes all gear in about 11 weeks. |
| 2 | Should the ten-pull floor be able to give an SSR? It is live now and gives about 38% more SSRs than I first told you. | Make the floor pull SR only, which keeps SSRs at about 1 per 106 pulls. |
| 3 | Shard prices | N 10, R 30, SR 100, SSR 300 |
| 4 | Events: exclusive cards, or a higher chance on existing cards | Higher chance on existing cards |
| 5 | First event | Christmas, December 2026 |

## 1. Separate tickets

**Replaced 2026-11-04:** tickets now come from a 7-slot login bonus panel instead of any fixed rate, so decision 1 and the accrual described below no longer apply. See `docs/development-spec.md` §1. The rate table still shows how fast gear maxes out: the current panel gives at most 3 gear tickets a week, or about 6 months to max all gear.

Cards and gear each get their own ticket. Saved tickets stay as card tickets, so nobody loses anything, and every player starts with one gear ticket.

**Why the gear rate matters:**

| Gear tickets | All 42 items at Lv 10 | Best item in all 7 slots at Lv 10 |
|---|---|---|
| Daily | about 11 weeks (75 tickets) | about 9 weeks (60 tickets) |
| Every 3 days | about 7.5 months | about 6 months |
| Weekly | about 1.4 years | about 1.2 years |

Gear strength feeds directly into PvP (Lv 10 is ×1.9), and a daily ticket would be worthless after the first few months. The rate can go up once the real gear list (124 weapons and 113 armor in the original) replaces the placeholders.

**Changes:**
- **Database:** `players.item_tickets` and `last_item_ticket_date`, plus a `kind` column on `ticket_ledger`. Weekly accrual on Monday, Taipei time. `gacha_draw` charges the ticket for its kind.
- **State:** `PlayerState.itemTickets`, and the guest service to match.
- **`Gacha.tsx`:** the count, the button, 再抽一次 and the next-ticket line follow the selected kind. The rules text stops saying the ticket is shared.
- **Running clients:** an old page shows the card count on the gear tab. A draw there is refused safely and the count re-syncs.

## 2. Shard exchange

**The problem:** duplicates past a card's cap are worth nothing. 110 of the 733 cards are capped at level 1, and 114 more at level 3.

**Income from duplicates past the cap, with daily card tickets:**

| Time | N | R | SR | SSR | Shards at values below |
|---|---|---|---|---|---|
| 3 months | 17 | 19 | 6 | 0.2 | about 90 |
| 6 months | 62 | 64 | 21 | 0.6 | about 300 |
| 1 year | 370 | 213 | 76 | 2.6 | about 1,230 |
| 2 years | 2,142 | 658 | 257 | 10 | about 4,940 |

**Proposed rule:**
- A duplicate past the cap pays shards by rarity: N 1, R 2, SR 5, SSR 20.
- Shards buy any card in the standard pool, either as a new card or as one level. The price is the same either way: N 10, R 30, SR 100, SSR 300.
- A card already at its cap cannot be bought, so shards can't loop back into shards.
- Result: a first SSR of the player's choice at about 6 months. By then they would own about 16 of the 38 at random, so shards fill gaps rather than replace draws.
- Cards and gear have separate wallets. Gear pays 1 shard per duplicate past the cap and costs 30 per item or level. It only matters once gear is capped, and that is far off at a weekly rate.

**Changes:**
- **Database:** `players.card_shards` and `item_shards`, replacing the per-card count. Live shard totals are 0 today, so nothing needs converting. Add a shard ledger.
- **New RPC:** `exchange_shards(kind, id, key)` with the same lock and idempotent retry as a draw. Prices stay on the server.
- **Engine and UI:** `applyPull` returns shards earned. The reveal shows `+N 碎片`, and `ItemTile` stops showing per-item 多餘.
- **Screen:** a shard exchange in the 抽卡 tab, reusing the deck picker's card list and filters. I'd show you one mockup first.

## 3. Events

**What the original did:** a themed event nearly every month, each giving themed weapons, from the wiki's `acquisition` column in `og-weapons.csv`. These were PvE events, which the remake doesn't have, so the themes carry over as gacha banners and the event play does not.

| Month | Original event | Banner theme |
|---|---|---|
| Dec | クリスマスタワー | Christmas |
| Jan | 三社参り | New Year |
| Feb | 秘密のチョコ工房 | Valentine's |
| Mar | 究極呪紋資格争奪戦 | Magic exam |
| Apr | 桜彩る祝水 | Cherry blossom |
| May | 愛しき人への贈り物 | Gifts |
| Jun | 海賊島の秘宝 | Pirate treasure |
| Jul | 白熱☆ビーチバトル | Beach |
| Aug | 儚く咲くや夜の華 | Summer festival |
| Sep | スポーツ秋の祭典！ | Sports festival |
| Oct | ハロウィン狂想曲！ | Halloween (month assumed from the title) |
| Nov | 愁いの紅葉狩り | Autumn leaves (month assumed from the title) |

**Proposed format:**
- **One event a month, 14 days,** alongside the standard pool, which never closes.
- **Higher chance, not exclusives:** an event pool holds the same cards, with three featured SSRs sharing half the SSR rate and a few featured SRs doing the same within SR. With a small friend group, an exclusive PvP card that someone missed forever would hurt more than it excites. Exclusives can be added later, and this choice closes nothing off.
- **Same card tickets and same pity counter,** with no event currency. Saved tickets give players a reason to look forward to an event.
- **Published odds per banner,** using `gacha_rates` for the chosen pool.
- **Cards only at first.** Gear banners wait for the real gear list, since the current 42 items are placeholders. The original's weapon sources are ready to use then.
- **Featured cards:** card data has no event tag in the original data, so you or I pick by name and art for each event.

**Changes:**
- **Pools as data:** `card_pools` gets `name`, `kind`, `starts_at`, `ends_at` and `featured`. The one-active rule becomes one standard pool plus time windows. A year of events can sit in the database and open by date, with no deploy.
- **Draw:** `draw_ten(key, pool_id)`, where the server rejects a closed pool. `gacha_requests` already records the pool, so draws stay traceable.
- **Odds:** because featured rates are only weights, the draw logic and the guarantees don't change.
- **`Gacha.tsx`:** banner switcher, featured cards and a countdown. Guests stay on the standard pool.
- **Visuals:** I'd agree the banner look with one mockup before building it.

**Left out on purpose:** event missions, login bonuses, per-banner pity, an admin screen (events are migrations for now), and paid anything.

## Order

| Step | Work | Size | Depends on |
|---|---|---|---|
| 1 | Separate tickets | Small | Decision 1 |
| 2 | Floor fix, if chosen | Very small | Decision 2 |
| 3 | Shard exchange | Medium, plus a mockup | Decision 3 |
| 4 | Event pools and banner screen | Medium, plus a mockup | Decision 4 |
| 5 | Christmas banner, live by 1 December | Small | Step 4, featured cards |

Steps 1 and 2 stand alone. Step 3 can follow step 4 if Christmas is the priority.
