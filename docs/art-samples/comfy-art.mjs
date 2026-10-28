// Restyles OG card art with ComfyUI img2img + hires pass (pilot: 12 cards).
// Usage: node comfy-art.mjs <comfyOutputDir> <pilotDir> <denoise> [id ...]   (no ids = all cards)
// If <pilotDir>/prompts.json exists ({id: prompt}), it replaces the pilot's CARDS; seeds are 1000 + its order.
// Reads <pilotDir>/og-crop/<id>.png (frame already cut off by pilot/crop.py), writes <pilotDir>/art/<id>.png
// and records the denoise per card in <pilotDir>/art/meta.json.
import { copyFile, readFile, writeFile } from "node:fs/promises";
import { join, basename } from "node:path";

const API = "http://127.0.0.1:8188";
const [comfyOut, pilot, denoiseArg, ...only] = process.argv.slice(2);
const DENOISE = Number(denoiseArg);

const STYLE = "crisp modern anime illustration, clean line art, richer lighting, detailed background, vibrant colors, highly detailed, masterpiece, high score, great score, absurdres";
const NEG = "lowres, blurry, text, letters, watermark, signature, frame, border, card frame, gem, orb, stars, worst quality, low quality, jpeg artifacts, bad anatomy, extra limbs, deformed";

// id -> [seed, per-card prompt written from the OG image]
const CARDS = {
  1: [101, "1girl, short blonde hair, blue eyes, small angel wings, white puffy blouse, hand on chest, red heart brooch, yellow skirt, sunset orange sky with clouds"],
  247: [102, "1girl, brown hair, long braid, brown cat ears, winking, smile, midriff, huge yellow gauntlets, blue sky with clouds"],
  490: [103, "1girl, short red hair, round glasses, oversized white and red hooded robe with long rabbit-ear hood, hands clasped, gentle smile, soft white glow background"],
  72: [104, "1boy, long purple hair, red glowing eyes, dark heavy plate armor, gritted teeth, lightning, small white-haired boy in dark armor at lower left, dark stormy ruins"],
  319: [105, "1girl, spiky magenta hair, dark skin, wild grin, black bikini top, bandaged arms, leather bracers, bare midriff, blue sky with clouds"],
  560: [106, "1girl, very long teal hair, frilly white gothic lolita dress, holding a black book with emblem, worried expression, purple eyes"],
  158: [107, "1girl, short lavender hair, arms raised above head, purple bikini armor, gold trim, giant greatsword behind her, wooden building, warm brown and gold light"],
  410: [108, "1boy, seen from below and behind, red and orange striped coat, long sword, standing on a cliff, mountains, dramatic blue sky with clouds"],
  655: [109, "pink-haired woman with glasses, white-haired man in spiked black armor with claws, blue-haired man with face tattoos, group, dark purple background"],
  235: [110, "1girl, very long purple hair, arms raised, flowing orange fire energy, flames, glowing aura, dynamic pose"],
  480: [111, "1girl, silver hair, cat ears, pirate hat with skull emblem, red and black pirate coat, open mouth smile, punching fist toward viewer, gold coins flying, blue sky"],
  719: [112, "1girl, long braided pink-orange hair, closed eyes, red outfit, holding a golden staff with green diamond jewels, blue magical glow, flower ornaments"],
};

try {
  const p = JSON.parse(await readFile(join(pilot, "prompts.json"), "utf8"));
  for (const k of Object.keys(CARDS)) delete CARDS[k];
  Object.keys(p).forEach((id, i) => (CARDS[id] = [1000 + i, p[id]]));
} catch (e) { if (e.code !== "ENOENT") throw e; }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ids = only.length ? only : Object.keys(CARDS);
let meta = {};
try { meta = JSON.parse(await readFile(join(pilot, "art", "meta.json"), "utf8")); } catch {}

let totalMs = 0;
for (const id of ids) {
  if (only.length === 0 && meta[id]) continue; // resume: skip cards already done
  const [seed, prompt] = CARDS[id];
  const src = join(pilot, "og-crop", `${id}.png`);
  const up = new FormData();
  up.append("image", new Blob([await readFile(src)], { type: "image/png" }), `pilot-${basename(src)}`);
  up.append("overwrite", "true");
  const { name } = await (await fetch(`${API}/upload/image`, { method: "POST", body: up })).json();

  const pos = `${prompt}, ${STYLE}`;
  const wf = {
    "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "animagine-xl-4.0-opt.safetensors" } },
    "2": { class_type: "CLIPTextEncode", inputs: { clip: ["1", 1], text: pos } },
    "3": { class_type: "CLIPTextEncode", inputs: { clip: ["1", 1], text: NEG } },
    "4": { class_type: "LoadImage", inputs: { image: name } },
    "5": { class_type: "VAEEncode", inputs: { pixels: ["4", 0], vae: ["1", 2] } },
    "6": { class_type: "KSampler", inputs: { model: ["1", 0], positive: ["2", 0], negative: ["3", 0], latent_image: ["5", 0], seed, steps: 30, cfg: 6, sampler_name: "dpmpp_2m", scheduler: "karras", denoise: DENOISE } },
    "7": { class_type: "VAEDecode", inputs: { samples: ["6", 0], vae: ["1", 2] } },
    // hires pass: 1.5x lanczos, light re-sample for crisp lines
    "9": { class_type: "ImageScaleBy", inputs: { image: ["7", 0], upscale_method: "lanczos", scale_by: 1.5 } },
    "10": { class_type: "VAEEncode", inputs: { pixels: ["9", 0], vae: ["1", 2] } },
    "11": { class_type: "KSampler", inputs: { model: ["1", 0], positive: ["2", 0], negative: ["3", 0], latent_image: ["10", 0], seed: seed + 1, steps: 24, cfg: 6, sampler_name: "dpmpp_2m", scheduler: "karras", denoise: 0.35 } },
    "12": { class_type: "VAEDecode", inputs: { samples: ["11", 0], vae: ["1", 2] } },
    "8": { class_type: "SaveImage", inputs: { images: ["12", 0], filename_prefix: `pilot-art-${id}` } },
  };
  const t0 = Date.now();
  const { prompt_id } = await (await fetch(`${API}/prompt`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: wf }) })).json();
  let e;
  while (!(e = (await (await fetch(`${API}/history/${prompt_id}`)).json())[prompt_id])) await sleep(1000);
  const img = e.outputs["8"].images[0];
  await copyFile(join(comfyOut, img.subfolder, img.filename), join(pilot, "art", `${id}.png`));
  const s = (Date.now() - t0) / 1000;
  totalMs += Date.now() - t0;
  meta[id] = { seed, denoise: DENOISE, seconds: s };
  await writeFile(join(pilot, "art", "meta.json"), JSON.stringify(meta, null, 1));
  console.log(`${id}: ${s.toFixed(1)}s`);
}
console.log(`avg ${(totalMs / ids.length / 1000).toFixed(1)}s/image`);
