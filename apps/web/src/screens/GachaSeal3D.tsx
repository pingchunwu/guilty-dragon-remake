import { useEffect, useRef } from "react";
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
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

const TEX = 2048;
const C = TEX / 2;
const SIZE = 8; // world size of every ring plane
const ORBIT_SECONDS = 40;
const BLUE_WHITE = "#d6ebff";

/* ---------- procedural ring art (white strokes on transparent) ---------- */

type Ctx = CanvasRenderingContext2D;
const pt = (r: number, a: number): [number, number] => [C + r * C * Math.cos(a), C + r * C * Math.sin(a)];

function ring(g: Ctx, r: number, lw: number) {
  g.lineWidth = lw;
  g.beginPath();
  g.arc(C, C, r * C, 0, Math.PI * 2);
  g.stroke();
}

/** Long arc whose thickness swells in the middle: a calligraphic brush stroke. */
function brushArc(g: Ctx, r: number, a0: number, a1: number, thick: number, wave = 0, waves = 0) {
  const n = 120;
  const outer: [number, number][] = [];
  const inner: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const a = a0 + (a1 - a0) * u;
    const rr = r + wave * Math.sin(a * waves);
    const half = (thick * Math.pow(Math.sin(Math.PI * u), 0.8) + 3) / 2 / C;
    outer.push(pt(rr + half, a));
    inner.push(pt(rr - half, a));
  }
  g.beginPath();
  outer.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  inner.reverse().forEach(([x, y]) => g.lineTo(x, y));
  g.closePath();
  g.fill();
}

function star(g: Ctx, r: number, points: number, skip: number, lw: number) {
  g.lineWidth = lw;
  g.lineJoin = "miter";
  g.beginPath();
  for (let i = 0; i <= points; i++) {
    const [x, y] = pt(r, ((i * skip) / points) * Math.PI * 2 - Math.PI / 2);
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.stroke();
}

function polygon(g: Ctx, r: number, n: number, lw: number, rot: number) {
  g.lineWidth = lw;
  g.beginPath();
  for (let i = 0; i <= n; i++) {
    const [x, y] = pt(r, rot + (i / n) * Math.PI * 2);
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.stroke();
}

const TAU = Math.PI * 2;
const LAYERS: { speed: number; paint: (g: Ctx) => void }[] = [
  {
    speed: 0.02,
    paint: (g) => {
      ring(g, 0.97, 12);
      ring(g, 0.93, 5);
      for (let i = 0; i < 12; i++) brushArc(g, 0.885, (i / 12) * TAU + 0.05, ((i + 1) / 12) * TAU - 0.12, i % 2 ? 22 : 34);
      ring(g, 0.84, 9);
    },
  },
  {
    speed: -0.035,
    paint: (g) => {
      for (const [r, th] of [[0.79, 26], [0.745, 18], [0.70, 12]] as const)
        for (let k = 0; k < 3; k++) brushArc(g, r, (k / 3) * TAU + r * 4, (k / 3) * TAU + r * 4 + 1.6, th, 0.012, 9);
      ring(g, 0.76, 5);
    },
  },
  {
    speed: 0.05,
    paint: (g) => {
      ring(g, 0.68, 8);
      polygon(g, 0.68, 3, 9, -Math.PI / 2);
      polygon(g, 0.68, 3, 9, Math.PI / 2);
      ring(g, 0.34, 7);
    },
  },
  {
    speed: -0.07,
    paint: (g) => {
      ring(g, 0.62, 7);
      star(g, 0.62, 7, 2, 8);
      ring(g, 0.3, 6);
    },
  },
  {
    speed: 0.09,
    paint: (g) => {
      ring(g, 0.56, 11);
      ring(g, 0.45, 11);
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * TAU;
        brushArc(g, 0.505, a, a + 0.3, 46);
      }
    },
  },
  {
    speed: -0.12,
    paint: (g) => {
      g.lineWidth = 8;
      g.lineJoin = "round";
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        const [x0, y0] = pt(0.12, a);
        const [x1, y1] = pt(0.4, a);
        const [c1x, c1y] = pt(0.3, a - 0.34);
        const [c2x, c2y] = pt(0.3, a + 0.34);
        g.beginPath();
        g.moveTo(x0, y0);
        g.quadraticCurveTo(c1x, c1y, x1, y1);
        g.quadraticCurveTo(c2x, c2y, x0, y0);
        g.stroke();
      }
      ring(g, 0.42, 6);
    },
  },
  {
    speed: 0.16,
    paint: (g) => {
      ring(g, 0.17, 9);
      ring(g, 0.1, 6);
      polygon(g, 0.17, 6, 6, 0);
    },
  },
];

/** Paint at 2048, then downsample to `out` px with a soft blurred falloff under a crisp core. */
function paintTexture(paint: (g: Ctx) => void, anisotropy: number, out: number) {
  const big = document.createElement("canvas");
  big.width = big.height = TEX;
  const g = big.getContext("2d")!;
  g.strokeStyle = g.fillStyle = "#fff";
  g.lineCap = "round";
  paint(g);
  const cv = document.createElement("canvas");
  cv.width = cv.height = out;
  const o = cv.getContext("2d")!;
  o.filter = `blur(${out / 160}px)`; // no-op where ctx.filter is unsupported
  o.globalAlpha = 0.55;
  o.drawImage(big, 0, 0, out, out);
  o.filter = "none";
  o.globalAlpha = 1;
  o.drawImage(big, 0, 0, out, out);
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

/* ---------- ring material: alpha texture + sweeping angular reveal ---------- */

const VERT = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
const FRAG = `
uniform sampler2D uMap; uniform vec3 uColor; uniform float uReveal; uniform float uAlpha;
varying vec2 vUv;
void main(){
  vec2 p = vUv - .5;
  float a = atan(p.y, p.x) / 6.2831853 + .5;
  float front = uReveal * 1.15;
  float m = 1. - smoothstep(front - .12, front, a);
  float head = smoothstep(front - .25, front - .03, a) * m * (1. - step(1., uReveal));
  float t = texture2D(uMap, vUv).a;
  gl_FragColor = vec4(uColor * (1. + 1.6 * head), t * m * uAlpha);
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
    const rings: { mesh: Mesh; mat: ShaderMaterial; speed: number }[] = [];

    LAYERS.forEach((L, i) => {
      const mat = new ShaderMaterial({
        uniforms: {
          uMap: { value: paintTexture(L.paint, aniso, i === 0 ? 2048 : 1024) },
          uColor: { value: new Color(BLUE_WHITE) },
          uReveal: { value: 0 },
          uAlpha: { value: 0.65 },
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      });
      tint.push(mat.uniforms.uColor!.value);
      const mesh = new Mesh(new PlaneGeometry(SIZE, SIZE), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.012 * i;
      scene.add(mesh);
      rings.push({ mesh, mat, speed: L.speed });
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
      color: BLUE_WHITE,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const glow = new Mesh(new PlaneGeometry(SIZE * 0.6, SIZE * 0.6), glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = -0.03;
    scene.add(glow);

    // faint upward haze
    const hazeMat = new MeshBasicMaterial({
      map: gradientTexture(4, 256, (g) => {
        const gr = g.createLinearGradient(0, 256, 0, 0);
        gr.addColorStop(0, "rgba(255,255,255,.55)");
        gr.addColorStop(0.5, "rgba(255,255,255,.12)");
        gr.addColorStop(1, "rgba(255,255,255,0)");
        return gr;
      }),
      color: BLUE_WHITE,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: DoubleSide,
      blending: AdditiveBlending,
    });
    const haze = new Mesh(new CylinderGeometry(3, 3.4, 5, 48, 1, true), hazeMat);
    haze.position.y = 2.5;
    scene.add(haze);
    tint.push(glowMat.color, hazeMat.color);

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
    const n = rings.length;
    rings.forEach((r, i) => {
      const at = (i / n) * 1.0;
      tl.to(r.mat.uniforms.uReveal!, { value: 1, duration: 0.8, ease: "power2.out" }, at);
      tl.from(r.mesh.scale, { x: 0.9, y: 0.9, duration: 0.8, ease: "power2.out" }, at);
    });
    tl.to(glowMat, { opacity: 0.15, duration: 1.8, ease: "sine.out" }, 0);
    tl.to(hazeMat, { opacity: 0.05, duration: 1.8, ease: "sine.out" }, 0.3);

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
      for (const r of rings) r.mesh.rotation.z += r.speed * dt;
      const az = (spin / ORBIT_SECONDS) * Math.PI * 2;
      const el35 = (35 * Math.PI) / 180;
      const d = Math.max(9, 10.8 / camera.aspect);
      camera.position.set(Math.sin(az) * Math.cos(el35) * d, Math.sin(el35) * d, Math.cos(az) * Math.cos(el35) * d);
      camera.lookAt(0, 0.3, 0);
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
