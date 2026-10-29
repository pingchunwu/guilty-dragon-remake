# Gacha animation plan (10-pull)

Goal: replace today's instant result grid (`apps/web/src/screens/Gacha.tsx`) with the staged reveal that modern Japanese mobile gacha games use:

1. a build-up whose colour hints at the best result
2. a reveal of each card
3. a big moment for the top rarity
4. a summary

The theme is our own: a sealed dragon gate (罪竜の封印), not any one game's look.

## Flow

| # | Stage | What the player sees | Length | Tap |
|---|---|---|---|---|
| 0 | Confirm | The 十連抽 button presses in and the screen darkens into a full-screen overlay. | 0.3s | – |
| 1 | Seal | A rune circle draws itself on a dark backdrop, with embers drifting up. | 1.2s | Speeds up |
| 2 | Omen | The circle charges in the **best rarity's colour**: N/R white-blue, SR gold, SSR rainbow. Sometimes it **upgrades mid-charge** (blue cracks to gold, gold to rainbow), which is the genre's signature "promotion" tease. | 1.0s (+0.6s if it upgrades) | Speeds up |
| 3 | Break | The seal shatters into shards with a white flash and a short screen shake. Ten light trails fly to a 2×5 grid of face-down cards. | 0.8s | – |
| 4 | Reveal | Each face-down card shows its rarity glow on the back: N/R a soft rim, SR a gold rim, SSR a rainbow aura. Cards flip one by one, about 0.15s apart. **Tap a card to flip it now, or tap "全部翻開" to flip them all.** | ~2s | Flips |
| 5 | SSR cut-in | For every SSR, play is paused for a full-screen cut-in: <ul><li>the art slides in on a speed-line background with a light sweep</li><li>the name and skill come in big</li><li>a "NEW" stamp hits if the card is new</li></ul> | 2.5s each | Skips one |
| 6 | Summary | The cards sit in the normal grid with the rarity shine we already have. Labels: NEW, 升級 Lv N, 已滿級. Buttons: 再抽一次 (if you have tickets) and 確認. | – | – |

**SKIP** sits in the top-right throughout and jumps straight to the summary. A cut-in for a new SSR still plays once, since that's the payoff.

## Rarity omen rules

- The omen colour comes from the best rarity in the pull, so it never lies upward.
- When the best is SR or SSR, the circle may start one tier lower and then upgrade. Proposed chance: 35% for SR and 50% for SSR.
- The roll for this is cosmetic. It runs on the client after the server result arrives and never touches pull odds.
- Card backs in stage 4 always show their true rarity.

## Technical approach

- **New file:** `apps/web/src/screens/GachaReveal.tsx`, a full-screen overlay mounted through a portal like `ResultScreen`. `Gacha.tsx` only swaps the result grid for this overlay, then shows the summary.
- **Animation:** one GSAP timeline with labels for each stage. Tapping jumps to the next label (`tl.seek`) and SKIP jumps to the end. The cut-in is a nested timeline per SSR. We already use `useGSAP`.
- **Effects:**
  - The rune circle is an SVG drawn with `stroke-dashoffset`.
  - Embers and shards are about 30 absolutely placed divs with transform/opacity tweens. No canvas or particle library is needed.
  - The rarity aura is CSS gradients plus blur, as in the shine block.
- **Data flow:** nothing changes. The server result (`PullResult[]`) arrives first, and the animation only plays it back, so a reload or crash never loses a pull. The retry key logic stays as it is.
- **Reduced motion:** skip stages 1–3 and 5, then fade the grid in with the final glows.
- **Performance:** animate transforms and opacity only, keep the particle count low on phones, and preload the 10 card images during stage 1.
- **Sound:** none for now. Hooks for whoosh, crack and fanfare can be added later if we bring in audio.
- **Items tab:** the same flow, with item tiles. The cut-in plays for the highest item rarity once items have rarities (see `docs/og-data/equipment/EQUIPMENT-SPEC.md`).

## Build steps

1. Add `GachaReveal` with stages 0, 3, 4 and 6, plus SKIP and tap-to-flip. This gets the core loop working first.
2. Add stages 1–2: the seal, the omen colour and the upgrade tease.
3. Add stage 5: the SSR cut-in.
4. Pass on reduced motion and phone performance. Then test in the browser at 375px with a mocked 10-pull that contains each rarity, including two SSRs and an upgrade tease.

## Decisions for you

1. **Theme:** a dragon seal with a rune circle, or something else, such as a book, an egg or a portal.
2. **Upgrade tease chance:** 35% for SR and 50% for SSR.
3. **Cut-in coverage:** SSR only, or SR as well with a shorter cut-in.
4. **Skippable cut-in:** may a new SSR's cut-in be skipped too?
