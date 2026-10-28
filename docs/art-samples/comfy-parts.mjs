// Generates card UI parts (frame, gem, skill icon, star) on flat backgrounds with a local ComfyUI.
// Usage: node comfy-parts.mjs <comfyOutputDir> <destDir> [id ...]   (cut-out is done by cutout.py)
import { copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const API = "http://127.0.0.1:8188";
const [comfyOut, dest, ...only] = process.argv.slice(2);
const CKPT = "animagine-xl-4.0-opt.safetensors";
const QUALITY = "masterpiece, high score, great score, absurdres, newest";
const NEG = "multiple icons, set, collection, sheet, lowres, bad anatomy, text, letters, numbers, error, cropped, worst quality, low quality, signature, watermark, logo, character, 1girl, 1boy, person, face, gradient background, shadow on background, cast shadow, scenery, multiple objects, blurry";
const BG = (c) => `simple background, solid ${c} background, flat ${c} background`;
// Frame = thin type-coloured border (compose-frames.py, so red is always red) + gold ornaments generated here.
const GOLD = "ornate gold filigree, scrollwork, wavy flowing curls, engraved metal, symmetrical, flat lay, game asset, no text";
const colors = { heavy: "crimson red enamel inlay, ruby", light: "emerald green enamel inlay, emerald", magic: "sapphire blue enamel inlay, sapphire" };

const parts = [];
const tops = { SR: "small simple gold crest, modest scrollwork, one tiny jewel", SSR: "elaborate gold crest with flowing waves of scrollwork, several jewels, delicate", UR: "extremely luxurious gold crest, grand sweeping scrollwork, wing shapes, crown-like peak, many glowing jewels, radiant" };
for (const [r, d] of Object.entries(tops)) {
  for (const s of [1, 2]) parts.push({ id: `orn-top-${r}-${s}`, seed: 1100 + s, w: 1216, h: 512, tags: `horizontal ornamental banner, wide gold ornament, ${d}, ${GOLD}, ${BG("black")}` });
}
const corners = { R: "tiny simple gold corner flourish, one small curl", SR: "small gold corner flourish with curls", SSR: "elegant gold corner scroll with flowing waves", UR: "grand gold corner ornament, swirling scrolls, small jewel" };
for (const [r, d] of Object.entries(corners)) {
  for (const s of [1, 2]) parts.push({ id: `orn-corner-${r}-${s}`, seed: 1200 + s, w: 768, h: 768, tags: `single corner ornament, ${d}, ${GOLD}, ${BG("black")}` });
}
for (const [t, cd] of Object.entries(colors)) {
  for (const s of [1, 2]) parts.push({ id: `gem-${t}-${s}`, seed: 950 + s, w: 768, h: 768, tags: `solo, one large faceted ${cd.split(", ")[1]} gemstone, square octagon cut, glossy white highlight, set in thin gold ring bezel, centered, front view, game icon, ${BG("black")}` });
}

const workflow = (p) => ({
  "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: CKPT } },
  "2": { class_type: "CLIPTextEncode", inputs: { clip: ["1", 1], text: `${p.tags}, ${QUALITY}` } },
  "3": { class_type: "CLIPTextEncode", inputs: { clip: ["1", 1], text: NEG } },
  "4": { class_type: "EmptyLatentImage", inputs: { width: p.w, height: p.h, batch_size: 1 } },
  "5": { class_type: "KSampler", inputs: { model: ["1", 0], positive: ["2", 0], negative: ["3", 0], latent_image: ["4", 0], seed: p.seed, steps: 28, cfg: 6, sampler_name: "euler_ancestral", scheduler: "normal", denoise: 1 } },
  "6": { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: ["1", 2] } },
  "7": { class_type: "SaveImage", inputs: { images: ["6", 0], filename_prefix: `part-${p.id}` } },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await mkdir(dest, { recursive: true });
for (const p of only.length ? parts.filter((x) => only.some((o) => x.id.startsWith(o))) : parts) {
  const t0 = Date.now();
  const res = await fetch(`${API}/prompt`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: workflow(p) }) });
  const { prompt_id, error, node_errors } = await res.json();
  if (!prompt_id) { console.log(`${p.id}: rejected ${JSON.stringify(error ?? node_errors)}`); continue; }
  let entry;
  while (!(entry = (await (await fetch(`${API}/history/${prompt_id}`)).json())[prompt_id])) await sleep(1500);
  const img = entry.outputs?.["7"]?.images?.[0];
  if (!img) { console.log(`${p.id}: failed`); continue; }
  await copyFile(join(comfyOut, img.subfolder, img.filename), join(dest, `${p.id}.png`));
  console.log(`${p.id}: ok in ${Math.round((Date.now() - t0) / 1000)}s`);
}
