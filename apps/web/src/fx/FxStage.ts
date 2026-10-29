import { Group, PerspectiveCamera, Scene } from "three";
import { createRig, disposeScene } from "./rig";
import { attackClash, type ClashAnchors, type ClashTimes } from "./clash";
import type { PhaseResult } from "@gdr/engine";

const FOV = 30;
const BLOOM = 0.4;

/** An element's box in scene units: pixels, origin at the canvas centre, y up. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Edges: top/bottom are scene y values. */
  top: number;
  bottom: number;
}

export type Updater = (dt: number, time: number) => void;

/**
 * One transparent WebGL canvas per duel. It lives idle in `home` (the duel's overlay host) and is
 * moved into a scene root with `attach()` while an effect plays; frames render only then. The camera
 * is perspective but placed so the z = 0 plane is 1 scene unit per CSS pixel, so DOM boxes line up.
 */
export class FxStage {
  readonly scene = new Scene();
  /** Everything an effect adds; emptied by detach(). */
  readonly group = new Group();
  readonly camera = new PerspectiveCamera(FOV, 1, 10, 8000);
  readonly canvas: HTMLCanvasElement;
  w = 1;
  h = 1;
  private rig;
  private home: HTMLElement;
  private parent: HTMLElement | null = null;
  private ro: ResizeObserver | null = null;
  private updaters = new Set<Updater>();
  private raf = 0;
  private last = 0;
  private time = 0;

  constructor(home: HTMLElement) {
    this.home = home;
    this.scene.add(this.group);
    this.rig = createRig({
      scene: this.scene,
      camera: this.camera,
      host: home,
      alpha: true,
      antialias: false,
      bloom: [0.4, 0.3, 0.8],
      bloomScale: 0.5,
      maxDpr: 1.5,
      exposure: 1,
      onResize: (w, h) => {
        this.w = w;
        this.h = h;
        this.camera.aspect = w / h;
        this.camera.position.set(0, 0, h / 2 / Math.tan((FOV * Math.PI) / 360));
        this.camera.updateProjectionMatrix();
      },
    });
    this.canvas = this.rig.renderer.domElement;
    this.canvas.className = "fx-canvas";
    this.canvas.setAttribute("aria-hidden", "true");
    home.appendChild(this.canvas);
    this.rig.resize(1, 1); // no big buffers while idle
  }

  get maxAnisotropy() {
    return this.rig.renderer.capabilities.getMaxAnisotropy();
  }

  get bloom() {
    return this.rig.bloom;
  }

  /** Move the canvas into `parent` (before `before`) and start rendering. */
  attach(parent: HTMLElement, before: Node | null = null) {
    this.parent = parent;
    parent.insertBefore(this.canvas, before);
    const fit = () => this.rig.resize(parent.clientWidth || 1, parent.clientHeight || 1);
    this.ro = new ResizeObserver(fit);
    this.ro.observe(parent);
    fit();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  /** Stop rendering, free the effect's objects and give the canvas back to the idle host. */
  detach() {
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    this.ro = null;
    this.updaters.clear();
    this.disposeGroup();
    this.rig.bloom.strength = BLOOM;
    this.rig.renderer.setClearColor(0x000000, 0);
    this.rig.renderer.clear();
    this.rig.resize(1, 1);
    this.home.appendChild(this.canvas);
    this.parent = null;
  }

  /** Per-frame hook for the current effect; removed by detach(). */
  onFrame(fn: Updater) {
    this.updaters.add(fn);
  }

  /** An element's box in scene units (the canvas fills the parent it is attached to). */
  box(el: Element): Box {
    const p = this.parent!.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const h = this.h;
    return {
      x: r.left - p.left + r.width / 2 - this.w / 2,
      y: h / 2 - (r.top - p.top + r.height / 2),
      w: r.width,
      h: r.height,
      top: h / 2 - (r.top - p.top),
      bottom: h / 2 - (r.bottom - p.top),
    };
  }

  /** The attack clash: beams, elemental circle, impact, barrier and blade. Nest the returned timeline at 0. */
  attackClash(result: PhaseResult, anchors: ClashAnchors, times: ClashTimes) {
    return attackClash(this, result, anchors, times);
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    if (document.hidden) return;
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    this.time += dt;
    this.rig.watch(dt);
    this.updaters.forEach((u) => u(dt, this.time));
    this.rig.render();
  };

  private disposeGroup() {
    disposeScene(this.scene);
    this.group.clear();
  }

  dispose() {
    if (this.parent) this.detach();
    this.rig.dispose();
  }
}
