---
title: "Card art generation runs one image at a time on the GPU, and the derived art must not be pushed"
author: Billy
date: 2026-10-28
branch: card-art-deck1
cost: { minutes: 20, tokens: 105261 }
id: l-698af01a
scope: repo
status: active
src: agent
touches:
  - apps/web/src/screens/Duel.tsx
  - apps/web/src/screens/Playback.tsx
  - apps/web/src/styles.css
  - ".github/copilot-instructions.md"
  - AGENTS.md
  - apps/web/index.html
  - apps/web/public/cards/og-heavy-001.webp
  - apps/web/public/cards/og-heavy-002.webp
  - apps/web/public/cards/og-heavy-003.webp
  - apps/web/public/cards/og-heavy-004.webp
---

## Decided
- Only the prompt writing and the game wiring run in parallel. ComfyUI renders one image at a time on the single local GPU, so splitting image generation across agents only queues the jobs. It takes about 85 s per image, so the 32-card first deck took about 45 minutes and all 733 cards would take about 17 hours.
- The 32 default-deck cards (the first N cards of each type) got art first, and that was enough to see the new card in the game.

## Tried and ruled out
- Ten parallel sub-agents for generation: no speed-up, because of the single GPU.

## Watch out
- The art is img2img from the OG pictures. Pushing to main deploys the site on Vercel, and pushing any branch creates a preview, so the derived art would go online. Keep it local and private.
- The leader reveal looked see-through because the charge and opponent slots had a higher z-index than the reveal panel.

In the code:
- Prompts: deck1/prompts.json ({card id: prompt}).
- Generate: `node docs/art-samples/comfy-art.mjs D:/AI/ComfyUI_windows_portable/ComfyUI/output deck1 0.6`, run from docs/og-data/card-images. It skips cards already listed in art/meta.json.
- Export: `python export-art.py deck1` writes 512 px webp files to apps/web/public/cards/<card id>.webp. BattleCard falls back to the card name when a file is missing.
