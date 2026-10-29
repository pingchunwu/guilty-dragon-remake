import { BufferGeometry, CatmullRomCurve3, Float32BufferAttribute, Group, Mesh, PlaneGeometry, TubeGeometry, Vector3, type Object3D } from "three";
import { gsap } from "gsap";
import type { PhaseResult, SideId } from "@gdr/engine";
import type { FxStage } from "./FxStage";
import { acquireTexture, ELEMENT_CIRCLE } from "./paint";
import { CRACK_SEGMENTS, beamMaterial, bladeMaterial, flareMaterial, hexMaterial, ringMaterial, ribbonMaterial, shockMaterial } from "./shaders";

/** Leader colours (heavy / light / magic), shared with the card art. */
export const LEADER_COLOR: Record<string, string> = { heavy: "#c4623d", light: "#3f9a7a", magic: "#7b4fd6" };

export interface ClashAnchors {
  /** Each side's number (`.scene-num`) and HP track; defender is on top, challenger below. */
  num: Record<SideId, Element>;
  track: Record<SideId, Element>;
}

/** Times (seconds on the caller's timeline) and the damage plan, as AttackScene's labels define them. */
export interface ClashTimes {
  /** Start of each calculation step, and how long a step holds. */
  steps: number[];
  step: number;
  /** The colour/skill step (only when it exists). */
  colour: number | null;
  rush: number;
  impact: number;
  shatter: number;
  defense: number;
  hit: number;
  /** Who deals damage, and whose HP bar is cut. */
  dealers: SideId[];
  hurt: SideId[];
}

const SIDES = ["defender", "challenger"] as const;
const foe = (id: SideId): SideId => (id === "challenger" ? "defender" : "challenger");
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rng = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};

const PLANE = new PlaneGeometry(1, 1);

/** Blade-arc strip: a crescent that tapers to points, uv.x along its length. */
function bladeGeometry(len: number, bulge: number, width: number) {
  const n = 56;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const at = (t: number) => ({ x: (t - 0.5) * len, y: -bulge * (1 - (2 * t - 1) ** 2) });
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = at(Math.max(0, t - 0.01));
    const b = at(Math.min(1, t + 0.01));
    const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = -(b.y - a.y) / d;
    const ny = (b.x - a.x) / d;
    const c = at(t);
    const w = (width / 2) * Math.pow(Math.sin(Math.PI * t), 0.85);
    pos.push(c.x + nx * w, c.y + ny * w, 0, c.x - nx * w, c.y - ny * w, 0);
    uv.push(t, 1, t, 0);
    if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Crack lines in the barrier's [-1, 1] space: 6 branches of 4 segments from the impact point. */
function crackSegments(seed: number) {
  const r = rng(seed);
  const out = new Float32Array(CRACK_SEGMENTS * 4);
  for (let b = 0; b < 6; b++) {
    let x = (r() - 0.5) * 0.08;
    let y = (r() - 0.5) * 0.08;
    let a = (b / 6) * Math.PI * 2 + (r() - 0.5) * 0.6;
    for (let s = 0; s < 4; s++) {
      a += (r() - 0.5) * 1.0;
      const l = 0.12 + r() * 0.1;
      const nx = x + Math.cos(a) * l;
      const ny = y + Math.sin(a) * l;
      out.set([x, y, nx, ny], (b * 4 + s) * 4);
      x = nx;
      y = ny;
    }
  }
  return out;
}

/**
 * The attack clash in light. Each side's total is a beam in its leader's colour from its number toward
 * the middle; the beams meet and push (the contact slides toward the weaker side as the numbers count
 * down), the loser shatters into ribbons, a hex barrier cracks by the defense %, and a blade arc cuts
 * the loser's HP bar. A final blow (no crash) fires each dealer's beam straight at its target.
 * The returned timeline is plain tweens on state objects; frames read that state, so seeking works.
 */
export function attackClash(fx: FxStage, result: PhaseResult, a: ClashAnchors, T: ClashTimes) {
  const tl = gsap.timeline();
  const S = result.sides;
  const normal = result.kind === "normal";
  const color = {} as Record<SideId, string>;
  for (const id of SIDES) color[id] = LEADER_COLOR[S[id].leaderType as string] ?? "#ffffff";
  const winner = result.winner;
  const loser = winner ? foe(winner) : null;
  const smaller = S.challenger.attack <= S.defender.attack ? "challenger" : "defender";
  const strong = foe(smaller);
  const tie = S.challenger.attack === S.defender.attack;
  const losers: SideId[] = normal ? (tie ? [...SIDES] : [smaller]) : [];
  const trackBox = (id: SideId) => fx.box(a.track[id]);

  const st = {
    f: 0.5, // contact point from the top number (0) to the bottom number (1)
    shake: 0,
    contact: 0, // contact flare
    reach: { defender: 0, challenger: 0 },
    alpha: { defender: 0, challenger: 0 },
    pulse: { defender: 1, challenger: 1 },
    circle: { defender: 0, challenger: 0 },
    circleA: { defender: 0, challenger: 0 },
    barrier: { defender: 0, challenger: 0 },
    crack: { defender: 0, challenger: 0 },
    brk: { defender: 0, challenger: 0 },
  };
  const add = <O extends Object3D>(o: O, order: number) => {
    o.renderOrder = order;
    o.visible = false;
    fx.group.add(o);
    return o;
  };

  /* ---- beams ---- */
  const beams = {} as Record<SideId, Mesh>;
  for (const id of SIDES) beams[id] = add(new Mesh(PLANE, beamMaterial(color[id])), 2);

  /* ---- elemental circles behind the side with colour advantage ---- */
  const circles = {} as Partial<Record<SideId, Mesh>>;
  if (normal && T.colour !== null) {
    for (const id of SIDES) {
      if (!S[id].advantage) continue;
      const m = new Mesh(PLANE, ringMaterial(acquireTexture("element", 1024, ELEMENT_CIRCLE, fx.maxAnisotropy), color[id], 0.6, 0.9));
      m.rotation.x = -0.95;
      circles[id] = add(m, 0);
    }
  }

  /* ---- hex barriers in front of each target ---- */
  const barriers = {} as Partial<Record<SideId, Mesh>>;
  for (const d of T.dealers) {
    const target = foe(d);
    if (!(S[target].defense > 0)) continue;
    const m = new Mesh(PLANE, hexMaterial(color[target], crackSegments(S[target].defense * 31 + 7)));
    barriers[target] = add(m, 3);
  }

  /* ---- shards (the shattering beam), shockwaves, flares ---- */
  const shardCount = 9;
  const shards = {} as Partial<Record<SideId, { group: Group; mats: ReturnType<typeof ribbonMaterial>[] }>>;
  for (const id of losers) {
    const r = rng(id === "defender" ? 11 : 29);
    const group = new Group();
    const mats: ReturnType<typeof ribbonMaterial>[] = [];
    const up = id === "defender" ? 1 : -1; // the loser's side of the contact point
    for (let i = 0; i < shardCount; i++) {
      const ang = Math.PI / 2 + (r() - 0.5) * 2.5;
      const len = 120 + r() * 190;
      const dx = Math.cos(ang) * len;
      const dy = Math.sin(ang) * len * up;
      const bend = (r() - 0.5) * len * 0.8;
      const curve = new CatmullRomCurve3([
        new Vector3(0, 0, 0),
        new Vector3(dx * 0.5 - dy * 0.0 + bend * 0.4, dy * 0.5 + bend * 0.3, (r() - 0.5) * 120),
        new Vector3(dx, dy, (r() - 0.5) * 160),
      ]);
      const mat = ribbonMaterial(color[id]);
      mats.push(mat);
      group.add(new Mesh(new TubeGeometry(curve, 36, 1.7, 5, false), mat));
    }
    shards[id] = { group, mats };
    add(group, 4);
  }
  const mkShock = (col: string) => {
    const m = new Mesh(PLANE, shockMaterial(col));
    m.rotation.x = -0.85;
    return add(m, 5);
  };
  const mkFlare = (col: string) => add(new Mesh(PLANE, flareMaterial(col)), 6);
  const shock = { impact: mkShock("#ffffff"), hit: {} as Partial<Record<SideId, Mesh>> };
  const contactFlare = mkFlare("#ffffff");
  const burstFlare = mkFlare("#ffffff");
  const blades = {} as Partial<Record<SideId, { mesh: Mesh; mat: ReturnType<typeof bladeMaterial> }>>;
  for (const id of T.hurt) {
    shock.hit[id] = mkShock(color[foe(id)]);
    const mat = bladeMaterial("#ffe6d6");
    blades[id] = { mesh: add(new Mesh(bladeGeometry(fx.w * 1.3, 20, 24), mat), 6), mat };
  }

  /* ---- per-frame layout from the DOM ---- */
  const inset = 16;
  const P = {} as Record<SideId, { x: number; y: number }>;
  const val = { defender: 0, challenger: 0 };
  let ref = 1;
  const base = Math.min(64, fx.w * 0.17); // quad height at full power (sheath sigma = 14% of it)
  const offX = (id: SideId) => (normal ? 0 : id === "defender" ? -34 : 34);
  const place = (m: Mesh, x0: number, y0: number, x1: number, y1: number, w: number, mat: ReturnType<typeof beamMaterial>) => {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const L = Math.hypot(dx, dy);
    m.visible = L > 2 && w > 0.5 && mat.uniforms.uAlpha!.value > 0.01;
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
    m.rotation.z = Math.atan2(dy, dx);
    m.scale.set(L, w * 2, 1);
    mat.uniforms.uLen!.value = L;
    mat.uniforms.uPx!.value = w * 2;
  };
  const sizeAt = (m: Mesh, x: number, y: number, s: number, z = 0) => {
    m.position.set(x, y, z);
    m.scale.set(s, s, 1);
  };
  // Beam anchors come from the numbers' layout before the rush; the numbers then slide to the middle,
  // but the beams, barrier and contact point keep the original far-side points.
  let locked = false;
  const measure = () => {
    for (const id of SIDES) {
      if (!locked) {
        const b = fx.box(a.num[id]);
        P[id] = { x: b.x, y: id === "defender" ? b.bottom - inset : b.top + inset };
      }
      val[id] = Number(a.num[id].textContent) || 0;
      ref = Math.max(ref, val[id]);
    }
  };
  measure();
  fx.onFrame((dt, time) => {
    measure();
    const k = st.shake;
    const C = {
      x: lerp(P.defender.x, P.challenger.x, st.f) + Math.sin(time * 61) * 3 * k,
      y: lerp(P.defender.y, P.challenger.y, st.f) + Math.cos(time * 47) * 2.5 * k,
    };
    for (const id of SIDES) {
      const mat = beams[id].material as ReturnType<typeof beamMaterial>;
      mat.uniforms.uAlpha!.value = st.alpha[id];
      mat.uniforms.uTime!.value = time;
      mat.uniforms.uDir!.value = id === "defender" ? -1 : 1;
      const off = offX(id);
      const tgt = normal ? C : { x: P[foe(id)].x + offX(id), y: P[foe(id)].y };
      const s = { x: P[id].x + off, y: P[id].y };
      const w = base * (0.42 + 0.58 * Math.sqrt(Math.min(1, val[id] / ref))) * st.pulse[id];
      place(beams[id], s.x, s.y, lerp(s.x, tgt.x, st.reach[id]), lerp(s.y, tgt.y, st.reach[id]), w, mat);
      // the barrier in front of this side as a target
      const bm = barriers[id];
      if (bm) {
        const u = (bm.material as ReturnType<typeof hexMaterial>).uniforms;
        const size = Math.min(fx.w * 0.86, 360);
        u.uAppear!.value = st.barrier[id];
        u.uCrack!.value = st.crack[id];
        u.uBreak!.value = st.brk[id];
        u.uTime!.value = time;
        sizeAt(bm, P[id].x, P[id].y, size, 30);
        bm.rotation.x = id === "defender" ? 0.38 : -0.38;
        bm.visible = st.barrier[id] > 0.001 && st.brk[id] < 1;
      }
      const cm = circles[id];
      if (cm) {
        const u = (cm.material as ReturnType<typeof ringMaterial>).uniforms;
        u.uReveal!.value = st.circle[id];
        u.uAlpha!.value = st.circleA[id] * 0.9;
        u.uSweep!.value = time * 0.15;
        const nb = fx.box(a.num[id]);
        sizeAt(cm, nb.x, nb.y, Math.min(fx.w * 1.15, 470) * (0.9 + 0.1 * st.circle[id]), -40);
        cm.rotation.z += 0.18 * dt;
        cm.visible = st.circleA[id] > 0.01;
      }
    }
    // contact flare follows the point where the beams meet
    const cf = contactFlare.material as ReturnType<typeof flareMaterial>;
    cf.uniforms.uAlpha!.value = st.contact * 0.7;
    sizeAt(contactFlare, C.x, C.y, 120 + 30 * st.shake, 10);
    contactFlare.visible = st.contact > 0.01;
  });

  /* ---- timeline ---- */
  const { rush, impact, shatter, defense, hit, step: STEP } = T;
  const contactPos = () => {
    measure(); // a skip can fire this before the first frame
    const c = { x: lerp(P.defender.x, P.challenger.x, st.f), y: lerp(P.defender.y, P.challenger.y, st.f) };
    return c;
  };

  const burst = (mesh: Mesh, at: number, pos: () => { x: number; y: number }, size: number, dur: number, alpha = 1) => {
    const u = (mesh.material as ReturnType<typeof shockMaterial>).uniforms;
    tl.call(() => {
      const p = pos();
      sizeAt(mesh, p.x, p.y, size, 10);
      mesh.visible = true;
    }, undefined, at)
      .fromTo(u.uR!, { value: 0.05 }, { value: 1, duration: dur, ease: "power2.out" }, at)
      .fromTo(u.uAlpha!, { value: alpha }, { value: 0, duration: dur, ease: "power1.in" }, at);
  };
  const flash = (mesh: Mesh, at: number, pos: () => { x: number; y: number }, size: number, dur: number) => {
    const u = (mesh.material as ReturnType<typeof flareMaterial>).uniforms;
    tl.call(() => {
      const p = pos();
      sizeAt(mesh, p.x, p.y, size, 20);
      mesh.visible = true;
    }, undefined, at)
      .fromTo(u.uAlpha!, { value: 0.8 }, { value: 0, duration: dur, ease: "power2.out" }, at);
  };

  tl.call(() => void (locked = true), undefined, rush);
  if (normal) {
    // beams rise from the numbers and creep toward the middle; each calculation step pulses them
    tl.to(st.alpha, { defender: 1, challenger: 1, duration: 0.4, ease: "power2.out" }, 0.4)
      .to(st.reach, { defender: 0.9, challenger: 0.9, duration: 0.8, ease: "power2.out" }, 0.4)
      .to(st.reach, { defender: 0.96, challenger: 0.96, duration: Math.max(0.1, rush - 1.45), ease: "none" }, 1.45);
    T.steps.forEach((s) => tl.fromTo(st.pulse, { defender: 1.5, challenger: 1.5 }, { defender: 1, challenger: 1, duration: 0.5, ease: "power2.out" }, s + STEP - 0.3));
    // colour advantage: the elemental circle writes in and flares behind the stronger colour
    if (T.colour !== null) {
      for (const id of SIDES) {
        if (!circles[id]) continue;
        tl.fromTo(st.circle, { [id]: 0 }, { [id]: 1, duration: 1.1, ease: "power2.out" }, T.colour + 0.25)
          .fromTo(st.circleA, { [id]: 0 }, { [id]: 1, duration: 0.4, ease: "power2.out" }, T.colour + 0.25)
          .to(st.circleA, { [id]: 0, duration: 0.4 }, hit);
      }
    }
    // crash: the beams slam together at the middle
    tl.to(st.reach, { defender: 1, challenger: 1, duration: 0.17, ease: "power3.in" }, rush)
      .to(st, { shake: 1, contact: 1, duration: 0.1 }, impact)
      .to(st, { f: tie ? 0.5 : 0.5 + (strong === "challenger" ? -1 : 1) * 0.36 * Math.sqrt((Math.abs(S.defender.attack - S.challenger.attack)) / Math.max(1, S[strong].attack)), duration: 1, ease: "power1.inOut" }, impact + 0.05);
    burst(shock.impact, impact, contactPos, 400, 0.6, 0.7);
    flash(burstFlare, impact, contactPos, 240, 0.5);
    // shatter: the losing beam breaks into ribbons of light, the winner's pushes through to the loser
    for (const id of losers) {
      const sh = shards[id]!;
      tl.to(st.alpha, { [id]: 0, duration: 0.12 }, shatter)
        .call(() => {
          const c = contactPos();
          sh.group.position.set(c.x, c.y, 0);
          sh.group.visible = true;
          sh.group.traverse((o) => (o.visible = true));
        }, undefined, shatter);
      sh.mats.forEach((m, i) => {
        tl.fromTo(m.uniforms.uProg!, { value: 0 }, { value: 1, duration: 0.4 + (i % 3) * 0.08, ease: "power2.out" }, shatter + i * 0.015)
          .fromTo(m.uniforms.uTail!, { value: 0 }, { value: 1, duration: 0.45, ease: "power2.in" }, shatter + 0.12 + i * 0.015);
      });
    }
    flash(burstFlare, shatter, contactPos, 300, 0.55);
    tl.to(st, { shake: 0, duration: 0.15 }, shatter);
    if (!tie) tl.to(st, { f: loser === "defender" ? 0 : 1, duration: 0.25, ease: "power3.in" }, shatter);
    tl.to(st, { contact: 0, duration: 0.3 }, shatter + 0.1);
  } else {
    // final blow: every dealer's beam fires at its target at once
    for (const d of T.dealers) {
      tl.to(st.alpha, { [d]: 1, duration: 0.12 }, impact)
        .to(st.reach, { [d]: 1, duration: 0.3, ease: "power3.in" }, impact);
      flash(burstFlare, impact + 0.3, () => (measure(), { x: P[foe(d)].x + offX(d), y: P[foe(d)].y }), 280, 0.5);
    }
  }

  // defense: the barrier rises in front of each target and cracks by its defense %
  for (const d of T.dealers) {
    const target = foe(d);
    const bm = barriers[target];
    if (!bm) continue;
    tl.to(st.barrier, { [target]: 1, duration: 0.5, ease: "power2.out" }, defense)
      .to(st.crack, { [target]: Math.min(1, Math.max(0.2, S[target].defense / 100)), duration: STEP - 0.6, ease: "power2.out" }, defense + 0.3)
      .to(st.brk, { [target]: 1, duration: 0.4, ease: "power2.in" }, hit);
    tl.fromTo(st.pulse, { [d]: 1.4 }, { [d]: 1, duration: 0.5, ease: "power2.out" }, defense + 0.3);
  }

  // hit: the winner's beam ends, a blade arc cuts each hurt HP bar with a shockwave and a bloom flare
  for (const d of T.dealers) tl.to(st.alpha, { [d]: 0, duration: 0.2 }, hit + 0.15);
  T.hurt.forEach((id) => {
    const bl = blades[id]!;
    const at = hit + 0.3;
    const tb = () => trackBox(id);
    tl.call(() => {
      const b = tb();
      bl.mesh.position.set(b.x, b.y, 20);
      bl.mesh.rotation.set(0, 0.35, -0.1);
      bl.mesh.visible = true;
    }, undefined, at)
      .fromTo(bl.mat.uniforms.uProg!, { value: 0 }, { value: 1.05, duration: 0.2, ease: "power3.out" }, at)
      .fromTo(bl.mat.uniforms.uTail!, { value: 0 }, { value: 1.3, duration: 0.5, ease: "power2.in" }, at + 0.1);
    burst(shock.hit[id]!, at + 0.1, () => {
      const b = tb();
      return { x: b.x, y: b.y };
    }, 420, 0.6, 0.9);
    flash(burstFlare, at + 0.08, () => {
      const b = tb();
      return { x: b.x, y: b.y };
    }, 240, 0.45);
  });
  if (T.hurt.length) {
    tl.to(fx.bloom, { strength: 0.7, duration: 0.08 }, hit + 0.3).to(fx.bloom, { strength: 0.4, duration: 0.45 }, hit + 0.38);
  }
  return tl;
}
