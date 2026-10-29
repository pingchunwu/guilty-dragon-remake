import {
  ACESFilmicToneMapping,
  Mesh,
  ShaderMaterial,
  Vector2,
  WebGLRenderer,
  type Camera,
  type Material,
  type Scene,
  type Texture,
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { releaseTexture } from "./paint";

export interface RigOptions {
  scene: Scene;
  camera: Camera;
  /** Element whose client size the canvas follows when `resize()` gets no size. */
  host: HTMLElement;
  /** Transparent canvas (clear alpha 0) for overlays; the gacha is opaque. */
  alpha?: boolean;
  antialias?: boolean;
  exposure?: number;
  /** UnrealBloomPass strength, radius, threshold. */
  bloom?: [number, number, number];
  /** Bloom resolution relative to the canvas (the slow-frame fallback halves it). */
  bloomScale?: number;
  maxDpr?: number;
  onResize?: (w: number, h: number) => void;
}

/** Premultiplied output for a transparent canvas: alpha never below the brightest channel. */
const PREMULT = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
void main(){ vec4 c = texture2D(tDiffuse, vUv); gl_FragColor = vec4(c.rgb, max(c.a, max(c.r, max(c.g, c.b)))); }`,
};

/**
 * Renderer + post chain shared by every 3D effect: ACES tone mapping, UnrealBloom, SMAA, OutputPass,
 * pixel ratio capped at 2 and a one-time fallback (ratio 1, half-res bloom) when the first 60 frames
 * average over 22 ms. Throws when WebGL is unavailable.
 */
export function createRig(o: RigOptions) {
  const renderer = new WebGLRenderer({ antialias: o.antialias ?? true, alpha: !!o.alpha });
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = o.exposure ?? 0.9;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, o.maxDpr ?? 2));
  if (o.alpha) renderer.setClearColor(0x000000, 0);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(o.scene, o.camera));
  const [strength, radius, threshold] = o.bloom ?? [0.45, 0.35, 0.55];
  const bloom = new UnrealBloomPass(new Vector2(1, 1), strength, radius, threshold);
  composer.addPass(bloom);
  composer.addPass(new SMAAPass());
  composer.addPass(new OutputPass());
  if (o.alpha) composer.addPass(new ShaderPass(PREMULT));

  let bloomScale = o.bloomScale ?? 1;
  const resize = (w = o.host.clientWidth || 1, h = o.host.clientHeight || 1) => {
    renderer.setSize(w, h, false);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    bloom.setSize(w * bloomScale, h * bloomScale);
    o.onResize?.(w, h);
  };

  let frames = 0;
  let acc = 0;
  return {
    renderer,
    composer,
    bloom,
    resize,
    render: () => composer.render(),
    /** Feed each rendered frame's dt (seconds, clamped by the caller); degrades once if the first 60 are slow. */
    watch(dt: number) {
      if (frames >= 60) return;
      acc += dt * 1000;
      if (++frames === 60 && acc / 60 > 22) {
        renderer.setPixelRatio(1);
        bloomScale *= 0.5;
        resize();
      }
    },
    dispose() {
      composer.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}

export type Rig = ReturnType<typeof createRig>;

const disposeMaterial = (m: Material) => {
  const map = (m as { map?: Texture | null }).map;
  if (map) releaseTexture(map);
  if (m instanceof ShaderMaterial) for (const u of Object.values(m.uniforms)) if (u.value?.isTexture) releaseTexture(u.value);
  m.dispose();
};

/** Disposes every mesh's geometry, material and textures (shared ones are ref-counted) and the background. */
export function disposeScene(scene: Scene) {
  if (scene.background && (scene.background as Texture).isTexture) releaseTexture(scene.background as Texture);
  scene.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    o.geometry.dispose();
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) disposeMaterial(m);
  });
}
