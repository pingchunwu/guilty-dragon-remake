import { useEffect, useRef } from "react";
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
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
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
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
const FRAG = `
uniform sampler2D uMap; uniform vec3 uColor; uniform float uReveal; uniform float uAlpha;
uniform float uGlint; uniform float uSweep;
varying vec2 vUv;
void main(){
  vec2 p = vUv - .5;
  float a = atan(p.y, p.x) / 6.2831853 + .5;
  float front = uReveal * 1.15;
  float m = 1. - smoothstep(front - .12, front, a);
  float head = smoothstep(front - .25, front - .03, a) * m * (1. - step(1., uReveal));
  float t = texture2D(uMap, vUv).a;
  float glint = exp(-fract(uSweep - a) * 12.) * uGlint;
  vec3 col = mix(uColor, vec3(1.), smoothstep(.7, 1., t) * .85);
  gl_FragColor = vec4(col * (1. + 1.6 * head + 1.8 * glint), t * m * uAlpha);
}`;

/* ---------- component ---------- */

/* ---------- pillar of light, ribbons, rays ---------- */

const PVERT = `varying vec3 vN; varying vec3 vV; varying vec2 vUv;
void main(){ vUv=uv; vec4 mv=modelViewMatrix*vec4(position,1.); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`;
const PFRAG = `
uniform vec3 uColor; uniform float uAlpha; uniform float uTime;
varying vec3 vN; varying vec3 vV; varying vec2 vUv;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(h(i), h(i+vec2(1.,0.)), f.x), mix(h(i+vec2(0.,1.)), h(i+vec2(1.,1.)), f.x), f.y); }
void main(){
  float f = pow(abs(dot(normalize(vN), normalize(vV))), 2.2);
  float g = smoothstep(0., .08, vUv.y) * (1. - smoothstep(.7, 1., vUv.y));
  float a = vUv.x * 6.2831853;
  float n = vn(vec2(cos(a) * 2.5 + vUv.y * 3. - uTime * .15, sin(a) * 2.5));
  vec3 col = mix(uColor, vec3(1.), f * f * .5);
  gl_FragColor = vec4(col, f * g * (.65 + .5 * n) * uAlpha);
}`;

const RVERT = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
const RFRAG = `
uniform vec3 uColor; uniform float uProg;
varying vec2 vUv;
void main(){
  float x = vUv.x;
  float a = (1. - smoothstep(uProg - .02, uProg, x)) * smoothstep(0., .06, x) * (1. - smoothstep(.94, 1., x));
  float head = exp(-max(uProg - x, 0.) * 5.) * (1. - step(1., uProg));
  gl_FragColor = vec4(mix(uColor, vec3(1.), .5) * (.7 + 1.4 * head), a);
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

/**
 * Gacha omen in 3D. Phases (seconds): seal 0-2.4; if good, breakthrough 2.4-3.8 then
 * SR 3.8-5.0 / SSR 3.8-7.0; final swell 1s (at 3.0 when nothing good). Tap skips to the next
 * phase; tapping in the final phase ends it. Reduced motion or no WebGL ends immediately.
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
    const { good, tier, tease } = omenRef.current;
    const gold = tier === "SSR";
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
    const camera = new PerspectiveCamera(40, 1, 0.1, 100);

    // every colour that follows the tier; setTier is the instant version of tierTo below
    const tint: Color[] = [];
    const tierColor = new Color(CYAN);
    const applyTier = () => tint.forEach((c) => c.copy(tierColor));
    const setTier = (hex: string) => {
      tierColor.set(hex);
      applyTier();
    };
    void setTier;

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
    const crown = tier === "SR" || (gold && tease) ? makeRing(CROWN) : null;
    const giant = gold ? makeRing(GIANT) : null;
    const extra = [crown, giant].filter((x) => x !== null);
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
      uniforms: { uColor: { value: new Color(CYAN) }, uAlpha: { value: 0 }, uTime: { value: 0 } },
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
      for (let i = 0; i < 4; i++) {
        const pts: Vector3[] = [];
        for (let j = 0; j <= 40; j++) {
          const u = j / 40;
          const a = (i / 4) * TAU + u * TAU * 1.6;
          const r = 3.5 + 0.25 * Math.sin(u * TAU * 2 + i);
          pts.push(new Vector3(r * Math.cos(a), 0.3 + u * 9, r * Math.sin(a)));
        }
        const mat = new ShaderMaterial({
          uniforms: { uColor: { value: new Color(CYAN) }, uProg: { value: 0 } },
          vertexShader: RVERT,
          fragmentShader: RFRAG,
          transparent: true,
          depthWrite: false,
          blending: AdditiveBlending,
        });
        tint.push(mat.uniforms.uColor!.value);
        ribbonMats.push(mat);
        ribbons.add(new Mesh(new TubeGeometry(new CatmullRomCurve3(pts), 220, 0.05, 6, false), mat));
      }
      scene.add(ribbons);
      late.push(ribbons);
    }

    // post-processing
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new Vector2(1, 1), 0.45, 0.35, 0.55);
    composer.addPass(bloom);
    composer.addPass(new SMAAPass());
    composer.addPass(new OutputPass());

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

    /* ---------- timeline ---------- */
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
    const FINAL = !good ? SEAL + 0.6 : gold ? GOOD + 3.2 : GOOD + 1.2;
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

      // 3. how good: silver-violet crown for SR; SSR (after the SR tease) goes gold
      if (crown) {
        show(crown.mesh, GOOD);
        tierTo(VIOLET, 0.9, GOOD);
        tl.fromTo(crown.mat.uniforms.uReveal!, { value: 0 }, { value: 1, duration: 1.0, ease: "power2.out" }, GOOD + 0.1);
        tl.fromTo(crown.mesh.position, { y: CROWN.y - 0.8 }, { y: CROWN.y, duration: 1.0, ease: "power2.out" }, GOOD + 0.1);
        tl.to(pillar.scale, { y: 9.5, duration: 1.2, ease: "sine.inOut" }, GOOD);
        tl.to(cam, { look: 4.2, dist: 1.3, duration: 1.2, ease: "sine.inOut" }, GOOD);
      }
      if (gold && giant) {
        const t0 = GOOD + (tease ? 1.0 : 0);
        tierTo(GOLD, 1.0, t0);
        tl.to(pillar.scale, { y: 11.5, duration: 2.0, ease: "sine.inOut" }, t0);
        tl.to(pillarMat.uniforms.uAlpha!, { value: 0.5, duration: 1.5, ease: "sine.out" }, t0);
        tl.to(cam, { look: 5.2, dist: 1.7, elev: 30, duration: 2.2, ease: "sine.inOut" }, t0);
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
      spin += dt;
      applyTier();
      pillarMat.uniforms.uTime!.value = spin;
      spinners.forEach((r, i) => {
        r.mesh.rotation.z += r.speed * dt;
        r.mat.uniforms.uSweep!.value = spin * (0.12 + 0.03 * i) * (i % 2 ? -1 : 1);
      });
      rays.rotation.y += 0.05 * dt;
      ribbons.rotation.y += 0.08 * dt;
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
