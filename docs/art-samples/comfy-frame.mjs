// Renders metal detail onto a frame-template.py layout with ComfyUI img2img, one image per denoise.
// Usage: node comfy-frame.mjs <comfyOutputDir> <template.png (flattened)> <destDir> <type> [denoise ...]
import { copyFile, readFile, mkdir } from "node:fs/promises";
import { join, basename } from "node:path";

const API = "http://127.0.0.1:8188";
const [comfyOut, tpl, dest, type, ...ds] = process.argv.slice(2);
const GEM = { heavy: "ruby, red gems", light: "emerald, green gems", magic: "sapphire, blue gems" }[type];
// RARITY env (default UR) picks how rich the metal description is; lower tiers stay plain
const RARITY = process.env.RARITY ?? "UR";
const COLOR = { heavy: "red", light: "green", magic: "blue" }[type];
const METAL = {
  N: `simple plain ${COLOR} card frame, smooth glossy ${COLOR} enamel border, minimal, clean bevel, no gold`,
  R: "simple bronze card frame, polished bronze metal, plain bronze trim, clean bevel",
  SR: "silver card frame, polished silver metal, engraved silver scrollwork, curled silver vines, no gold",
  SSR: "ornate gold filigree card frame, embossed gold relief, engraved scrollwork, acanthus leaves, curled vines, polished gold metal, jewel encrusted",
  UR: "luxurious, baroque, intricate embossed gold relief, pearls, jewel encrusted, ornate gold filigree card frame, engraved gold scrollwork, acanthus leaves, curled vines, polished gold metal",
}[RARITY];
const POS = `${METAL}, ${GEM}, faceted jewels, glossy highlights, fantasy trading card border, highly detailed, game asset, masterpiece, high score, great score, absurdres`;
const SEED = Number(process.env.SEED ?? 1300);
const NEG = "lowres, blurry, text, letters, watermark, signature, character, person, face, worst quality, low quality, jpeg artifacts, flat colors";

const up = new FormData();
up.append("image", new Blob([await readFile(tpl)], { type: "image/png" }), basename(tpl));
up.append("overwrite", "true");
const { name } = await (await fetch(`${API}/upload/image`, { method: "POST", body: up })).json();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await mkdir(dest, { recursive: true });
for (const d of (ds.length ? ds : ["0.35", "0.45", "0.55"]).map(Number)) {
  const wf = {
    "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "animagine-xl-4.0-opt.safetensors" } },
    "2": { class_type: "CLIPTextEncode", inputs: { clip: ["1", 1], text: POS } },
    "3": { class_type: "CLIPTextEncode", inputs: { clip: ["1", 1], text: NEG } },
    "4": { class_type: "LoadImage", inputs: { image: name } },
    "5": { class_type: "VAEEncode", inputs: { pixels: ["4", 0], vae: ["1", 2] } },
    "6": { class_type: "KSampler", inputs: { model: ["1", 0], positive: ["2", 0], negative: ["3", 0], latent_image: ["5", 0], seed: SEED, steps: 30, cfg: 6, sampler_name: "dpmpp_2m", scheduler: "karras", denoise: d } },
    "7": { class_type: "VAEDecode", inputs: { samples: ["6", 0], vae: ["1", 2] } },
    // hires pass: 1.5x lanczos, light re-sample for crisp engraving
    "9": { class_type: "ImageScaleBy", inputs: { image: ["7", 0], upscale_method: "lanczos", scale_by: 1.5 } },
    "10": { class_type: "VAEEncode", inputs: { pixels: ["9", 0], vae: ["1", 2] } },
    "11": { class_type: "KSampler", inputs: { model: ["1", 0], positive: ["2", 0], negative: ["3", 0], latent_image: ["10", 0], seed: SEED + 1, steps: 24, cfg: 6, sampler_name: "dpmpp_2m", scheduler: "karras", denoise: 0.35 } },
    "12": { class_type: "VAEDecode", inputs: { samples: ["11", 0], vae: ["1", 2] } },
    "8": { class_type: "SaveImage", inputs: { images: ["12", 0], filename_prefix: `frame-${type}-${RARITY}-${SEED}` } },
  };
  const { prompt_id } = await (await fetch(`${API}/prompt`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: wf }) })).json();
  let e;
  while (!(e = (await (await fetch(`${API}/history/${prompt_id}`)).json())[prompt_id])) await sleep(1500);
  const img = e.outputs["8"].images[0];
  await copyFile(join(comfyOut, img.subfolder, img.filename), join(dest, `frame-${type}-${RARITY}-s${SEED}-d${d}.png`));
  console.log(`denoise ${d}: ok`);
}
