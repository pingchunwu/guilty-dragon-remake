# Guilty Dragon–Inspired Card Battle PWA — Development Specification

**Status:** Working baseline for implementation  
**Last reviewed:** 2026-10-25 (added review findings and open decisions)  
**Language:** TypeScript for web and API; Godot/Phaser are not part of v1

This document captures the product and engineering decisions that future implementation work should follow. Items marked **TBD** must not be silently invented; confirm or record a versioned product decision before implementing them.

## 1. Product scope

### Confirmed for v1

- A personal browser game shared by URL with a small group of friends.
- PWA access with email sign-in. Visitors may preview/play without an account, but visitor progress is not saved and cannot later be claimed or recovered. What a guest can actually play is **TBD** (see §7).
- Card collection, deck building, one card pool, daily draw tickets, ten-pulls, and asynchronous PvP.
- Challenger submits their choices phase by phase. The defender's saved defense deck is played by a server-side AI.
- A battle continues through multiple phases until either player's HP reaches zero. Show a result summary; do not provide a post-battle replay.
- First release has no story exploration, 3D scenes, real-time PvP, fixed NPC decks, or leaderboard.
- Original anime-inspired fantasy artwork and characters. Use the original game only as a reference for broad card-frame composition and information hierarchy; do not copy existing characters or illustrations.

### Deck and collection rules confirmed for v1

- A deck has 32 cards in four 8-card slots: Heavy, Light, Magic, and Free.
- Cards in a non-Free slot must match its type. A slot cannot contain duplicate copies of the same card name.
- Each battle phase starts with eight cards in hand (see §6a).
- One daily draw ticket is granted, tickets accumulate, and one ticket buys ten draws. The initial release has one pool.
- A first-time signed-in player receives a default deck once.
- Each duplicate raises that card (or item) one level (decided 2026-10-26; it took five shards before). A card's level is its skill level and stops at its skill's max level (1, 3, 5 or 10); items stop at level 10. Duplicates past the cap are kept as spare shards. Existing shards were converted into levels by migration `20261026000200`.
- Consequence: a player owns at most one copy of each card, so every deck needs 32 distinct cards (at least 8 distinct cards of each constrained type). The duplicate-name slot rule cannot trigger under this model. The default deck and the first pool must be sized for this (pool size is **TBD**, see §7).
- Cards have the original game's rarity tiers N, N+, R, R+, SR, SR+ (decided 2026-10-26). Rarity sets a placeholder attack range and draw weight; real odds and balancing remain TBD.

### Explicitly deferred

- Real-time PvP, battle animation sequences, multiple/rotating pools, rarity balancing, player card crafting, and any leaderboard.
- PvE events, crafting/selling skills from the original game, and story content.

## 2. Technical decisions

### Chosen baseline

| Layer | Decision |
|---|---|
| Browser app | React + TypeScript + Vite, installable PWA |
| Visual/game UI for v1 | React, HTML/CSS/SVG; no game engine required for card selection and deck screens |
| Server logic (decided 2026-10-25) | Supabase only: PostgreSQL functions (RPC) + row-level security. No NestJS/Vercel API in v1 for collection, decks, tickets, or gacha. Battle resolution (decided 2026-10-26): a Supabase Edge Function `pvp` that runs the same TypeScript engine (see §6b). |
| Database and email identity | Supabase PostgreSQL and Supabase Auth |
| Hosting | Vercel (or any static host) for the frontend; Supabase for data, auth, and server logic |
| Source control / deploy trigger | GitHub connected to Vercel |

Use a TypeScript LTS-compatible toolchain and pin versions when scaffolding. Keep SQL migrations checked into the repository under `supabase/migrations/`. Database functions that change player state run as `security definer`, derive the player from `auth.uid()`, and are the only write path; tables are read-only (own rows) to the `authenticated` role through RLS.

Sections 3 and 4 below were written for a Vercel Functions API. Their principles (no in-memory state, never trust client values, idempotency, no caching of private data) still apply, now enforced inside Postgres functions.

### Engine decision: Godot and Phaser

Neither engine is needed for v1. The first release is primarily PWA pages, cards, forms, and phase-by-phase choices. Use React for those screens.

For the later animation phase, use Phaser if the game remains a browser-first 2D surface embedded in the React PWA. Consider Godot if the project intentionally shifts to a scene-driven game client or needs Godot's editor/animation workflow enough to justify replacing the React UI layer. Avoid embedding a small Godot canvas inside React by default; it creates a second UI runtime and a browser-to-engine integration boundary.

Godot web export is viable and supports PWA output. It renders into a canvas, uses WebAssembly and WebGL 2, and has extra browser/mobile considerations. If adopted, use Godot 4 with GDScript for web (Godot 4 C# projects currently cannot export to web); prefer the default single-threaded web export unless performance requirements justify cross-origin isolation setup. Validate target iOS/Safari devices before committing. See [Godot Web export docs](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html).

## 3. Hosting and serverless requirements

The API runs as stateless Vercel Functions, not as a persistent process. This removes Render Free Web Service's idle spin-down behavior, but does not guarantee zero startup latency or eliminate provider/function limits.

- Do not keep player, battle, auth, or rate-limit state only in process memory.
- Do not use local files as persistent storage.
- Persist challenge state, phase state, draw ledger, and idempotency records in PostgreSQL.
- Do not rely on an in-process timer, long-running worker, WebSocket server, or background loop. The v1 flows must complete as bounded HTTP requests; use database-driven lazy ticket accrual or an explicitly configured scheduled function if needed.
- Do not add periodic keep-alive requests. Handle API startup/network errors with a loading state and retry affordance.
- Keep each API operation short. Recheck current Vercel function duration, invocation, and bandwidth limits when deploying; Hobby is intended for personal, non-commercial use and can pause usage after limits are reached. See [Vercel Hobby](https://vercel.com/docs/plans/hobby) and [Vercel limits](https://vercel.com/docs/limits).
- Vercel PWA/service-worker caching may cache the app shell and versioned public assets. Never cache authenticated responses, draw transactions, battle mutations, or private player data.

Suggested monorepo layout:

```text
apps/
  web/       # React, TypeScript, Vite, PWA
  api/       # NestJS API adapted to Vercel Functions
packages/
  contracts/ # shared DTO/schema/OpenAPI-generated types, if useful
  cards/     # card/effect data formats that are safe to publish
```

Keep the API's Vercel function adapter and routing explicit. Do not start a permanent `app.listen()` server in a function invocation; bootstrap/reuse the Nest application according to the selected Vercel adapter's lifecycle guidance.

## 4. Authentication, API, and data ownership

- Use Supabase Auth for email sign-in. The browser receives an access token; the API validates it on authenticated routes and derives the player identity from the verified token.
- Visitor preview routes remain unauthenticated and must not create durable player progress.
- The browser talks to the API for player-owned game data. Do not ship database passwords, Supabase service-role credentials, or privileged keys in Vite client variables.
- The API enforces ownership for every deck, collection, ticket, challenge, and battle read/write. Never trust a client-supplied player ID, result, damage value, reward, random seed, or opponent deck contents.
- API payloads are versioned JSON under `/api/v1`. Return stable machine-readable error codes and validate request bodies.
- Email delivery: Supabase's built-in email sender is heavily rate-limited and may only deliver to project team members. Verify the current limits, and expect to configure a custom SMTP provider before inviting friends; otherwise sign-in emails may never arrive.

Indicative v1 routes (final names may be adjusted before implementation):

| Route | Purpose |
|---|---|
| `GET /api/v1/health` | Public function/readiness check; not a keep-alive endpoint |
| `GET /api/v1/me` | Profile and current ticket balance; lazily accrue a daily ticket idempotently if that policy is selected |
| `GET /api/v1/cards` | Public card definitions needed by the client |
| `GET/PUT /api/v1/decks/{attack\|defense}` | Read or validate/save a player's deck |
| `POST /api/v1/gacha/draws` | Spend one ticket for ten draws; require idempotency key |
| `POST /api/v1/challenges` | Create a challenge with immutable deck snapshots and rule/AI versions |
| `GET /api/v1/challenges/{id}` | Read the authorized challenge/battle state |
| `POST /api/v1/challenges/{id}/phases/{phase}/actions` | Submit challenger selections; server validates, executes defender AI, resolves, and persists the phase |

### Supabase connection

Vercel Functions are serverless. Use Supabase's shared Supavisor transaction pooler for serverless connections, keep the client pool small, require SSL, and configure the chosen database library according to Supabase's transaction-pooling guidance (including prepared-statement compatibility). Keep database credentials in Vercel server-side environment variables only. See [Supabase connection modes](https://supabase.com/docs/guides/database/connecting-to-postgres) and [pooling limits](https://supabase.com/docs/guides/database/connecting-to-postgres/pooling-and-limits).

## 5. Game authority and rule versioning

The server owns all persistent and competitive state. A battle should be reproducible/auditable from its rule version, AI strategy version, deck snapshots, and server-generated random seed. Persist battle state between phase requests; never depend on a warm function instance.

Challenge lifecycle:

1. Challenger chooses their attack deck and a friend's saved defense deck.
2. Server validates both and stores immutable snapshots, `rule_version`, `ai_strategy_version`, and a server-generated random seed.
3. Each phase, challenger submits a leader and permitted support selections. Server checks they came from the current hand and satisfy color/slot rules.
4. Server draws/resolves leader skills in a fixed, versioned order, runs defender AI from the snapshotted defense deck, computes attack/defense/damage, and updates HP and card zones.
5. Server checks for victory; otherwise it persists the next phase state.
6. Store a minimal audit record and final summary. There is no replay product feature.

Card definitions and skill/effect data must be separated from UI code. Use stable effect IDs, triggers, targets, parameters, source notes, and rule versions. Do not encode unverified original-game rules as fact. The client may show animation or previews, but the server's final result is authoritative.

`BattlePhaseState` should be sufficient to continue a battle across separate function invocations: both players' HP, draw piles, hands, discard piles, destroyed/removed cards, triggered effects, phase result, and current status. Distinguish destroyed/removed cards from ordinary discards.

Additional engine requirements:

- Deck snapshots store each card's level (and any level-derived stats) at challenge creation, for both decks, not only card IDs.
- `rule_version` pins a seedable PRNG algorithm (never `Math.random`) and the numeric rounding rule for multipliers, so the same seed and actions give the same result in every environment. The rounding rule itself is **TBD** (see §7).
- Challenger-facing responses never include the random seed, remaining draw-pile order, or the defender's hand.
- A battle must be guaranteed to end. The engine cannot be locked until the stalemate rules in §7 are decided (a tied Final Blow repeats forever if decks reset unchanged).

### Draw transaction

One draw request atomically performs all of the following:

1. Checks/records the idempotency key for the authenticated player.
2. Checks and deducts exactly one ticket.
3. Selects exactly ten cards from the active pool version and records the outcomes.
4. Adds cards or duplicate-card shards to the player's collection.
5. Commits the ledger, collection, and response record together.

A retry with the same idempotency key returns the original result and never charges twice. Daily ticket accrual uses the `Asia/Taipei` calendar and an idempotent database ledger/claim; do not depend on a process timer.

## 6. Initial data model

Candidate entities/tables; refine columns and constraints with migrations before implementation:

- `Player`, `Identity` (or Supabase Auth user ID mapping)
- `CardDefinition`, `CardPool`, `PoolRate`
- `PlayerCard`, `PullTicketLedger`, `GachaRequest`
- `Deck`, `DeckCard`
- `Challenge`, `Battle`, `BattlePhaseState`, `BattleResult`

Important constraints include one-time default-deck grant, unique card per constrained deck slot, unique `(player_id, idempotency_key)` for draws, and unique phase/action application so duplicate requests cannot resolve a phase twice.

## 6a. Battle rules, version `0.6.0-draft` (decided 2026-10-25, skills and levels 2026-10-26)

Product decisions are marked **decided**; values the product owner has not set are marked **placeholder** or **provisional** and live in `packages/engine` so they can change under a new rule version.

- **HP:** each side starts at 3000 (decided; raised from 1000). No phase cap and no end phase (decided); see "Ending" below.
- **Types are colours** (decided): Heavy/Light/Magic decide deck slots, same-colour supports, and type advantage. Advantage cycle Heavy > Light > Magic > Heavy, ×1.2 to the advantaged side's attack (cycle order provisional).
- **Equipment** (decided): one 裝備 loadout with 1 armor, 1 weapon and 1 gear slot, separate from the deck and used for both attack and defense battles. Replaces the earlier "3 weapon slots" decision.
  - Armor defense is subtracted from damage taken in a lost phase.
  - Weapon attack is added to the phase's attack after the combo and advantage multipliers (decided). Provisional: it is also added to deck-out hand totals, since it applies "every phase".
  - Gear has a slot but no effect yet (open).
  - Items come from a separate item gacha: one shared ticket for 10 item pulls; each duplicate raises the item one level, up to 10 (decided). Each level past 1 adds 10% of the item's base attack and defense, rounded down (decided 2026-10-26), so level 10 is ×1.9. Item odds are placeholders (equal weights).
  - Placeholder items: 6 per kind. Armor defense 14–29, weapon attack +10 to +60, gear no stats. Every player gets and equips the starter armor, weapon and gear (見習防具 14, 見習武器 +10, 見習飾品).
- **Data:** card attack is stored in `card_definitions.attack`, and item stats in `item_definitions`, both generated from `packages/engine/src/catalog.ts`. The web app loads card and item definitions (names, types/kinds, attack, defense) from these tables once per page load and keeps them in memory only, so the database is the source of truth for content; a test checks the database matches the catalog. Builds without Supabase settings fall back to the bundled catalog for guest play.
- **Card attack:** the number on a card is its attack (decided). A card's level does not change it (decided 2026-10-26). Placeholder values by rarity: N 30–45, N+ 35–55, R 45–65, R+ 50–72, SR 60–85, SR+ 70–100.
- **Skills** (decided 2026-10-26): every card has one skill; only the leader's skill fires, at the leader card's level. The skill list recreates the original game's community skill table ([wikiwiki guildra スキル](https://wikiwiki.jp/guildra/%E3%82%B9%E3%82%AD%E3%83%AB), last edited 2014) in `packages/engine/src/skills.ts`, mirrored to `skill_definitions`: combo up/down, attack up/down (flat and %), 不惜身命, defense up and armor break, damage guard, healing, direct damage, HP-for-attack, final damage up, final-blow guard, the three 武技 colour skills, hand discard/redraw and 選民主義, chain draw up/down, board power (共闘/同郷), shuffles, 肅清, cross-colour charge, 護盾 and 模仿. Event-only (Phantom, GvG), synthesis and sale skills are left out because those systems don't exist here.
  - Values (decided): percentages as in the original; flat values ÷10 to fit HP 3000 (e.g. パワーアップ1 = +2 attack per level, 癒しの水1 = +5 HP per level). Max levels as in the original.
  - Resolution order (provisional; the original's full order is not documented):
    1. Settle skills: a 護盾 cancels the other leader's skill unless it is also a shield; then an uncancelled 模仿 becomes the other leader's skill (not a shield or mimic) at the mimic card's level, capped at that skill's max.
    2. Leader-time hand and deck effects, challenger first. Discard/redraw act on the hand cards that were not picked (other colours first, then lowest attack). 選民主義 returns other-colour hand cards to the deck and redraws. Shuffles return the rest of the hand (and, for "all", the discard pile) to the deck and redraw as many.
    3. Chains, with the draw cap changed by draw skills and extra colours merging for charge skills. 肅清 fires once when all 4 spaces are blocked, removing the earliest blockers and drawing into the freed spaces.
    4. Colour multipliers: natural advantage, then 天秤 (both 1.0), 凌駕 (own 1.2), 不調 (cancel the enemy's advantage).
    5. Attack = floor(sum × combo × colour) + max(0, floor(weapon × (100 + weapon % up − enemy's % down) / 100) + flat up − enemy's flat down) + board bonus + HP-for-attack gain. Attack up/down skills (パワーアップ, 脱力, 力の封印, 武装封咒, 不借身命…) change only the weapon's power: the original table says 武器パワー for every one of them (corrected 2026-10-26; they used to scale the whole attack, so 武装封咒 cancelled the enemy's entire attack). Combo count = counted cards + combo up − enemy's combo down, clamped to 1–5.
    6. Defense = floor(armor × (100 + defense % − enemy's armor break − 不惜身命 penalty) / 100).
    7. HP effects for each side in turn: heal (up to max HP), pay HP (not below 1; the full cost still becomes attack), direct damage to the enemy (not below 1; % is of current HP).
    8. Phase damage = winner's attack − loser's defense, + winner's final damage (flat, and % of that damage), − loser's guard, minimum 0.
  - Deck-out phases use no skills, except that the receiving side's strongest 一縷希望/守護神 held in its hand reduces the final-blow damage (provisional; the original fires them on Final Blow, which has no leader here).
  - The defender AI still ignores skills (`ai 0.4.0`).
- **Hand** (decided): 8 cards. Cards not played stay in hand; after each phase the hand refills to 8 from the draw pile.
- **Picking** (decided): each side plays exactly 5 cards per phase (the whole hand if it has fewer): a leader, which always counts, and 4 cards of any colour in the 4 spaces behind it. How fast a deck empties depends on the chain draws.
- **Chain** (decided, matching the original game's play video): the 4 spaces resolve in order. A card of the leader's colour merges into the attack, which frees its space, and one card is drawn from the deck into the end of the row. A card of another colour stays and blocks its space; it draws nothing. Drawn cards resolve the same way. The chain ends when all 4 spaces hold blockers, when 5 drawn cards have counted, or when the deck is empty, so there are never more than 4 blockers.
  - Provisional detail: to keep the 5-draw cap exact, a new card is only drawn while counted draws plus waiting draws are under 5.
  - All played and chain-drawn cards (counted or blocking) go to the discard pile after the phase (decided).
- **Attack:** floor(sum of counted cards × combo × advantage). Combo by counted cards, counting from the leader: 1–5 cards ×1.0, ×1.1, ×1.2, ×1.3, ×1.5, staying at ×1.5 beyond 5 (decided). Higher attack wins the phase; damage = winner's attack − loser's armor, minimum 0 (floor provisional). Equal attack: no damage (decided).
- **Defender AI** (`ai 0.4.0`): leads with the type whose cards (up to 5, highest attack first) give the highest attack ignoring advantage; ties go Heavy, Light, Magic. It fills the rest of its 5 cards with its lowest-attack cards of other types. It never sees the challenger's selection.
- **Deck-out** (decided): once a side's draw pile hits 0 (during a chain or a refill), the next phase is a deck-out phase for that side, using whatever is in its hand.
  - Only one side runs out: its hand total hits the opponent directly, ignoring armor. Provisional: the opponent does not attack in that phase and keeps its hand; only the side that ran out reshuffles.
  - Both run out: compare hand totals; the higher total deals (total − loser's armor), equal deals nothing. Then both decks are reshuffled and reset.
  - A side that reshuffles puts its hand, discard and pile together, shuffles, and draws a fresh 8.
- **Ending** (decided): the battle ends only when a side reaches 0 HP. There is no safety cap; instead, balance must keep base armor below the lowest card attack so most won phases deal damage (levels and defense skills can now push armor above a single card). Deck-out hits ignore armor, so battles still end; the engine tests play full battles with every placeholder card to check this.
- **Balance (open):** a phase typically counts about 5 cards for ×1.5, so attacks of 300–800 are common. With skills (0.6.0-draft), 400 simulated AI-vs-AI battles with the default deck averaged 11.0 phases at level 1 and 10.6 with every card and item at max level (at most 17), with about 2.5 deck-outs per battle; random decks drawn from all 110 cards at max level averaged 8.9 phases. Card attack, skill values, HP, the combo cap, or the chain limits need tuning before this feels right.

### Rule version `0.7.0-draft`: picking, draws and weapons from the OG clip (spec only, not built)

Source: the original game's battle footage, [YouTube od0P9ciUKe8](https://www.youtube.com/watch?v=od0P9ciUKe8) 00:21–00:37 (judgment screen after 00:37). The engine still runs `0.6.0-draft`; this section replaces the **Picking**, **Chain**, **Attack** and the weapon part of **Equipment** above once built. Everything else in §6a carries over. Old battles keep `0.6.0-draft`.

What the clip shows (observed):

- The hand refills to 8; each side shows its deck count.
- **Leader step:** the prompt asks for a leader. Every hand card shows its **DRAW** number, not its attack.
- The leader's colour lights the weapon of that colour (3 weapon slots, one per colour, 1300 each in the clip); the other two grey out, and the attack total starts at that weapon's power.
- **Charge step:** the prompt asks for power-charge units. Hand cards now show their **POW** (attack). All 4 picks in the clip are the leader's colour. No button: the phase starts after the 4th charge pick.
- **Playback:** each picked card flies into the total (1300 → 4037 → 6432 → 7288) and lights one combo pip; at the same time cards are drawn from the deck (24 → 21) into a row. The leader was the last card of the bottom hand row and shows **DRAW 3**, and exactly 3 cards were drawn. They were off-colour and added nothing. The leader is added last. 7288 = weapon 1300 + 4 supports + leader 856, a plain sum.
- The opponent does the same at the same time in the top row.
- After 00:37: a judgment screen shows each side's attack and defense as a **percentage** (11%, 16%), then only the winner attacks (プレイヤーアタック) with several hits.

Rules (decided 2026-10-26 by the product owner, following the clip and the [system wiki](https://wikiwiki.jp/guildra/%E3%82%B7%E3%82%B9%E3%83%86%E3%83%A0), unless marked provisional):

- **Cards gain a DRAW stat (0–6):** how many cards the leader draws from the deck. Only the leader's DRAW is used, so the two sides usually draw different amounts. Values come from the OG card library (see "OG card library" below).
- **Picking:** each side picks a leader, then 4 charge cards of **any colour** from the hand. Picking the 4th charge card starts the phase (no confirm button). Before that, a picked charge card can be taken back one at a time; taking back the leader clears the picks. A hand with fewer than 5 cards starts the phase when every card is picked.
- **Charge:** the 4 charge cards sit in 4 spaces behind the leader and resolve in order. A card of the leader's colour adds its POW and +1 combo and frees its space. A card of another colour is a **blocker**: it stays in its space and adds nothing.
- **Draws:** then the deck draws the leader's DRAW count, one card at a time, into the free spaces. A card of the leader's colour adds its POW and +1 combo and frees its space; another colour blocks a space. Drawing stops when the DRAW count is used up, when every space holds a blocker (even with draws left; wiki: 同色でないカードがドロー枠を埋めてしまうと、残りドロー回数が残っていてもそこでドロー終了), or when the deck is empty. In the clip the 4 charge cards all counted, so the 3 off-colour draws took 3 of the 4 freed spaces.
- **Discard:** every played and drawn card, counted or blocking, goes to the discard pile after the phase (as in the OG). Unpicked hand cards stay in hand.
- **Weapons:** the equipment loadout gets 3 weapon slots, one per colour (Heavy, Light, Magic). The leader's colour picks which weapon is used; the others do nothing that phase. This reverses the 2026-10-25 "one weapon slot" decision. Weapon power is on the same scale as card POW, as in the OG ([装備変更](https://wikiwiki.jp/guildra/%E8%A3%85%E5%82%99%E5%A4%89%E6%9B%B4): starter weapons 300, story weapons 1000; 1000–2000 in the Final Blow table; 1300 in the clip).
- **Armor:** as in the OG, 4 armor slots by body part: head (頭), body (胴), legs (脚) and back (背). Each piece gives a defense %, and a side's defense % is the sum of its 4 pieces (OG examples: starter body 2%, event body 10%, head 3%; the clip shows totals of 11% and 16%). The armor pieces replace the old flat armor and the gear slot.
- **Attack:** total = weapon + leader POW + every counted card's POW, a plain sum, shown counting up during playback. At judgment: attack = floor(floor(total × advantage) × combo). Combo counts the leader and every counted card, ×1.0/1.1/1.2/1.3/1.5 for 1–5, ×1.5 beyond, and is capped at 5 combo as in the OG (最大で5まで溜まる).
- **Damage** (OG): the higher attack wins the phase. In a normal phase the two sides' numbers are subtracted and the difference hits the loser ([Bahamut guide](https://forum.gamer.com.tw/Co.php?bsn=4005&sn=30247): 雙方數字相減後的差值扣對方體力). Then the loser's defense % reduces it, then flat guard: damage = max(0, floor((winner's attack − loser's attack) × (100 − loser's defense %) / 100) − loser's guard). Equal attack deals nothing. Defense % applies only after the subtraction (decided 2026-10-26; the OG sources don't say). Defense skills change the % (ハードアーマー +Lv×1–3%, 見守る心 +15%, 銀冠穴熊 +40%, 魄の甲冑 +Lv×10%, ブレイクアーマー −Lv×1–3% and 鎧通し −8% on the enemy); ガード is the flat guard (−Lv×50/100/150).
- **HP:** the OG had no separate PvP HP. Duels used the player's HP from the player-level table ([ステータス](https://wikiwiki.jp/guildra/%E3%82%B9%E3%83%86%E3%83%BC%E3%82%BF%E3%82%B9): Lv 5 810, Lv 20 2070, Lv 58 3400, Lv 80 4500; 3200 in the clip). Because damage is only the difference between attacks, OG duels usually lasted until a deck ran out, around round 3–4. This game has no player level, so HP stays a fixed 3000 for both sides (provisional; that is a mid-level OG player).
- **Deck-out:** the side's total is its hand total + **all three** weapons' power. As before it ignores defense. The OG Final Blow formula (deck POW ÷ 8 + weapons ÷ 3) is not used, because the clip is a raid fight, not PvP.
- **Card level** (decided 2026-10-26): a card's level only sets its skill level. It rises only by pulling a duplicate in the gacha. POW and DRAW do not change with level, so each card has one POW value (see open questions).
- **Playback order:** leader reveal and weapon light-up → leader-time skills → charge cards resolve one at a time (count with a combo pip, or block) → deck draws one at a time → leader added last → judgment screen (attack, defense %, multipliers) → winner's attack with damage and HP drop. Both sides play back at the same time.
- **Skill values:** with OG-scale numbers, flat skill values use the OG values again (no more ÷10), e.g. パワーアップ1 = weapon +300, 影討ち1 = −Lv×50 HP.
- **Skills that touched the old chain:** chain-draw up/down change the leader's DRAW count; 肅清 fires when all 4 spaces hold blockers; cross-colour charge lets the named extra colour count, both as a charge pick and as a draw.
- **Defender AI:** picks a leader and 4 charge cards, preferring the leader's colour. Its leader choice must now weigh DRAW too, so the AI gets a new version.

Open questions (do not invent during implementation):

None left. Resolved 2026-10-26: HP stays 3000; defense % comes from armor; level only affects skills; a deck-out uses all three weapons; the deck-out keeps the hand total, not the OG Final Blow; each card uses its OG **max POW**; defense % applies only after the two attacks are subtracted (as in the damage formula above).

Still to check after building (not a decision): HP 3000 comes from the OG, but our placeholder weapons and armor are new. Step 7 below re-runs the AI-vs-AI simulation to confirm battles last several phases instead of ending in one, and tunes item values if not.

### Implementation steps for `0.7.0-draft` (not started)

One PR per step, in order; each keeps the tests passing. Old battles stay on `0.6.0-draft`.

1. **Card data:** add `draw` to cards, and set `attack` to the OG max POW scale. Replace the 110 placeholder cards (one per skill, so every skill stays covered) with POW and DRAW values from the OG ranges above, per rarity. `packages/engine/src/catalog.ts`, a new migration for `card_definitions.draw` and the new values, and the catalog-matches-database test.
2. **Equipment data** (built): 3 weapon slots (one per colour) and 4 armor slots (head, body, legs, back) with defense %; drop the flat armor value and the gear slot. Placeholder items on the OG scale (weapons 300–2000, armor pieces 2–10%); starter set of 3 weapons at 300 and 4 armor pieces. `equipment.ts`, `catalog.ts`, a migration for `item_definitions` and existing loadouts (move each player to the starter set), `apps/web/src/screens/Equipment.tsx`. Item kinds are the slots (`heavy`, `light`, `magic`, `head`, `body`, `legs`, `back`); the old armor/weapon/gear items are removed. Until step 4, rule `0.6.0-draft` reads the new loadout as: strongest weapon for the weapon bonus, sum of the 4 armor % as flat armor; stored 0.6.0 battles were mapped so their numbers do not change.
3. **Skill values:** flat values back to OG values (no ÷10); armor-type skills change defense %; ガード stays flat. `skills.ts`, `skills.test.ts`, `skill_definitions` migration.
4. **Engine rules** as rule version `0.7.0-draft` (`rules.ts`, `battle.ts`, `battle.test.ts`):
   - picking: leader + 4 charge cards of any colour;
   - charge spaces then leader-DRAW draws, blockers, stop conditions;
   - attack = floor(floor((weapon of leader colour + leader + counted POW) × advantage) × combo);
   - damage = max(0, floor((winner − loser) × (100 − loser's defense %) / 100) − guard);
   - deck-out = hand total + all 3 weapons, ignoring defense;
   - `PhaseResult` gains what playback needs: each side's weapon used, charge results, draws, defense %.
   Keep `0.6.0-draft` working for stored battles.
5. **Defender AI:** new `ai_strategy_version`; pick the leader by colour count, POW and DRAW, then 4 charge cards preferring the leader's colour. `battle.ts`, tests.
6. **Server:** rebuild the engine bundle (`supabase/scripts` → `functions/_shared/engine.js`), have `pvp` create new battles on `0.7.0-draft`, and extend the sanitized view with the new result fields. `supabase/functions/pvp/logic.ts`.
7. **Balance check:** run 400 AI-vs-AI battles with the default deck (as was done for 0.6.0) and record average and max phases and deck-outs. Target: several phases per battle, with a deck-out about round 3–4 as in the OG. Tune placeholder weapon and armor values if needed, and record the numbers in §6a.
8. **Battle UI** (§6c round 2): leader step showing DRAW, then charge step showing POW; the 4th charge pick starts the phase (no 出牌 button); playback in the clip's order (weapon light-up, cards fly into the total with combo pips, draws, leader last, judgment screen with attack and defense %, winner's attack, HP drop), both sides at once. `Playback.tsx`, `BattleParts.tsx`, `Battle.tsx`, `Pvp.tsx`. Check at 375 × 667 in the browser pane with reduced motion on and off.

### OG card library (research, 2026-10-26)

Source: [ユニット早見表](https://wikiwiki.jp/guildra/%E3%83%A6%E3%83%8B%E3%83%83%E3%83%88%E6%97%A9%E8%A6%8B%E8%A1%A8) (community quick-reference, last edited 2014) with per-colour/rarity pages (e.g. [重装SUPERRARE](https://wikiwiki.jp/guildra/%E9%87%8D%E8%A3%85SUPERRARE)), plus [ドロー順](https://wikiwiki.jp/guildra/%E3%83%A6%E3%83%8B%E3%83%83%E3%83%88%E6%97%A9%E8%A6%8B%E8%A1%A8/%E3%82%BD%E3%83%BC%E3%83%88%E3%83%89%E3%83%AD%E3%83%BC) and [最大POW順](https://wikiwiki.jp/guildra/%E3%83%A6%E3%83%8B%E3%83%83%E3%83%88%E6%97%A9%E8%A6%8B%E8%A1%A8/%E3%82%BD%E3%83%BC%E3%83%88%E6%9C%80%E5%A4%A7POW) sorts.

- **Size:** about 730 units, roughly 245 per colour (重装 ~247, 軽装 ~243, 魔装 ~243), plus ~18 material items (EXP cores, ナビコ) that are not battle cards.
- **Columns:** rarity (N, N+, R, R+, SR, SR+), name, initial POW, max POW, DRAW, skill, notes (where obtained, e.g. a seasonal gacha).
- **POW by rarity (initial / max):** N 160–400 / 320–800; N+ 100–420 / 220–924; R 280–500 / 644–1150; R+ 360–530 / 864–1272; SR 300–710 / 750–1775; SR+ 470–700 / 1410–2070. Max ÷ initial is about 2.0 (N), 2.2 (N+), 2.3 (R), 2.4 (R+), 2.5 (SR), 3.0 (SR+).
- **DRAW:** 0–6. Low rarities are mostly 1–3 and SR/SR+ mostly 3–5, but it does not track POW: e.g. 昴 (N+, 100/220) has DRAW 4 while エンデュランス (N+, 420/924) has DRAW 0. That trade-off (high POW or high DRAW) is the main leader choice.
- **Examples:** 寺島良子 N 260/520 DRAW 2 ガード1; 楓 N+ 360/792 DRAW 2 パワーアップ3; 殴られ屋碧 R 280/644 DRAW 3 見切り; 剣舞のブラックローズ SR 540/1350 DRAW 4 ガード3; 灼紅覚醒のエレミア SR+ 650/1950 DRAW 5 魂の息吹; 迷いし志乃 R 340/782 DRAW 3 天秤の武技; 魔蒼覚醒のココレ SR+ 650/1950 DRAW 5 癒しの水4.
- **Remake plan:** the long-term goal is to recreate the OG card set: same rarity, max POW, DRAW and skill per card, with original names and art (characters and art are not copied, §1). For this dev stage, a **testable subset** is enough: replace the 110 placeholder cards (one per skill) with POW and DRAW values drawn from the ranges above, so every skill stays covered. Importing the full table is a later step.

## 6b. Friend PvP (decided 2026-10-26)

Product decisions (asked 2026-10-26):

- **Finding opponents:** any registered player can be challenged. Players can also add friends by friend code (8 characters, one-directional); friends are listed first.
- **Names:** a player's shown name defaults to their account email and can be changed in the game (1–20 characters; clearing it goes back to the email). Consequence: every player can see other players' emails until they set a name.
- **Rewards:** none. A battle only produces a win/loss record.
- **Open battles:** one unfinished battle per challenger. Abandoning is a loss: the player cannot leave the battle screen (tabs and sign-out are hidden) except by surrendering, and not acting for 60 seconds in a phase is a loss by timeout. Reloading returns to the battle.
- **Defender:** no notification; the PvP screen lists finished battles for both the challenger and the defender (who, win/loss, phase, end reason, HP).

Implementation:

- The `pvp` Edge Function (`supabase/functions/pvp`) verifies the caller's access token and handles `start` (snapshot both decks with card levels, card definitions and equipment, server seed, `startBattle`) and `play` (check phase number, `resolvePhase` with the defender AI). It bundles `packages/engine` into `supabase/functions/_shared/engine.js` (`npm run gen:engine`; a test checks the bundle is current).
- It writes only through service-role database functions (`pvp_prepare`, `pvp_create`, `pvp_load`, `pvp_record_phase`). `pvp_battles` (summary) is readable by both participants; `pvp_battle_secrets` (seed, snapshot, engine state) and `pvp_phases` (per-phase selection and raw result, the audit record) are not readable by players. Each phase applies once (`PHASE_CONFLICT` otherwise).
- Players get a sanitized view (`pvp_view`): own hand, draw-pile counts, HP, equipment, the last phase result and the shown cards. It never includes the seed, RNG state, draw-pile order or the defender's hand, also not the hand a defender keeps in a one-sided deck-out.
- Name, friends, surrender and lobby are ordinary RPCs (`pvp_lobby`, `pvp_set_name`, `pvp_add_friend`, `pvp_remove_friend`, `pvp_surrender`).
- **Provisional:** the server accepts an action up to 5 seconds after the 60-second deadline for network delay (`game_config.pvp_grace_seconds`); timeouts are applied lazily on the next request.

## 6c. UI revision (requested and built 2026-10-26 in PRs #6, #8 and #10; the re-sign-in report is not reproduced)

### Requirements

In a battle (practice and PvP):

1. **Long-press card info:** long-pressing any card shows a toast with its name, colour, attack, rarity, level and skill effect at that level. The original showed a card's attack and effect while it was held ([Bahamut guide](https://forum.gamer.com.tw/Co.php?bsn=4005&sn=30247)).
2. **Phase playback:** after confirming a selection, the phase plays back step by step: the chain resolves one card at a time; a card of the leader's colour merges into the attack while one card is drawn into the end of the row; another colour blocks its space.
3. **One screen:** the whole battle fits on one screen without scrolling.
4. **No tab bar** during a battle.

After signing in:

1. A signed-in player reopening the game is not asked to sign in again.
2. The build/rules line ("Guilty Dragon Remake 開發版 · 規則 0.6.0-draft…") moves to a player tab.
3. The ticket count shows only on the gacha tab.
4. Deck and equipment share one tab; the collection becomes a section of the player tab.

### Requirements, round 2 (2026-10-26; not built yet)

Reference: the original game's battle footage, [YouTube od0P9ciUKe8](https://www.youtube.com/watch?v=od0P9ciUKe8), **00:21–00:37** (also listed in the plan's reference list as an OG reference). It is the authority for how a phase looks and plays; the earlier playback decisions below (side by side, 0.5 s per step) give way to it wherever they differ.

1. **Mimic the OG phase presentation:** the animation, the phase order and the on-screen effects (card selection, leader reveal, charge/draw chain, skill callouts, attack compare, damage and HP change) follow that clip. Only the rule engine's results are shown; animation never changes damage.
2. **Ignore the clip's semi-auto and auto buttons.** We do not build them.
3. **Remove the 出牌 (confirm) button.** Picking the fifth card (leader + 4) starts the phase at once, as the original did ([wiki tips](https://wikiwiki.jp/guildra/%E5%B0%8F%E3%83%8D%E3%82%BF)). Picked support cards can still be taken back one at a time before the fifth. When the hand has fewer than 5 cards, the phase starts when every card is picked.

Open: the clip has not been frame-checked against our beats yet; list the differences (timing, camera, effects, layout) in the PR before changing `playbackSteps`.

### Original playback order (research)

Community sources give this order per phase: leader chosen → "on leader select" skills (乱舞) → charge one card at a time (same colour adds attack and +1 combo; draws come from the deck per the leader's draw count; an off-colour card takes a space and the draw stops when spaces run out) → "after charge" skills (追撃) → "when drawing ends" skills (見切り) → attack/defense judgment with combo and attribute multipliers → the winner deals damage. Sources: [system wiki](https://wikiwiki.jp/guildra/%E3%82%B7%E3%82%B9%E3%83%86%E3%83%A0), [skill table](https://wikiwiki.jp/guildra/%E3%82%B9%E3%82%AD%E3%83%AB), [Bahamut guide](https://forum.gamer.com.tw/Co.php?bsn=4005&sn=30247), [AppBank 2012](https://www.appbank.net/2012/10/28/iphone-application/490608.php). No source says whether the two sides play back at the same time or in turn.

This matches the engine's existing order (§6a), so playback needs no rule change: it replays `SideResult.chain` and the fields already in each `PhaseResult`.

### Playback decisions (2026-10-26)

- Both sides' chains play back side by side at the same time, one step per beat.
- About 0.5 s per step, with a skip button; no animation under `prefers-reduced-motion`.
- On desktop, right-click or holding the mouse button opens the same card toast as a long press.

### Implementation plan

Three PRs, smallest first. Engine, database and Edge Function stay unchanged.

1. **Navigation and session** (built 2026-10-26. The re-sign-in report did not reproduce in a desktop browser: a reload and an expired access token both kept the player signed in, with the token refreshed. Only the sign-in form flashing while a saved session loads was fixed. Remaining suspects are device-side: an installed iOS PWA keeps storage apart from Safari, and Safari may clear a site's storage after 7 days without a visit; also check the Supabase Auth session time-box and inactivity timeout settings.) (`App.tsx`, new `screens/Player.tsx`, `DeckEditor.tsx`, `Equipment.tsx`, `Gacha.tsx`):
   - Tabs become 對戰 / 牌組 / 抽卡 / 玩家. 牌組 shows the deck editor and equipment as two sections (or a chip switch, reusing `.chips`). 玩家 holds the account line (email or name), the build/rules line, sign-out and `Collection` as a section.
   - Ticket count moves from the app-wide bar into `Gacha`; the app-wide bar and header subtitle go away.
   - Session: supabase-js already keeps the session in `localStorage`, so first reproduce the reported re-login. Likely causes to check: an installed iOS PWA has storage separate from Safari, so a sign-in link opened in Safari doesn't carry over (the code path does); or the app briefly shows `SignIn` before `getSession` resolves. Fix whichever it is; no new auth code if neither.
2. **Long-press toast** (built 2026-10-26; works on every card tile in the app, not only in battle; chain chips in the phase summary get it with the playback rework) (`CardTile.tsx`, `BattleParts.tsx`, `styles.css`):
   - `CardTile` gets an `onInfo` prop: pointer down starts a 450 ms timer, moving or lifting cancels it, and `contextmenu` also opens it; a click right after a long press is ignored so it doesn't also pick the card.
   - One `CardToast` (fixed at the top of the battle screen, `role="status"`, closes on tap or after a few seconds) shows the card with `skillEffectText` at the card's level. Used in the hand picker, chain rows and deck-out panel.
3. **Playback and one-screen layout** (built 2026-10-26: `screens/Playback.tsx` with `playbackFrames` and `PhaseBoard`; the old `PhaseSummary` is gone and its skill banners open from the board's 技能詳情 button; hand cards hide their level, which the long-press toast shows; fits 375 × 667 with no scrolling) (`BattleParts.tsx`, `Battle.tsx`, `Pvp.tsx`, `App.tsx`, `styles.css`):
   - A pure `playbackSteps(result)` turns a `PhaseResult` into ordered beats: leader reveal and leader-time skill (with `handChange`), one beat per chain step (counted: attack and combo tick up while the next drawn card enters the row; blocked: the space is marked; purged blockers drop out), then multipliers, attack compare, defense and HP effects, damage. It gets a unit test against a fixed engine result.
   - `PhasePlayback` steps through the beats on a timer, with a skip button; the HP bars update only at the damage beat. `PhaseSummary` stays as the end state.
   - Battle layout uses a fixed `100dvh` grid: opponent HP and row on top, playback in the middle, own HP, hand (8 cards, 4 × 2) and confirm button at the bottom. The rules list moves behind a disclosure on the start screen. Target: no scrolling at 375 × 667.
   - Practice battles report "in battle" to `App` like PvP does, and `App` hides the tab bar and header during any battle. Practice keeps a back/quit button; PvP keeps surrender.
   - Check in the browser pane at mobile size, with reduced motion on and off, and run the existing tests.

## 7. Open decisions — do not invent during implementation

Resolve these before locking battle-engine behavior or pool data:

- Starting HP, HP maximum, per-phase damage formula, healing cap, draw/phase tie handling, and simultaneous zero-HP handling.
- **Attack model — decided 2026-10-25:** each phase both sides compute an attack value; the side with the higher attack wins the phase and is the only one that attacks. Damage = winner's attack − loser's defense. Still open: equal-attack phases, whether damage has a floor (e.g. 0 or 1), and where a side's defense value comes from.
- ~~**Guaranteed battle end:** a phase cap~~ — replaced later on 2026-10-25: no phase cap; battles end by HP only, with balance keeping armor below card attack (see §6a).
- ~~**Weapons:** 3 weapon slots~~ — replaced 2026-10-25 by one loadout of armor, weapon and gear (see §6a). Still open: the gear effect, item rarity/odds, and real item stats. Item levels were decided 2026-10-26 (+10% per level, cap 10).
- ~~**Type, colour, and attribute**~~ — decided: types are colours (see §6a). Original question: Heavy/Light/Magic are slot types; the docs also use a three-way attribute counter system and "same-colour" supports. Define whether these are one concept, and if not, which one support selection, counters, and slot validation each use.
- ~~Hand size~~ — decided 2026-10-25: 8 cards with refill and a chain (see §6a). Original question: exact relationship between five starting cards and the reported original-game limit of leader plus four support cards; recommended initial interpretation is deal five and allow up to five selected cards, with skill-drawn cards outside the starting hand count. Risk: with five cards and a same-colour support rule, the best play is often "take every card of the biggest colour", which removes most decisions. Confirm in rule walkthroughs that five cards still leaves real choices, or revert to eight.
- **Defender AI information and goal:** the server receives challenger picks before running the AI. Decide whether the AI may see them (recommended: no; it decides only from its own hand and public state). If the attack model includes defense, decide whether "maximize current-phase attack" becomes another goal such as net damage.
- Multiplier rounding (×1.1, ×1.2, ×1.5, …) and whether HP/damage are always integers.
- Card-zone movement at phase boundaries, hand/discard/deck recycling, and clearing versus destroying cards.
- Full trigger ordering and all skill values/targets/limits, with source confidence recorded card by card. A provisional order and the original values are implemented (see §6a).
- Final Blow behavior and whether/when a non-tie Final Blow resets a deck; available community sources are incomplete. Any temporary rule must be explicitly marked as a new-game decision and versioned.
- HP/score tie-breakers and deterministic defender-AI tie-break order. Initial defender strategy is versioned maximum current-phase attack value.
- Pool odds, guarantees and any multi-pool schedule. Rarity tiers and level caps were decided 2026-10-26 (see §1, §6a).
- Email sign-in flow. **Provisional implementation:** an email code (OTP; length set in Supabase, currently 8 digits) as the main path, because a link opened from email lands in the browser, not an installed PWA. The same email also carries a sign-in link, which the app accepts. Custom SMTP (Resend) is configured; a verified sending domain is still needed before friends can receive codes.
- ~~Whether to use NestJS on Vercel~~ — decided 2026-10-25: Supabase only (see §2).

Provisional placeholder values used by the first implementation (clearly marked in code and data; replace when decided):

- Starting tickets: 1. Default deck: one 32-card placeholder deck saved as both the attack and defense deck.
- Pool (`pool-v1`): one placeholder card per skill (110 cards), draw weight per card by rarity: N 12, N+ 8, R 5, R+ 3, SR 2, SR+ 1.

Product decisions added after the 2026-10-25 review (not engine-blocking, but needed before the matching delivery step):

- **Original cards vs. recreated cards:** the art direction requires original characters, but rule research plans to transcribe the original game's skills card by card, which would rebuild its card list. Decide between (a) reusing the original's mechanics and effect families with a newly designed card set, or (b) recreating original cards' stats and skills. Also decide whether "Guilty Dragon" appears in the public project/game name.
- **Collection sizing:** first-pool card count (must be well above 32), the 32 distinct cards in the default deck, and whether one card may sit in both the attack and defense decks.
- **New-player state:** starting ticket count; whether the default deck becomes both attack and defense deck; whether a player with no saved defense deck can be challenged.
- ~~**Battle rewards**~~ — decided 2026-10-26: no rewards; defenders see a history list, no notification (see §6b).
- ~~**Abandon, expiry, and rerolls**~~ — decided 2026-10-26: one unfinished battle at a time; surrender is a loss; 60 s without acting is a loss by timeout (see §6b).
- **Guest play:** which deck a guest uses, who they fight, and whether the engine runs in the browser (engine shipped as a shared package) or through unauthenticated API routes (needs abuse/usage limits).

The original-game sources summarized in the product research are community-maintained and may describe older versions. Preserve source URLs, dates/version, and confidence notes when adding rule data.

## 8. Delivery sequence

1. **Lock battle rules:** resolve open rules, produce machine-readable card/effect schemas, and mark original facts vs new-game decisions. Walk through a tied Final Blow and a no-damage stalemate to prove every battle ends.
2. **Build the deterministic domain engine:** battle calculations independent of UI/API transport; version rules and AI.
3. **PWA shell and account:** guest preview, email sign-in, first-login player/default deck, public card collection.
4. **Deck management:** attack and defense decks with server validation.
5. **Gacha:** daily ticket ledger, one pool, atomic idempotent ten-pull, duplicate shards.
6. **Asynchronous PvP:** snapshots, phase action API, server AI, persistent multi-phase state, result summary.
7. **Visual polish:** original art, responsive card layouts, PWA installation/cache behavior.
8. **Post-v1:** multiple pools, rarity/economy, card crafting, optional Phaser/Godot animation client, and only later real-time PvP.

## 9. Operational notes

- Track Vercel Function usage and Supabase database/egress limits; both free offerings can change.
- Supabase Free projects can pause after inactivity and have limited database/storage quotas. Keep a recoverable export of important project data; do not treat the free project as a backed-up production database. See [Supabase pricing](https://supabase.com/pricing) and [project pausing](https://supabase.com/docs/guides/platform/free-project-pausing).
- Keep provider secrets out of Git. Commit `.env.example` with names and safe placeholders only.
- Use health/error logs that include request and battle IDs but omit access tokens and sensitive email data.
- Keep public card art/static assets separate from player-private data. Store only small battle state and user data in Postgres; do not store generated animation/render assets there.

