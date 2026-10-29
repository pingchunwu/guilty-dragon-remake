import { useEffect, useRef } from "react";
import {
  AdditiveBlending,
  CatmullRomCurve3,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  TubeGeometry,
  Vector3,
  Color,
  CanvasTexture,
  type Object3D,
} from "three";
import { gsap } from "gsap";
import { reducedMotion } from "./BattleParts";
import type { Omen } from "./gachaOmen";
import { acquireTexture, gradientTexture, releaseTexture, ring, poly, spokes, vertexCircles, crescents, petals, script, TAU, type Ctx } from "../fx/paint";
import { createRig, disposeScene, type Rig } from "../fx/rig";
import { pillarMaterial, ribbonMaterial, ringMaterial } from "../fx/shaders";

const SIZE = 8; // world size of the ground ring planes
const ORBIT_SECONDS = 40;
const CYAN = "#9fe8ff";

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
    const scene = new Scene();
    const camera = new PerspectiveCamera(40, 1, 0.1, 100);
    let rig: Rig;
    try {
      rig = createRig({
        scene,
        camera,
        host: el,
        onResize: (w, h) => {
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
        },
      });
    } catch {
      done.current();
      return;
    }
    const { renderer, bloom } = rig;
    const { good, tier, tease } = omenRef.current;
    const gold = tier === "SSR";
    el.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";

    const aniso = renderer.capabilities.getMaxAnisotropy();
    scene.background = gradientTexture(256, 256, (g) => {
      const gr = g.createRadialGradient(128, 150, 0, 128, 150, 200);
      gr.addColorStop(0, "#14233f");
      gr.addColorStop(0.55, "#0a1226");
      gr.addColorStop(1, "#03060f");
      return gr;
    }, true);
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

    const makeRing = (L: Layer, design: string) => {
      const mat = ringMaterial(acquireTexture(design, L.tex, L.paint, aniso), CYAN, L.glint);
      tint.push(mat.uniforms.uColor!.value);
      const mesh = new Mesh(new PlaneGeometry(L.size, L.size), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = L.y;
      scene.add(mesh);
      return { mesh, mat, speed: L.speed, L };
    };
    // paint everything before the timeline exists so painting never eats the reveal
    const rings = LAYERS.map((L, i) => makeRing(L, `gacha-${i}`));
    const crown = tier === "SR" || (gold && tease) ? makeRing(CROWN, "gacha-crown") : null;
    const giant = gold ? makeRing(GIANT, "gacha-giant") : null;
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
    const pillarMat = pillarMaterial(CYAN);
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
        const mat = ribbonMaterial(CYAN);
        tint.push(mat.uniforms.uColor!.value);
        ribbonMats.push(mat);
        ribbons.add(new Mesh(new TubeGeometry(new CatmullRomCurve3(pts), 220, 0.05, 6, false), mat));
      }
      scene.add(ribbons);
      late.push(ribbons);
    }

    const resize = () => rig.resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    // warm-up: compile every shader now (late objects visible for one frame), then hide them
    late.forEach((o) => (o.visible = true));
    rig.render();
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
      rig.watch(dt);
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
      rig.render();
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      tl.kill();
      ro.disconnect();
      disposeScene(scene);
      rig.dispose();
    };
  }, []);

  return <div ref={host} onPointerDown={() => tap.current()} style={{ position: "absolute", inset: 0, overflow: "hidden", touchAction: "none" }} />;
}
