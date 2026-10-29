import { useEffect, useRef } from "react";
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  CanvasTexture,
  Color,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
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

type Layer = { size: number; tex: number; y: number; speed: number; glint: number; delay: number; paint: (g: Ctx) => void };

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
  { size: 6.2, tex: 1024, y: 1.5, speed: 0.06, glint: 0.6, delay: 2.4, paint: (g) => {
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
  { size: 4.4, tex: 512, y: 2.6, speed: -0.09, glint: 0.7, delay: 3.1, paint: (g) => {
    ring(g, 0.97, 3);
    script(g, 0.8, 0.94, 6, 2.5);
    ring(g, 0.76, 2.5);
    poly(g, 0.74, 5, 2, 2.5);
    vertexCircles(g, 0.74, 5, 0.12, 2);
    ring(g, 0.36, 2.5);
    poly(g, 0.36, 5, 1, 2.5);
  } },
  { size: 3, tex: 512, y: 3.6, speed: 0.12, glint: 0.8, delay: 3.8, paint: (g) => {
    ring(g, 0.96, 3);
    ring(g, 0.86, 2.5);
    poly(g, 0.82, 7, 3, 2.5);
    crescents(g, 0.52, 7, 0.1, 2, 0.2);
    ring(g, 0.34, 2.5);
    poly(g, 0.34, 6, 1, 2.5, 0);
  } },
];

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

// omen is accepted for the later phases (tier colours, SR/SSR); step 1 only shows the base seal.
export function GachaSeal3D({ omen: _omen, onDone }: { omen: Omen; onDone: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  done.current = onDone;

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

    const tint: Color[] = []; // every colour that setTier recolours
    const rings: { mesh: Mesh; mat: ShaderMaterial; speed: number; y: number; delay: number }[] = [];

    LAYERS.forEach((L) => {
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
      rings.push({ mesh, mat, speed: L.speed, y: L.y, delay: L.delay });
    });

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

    /** Recolour the whole scene (later phases pass the SR / SSR colour). */
    const setTier = (hex: string) => tint.forEach((c) => c.set(hex));
    void setTier;

    // post-processing
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new Vector2(1, 1), 0.45, 0.35, 0.55);
    composer.addPass(bloom);
    composer.addPass(new SMAAPass());
    composer.addPass(new OutputPass());

    let w = 1;
    let h = 1;
    let bloomScale = 1;
    const resize = () => {
      w = el.clientWidth || 1;
      h = el.clientHeight || 1;
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

    // seal reveal: outer ring first, each sweeping around its angle
    const tl = gsap.timeline();
    rings.forEach((r) => {
      const dur = r.y > 0.5 ? 1.2 : 1.0;
      tl.to(r.mat.uniforms.uReveal!, { value: 1, duration: dur, ease: "power2.out" }, r.delay);
      tl.from(r.mesh.scale, { x: 0.92, y: 0.92, duration: dur, ease: "power2.out" }, r.delay);
      if (r.y > 0.5) tl.from(r.mesh.position, { y: r.y - 0.7, duration: dur, ease: "power2.out" }, r.delay);
    });
    tl.to(glowMat, { opacity: 0.15, duration: 1.8, ease: "sine.out" }, 0);

    // single render loop
    let raf = 0;
    let last = performance.now();
    let spin = 0;
    let frames = 0;
    let acc = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      if (document.hidden) return;
      if (frames < 60) {
        acc += dt * 1000;
        if (++frames === 60 && acc / 60 > 22) {
          renderer.setPixelRatio(1);
          bloomScale = 0.5;
          resize();
        }
      }
      spin += dt;
      rings.forEach((r, i) => {
        r.mesh.rotation.z += r.speed * dt;
        r.mat.uniforms.uSweep!.value = spin * (0.12 + 0.03 * i) * (i % 2 ? -1 : 1);
      });
      const az = (spin / ORBIT_SECONDS) * Math.PI * 2;
      const el35 = (35 * Math.PI) / 180;
      const d = Math.max(9, 10.8 / camera.aspect);
      camera.position.set(Math.sin(az) * Math.cos(el35) * d, Math.sin(el35) * d, Math.cos(az) * Math.cos(el35) * d);
      camera.lookAt(0, 1.2, 0);
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

  return <div ref={host} onPointerDown={() => done.current()} style={{ position: "absolute", inset: 0, overflow: "hidden", touchAction: "none" }} />;
}
