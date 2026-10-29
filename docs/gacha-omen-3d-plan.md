# Gacha omen in real 3D: plan

## Why the current spell looks cheap

The seal is an SVG that is drawn and then flattened. Three things hold it back:

- **Small marks read as dots.** The sigils, comet heads and stroke caps are only a few pixels tall at phone size, so they look like specks.
- **The tilt is fake.** Everything is squashed into one flat plane. Nothing has real depth or parallax, and the "tower" is just shapes sliding upward.
- **The glow is a blurred copy.** Real light falloff and bloom need the GPU.

More SVG tuning won't fix this. The page needs a GPU renderer.

## Options

| Option | What it gives | Cost | Verdict |
|---|---|---|---|
| **Three.js (WebGL) + post-processing** | Real 3D camera and depth, glowing additive light, true bloom, anti-aliasing, shader light effects | ~150 KB gzipped, loaded only when the gacha opens; we write shaders ourselves | **Recommended** |
| PixiJS (2D WebGL) + filters | GPU glow and bloom, crisp sprites, but 2D only (no real camera or depth) | ~100 KB | A fallback if 3D is too heavy on phones |
| Rive / Lottie (authored vector animation) | Designer-quality motion | Needs an artist working in Rive or After Effects; I can't author these files well | Only if you have an animator |
| Keep SVG | – | – | Already at its ceiling |

## Design in 3D

The scene has a perspective camera looking down at about 35° at a magic circle on the ground. Everything is light, with no particles shaped as dots.

1. **Circle layers.** Each ring and the sigils are painted once at high resolution (a 2048px texture generated in code from our own vector drawing). Each layer sits on its own plane in 3D, glows with additive light, and rotates steadily.
2. **Seal:** the camera slowly descends as the rings fade in from the outside to the centre. A shader writes the engraving along each ring as a moving reveal mask, so it's never made of dots.
3. **Breakthrough (SR+ only):** the rings rise off the ground into a real stacked tower, which the camera orbits around. A pillar of light forms in the middle from a cylinder with a gradient, scrolling noise and soft edges.
4. **How good:**
   - **SR:** a violet and silver crown ring forms above the tower.
   - **SSR:** a giant gold circle descends from the sky with real perspective, light shafts (god rays) pour through, and long gold light ribbons spiral around the tower. The ribbons are drawn as smooth tubes, not particles.
   - **SSR tease:** the scene first looks like SR, then rises to gold.
5. **Final:** the bloom swells to white, then the scene cuts to the card flip.
6. **Post-processing:** bloom gives the holy glow, plus SMAA anti-aliasing and a light vignette. The render resolution is capped at 2× screen density.

## Keeping what works

- GSAP still runs the whole timeline. It drives the scene's values (camera, ring heights, colours, bloom strength), so tap-skip between phases keeps working.
- The phase rules and lengths stay the same: about 4s for a pack with nothing good, 6s for SR and 8s for SSR. The same goes for the colour rules and the `{ omen, onDone }` API.
- **Fallbacks:** reduced motion, or a device with no WebGL, skips straight to the flip, as reduced motion does today.

## Engineering

- **Dependency:** add `three` (`postprocessing` is optional). The scene is code-split with `import()`, so other screens don't pay for it.
- **Lifecycle:** a new `GachaSeal3D.tsx` creates the renderer when the omen starts and disposes of everything when it ends, so nothing leaks between pulls.
- **Performance:** the scene uses few draw calls (about 15 planes, a few tubes, one pillar). If the frame time is too slow on a phone, it automatically turns down the render resolution and the bloom.
- **Tests:**
  - **Unit:** the phase plan by tier, and tap-skip.
  - **Browser:** screenshots of each phase for N, SR and SSR at 375×812, with the frame rate measured in the pane.

## Build steps

1. Get the scene running with the rings on the ground, the camera, bloom and anti-aliasing, then compare it with the current version.
2. Add the seal and breakthrough phases: the tower rising and the pillar forming.
3. Add the "how good" phase for SR and SSR, including the SSR tease.
4. Do a performance pass, the fallbacks, then remove the old SVG seal.

## Decisions for you

1. **Engine:** Three.js 3D, as recommended, or PixiJS 2D?
2. **Camera:** fixed angle, or a slow orbit during the breakthrough? I recommend a slow orbit.
3. **Review point:** should I stop after step 1 so you can review the look before I build the full sequence? I recommend yes.
