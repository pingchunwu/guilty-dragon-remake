import { CanvasTexture, SRGBColorSpace, type Texture } from "three";

/* Circle texture painter (white strokes on transparent) shared by the gacha omen and the duel effects. */

export const TEX = 2048; // paint resolution; each texture is downsampled to its own size
export const C = TEX / 2;
export const TAU = Math.PI * 2;

export type Ctx = CanvasRenderingContext2D;
let K = 1; // paint-space px per final texture px; line widths below are in final px
const pt = (r: number, a: number): [number, number] => [C + r * C * Math.cos(a), C + r * C * Math.sin(a)];
const lwk = (g: Ctx, lw: number) => (g.lineWidth = lw * K);

export function ring(g: Ctx, r: number, lw: number, dash?: [number, number]) {
  lwk(g, lw);
  if (dash) g.setLineDash(dash.map((d) => d * K));
  g.beginPath();
  g.arc(C, C, r * C, 0, TAU);
  g.stroke();
  g.setLineDash([]);
}

export function poly(g: Ctx, r: number, n: number, skip: number, lw: number, rot = -Math.PI / 2) {
  lwk(g, lw);
  g.beginPath();
  for (let i = 0; i <= n; i++) {
    const [x, y] = pt(r, rot + ((i * skip) / n) * TAU);
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.stroke();
}

export function spokes(g: Ctx, r0: number, r1: number, n: number, lw: number, rot = 0) {
  lwk(g, lw);
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TAU;
    const [x0, y0] = pt(r0, a);
    const [x1, y1] = pt(r1, a);
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
  }
  g.stroke();
}

/** Circles sitting on the vertices of an n-gon, each with an inner ring and a mini star. */
export function vertexCircles(g: Ctx, r: number, n: number, rr: number, lw: number, rot = -Math.PI / 2) {
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TAU;
    const [x, y] = pt(r, a);
    lwk(g, lw);
    g.beginPath();
    g.arc(x, y, rr * C, 0, TAU);
    g.stroke();
    g.beginPath();
    g.arc(x, y, rr * C * 0.66, 0, TAU);
    g.stroke();
    const m = rr * C * 0.6;
    g.beginPath();
    for (let j = 0; j <= 6; j++) {
      const b = a + ((j * 2) / 6) * TAU;
      j ? g.lineTo(x + m * Math.cos(b), y + m * Math.sin(b)) : g.moveTo(x + m * Math.cos(b), y + m * Math.sin(b));
    }
    g.stroke();
  }
}

export function crescents(g: Ctx, r: number, n: number, s: number, lw: number, rot = 0) {
  lwk(g, lw);
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TAU;
    const [x, y] = pt(r, a);
    const d = s * C;
    g.beginPath();
    g.arc(x, y, d, a - 2.2, a + 2.2);
    g.arc(x + Math.cos(a) * d * 0.4, y + Math.sin(a) * d * 0.4, d * 0.82, a + 2.2, a - 2.2, true);
    g.closePath();
    g.stroke();
  }
}

export function petals(g: Ctx, r0: number, r1: number, n: number, lw: number, bend = 0.3) {
  lwk(g, lw);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const [x0, y0] = pt(r0, a);
    const [x1, y1] = pt(r1, a);
    const [c1x, c1y] = pt((r0 + r1) / 2, a - bend);
    const [c2x, c2y] = pt((r0 + r1) / 2, a + bend);
    g.beginPath();
    g.moveTo(x0, y0);
    g.quadraticCurveTo(c1x, c1y, x1, y1);
    g.quadraticCurveTo(c2x, c2y, x0, y0);
    g.stroke();
  }
}

const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/**
 * A band of invented cursive: words of connected loops, ascenders and descenders written
 * along the circle between two bounding rings. Every letter joins the baseline, so it reads
 * as handwriting, never as specks.
 */
export function script(g: Ctx, rIn: number, rOut: number, seed: number, lw: number) {
  ring(g, rIn, lw);
  ring(g, rOut, lw);
  const rand = rng(seed);
  const band = (rOut - rIn) * C;
  const R = rIn * C + band * 0.3;
  const H = band * 0.3;
  const L = TAU * R;
  lwk(g, lw * 0.9);
  const heights = [0.5, 0.8, 1.1, 1.6, -0.45];
  let x = 0;
  let inWord = 0;
  g.beginPath();
  while (x < L - H) {
    if (inWord <= 0) {
      x += H * (0.5 + rand() * 0.4); // word gap
      inWord = 3 + Math.floor(rand() * 5);
      g.stroke();
      g.beginPath();
    }
    inWord--;
    const w = H * (0.55 + rand() * 0.55);
    const h = heights[Math.floor(rand() * heights.length)]! * H;
    const k = 0.15 + rand() * 0.3;
    const phase = rand() < 0.5 ? 0 : Math.PI;
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const px = x + w * t + k * w * Math.sin(TAU * t + phase);
      const py = h * Math.pow(Math.sin(Math.PI * t), 0.9);
      const a = Math.min(px, L) / R;
      g.lineTo(C + (R + py) * Math.cos(a), C + (R + py) * Math.sin(a));
    }
    x += w;
  }
  g.stroke();
}


const big = typeof document === "undefined" ? null : document.createElement("canvas");

/** Paint at 2048, then downsample to `out` px with a faint soft falloff under a crisp core. */
export function paintTexture(paint: (g: Ctx) => void, anisotropy: number, out: number) {
  big!.width = big!.height = TEX;
  const g = big!.getContext("2d")!;
  g.strokeStyle = g.fillStyle = "#fff";
  g.lineCap = g.lineJoin = "round";
  K = TEX / out;
  paint(g);
  const cv = document.createElement("canvas");
  cv.width = cv.height = out;
  const o = cv.getContext("2d")!;
  o.filter = `blur(${out / 450}px)`; // no-op where ctx.filter is unsupported
  o.globalAlpha = 0.5;
  o.drawImage(big!, 0, 0, out, out);
  o.filter = "none";
  o.globalAlpha = 1;
  o.drawImage(big!, 0, 0, out, out);
  const t = new CanvasTexture(cv);
  t.anisotropy = anisotropy;
  return t;
}

export function gradientTexture(w: number, h: number, fill: (g: Ctx) => CanvasGradient, srgb = false) {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const g = cv.getContext("2d")!;
  g.fillStyle = fill(g);
  g.fillRect(0, 0, w, h);
  const t = new CanvasTexture(cv);
  if (srgb) t.colorSpace = SRGBColorSpace;
  return t;
}

/* ---------- cache: one texture per design + size, ref-counted ---------- */

const cache = new Map<string, { tex: CanvasTexture; refs: number }>();
const keyOf = new WeakMap<Texture, string>();

/** The shared texture for a painted design at `size` px; pair every acquire with a releaseTexture. */
export function acquireTexture(design: string, size: number, paint: (g: Ctx) => void, anisotropy = 1): CanvasTexture {
  const k = `${design}@${size}`;
  let e = cache.get(k);
  if (!e) {
    e = { tex: paintTexture(paint, anisotropy, size), refs: 0 };
    cache.set(k, e);
    keyOf.set(e.tex, k);
  }
  e.refs++;
  return e.tex;
}

/** Drops one reference; a shared texture is disposed with its last user, any other texture at once. */
export function releaseTexture(t: Texture) {
  const k = keyOf.get(t);
  if (k === undefined) return t.dispose();
  const e = cache.get(k)!;
  if (--e.refs > 0) return;
  cache.delete(k);
  keyOf.delete(t);
  t.dispose();
}

/** The elemental circle that flares behind the side with colour advantage (tinted by the shader). */
export const ELEMENT_CIRCLE = (g: Ctx) => {
  ring(g, 0.985, 4);
  ring(g, 0.965, 2);
  script(g, 0.84, 0.94, 21, 3);
  ring(g, 0.82, 3);
  poly(g, 0.8, 6, 2, 3);
  vertexCircles(g, 0.8, 6, 0.1, 2.5);
  ring(g, 0.52, 3);
  poly(g, 0.5, 8, 3, 2.5);
  crescents(g, 0.34, 6, 0.06, 2.5, 0.3);
  petals(g, 0.06, 0.3, 8, 2.5, 0.28);
  ring(g, 0.1, 3);
};
