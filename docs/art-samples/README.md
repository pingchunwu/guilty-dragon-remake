# Card art samples

Style exploration for card illustrations (see the art direction in `docs/guilty-dragon-pwa-development-plan.md`). All characters are original. Open `card-preview.html` through a local web server (for example `python -m http.server`) to see the images in the draft card frame.

## Toolchain

- ComfyUI portable v0.42.1 (NVIDIA build), run locally on an RTX 4050 6 GB
- Checkpoint: `animagine-xl-4.0-opt.safetensors` ([cagliostrolab/animagine-xl-4.0](https://huggingface.co/cagliostrolab/animagine-xl-4.0))
- Style LoRA: `anime-screencap-xl.safetensors` ([Muapi/anime-screencap-xl](https://huggingface.co/Muapi/anime-screencap-xl)), plus `fine-anime-screencap-xl.safetensors` ([Muapi/fine-anime-screencap-xl…](https://huggingface.co/Muapi/fine-anime-screencap-xl-anime-screencap-style-lora-illustrious-and-ponyxl)) for the two Magic base images. Both are re-uploads of LoRAs originally published elsewhere; confirm provenance and license before using them for shipped assets.

## How the final set was made

1. **Base images** — `comfy-gen.mjs` (text-to-image, 832×1216 then 1.5× hires pass) with the v3 prompts in the script and a LoRA at 0.7:
   - Heavy and Light cards: `LORA=anime-screencap-xl.safetensors LORA_W=0.7 TRIGGER="anime screencap"`
   - Magic cards: `LORA=fine-anime-screencap-xl.safetensors LORA_W=0.7 TRIGGER="fine anime screencap_xl, anime screencap"`
2. **Brighten** — `brighten.py <in> <out>` lifts shadows and midtones of each base image and writes it to `ComfyUI/input/pick-<id>.png`.
3. **Restyle** — `comfy-gen.mjs` in restyle mode redraws each pick toward the LoRA's demo look:

   ```
   LORA=anime-screencap-xl.safetensors LORA_W=0.85 CFG=4 TRIGGER="anime screencap" RESTYLE=0.6
   STYLE="anime screencap, anime coloring, clean lineart, soft shading, soft lighting, bright, well-lit face, bloom, glint, detailed eyes, shiny hair, depth of field, blurry background, cinematic angle"
   NEG="lowres, bad anatomy, bad hands, text, error, missing finger, extra digits, fewer digits, cropped, worst quality, low quality, low score, bad score, average score, signature, watermark, username, logo, frame, border, subtitles, 3d, realistic, photorealistic, oil painting, sketch, monochrome, desaturated, muted color, film grain, noise, jpeg artifacts, chibi"
   ```

4. **Touch-up** — `light-2` had its raised sword hand inpainted (seed 77, denoise 0.8) so the arm connects to the sleeve.

Usage: `node comfy-gen.mjs <ComfyUI output dir> <dest dir> [card ids…]` with ComfyUI running on `127.0.0.1:8188`.
