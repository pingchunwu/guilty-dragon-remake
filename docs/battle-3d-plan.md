# 3D effects in battles: plan

The goal is to bring the gacha omen's look (Three.js, glowing line-work circles, light pillars, ribbons and bloom) into duels, for both CPU and PvP, which share `Duel.tsx`.

**3D is a layer of light, not the board.** Cards, the hand, numbers and HP bars stay as normal page elements, so they stay sharp, readable, tappable and accessible. A transparent 3D canvas sits between the board and the numbers and plays effects at the right moments.

## Where 3D adds the most

| # | Moment (today) | 3D version | Value |
|---|---|---|---|
| 1 | **Attack scene** (`AttackScene` in Playback.tsx): combo, colour advantage, crash, winner, defense, slash, HP | Each side's total becomes a beam of light in its leader's colour. The two beams meet mid-screen and push against each other while the numbers count down. On colour advantage, an elemental circle flares behind the stronger beam. Defense raises a hexagonal light barrier that cracks by the defense %. The final slash is a 3D blade-arc ribbon with a shockwave ring. The numbers stay on top as they are today. | Highest: it plays every round |
| 2 | **Skill activation** (skill banners, 7 families: attack, debuff, guard, heal, damage, cards, element) | A small magic circle opens under the caster's leader card, with a different look for each family: <ul><li>attack: a red light spear rising</li><li>debuff: a dark circle sinking</li><li>guard: a hex dome</li><li>heal: green ribbons spiralling up</li><li>damage: a falling star streak</li><li>cards: orbiting card-shaped light frames</li><li>element: a split two-colour circle</li></ul> The banner text stays. | High: it shows that a skill actually fired |
| 3 | **Leader reveal** (3s at phase start) | Each leader card stands on its own circle in its colour (heavy `#c4623d`, light `#3f9a7a`, magic `#7b4fd6`), drawn in like the gacha seal, then the card flies to its slot. | Medium |
| 4 | **Final blow** (deck-out) | Both sides' circles stack into towers and fire at once. | Medium, but rare |
| 5 | **Win / lose screen** | Win: a gold circle rises with a pillar and ribbons, a short version of the SSR omen. Lose: the player's circle cracks and fades into dim ash, with no particles. | Medium |

## Architecture

- **Shared toolkit:** `src/fx/`, extracted from `GachaSeal3D.tsx`:
  - the circle texture painter (rings, script bands, star patterns, emblems), with textures cached per colour and size
  - the shaders: the reveal along a ring's angle, the light pillar, ribbons drawn along their length, a shockwave ring, a hex barrier
  - renderer setup: tone mapping, bloom, edge smoothing, a resolution cap, and a fallback when frames run slow
  - disposal

  The gacha switches to the toolkit with no visual change.
- **`FxStage`:** one transparent Three.js canvas per duel, mounted over the board with `pointer-events: none`.
  - It is created when the duel opens and disposed when it closes.
  - It renders only while an effect plays and stays idle between effects, so a long battle costs no GPU or battery time while waiting.
  - Three.js is lazy-loaded, as the gacha already does. A duel opens in 2D right away and the effects switch on once loaded.
- **Effects:** `fx.attackClash(result)`, `fx.skill(side, family, colour)`, `fx.leaderReveal(...)`, `fx.finalBlow(...)` and `fx.result(won)`.
  - Each returns a GSAP timeline that the existing timelines nest at their labels.
  - So the 3D stays in step with the numbers, and SKIP or tap-to-skip still works.
- **Positioning:** effects anchor to page elements (leader slots, HP bars, the scene centre). Their positions on screen are converted into the 3D scene, so layout changes need no 3D changes.
- **Fallback:** reduced motion, no WebGL, or a new **特效 高/低** setting in the player tab fall back to today's 2D effects, which stay as they are.

## Performance budget (phones)

- Up to about 40 MB of GPU memory during a duel, with circle textures at 1024px or smaller and shared across effects.
- Effects target 60 fps. If the frame time goes over 22 ms, the resolution and bloom drop automatically.
- Nothing renders between effects.
- The battle screen's JavaScript doesn't grow, because Three.js is already a separate download from the gacha and is shared.

## Build steps (each one reviewable)

1. **Extract the toolkit** from `GachaSeal3D` into `src/fx/` with no visual change, so the gacha still looks the same.
2. **FxStage and the attack clash** (#1). Review it in a real CPU battle.
3. **Skill circles** for the 7 families (#2).
4. **Leader reveal, final blow and the win/lose screen** (#3–5).
5. **Wrap-up:** the 特效 setting, a performance pass, and a run on a real phone and on PvP.

Each step gets a browser check at 375×812, then a merge and the DB check.

## Decisions for you

1. **Scope:** all five moments, or start with the attack clash and skills (#1–2) and decide on the rest after? I recommend starting with #1–2.
2. **Colours:** use the existing type colours for each side's beam and circle (heavy orange-red, light green, magic violet)? Or one colour per side, such as you in cyan and the opponent in red?
3. **Setting:** add the 特效 高/低 setting? I recommend yes, for weaker phones.
