// Queues card samples on a local ComfyUI and copies results out.
// Usage: node comfy-gen.mjs <comfyOutputDir> <destDir> [id ...]
import { copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const API = "http://127.0.0.1:8188";
const [comfyOut, dest, ...only] = process.argv.slice(2);
const CKPT = "animagine-xl-4.0-opt.safetensors";

// v3: modern TV-anime screencap look — muted desaturated palette, grey-tinted two-tone cel shading,
// hard cast shadows across faces, natural proportions — framed as epic action shots.
// Animagine tag order: subject, details, style, quality last.
const STYLE = process.env.STYLE ?? "anime screencap, cel shading, two-tone shading, hard shadow, clean lineart, thin lineart, muted color, desaturated, low saturation, high contrast, cinematic lighting, dramatic lighting, rim light, depth of field, dynamic angle";
const QUALITY = "masterpiece, high score, great score, absurdres, newest";
const NEGATIVE = process.env.NEG ?? "lowres, bad anatomy, bad hands, text, error, missing finger, extra digits, fewer digits, cropped, worst quality, low quality, low score, bad score, average score, signature, watermark, username, blurry, logo, frame, border, subtitles, 3d, realistic, photorealistic, glossy, shiny skin, shiny clothes, oil painting, airbrush, vivid colors, oversaturated, neon, sparkle, glitter, chibi, large breasts, cleavage, sexy";
const CFG = Number(process.env.CFG ?? 4.5);

// Optional style LoRA: LORA=<file in models/loras> LORA_W=0.7 TRIGGER="trigger words"
const LORA = process.env.LORA;
const LORA_W = Number(process.env.LORA_W ?? 0.7);
const TRIGGER = process.env.TRIGGER ? `${process.env.TRIGGER}, ` : "";
// Restyle mode: RESTYLE=0.55 redraws ComfyUI/input/pick-<id>.png at that denoise, keeping its composition.
const RESTYLE = process.env.RESTYLE ? Number(process.env.RESTYLE) : 0;
const MODEL = LORA ? ["12", 0] : ["1", 0];
const CLIP = LORA ? ["12", 1] : ["1", 1];

const cards = [
  { id: "heavy-1", seed: 3101, tags: "1girl, solo, original, knight, short red hair, braid, amber eyes, angry, clenched teeth, shouting, dark steel armor, red tabard, gauntlets, holding greatsword with both hands, greatsword over shoulder, huge sword, sword slash effect, foreshortening, from below, upper body, looking at viewer, debris, embers, smoke, burning battlefield, night, orange backlighting" },
  { id: "heavy-2", seed: 3102, tags: "1boy, solo, original, muscular male, mature male, brown hair, stubble, scar on face, serious, iron armor, fur cloak, holding war hammer, hammer raised overhead, about to strike, from below, cowboy shot, ground cracking, shockwave, flying debris, dust, burning castle gate, dusk, firelight on face, face visible, rim light" },
  { id: "light-1", seed: 3211, tags: "1girl, solo, original, elf, pointy ears, blonde hair, ponytail, green eyes, focused, hooded cape, leather armor, holding bow, longbow, drawing bow, bowstring, arrow nocked, glowing arrowhead, aiming, from side, cowboy shot, wind, cape fluttering, falling leaves, forest canopy, sunbeam through trees, light rays, green tint" },
  { id: "light-2", seed: 3202, tags: "1boy, solo, original, young man, black hair, grey eyes, clenched teeth, determined, long scarf, dark travel coat, dual wielding, short swords, mid-air, jumping, dashing toward viewer, foreshortening, motion lines, speed lines, from above, rooftops, fantasy town below, dusk, teal shadows, orange sky" },
  { id: "magic-1", seed: 3301, tags: "1girl, solo, original, mage, long silver hair, blue eyes, wizard hat, dark blue robe, casting spell, outstretched arm, hand toward viewer, foreshortening, glowing magic orb, magic circle, energy burst, floating hair, wind, ice crystals, dark cave, blue light, teal color grading, serious, detailed eyes" },
  { id: "magic-2", seed: 3312, tags: "1boy, original, teenage boy, white hair, purple eyes, glaring, white robe, purple trim, floating paper talisman, summoning, huge eastern dragon coiling in sky above him, glowing spirit dragon, long serpentine dragon, translucent, dragon roaring, upper body, low angle, wind, ruined shrine, storm, moonlight, lightning, dark blue tint" },
];

const restyleWorkflow = (c) => ({
  "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: CKPT } },
  ...(LORA && { "12": { class_type: "LoraLoader", inputs: { model: ["1", 0], clip: ["1", 1], lora_name: LORA, strength_model: LORA_W, strength_clip: LORA_W } } }),
  "2": { class_type: "CLIPTextEncode", inputs: { clip: CLIP, text: `${TRIGGER}${c.tags}, ${STYLE}, ${QUALITY}` } },
  "3": { class_type: "CLIPTextEncode", inputs: { clip: CLIP, text: NEGATIVE } },
  "13": { class_type: "LoadImage", inputs: { image: `pick-${c.id}.png` } },
  "8": { class_type: "VAEEncode", inputs: { pixels: ["13", 0], vae: ["1", 2] } },
  "9": { class_type: "KSampler", inputs: { model: MODEL, positive: ["2", 0], negative: ["3", 0], latent_image: ["8", 0], seed: c.seed, steps: 28, cfg: CFG, sampler_name: "euler_ancestral", scheduler: "normal", denoise: RESTYLE } },
  "6": { class_type: "VAEDecode", inputs: { samples: ["9", 0], vae: ["1", 2] } },
  "7": { class_type: "SaveImage", inputs: { images: ["6", 0], filename_prefix: `card-${c.id}` } },
});

const workflow = (c) => RESTYLE ? restyleWorkflow(c) : ({
  "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: CKPT } },
  ...(LORA && { "12": { class_type: "LoraLoader", inputs: { model: ["1", 0], clip: ["1", 1], lora_name: LORA, strength_model: LORA_W, strength_clip: LORA_W } } }),
  "2": { class_type: "CLIPTextEncode", inputs: { clip: CLIP, text: `${TRIGGER}${c.tags}, ${STYLE}, ${QUALITY}` } },
  "3": { class_type: "CLIPTextEncode", inputs: { clip: CLIP, text: NEGATIVE } },
  "4": { class_type: "EmptyLatentImage", inputs: { width: 832, height: 1216, batch_size: 1 } },
  "5": { class_type: "KSampler", inputs: { model: MODEL, positive: ["2", 0], negative: ["3", 0], latent_image: ["4", 0], seed: c.seed, steps: 28, cfg: CFG, sampler_name: "euler_ancestral", scheduler: "normal", denoise: 1 } },
  // Hires pass: decode, upscale pixels 1.5x (lanczos), re-encode and re-sample lightly for crisper lines and faces.
  "10": { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: ["1", 2] } },
  "11": { class_type: "ImageScaleBy", inputs: { image: ["10", 0], upscale_method: "lanczos", scale_by: 1.5 } },
  "8": { class_type: "VAEEncode", inputs: { pixels: ["11", 0], vae: ["1", 2] } },
  "9": { class_type: "KSampler", inputs: { model: MODEL, positive: ["2", 0], negative: ["3", 0], latent_image: ["8", 0], seed: c.seed, steps: 20, cfg: CFG, sampler_name: "dpmpp_2m", scheduler: "karras", denoise: 0.4 } },
  "6": { class_type: "VAEDecode", inputs: { samples: ["9", 0], vae: ["1", 2] } },
  "7": { class_type: "SaveImage", inputs: { images: ["6", 0], filename_prefix: `card-${c.id}` } },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await mkdir(dest, { recursive: true });

for (const c of only.length ? cards.filter((x) => only.includes(x.id)) : cards) {
  const t0 = Date.now();
  const res = await fetch(`${API}/prompt`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: workflow(c) }) });
  const { prompt_id, error, node_errors } = await res.json();
  if (!prompt_id) { console.log(`${c.id}: rejected ${JSON.stringify(error ?? node_errors)}`); continue; }
  let entry;
  while (!(entry = (await (await fetch(`${API}/history/${prompt_id}`)).json())[prompt_id])) await sleep(2000);
  const img = entry.outputs?.["7"]?.images?.[0];
  if (!img) { console.log(`${c.id}: failed ${JSON.stringify(entry.status).slice(0, 300)}`); continue; }
  await copyFile(join(comfyOut, img.subfolder, img.filename), join(dest, `${c.id}.png`));
  console.log(`${c.id}: ok in ${Math.round((Date.now() - t0) / 1000)}s`);
}
