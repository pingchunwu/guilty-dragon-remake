# OG card remake plan

## Where we are

- `og-card-images.csv` lists all 733 OG cards with their stats, art URL and wiki page.
  - 725 cards have art.
  - 8 have no picture on the wiki at all: 260, 477, 486, 487, 488, 721, 731, 733.
  - 104 also have alternate art (Lv40 / MAX), listed in `extra_image_urls`.
- `gallery.html` shows every card. Filter by type, rarity, name or skill, or "missing only".
  - Open it with `python -m http.server 8766` in this folder; images don't load from `file://`.
  - Rebuild the table and the gallery with `python merge.py`.
- Frames are finished: 3 types × 5 tiers, in `docs/art-samples/parts/og-frame-*`.
- The game is ready for art.
  - `BattleCard.tsx` already has empty `.bcard-art` and `.bcard-frame` layers.
  - Every engine card id (`og-<type>-<n>`) matches exactly one wiki row by name + type (checked: 733/733).

## Decisions needed before generating

1. **How the new art is made.**
   - **A. img2img from the OG art.** Each card keeps its character, pose and colours, redrawn in the new style. It is the closest "remake", but every image is derived from the original copyrighted art. That's fine for a private build; keep it off a public deploy.
   - **B. txt2img from a written description.** A Haiku pass describes each OG card once: character, outfit, pose, colours, setting. Then we generate from text only. The likeness is looser, but the art is your own and safe to deploy.
2. **Rarity → frame.** The engine has N / R / SR; the wiki's N+ / R+ / SR+ are already folded in.
   - Proposal: N → plain, R → bronze, SR → silver.
   - Keep the SSR and UR frames for future cards or events.
3. **Style.** You pick from a pilot (step 3) rather than in the abstract.

## Pipeline

1. **Download the OG art locally** as a reference. Not committed.
   - 725 files, about 30 MB, into `og/`.
   - One request every 2 s from the image CDN. The CDN isn't rate-limited the way the wiki is.
2. **Describe the cards with 10 Haiku sessions** of about 73 cards each.
   - Each writes `prompts/batch-NN.csv` with columns `id, subject, outfit, pose, palette, background`.
   - I spot-check about 10% against the images and re-run any bad batch.
   - Needed for B. For A, it still helps steer the prompt.
3. **Pilot.** 12 cards (4 per type, mixed rarity) × 3 style variants, shown side by side with the OG art. You pick one style; it becomes the fixed style prompt.
4. **Generate all 733** with a new `comfy-art.mjs`, built from the existing `comfy-frame.mjs`.
   - Same checkpoint, a fixed seed per card id, 1024 px.
   - It skips cards that are already done, so it can be stopped and resumed. It runs in the background, probably overnight; the pilot will measure the real time per image.
   - The 8 cards with no picture are generated from their name, type and skill only.
5. **Review.**
   - `gallery.html` gets an "OG | remake" toggle.
   - You list rejects in `rejects.txt`, and those are regenerated with a new seed. Repeat until the list is empty.
6. **Put it into the game.**
   - Export the art as 512 px webp to `apps/web/public/cards/<engine-id>.webp`, about 40 KB each, about 30 MB in total.
   - Export the 9 frames (3 types × N/R/SR) as 512 px webp to `apps/web/public/frames/`.
   - `BattleCard` and `CardTile` render the art `<img>` and the frame. The badge, number and stars are already HTML.
7. **Verify.** Play a practice duel and the deck screen and take screenshots at desktop and phone width. Check loading speed with 24 cards on screen.

## Order of work

Decisions 1–2 → steps 1–2 (parallel sessions) → step 3 (you pick) → steps 4–5 (long run, review loop) → steps 6–7 (one PR).
