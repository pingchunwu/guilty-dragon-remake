import { useEffect, useRef } from "react";
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
  TubeGeometry,
  Vector3,
  type Object3D,
  type Texture,
  type WebGLRenderTarget,
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { FullScreenQuad, Pass } from "three/examples/jsm/postprocessing/Pass.js";
import { CopyShader } from "three/examples/jsm/shaders/CopyShader.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { gsap } from "gsap";
import { reducedMotion } from "./BattleParts";
import type { Omen } from "./gachaOmen";

const TEX = 2048; // paint resolution; each layer is downsampled to its own size
const C = TEX / 2;
const TAU = Math.PI * 2;
const SIZE = 8; // world size of the ground ring planes
const ORBIT_SECONDS = 40;
const CYAN = "#9fe8ff";

/* ---------- procedural ring art (white strokes on transparent) ---------- */

type Ctx = CanvasRenderingContext2D;
let K = 1; // paint-space px per final texture px; line widths below are in final px
const pt = (r: number, a: number): [number, number] => [C + r * C * Math.cos(a), C + r * C * Math.sin(a)];
const lwk = (g: Ctx, lw: number) => (g.lineWidth = lw * K);

function ring(g: Ctx, r: number, lw: number, dash?: [number, number]) {
  lwk(g, lw);
  if (dash) g.setLineDash(dash.map((d) => d * K));
  g.beginPath();
  g.arc(C, C, r * C, 0, TAU);
  g.stroke();
  g.setLineDash([]);
}

function poly(g: Ctx, r: number, n: number, skip: number, lw: number, rot = -Math.PI / 2) {
  lwk(g, lw);
  g.beginPath();
  for (let i = 0; i <= n; i++) {
    const [x, y] = pt(r, rot + ((i * skip) / n) * TAU);
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.stroke();
}

function spokes(g: Ctx, r0: number, r1: number, n: number, lw: number, rot = 0) {
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
function vertexCircles(g: Ctx, r: number, n: number, rr: number, lw: number, rot = -Math.PI / 2) {
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

function crescents(g: Ctx, r: number, n: number, s: number, lw: number, rot = 0) {
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

function petals(g: Ctx, r0: number, r1: number, n: number, lw: number, bend = 0.3) {
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
function script(g: Ctx, rIn: number, rOut: number, seed: number, lw: number) {
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

type Layer = { ty?: number; size: number; tex: number; y: number; speed: number; glint: number; delay: number; paint: (g: Ctx) => void };

/** Layers 0-4 form the ground circle; 5-7 are the floating casts above it. Order = reveal order. */
const LAYERS: Layer[] = [
  { size: SIZE, tex: 2048, y: 0, speed: -0.012, glint: 0.35, delay: 0, paint: (g) => {
    ring(g, 0.985, 4);
    ring(g, 0.97, 2);
    script(g, 0.87, 0.955, 1, 4);
    ring(g, 0.85, 3);
    ring(g, 0.825, 7, [110, 40]);
    ring(g, 0.8, 3);
  } },
  { size: SIZE, tex: 1024, y: 0.012, speed: 0.022, glint: 0.5, delay: 0.5, paint: (g) => {
    script(g, 0.69, 0.78, 2, 3);
    ring(g, 0.665, 3);
    crescents(g, 0.62, 12, 0.032, 3, 0.1);
    ring(g, 0.58, 3);
  } },
  { size: SIZE, tex: 1024, y: 0.024, speed: -0.032, glint: 0.4, delay: 1.0, paint: (g) => {
    ring(g, 0.56, 3);
    script(g, 0.46, 0.55, 3, 3);
    ring(g, 0.44, 3);
    poly(g, 0.44, 8, 1, 3);
    spokes(g, 0.38, 0.44, 48, 2.5);
  } },
  { size: SIZE, tex: 1024, y: 0.036, speed: 0.05, glint: 0, delay: 1.5, paint: (g) => {
    poly(g, 0.42, 4, 1, 3, 0);
    poly(g, 0.42, 4, 1, 3, Math.PI / 4);
    poly(g, 0.42, 8, 3, 2.5);
    vertexCircles(g, 0.42, 8, 0.07, 2.5, 0);
    ring(g, 0.32, 3);
    poly(g, 0.32, 6, 2, 3);
    crescents(g, 0.25, 6, 0.04, 2.5, 0.3);
    ring(g, 0.2, 3);
  } },
  { size: 3.6, tex: 512, y: 0.048, speed: -0.09, glint: 0, delay: 2.0, paint: (g) => {
    ring(g, 0.96, 2.5);
    ring(g, 0.78, 2.5);
    petals(g, 0.1, 0.76, 8, 2.5, 0.28);
    poly(g, 0.55, 6, 2, 2.5);
    ring(g, 0.55, 2);
    ring(g, 0.3, 2.5);
    poly(g, 0.3, 8, 3, 2);
    ring(g, 0.1, 3);
  } },
  { size: 6.2, tex: 1024, y: 1.5, ty: 2.2, speed: 0.06, glint: 0.6, delay: 2.4, paint: (g) => {
    ring(g, 0.98, 4);
    script(g, 0.84, 0.95, 5, 3);
    ring(g, 0.8, 3);
    poly(g, 0.78, 6, 2, 3);
    vertexCircles(g, 0.78, 6, 0.1, 2.5);
    ring(g, 0.5, 3);
    poly(g, 0.5, 6, 1, 3, 0);
    spokes(g, 0.2, 0.5, 12, 2.5);
    ring(g, 0.2, 3);
  } },
  { size: 4.4, tex: 512, y: 2.6, ty: 4.4, speed: -0.09, glint: 0.7, delay: 3.1, paint: (g) => {
    ring(g, 0.97, 3);
    script(g, 0.8, 0.94, 6, 2.5);
    ring(g, 0.76, 2.5);
    poly(g, 0.74, 5, 2, 2.5);
    vertexCircles(g, 0.74, 5, 0.12, 2);
    ring(g, 0.36, 2.5);
    poly(g, 0.36, 5, 1, 2.5);
  } },
  { size: 3, tex: 512, y: 3.6, ty: 6.6, speed: 0.12, glint: 0.8, delay: 3.8, paint: (g) => {
    ring(g, 0.96, 3);
    ring(g, 0.86, 2.5);
    poly(g, 0.82, 7, 3, 2.5);
    crescents(g, 0.52, 7, 0.1, 2, 0.2);
    ring(g, 0.34, 2.5);
    poly(g, 0.34, 6, 1, 2.5, 0);
  } },
];

/** SR crown above the tower, and the SSR giant descending from the sky. */
const CROWN: Layer = { size: 3.4, tex: 512, y: 8.4, speed: -0.1, glint: 0.8, delay: 0, paint: (g) => {
  ring(g, 0.96, 3);
  script(g, 0.78, 0.93, 13, 2.5);
  ring(g, 0.74, 2.5);
  poly(g, 0.7, 6, 2, 2.5);
  crescents(g, 0.5, 6, 0.1, 2, 0.2);
  ring(g, 0.3, 2.5);
} };
const GIANT: Layer = { size: 10, tex: 1024, y: 9.6, speed: 0.025, glint: 0.7, delay: 0, paint: (g) => {
  ring(g, 0.99, 4);
  ring(g, 0.97, 2.5);
  script(g, 0.86, 0.96, 11, 3);
  ring(g, 0.85, 3);
  script(g, 0.72, 0.83, 12, 3);
  ring(g, 0.7, 3);
  poly(g, 0.68, 12, 5, 2.5);
  poly(g, 0.68, 12, 1, 2.5);
  vertexCircles(g, 0.68, 12, 0.06, 2.2);
  ring(g, 0.5, 3);
  poly(g, 0.46, 6, 2, 3);
  petals(g, 0.1, 0.4, 16, 2.5, 0.25);
  spokes(g, 0.5, 0.58, 36, 2.5);
  ring(g, 0.1, 3);
} };

/** UR: a second, larger giant that descends against the gold one. */
const GIANT2: Layer = { ...GIANT, size: 13, y: 17, speed: -0.045 };

const big = typeof document === "undefined" ? null : document.createElement("canvas");

/** Paint at 2048, then downsample to `out` px with a faint soft falloff under a crisp core. */
function paintTexture(paint: (g: Ctx) => void, anisotropy: number, out: number) {
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

function gradientTexture(w: number, h: number, fill: (g: Ctx) => CanvasGradient, srgb = false) {
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

/* ---------- ring material: alpha texture, angular write-in reveal, travelling glint ---------- */

const VERT = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
// UR: hue wheel for the prismatic break
const HUE = `vec3 rainbow(float h){ return clamp(abs(mod(h * 6. + vec3(0., 4., 2.), 6.) - 3.) - 1., 0., 1.); }`;
const FRAG = `
uniform sampler2D uMap; uniform vec3 uColor; uniform float uReveal; uniform float uAlpha;
uniform float uGlint; uniform float uSweep; uniform float uPrism; uniform float uHue;
varying vec2 vUv;
${HUE}
void main(){
  vec2 p = vUv - .5;
  float a = atan(p.y, p.x) / 6.2831853 + .5;
  float front = uReveal * 1.15;
  float m = 1. - smoothstep(front - .12, front, a);
  float head = smoothstep(front - .25, front - .03, a) * m * (1. - step(1., uReveal));
  float t = texture2D(uMap, vUv).a;
  float glint = exp(-fract(uSweep - a) * 12.) * uGlint;
  vec3 col = mix(uColor, rainbow(a + length(p) * .9 + uHue), uPrism);
  col = mix(col, vec3(1.), smoothstep(.7, 1., t) * .85);
  gl_FragColor = vec4(col * (1. + 1.6 * head + 1.8 * glint), t * m * uAlpha);
}`;

/* ---------- component ---------- */

/* ---------- pillar of light, ribbons, rays ---------- */

const PVERT = `varying vec3 vN; varying vec3 vV; varying vec2 vUv;
void main(){ vUv=uv; vec4 mv=modelViewMatrix*vec4(position,1.); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`;
const PFRAG = `
uniform vec3 uColor; uniform float uAlpha; uniform float uTime; uniform float uPrism; uniform float uHue;
varying vec3 vN; varying vec3 vV; varying vec2 vUv;
${HUE}
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(h(i), h(i+vec2(1.,0.)), f.x), mix(h(i+vec2(0.,1.)), h(i+vec2(1.,1.)), f.x), f.y); }
void main(){
  float f = pow(abs(dot(normalize(vN), normalize(vV))), 2.2);
  float g = smoothstep(0., .08, vUv.y) * (1. - smoothstep(.7, 1., vUv.y));
  float a = vUv.x * 6.2831853;
  float n = vn(vec2(cos(a) * 2.5 + vUv.y * 3. - uTime * .15, sin(a) * 2.5));
  vec3 col = mix(uColor, rainbow(vUv.x + vUv.y * .7 + uHue), uPrism);
  col = mix(col, vec3(1.), f * f * .5);
  gl_FragColor = vec4(col, f * g * (.65 + .5 * n) * uAlpha);
}`;

const RVERT = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
const RFRAG = `
uniform vec3 uColor; uniform float uProg; uniform float uFade;
varying vec2 vUv;
void main(){
  float x = vUv.x;
  float a = (1. - smoothstep(uProg - .02, uProg, x)) * smoothstep(0., .06, x) * (1. - smoothstep(.94, 1., x));
  float head = exp(-max(uProg - x, 0.) * 5.) * (1. - step(1., uProg));
  gl_FragColor = vec4(mix(uColor, vec3(1.), .5) * (.7 + 1.4 * head), a * uFade);
}`;

function rayTexture() {
  const cv = document.createElement("canvas");
  cv.width = 64;
  cv.height = 256;
  const g = cv.getContext("2d")!;
  const v = g.createLinearGradient(0, 0, 0, 256);
  v.addColorStop(0, "rgba(255,255,255,.9)");
  v.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = v;
  g.fillRect(0, 0, 64, 256);
  const hz = g.createLinearGradient(0, 0, 64, 0);
  hz.addColorStop(0, "rgba(0,0,0,0)");
  hz.addColorStop(0.5, "rgba(0,0,0,1)");
  hz.addColorStop(1, "rgba(0,0,0,0)");
  g.globalCompositeOperation = "destination-in";
  g.fillStyle = hz;
  g.fillRect(0, 0, 64, 256);
  return new CanvasTexture(cv);
}

const VIOLET = "#c9b6ff";
const GOLD = "#ffd34d";
const LABEL_TOL = 0.05;

// screen-space fake-out for SSR/UR: the picture loses its signal like an old TV until only snow is left
const GLITCH_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uGlitch: { value: 0 },
    uTime: { value: 0 },
  },
  vertexShader: `varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uGlitch; uniform float uTime;
varying vec2 vUv;
float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  float g = uGlitch;
  float st = floor(uTime * 30.);
  vec2 uv = vUv;
  vec3 col;
  if (g > 0.) {
    // horizontal sync slips: the whole picture bends, and each scanline jitters on its own
    float line = floor(vUv.y * 260.);
    uv.x += sin(vUv.y * 14. + uTime * 26.) * .014 * g + (rnd(vec2(line, st)) - .5) * .03 * g * g;
    // a tracking band crawls up the screen, shearing whatever it passes
    float band = fract(vUv.y + uTime * .9);
    float shear = smoothstep(.14, 0., band);
    uv.x += shear * shear * .22 * g;
    // vertical hold lets go: the picture starts rolling, faster as the signal dies
    float roll = g * g * g * 2.6;
    uv.y = fract(uv.y + roll);
    uv.x = fract(uv.x);
    vec3 pic = texture2D(tDiffuse, uv).rgb;
    // weak signal loses colour first, then brightness
    pic = mix(pic, vec3(dot(pic, vec3(.3, .59, .11))), smoothstep(.1, .6, g));
    pic *= 1. - smoothstep(.5, .97, g);
    // the dark hum bar at the seam of the roll
    pic *= 1. - .85 * smoothstep(.1, 0., abs(fract(vUv.y - roll) - .5)) * step(.02, roll);
    // snow: grainy static, stretched a little sideways like a real tube
    vec2 grain = floor(gl_FragCoord.xy / vec2(3., 2.));
    float snow = rnd(grain + st * 7.13);
    float amount = mix(.1, 1.15, smoothstep(.25, .92, g));
    col = pic + vec3(snow * snow) * amount * (.75 + shear * .6);
    // bright dropout streaks where the tape or antenna hiccups
    float rowN = floor(vUv.y * 90.);
    col += step(.985 - g * .03, rnd(vec2(rowN, st))) * vec3(.9) * rnd(vec2(grain.x * .02, rowN));
    col *= .86 + .14 * sin(gl_FragCoord.y * 1.57);
  } else {
    col = texture2D(tDiffuse, uv).rgb;
  }
  gl_FragColor = vec4(col, 1.);
}`,
};

// the screen as a pane of clear glass: each shard bends what is behind it and catches reflections as it tilts
const SHARD_VERT = `attribute vec2 aPane; attribute float aEdge; attribute vec2 aSide;
varying vec2 vPane; varying float vEdge; varying vec3 vN; varying vec3 vSide; varying vec3 vView;
void main(){
  vPane = aPane;
  vEdge = aEdge;
  vN = normalMatrix * normal;
  vSide = normalMatrix * vec3(aSide, 0.);
  vec4 mv = modelViewMatrix * vec4(position, 1.);
  vView = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;
const SHARD_FRAG = `uniform sampler2D tScene; uniform vec2 uRes; uniform vec2 uHit; uniform float uAspect; uniform float uReach;
varying vec2 vPane; varying float vEdge; varying vec3 vN; varying vec3 vSide; varying vec3 vView;
void main(){
  vec3 n = normalize(vN);
  vec3 v = normalize(vView);
  if (dot(n, v) < 0.) n = -n;
  // ground chamfer along the cut: the surface really turns there, so light and refraction do the drawing, not a stroke
  float reach = step(length((vPane - uHit) * vec2(uAspect, 1.)), uReach);
  float chamfer = smoothstep(max(.0045, fwidth(vEdge) * 1.6), 0., vEdge) * reach; // never under a pixel or so, or the hairline breaks into dashes
  n = normalize(n + vSide * chamfer * 1.1);
  float tilt = 1. - abs(n.z);
  // looking through: the tilt bends the view, and splits it slightly into colours
  vec2 s = gl_FragCoord.xy / uRes;
  vec2 bend = n.xy * (.03 + .2 * tilt);
  vec3 behind = vec3(texture2D(tScene, s + bend * 1.08).r, texture2D(tScene, s + bend).g, texture2D(tScene, s + bend * .92).b);
  vec3 col = behind * 1.08;
  // reflection: a warm room above and one hard window, sliding across the surface as it turns
  vec3 r = reflect(-v, n);
  float fresnel = .05 + .95 * pow(1. - abs(dot(n, v)), 4.);
  vec3 room = mix(vec3(.05, .07, .12), vec3(1.3, 1., .62), smoothstep(-.2, .9, r.y));
  col += room * fresnel;
  col += vec3(1., .96, .88) * pow(max(dot(r, normalize(vec3(.35, .55, .76))), 0.), 90.) * 7. * step(.001, tilt);
  // the chamfer faces the light on one side of a piece and away from it on the other
  float lit = dot(n, normalize(vec3(.35, .55, .76)));
  col += vec3(.95, .9, .8) * chamfer * max(lit - .6, 0.) * 2.2;
  col *= 1. - chamfer * max(.5 - lit, 0.) * 1.3;
  gl_FragColor = vec4(col, 1.);
}`;

const SHARD_THICKNESS = 0.018;

/** Radial glass break around one hit point, as a composer pass over the scene. Coordinates: the pane is y -1..1, x -aspect..aspect. */
function makeShatter(aspect: number) {
  const hit = new Vector2(0.1 * aspect, 0.12);
  const material = new ShaderMaterial({
    uniforms: {
      tScene: { value: null },
      uRes: { value: new Vector2(1, 1) },
      uHit: { value: new Vector2(hit.x / aspect / 2 + 0.5, hit.y / 2 + 0.5) },
      uAspect: { value: aspect },
      uReach: { value: 0 },
    },
    vertexShader: SHARD_VERT,
    fragmentShader: SHARD_FRAG,
    side: DoubleSide,
  });
  const scene = new Scene();
  const shards: { mesh: Mesh; x: number; y: number; delay: number; vx: number; vy: number; vz: number; axis: Vector3; spin: number }[] = [];
  const addShard = (pts: Vector2[]) => {
    const c = pts.reduce((sum, p) => sum.add(p), new Vector2()).divideScalar(pts.length);
    const pos: number[] = [];
    const pane: number[] = [];
    const edge: number[] = [];
    const side: number[] = [];
    const normal: number[] = [];
    const push = (p: Vector2, z: number, e: number, n: [number, number, number], s: Vector2 | null) => {
      pos.push(p.x - c.x, p.y - c.y, z);
      pane.push(p.x / aspect / 2 + 0.5, p.y / 2 + 0.5);
      edge.push(e);
      normal.push(...n);
      side.push(s?.x ?? 0, s?.y ?? 0);
    };
    pts.forEach((p, i) => {
      const q = pts[(i + 1) % pts.length]!;
      const along = q.clone().sub(p);
      const out = new Vector2(along.y, -along.x).normalize();
      if (out.dot(p.clone().sub(c)) < 0) out.negate();
      const wall: [number, number, number] = [out.x, out.y, 0];
      // front: aEdge is the true distance to the cut edge, its height at the centre and 0 along the edge
      push(c, 0, Math.abs(along.cross(c.clone().sub(p))) / along.length(), [0, 0, 1], out);
      push(p, 0, 0, [0, 0, 1], out);
      push(q, 0, 0, [0, 0, 1], out);
      // back face and the side wall that give the piece its thickness
      push(c, -SHARD_THICKNESS, 1, [0, 0, -1], null);
      push(p, -SHARD_THICKNESS, 1, [0, 0, -1], null);
      push(q, -SHARD_THICKNESS, 1, [0, 0, -1], null);
      push(p, 0, 1, wall, null);
      push(q, 0, 1, wall, null);
      push(q, -SHARD_THICKNESS, 1, wall, null);
      push(p, 0, 1, wall, null);
      push(q, -SHARD_THICKNESS, 1, wall, null);
      push(p, -SHARD_THICKNESS, 1, wall, null);
    });
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute("aPane", new BufferAttribute(new Float32Array(pane), 2));
    geo.setAttribute("aEdge", new BufferAttribute(new Float32Array(edge), 1));
    geo.setAttribute("aSide", new BufferAttribute(new Float32Array(side), 2));
    geo.setAttribute("normal", new BufferAttribute(new Float32Array(normal), 3));
    const mesh = new Mesh(geo, material);
    mesh.position.set(c.x, c.y, 0);
    scene.add(mesh);
    const out = c.clone().sub(hit);
    const dist = out.length();
    out.normalize();
    shards.push({
      mesh,
      x: c.x,
      y: c.y,
      delay: dist * 0.16 + Math.random() * 0.1, // the pieces around the hit let go first
      vx: out.x * (0.12 + Math.random() * 0.4),
      vy: out.y * (0.1 + Math.random() * 0.3) + 0.12,
      vz: 0.25 + Math.random() * 0.95,
      axis: new Vector3(Math.random() - 0.5, Math.random() - 0.5, (Math.random() - 0.5) * 0.5).normalize(),
      spin: (Math.random() < 0.5 ? -1 : 1) * (1.4 + Math.random() * 3.4),
    });
  };
  // long splinters near the hit, wider plates further out; neighbours share corners so the pieces fit back together
  const SPOKES = 13;
  const far = Math.hypot(Math.max(aspect, 1) + 0.2, 1.2) * 1.5;
  const radii = [0.07, 0.2, 0.42, 0.78, 1.3, far];
  const grid = radii.map((r0, ring) =>
    Array.from({ length: SPOKES }, (_, j) => {
      const a = ((j + (ring === radii.length - 1 ? 0 : (Math.random() - 0.5) * 0.45)) / SPOKES) * TAU;
      const r = r0 * (ring === radii.length - 1 ? 1 : 0.84 + Math.random() * 0.32);
      return new Vector2(hit.x + Math.cos(a) * r, hit.y + Math.sin(a) * r);
    }),
  );
  for (let j = 0; j < SPOKES; j++) {
    const k = (j + 1) % SPOKES;
    addShard([hit.clone(), grid[0]![j]!, grid[0]![k]!]);
    for (let ring = 0; ring < radii.length - 1; ring++) {
      const [a, b, c, d] = [grid[ring]![j]!, grid[ring + 1]![j]!, grid[ring + 1]![k]!, grid[ring]![k]!];
      if (Math.random() < 0.6) {
        addShard([a, b, c]);
        addShard([a, c, d]);
      } else addShard([a, b, c, d]);
    }
  }
  const camera = new PerspectiveCamera(40, aspect, 0.1, 20);
  camera.position.z = 1 / Math.tan((20 * Math.PI) / 180); // the pane at z 0 exactly fills the view

  const copy = new FullScreenQuad(new ShaderMaterial(CopyShader));
  const copyU = (copy.material as ShaderMaterial).uniforms;
  class ShatterPass extends Pass {
    setSize(w: number, h: number) {
      material.uniforms.uRes!.value.set(w, h);
    }
    render(renderer: WebGLRenderer, writeBuffer: WebGLRenderTarget, readBuffer: WebGLRenderTarget) {
      copyU.tDiffuse!.value = readBuffer.texture;
      material.uniforms.tScene!.value = readBuffer.texture;
      renderer.setRenderTarget(writeBuffer);
      copy.render(renderer);
      const auto = renderer.autoClear;
      renderer.autoClear = false;
      renderer.clearDepth();
      renderer.render(scene, camera);
      renderer.autoClear = auto;
    }
  }
  const pass = new ShatterPass();
  return {
    pass,
    reach: material.uniforms.uReach!,
    fall: (t: number) => {
      for (const s of shards) {
        const l = Math.max(0, t - s.delay);
        s.mesh.position.set(s.x + s.vx * l, s.y + s.vy * l - 1.7 * l * l, s.vz * l);
        s.mesh.setRotationFromAxisAngle(s.axis, s.spin * l);
      }
    },
  };
}

/**
 * Gacha omen in 3D. Phases (seconds): seal 0-2.4 (final swell at 3.0 when nothing good); if good, breakthrough 2.4-3.8 then
 * the SR look 3.8-5.0 and its final swell. SSR/UR play that same swell, then signal loss 5.7-6.95, the screen cracks at 6.95 and falls away as glass over gold 7.11-10.31
 * (UR: gold 2s, a stalled beat, then a prismatic break). Tap skips to the next phase; tapping in the final phase ends it.
 * Reduced motion or no WebGL ends immediately.
 */
export function GachaSeal3D({ omen, onDone }: { omen: Omen; onDone: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  done.current = onDone;
  const omenRef = useRef(omen); // the omen is fixed for the life of a pull
  const tap = useRef<() => void>(() => {});

  useEffect(() => {
    const el = host.current!;
    if (reducedMotion()) {
      done.current();
      return;
    }
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      done.current();
      return;
    }
    const { good, tier } = omenRef.current;
    const ur = tier === "UR";
    const gold = tier === "SSR" || ur; // UR first plays the full gold look
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    el.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";

    const aniso = renderer.capabilities.getMaxAnisotropy();
    const scene = new Scene();
    scene.background = gradientTexture(256, 256, (g) => {
      const gr = g.createRadialGradient(128, 150, 0, 128, 150, 200);
      gr.addColorStop(0, "#14233f");
      gr.addColorStop(0.55, "#0a1226");
      gr.addColorStop(1, "#03060f");
      return gr;
    }, true);
    const camera = new PerspectiveCamera(40, 1, 0.1, 200);

    // every colour that follows the tier; setTier is the instant version of tierTo below
    const tint: Color[] = [];
    const tierColor = new Color(CYAN);
    const applyTier = () => tint.forEach((c) => c.copy(tierColor));
    const setTier = (hex: string) => {
      tierColor.set(hex);
      applyTier();
    };
    void setTier;

    const prism = { value: 0 }; // UR: shared by every material that shifts to the spectrum
    const hue = { value: 0 };
    const late: Object3D[] = []; // later-phase objects: compiled up front, hidden until their phase

    const makeRing = (L: Layer) => {
      const mat = new ShaderMaterial({
        uniforms: {
          uMap: { value: paintTexture(L.paint, aniso, L.tex) },
          uColor: { value: new Color(CYAN) },
          uReveal: { value: 0 },
          uAlpha: { value: 0.8 },
          uGlint: { value: L.glint },
          uSweep: { value: 0 },
          uPrism: prism,
          uHue: hue,
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      });
      tint.push(mat.uniforms.uColor!.value);
      const mesh = new Mesh(new PlaneGeometry(L.size, L.size), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = L.y;
      scene.add(mesh);
      return { mesh, mat, speed: L.speed, L };
    };
    // paint everything before the timeline exists so painting never eats the reveal
    const rings = LAYERS.map(makeRing);
    const crown = good ? makeRing(CROWN) : null;
    const giant = gold ? makeRing(GIANT) : null;
    const giant2 = ur ? makeRing(GIANT2) : null;
    const extra = [crown, giant, giant2].filter((x) => x !== null);
    extra.forEach((r) => late.push(r.mesh));
    const spinners = [...rings, ...extra];

    // soft glow disc under the circle
    const glowMat = new MeshBasicMaterial({
      map: gradientTexture(256, 256, (g) => {
        const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
        gr.addColorStop(0, "rgba(255,255,255,.9)");
        gr.addColorStop(0.5, "rgba(255,255,255,.28)");
        gr.addColorStop(1, "rgba(255,255,255,0)");
        return gr;
      }),
      color: CYAN,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const glow = new Mesh(new PlaneGeometry(SIZE * 0.6, SIZE * 0.6), glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = -0.03;
    scene.add(glow);
    tint.push(glowMat.color);

    // pillar of light through the centre (grows upward from the ground circle)
    const pillarGeo = new CylinderGeometry(0.7, 0.7, 1, 48, 1, true);
    pillarGeo.translate(0, 0.5, 0);
    const pillarMat = new ShaderMaterial({
      uniforms: { uColor: { value: new Color(CYAN) }, uAlpha: { value: 0 }, uTime: { value: 0 }, uPrism: prism, uHue: hue },
      vertexShader: PVERT,
      fragmentShader: PFRAG,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: AdditiveBlending,
    });
    tint.push(pillarMat.uniforms.uColor!.value);
    const pillar = new Mesh(pillarGeo, pillarMat);
    pillar.scale.y = 0.01;
    scene.add(pillar);
    late.push(pillar);

    // SSR: god rays fanning from the giant circle, and gold ribbons spiralling the tower
    const rays = new Group();
    const rayMat = new MeshBasicMaterial({
      map: rayTexture(),
      color: CYAN,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: DoubleSide,
      blending: AdditiveBlending,
    });
    const ribbons = new Group();
    const ribbonMats: ShaderMaterial[] = [];
    // spiral tube around the tower; returns its colour so the caller can tint it
    const addRibbon = (into: Group, i: number, n: number, r0: number, h: number, w: number, dir = 1) => {
      const pts: Vector3[] = [];
      for (let j = 0; j <= 40; j++) {
        const u = j / 40;
        const a = dir * ((i / n) * TAU + u * TAU * 1.6);
        const r = r0 + 0.25 * Math.sin(u * TAU * 2 + i);
        pts.push(new Vector3(r * Math.cos(a), 0.3 + u * h, r * Math.sin(a)));
      }
      const mat = new ShaderMaterial({
        uniforms: { uColor: { value: new Color(CYAN) }, uProg: { value: 0 }, uFade: { value: 1 } },
        vertexShader: RVERT,
        fragmentShader: RFRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      });
      ribbonMats.push(mat);
      into.add(new Mesh(new TubeGeometry(new CatmullRomCurve3(pts), 220, w, 6, false), mat));
      return mat.uniforms.uColor!.value as Color;
    };
    if (gold) {
      tint.push(rayMat.color);
      for (let i = 0; i < 5; i++) {
        const pivot = new Group();
        pivot.rotation.y = (i / 5) * TAU;
        const tilt = new Group();
        tilt.rotation.z = 0.28;
        const m = new Mesh(new PlaneGeometry(1.8, 14), rayMat);
        m.position.y = -7;
        tilt.add(m);
        pivot.add(tilt);
        rays.add(pivot);
      }
      rays.position.y = GIANT.y;
      scene.add(rays);
      late.push(rays);
      for (let i = 0; i < 4; i++) tint.push(addRibbon(ribbons, i, 4, 3.5, 9, 0.05));
      scene.add(ribbons);
      late.push(ribbons);
    }

    // UR: seven spectrum ribbons spiralling the other way, and the ring of light along the ground
    const prismRibbons = new Group();
    const prismMats: ShaderMaterial[] = [];
    const wave = new Mesh(
      new PlaneGeometry(120, 120),
      new ShaderMaterial({
        uniforms: { uR: { value: 0 }, uHue: hue },
        vertexShader: RVERT,
        fragmentShader: `uniform float uR; uniform float uHue; varying vec2 vUv;
${HUE}
void main(){
  vec2 p = (vUv - .5) * 120.;
  float r = length(p);
  float d = r - uR * 60.;
  float line = exp(-d * d / .25) + .35 * exp(-d * d / 6.) * step(d, 0.);
  float fade = 1. - smoothstep(.55, 1., uR);
  vec3 col = mix(rainbow(atan(p.y, p.x) / 6.2831853 + uHue), vec3(1.), exp(-d * d / .25) * .6);
  gl_FragColor = vec4(col * line * fade * 1.4, 1.);
}`,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    );
    if (ur) {
      for (let i = 0; i < 7; i++) {
        const c = addRibbon(prismRibbons, i, 7, 4.3, 17, 0.045, -1);
        c.setHSL(i / 7, 1, 0.55);
        const pm = ribbonMats.pop()!;
        pm.uniforms.uFade!.value = 0.55; // keep the seven colours readable instead of blowing out to white
        prismMats.push(pm);
      }
      scene.add(prismRibbons);
      wave.rotation.x = -Math.PI / 2;
      wave.position.y = 0.06;
      scene.add(wave);
      late.push(prismRibbons, wave);
    }

    // post-processing
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new Vector2(1, 1), 0.45, 0.35, 0.55);
    composer.addPass(bloom);
    // shortcut: the shards are cut for the aspect at the start, so turning the phone during the fall misaligns them; re-cut on resize if that shows
    const shatter = gold ? makeShatter((el.clientWidth || 1) / (el.clientHeight || 1)) : null;
    if (shatter) composer.addPass(shatter.pass);
    composer.addPass(new SMAAPass());
    const glitch = new ShaderPass(GLITCH_SHADER);
    composer.addPass(glitch);
    composer.addPass(new OutputPass());
    const glitchU = glitch.uniforms as Record<"uGlitch" | "uTime", { value: number }>;

    let bloomScale = 1;
    const resize = () => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
      bloom.setSize(w * bloomScale, h * bloomScale);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    // warm-up: compile every shader now (late objects visible for one frame), then hide them
    late.forEach((o) => (o.visible = true));
    composer.render();
    late.forEach((o) => (o.visible = false));
    glitch.enabled = false;
    if (shatter) shatter.pass.enabled = false;

    /* ---------- timeline ---------- */
    const slow = { v: 1 }; // global time scale for the UR held breath
    const cam = { look: 1.2, dist: 1, elev: 35 };
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      done.current();
    };
    const tl = gsap.timeline({ paused: true });
    const SEAL = 2.4;
    const BREAK = SEAL;
    const GOOD = BREAK + 1.4;
    const SR_FINAL = GOOD + 1.2;
    const GLITCH = SR_FINAL + 0.7; // SSR/UR: breaks on the beat the SR ending has swelled to white and would fade out
    const CRACK = GLITCH + 1.25;
    const SPELL = CRACK + 0.16; // the cracked pane holds for a beat before it falls
    const falling = { t: 0 };
    const GOLD_END = SPELL + 2.0; // UR: gold look, then held breath, then the spectrum
    const URBREAK = GOLD_END + 0.9;
    const FINAL = !good ? SEAL + 0.6 : ur ? URBREAK + 2.8 : gold ? SPELL + 3.2 : SR_FINAL;
    tl.addLabel("seal", 0).addLabel("final", FINAL);
    const marks = [FINAL];
    const show = (o: Object3D, at: number) => tl.set(o, { visible: true }, at);
    const tierTo = (hex: string, dur: number, at: number) => {
      const c = new Color(hex);
      tl.to(tierColor, { r: c.r, g: c.g, b: c.b, duration: dur, ease: "sine.inOut" }, at);
    };

    // 1. seal: every ring writes in around its angle, outer to inner, then the upper casts
    rings.forEach((r) => {
      const at = r.L.delay * 0.4;
      tl.to(r.mat.uniforms.uReveal!, { value: 1, duration: 0.8, ease: "power2.out" }, at);
      if (r.L.y > 0.5) tl.from(r.mesh.position, { y: r.L.y - 0.7, duration: 0.8, ease: "power2.out" }, at);
      else tl.from(r.mesh.scale, { x: 0.92, y: 0.92, duration: 0.8, ease: "power2.out" }, at);
    });
    tl.to(glowMat, { opacity: 0.15, duration: 1.8, ease: "sine.out" }, 0);

    if (good) {
      // 2. breakthrough: the casts part into a tower and the pillar of light rises through them
      tl.addLabel("break", BREAK).addLabel("good", GOOD);
      marks.push(BREAK, GOOD);
      rings.forEach((r) => {
        if (r.L.ty) tl.to(r.mesh.position, { y: r.L.ty, duration: 1.4, ease: "power2.inOut" }, BREAK);
      });
      show(pillar, BREAK);
      tl.to(pillarMat.uniforms.uAlpha!, { value: 0.32, duration: 1.0, ease: "sine.out" }, BREAK);
      tl.to(pillar.scale, { y: 7.5, duration: 1.4, ease: "power2.inOut" }, BREAK);
      tl.to(cam, { look: 3, dist: 1.15, elev: 32, duration: 1.4, ease: "sine.inOut" }, BREAK);

      // 3. how good: silver-violet crown for everyone; SSR and UR then break out of it into gold
      if (crown) {
        show(crown.mesh, GOOD);
        tierTo(VIOLET, 0.9, GOOD);
        tl.fromTo(crown.mat.uniforms.uReveal!, { value: 0 }, { value: 1, duration: 1.0, ease: "power2.out" }, GOOD + 0.1);
        tl.fromTo(crown.mesh.position, { y: CROWN.y - 0.8 }, { y: CROWN.y, duration: 1.0, ease: "power2.out" }, GOOD + 0.1);
        tl.to(pillar.scale, { y: 9.5, duration: 1.2, ease: "sine.inOut" }, GOOD);
        tl.to(cam, { look: 4.2, dist: 1.3, duration: 1.2, ease: "sine.inOut" }, GOOD);
      }
      if (gold && giant) {
        // the same swell the SR look ends on, then the glitch instead of its fade-out
        tl.addLabel("glitch", GLITCH).addLabel("spell", SPELL);
        marks.push(SR_FINAL, GLITCH, SPELL);
        tl.to(bloom, { strength: 2.6, duration: 0.7, ease: "power2.in" }, SR_FINAL);
        tl.to(renderer, { toneMappingExposure: 2.8, duration: 0.7, ease: "power2.in" }, SR_FINAL);
        tl.set(bloom, { strength: 0.45 }, GLITCH);
        tl.set(renderer, { toneMappingExposure: 0.9 }, GLITCH);
        tl.set(glitch, { enabled: true }, GLITCH);
        tl.set(slow, { v: 0.03 }, GLITCH); // the seal freezes while the picture falls apart
        tl.set(glitchU.uGlitch, { value: 0.12 }, GLITCH);
        tl.to(glitchU.uGlitch, { value: 1, duration: CRACK - GLITCH - 0.15, ease: "sine.in" }, GLITCH); // holds on pure snow before the cut
        // the pane covers the whole screen from here, so the look behind it can change unseen
        tl.set(glitch, { enabled: false }, CRACK);
        tl.set(shatter!.pass, { enabled: true }, CRACK);
        tl.to(shatter!.reach, { value: 2, duration: SPELL - CRACK, ease: "power2.out" }, CRACK);
        tierTo(GOLD, 0.01, CRACK);
        const t0 = SPELL;
        tl.set(slow, { v: 1 }, t0);
        tl.to(falling, { t: 2.2, duration: 2.2, ease: "none" }, t0);
        tl.set(shatter!.pass, { enabled: false }, t0 + 2.2);
        tl.to(pillar.scale, { y: 11.5, duration: 2.0, ease: "sine.inOut" }, t0);
        tl.to(pillarMat.uniforms.uAlpha!, { value: 0.5, duration: 1.5, ease: "sine.out" }, t0);
        tl.to(cam, { look: 5.2, dist: 1.7, elev: 30, duration: ur ? 2.0 : 2.2, ease: "sine.inOut" }, t0);
        show(giant.mesh, t0);
        tl.fromTo(giant.mesh.position, { y: 26 }, { y: GIANT.y, duration: 2.0, ease: "power2.out" }, t0);
        tl.fromTo(giant.mat.uniforms.uReveal!, { value: 0 }, { value: 1, duration: 2.0, ease: "power1.inOut" }, t0);
        show(rays, t0);
        tl.to(rayMat, { opacity: 0.22, duration: 1.6, ease: "sine.out" }, t0 + 0.3);
        show(ribbons, t0);
        ribbonMats.forEach((m, i) =>
          tl.fromTo(m.uniforms.uProg!, { value: 0 }, { value: 1, duration: 1.2, ease: "sine.inOut" }, t0 + 0.3 + i * 0.12),
        );
      }
    }

    if (ur && giant && giant2) {
      tl.addLabel("stall", GOLD_END).addLabel("prism", URBREAK);
      marks.push(GOLD_END, URBREAK);
      // held breath: everything slows and the light drains away except the pillar core
      tl.to(slow, { v: 0.1, duration: 0.5, ease: "sine.out" }, GOLD_END);
      rings.concat(extra).forEach((r) => tl.to(r.mat.uniforms.uAlpha!, { value: 0.1, duration: 0.6, ease: "sine.out" }, GOLD_END));
      tl.to(glowMat, { opacity: 0, duration: 0.6, ease: "sine.out" }, GOLD_END);
      tl.to(rayMat, { opacity: 0, duration: 0.6, ease: "sine.out" }, GOLD_END);
      ribbonMats.forEach((m) => tl.to(m.uniforms.uFade!, { value: 0, duration: 0.6, ease: "sine.out" }, GOLD_END));
      tl.to(pillarMat.uniforms.uAlpha!, { value: 0.38, duration: 0.6, ease: "sine.out" }, GOLD_END);
      // shatter: gold becomes a drifting spectrum, the tower climbs and the camera lifts away
      tl.to(slow, { v: 1, duration: 0.8, ease: "sine.inOut" }, URBREAK);
      tl.to(prism, { value: 1, duration: 0.9, ease: "sine.inOut" }, URBREAK);
      rings.concat(extra).forEach((r) => tl.to(r.mat.uniforms.uAlpha!, { value: 0.85, duration: 1.0, ease: "sine.out" }, URBREAK));
      tl.to(glowMat, { opacity: 0.2, duration: 1.2, ease: "sine.out" }, URBREAK);
      rings.forEach((r) => {
        if (r.L.ty) tl.to(r.mesh.position, { y: r.L.ty * 1.6, duration: 2.2, ease: "sine.inOut" }, URBREAK);
      });
      tl.to(giant.mesh.position, { y: 13, duration: 2.2, ease: "sine.inOut" }, URBREAK);
      show(giant2.mesh, URBREAK);
      tl.fromTo(giant2.mesh.position, { y: 40 }, { y: GIANT2.y, duration: 2.2, ease: "power2.out" }, URBREAK);
      tl.fromTo(giant2.mat.uniforms.uReveal!, { value: 0 }, { value: 1, duration: 2.0, ease: "power1.inOut" }, URBREAK);
      tl.to(pillar.scale, { x: 2.2, z: 2.2, y: 19, duration: 2.2, ease: "sine.inOut" }, URBREAK);
      tl.to(pillarMat.uniforms.uAlpha!, { value: 0.55, duration: 1.4, ease: "sine.out" }, URBREAK);
      tl.to(cam, { look: 10, dist: 2.7, elev: 36, duration: 2.6, ease: "sine.inOut" }, URBREAK);
      tl.to(bloom, { strength: 0.6, duration: 1.8, ease: "sine.inOut" }, URBREAK);
      show(prismRibbons, URBREAK);
      prismMats.forEach((m, i) => tl.fromTo(m.uniforms.uProg!, { value: 0 }, { value: 1, duration: 1.4, ease: "sine.inOut" }, URBREAK + 0.5 + i * 0.1));
      show(wave, URBREAK + 1.2);
      tl.fromTo(wave.material.uniforms.uR!, { value: 0 }, { value: 1, duration: 1.4, ease: "power2.out" }, URBREAK + 1.2);
    }

    // 4. final: bloom and exposure swell to white, then the canvas fades out
    tl.to(bloom, { strength: 2.6, duration: 0.7, ease: "power2.in" }, FINAL);
    tl.to(renderer, { toneMappingExposure: 2.8, duration: 0.7, ease: "power2.in" }, FINAL);
    tl.to(el, { opacity: 0, duration: 0.3, ease: "none" }, FINAL + 0.7);
    tl.call(finish, undefined, FINAL + 1.0);

    tap.current = () => {
      if (finished || tl.paused()) return;
      const t = tl.time();
      if (t >= FINAL) return finish();
      const next = marks.filter((m) => m > t + LABEL_TOL).sort((a, b) => a - b)[0]!;
      tl.seek(next);
    };

    // single render loop
    let raf = 0;
    let last = performance.now();
    let spin = 0;
    let frames = 0;
    let acc = 0;
    let started = false;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      if (document.hidden) return;
      if (!started) {
        started = true;
        tl.play(0);
      }
      if (frames < 60) {
        acc += dt * 1000;
        if (++frames === 60 && acc / 60 > 22) {
          renderer.setPixelRatio(1);
          bloomScale = 0.5;
          resize();
        }
      }
      const sdt = dt * slow.v;
      spin += sdt;
      hue.value = spin * 0.08;
      applyTier();
      glitchU.uTime.value = now / 1000;
      if (shatter?.pass.enabled) shatter.fall(falling.t);
      pillarMat.uniforms.uTime!.value = spin;
      spinners.forEach((r, i) => {
        r.mesh.rotation.z += r.speed * sdt;
        r.mat.uniforms.uSweep!.value = spin * (0.12 + 0.03 * i) * (i % 2 ? -1 : 1);
      });
      rays.rotation.y += 0.05 * sdt;
      ribbons.rotation.y += 0.08 * sdt;
      prismRibbons.rotation.y -= 0.1 * sdt;
      const az = (spin / ORBIT_SECONDS) * TAU;
      const elev = (cam.elev * Math.PI) / 180;
      const d = Math.max(9, 10.8 / camera.aspect) * cam.dist;
      camera.position.set(Math.sin(az) * Math.cos(elev) * d, Math.sin(elev) * d + cam.look - 1.2, Math.cos(az) * Math.cos(elev) * d);
      camera.lookAt(0, cam.look, 0);
      composer.render();
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      tl.kill();
      ro.disconnect();
      const textures = new Set<Texture>();
      if (scene.background) textures.add(scene.background as Texture);
      scene.traverse((o) => {
        if (!(o instanceof Mesh)) return;
        o.geometry.dispose();
        const m = o.material as MeshBasicMaterial | ShaderMaterial;
        if ("map" in m && m.map) textures.add(m.map);
        if ("uniforms" in m && m.uniforms.uMap) textures.add(m.uniforms.uMap.value);
        m.dispose();
      });
      textures.forEach((t) => t.dispose());
      composer.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={host} onPointerDown={() => tap.current()} style={{ position: "absolute", inset: 0, overflow: "hidden", touchAction: "none" }} />;
}
