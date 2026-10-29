import { useMemo, useRef } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import type { Rarity } from "@gdr/engine";
import { reducedMotion } from "./BattleParts";

const TIER = (r: Rarity) => (r === "SSR" ? "ssr" : "n");
const RING_COLOR = { n: "#d6ebff", ssr: "#ffd34d" };
const CHARGE = 1.8;
const BREAK = 3.8;
const END = 5.2;

// Invented sigil glyphs (Runic block + geometric symbols); purely decorative.
const RUNES = [..."ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ"];
const GEO = [..."⟁◬◈⌬⏣◇⬡⟐"];
const FRAGS = [..."ᚠᛟᚨᛉ⟁ᚹ◬ᛞᚱ⌬"];

const rad = (d: number) => (d * Math.PI) / 180;
const pt = (r: number, d: number) => `${(r * Math.cos(rad(d))).toFixed(2)} ${(r * Math.sin(rad(d))).toFixed(2)}`;
/** Star polygon {n/k}: k=1 is a regular polygon. */
const poly = (n: number, r: number, k = 1, off = -90) =>
  Array.from({ length: n }, (_, i) => `${i ? "L" : "M"}${pt(r, ((i * k) / n) * 360 + off)}`).join(" ") + "Z";
const circ = (r: number) => `M${-r} 0A${r} ${r} 0 1 1 ${r} 0A${r} ${r} 0 1 1 ${-r} 0`;
const NODE_R = 66;
const nodeAt = (i: number) => [NODE_R * Math.cos(rad(i * 30 - 90)), NODE_R * Math.sin(rad(i * 30 - 90))] as const;
/** Jagged lightning path between two ring nodes. */
function bolt(a: number, b: number) {
  const [x1, y1] = nodeAt(a);
  const [x2, y2] = nodeAt(b);
  const nx = -(y2 - y1) / Math.hypot(x2 - x1, y2 - y1);
  const ny = (x2 - x1) / Math.hypot(x2 - x1, y2 - y1);
  let d = `M${x1.toFixed(1)} ${y1.toFixed(1)}`;
  for (let s = 1; s < 7; s++) {
    const o = (Math.random() - 0.5) * 12;
    d += `L${(x1 + ((x2 - x1) * s) / 7 + nx * o).toFixed(1)} ${(y1 + ((y2 - y1) * s) / 7 + ny * o).toFixed(1)}`;
  }
  return d + `L${x2.toFixed(1)} ${y2.toFixed(1)}`;
}
const BOLT_PAIRS = [[0, 5], [2, 7], [4, 9], [6, 11], [8, 1]] as const;
const SIGIL_ARCS = [0, 90, 180, 270].map((a) => `M${pt(18, a - 35)}A18 18 0 0 1 ${pt(18, a + 35)}`).join("");

/** Stages 1-3 of the gacha reveal: layered rune circle draws, charges (blue, or gold for SSR), shatters. Tap skips to the next phase. */
export function GachaSeal({ start, best, onDone }: { start: Rarity; best: Rarity; onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const fx = useMemo(
    () => ({
      motes: Array.from({ length: 40 }, (_, i) => ({ a: Math.random() * 6.28, d: (i / 40) * 1.1, k: 0.5 + Math.random() * 0.5 })),
      frags: FRAGS.map((g, i) => ({ g, a: (i / FRAGS.length) * 6.28, w: (i % 2 ? -1 : 1) * (0.3 + (i % 3) * 0.12), r: 0.5 + (i % 3) * 0.07 })),
      sparks: Array.from({ length: 18 }, () => ({ x: Math.random() - 0.5, y: Math.random() * 0.12, h: 0.35 + Math.random() * 0.45, d: 1.4 + Math.random() * 1.6, t: Math.random() * 2 })),
      bolts: BOLT_PAIRS.map(([a, b]) => bolt(a, b)),
    }),
    [],
  );
  const t0 = TIER(start);
  const t1 = TIER(best);
  const upgrade = t0 !== t1;

  useGSAP(
    () => {
      if (reducedMotion()) {
        doneRef.current();
        return;
      }
      const q = gsap.utils.selector(root);
      const stage = q(".gseal-stage")[0] as HTMLElement;
      const S = stage.offsetWidth;
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        doneRef.current();
      };
      const tl = gsap.timeline({ onComplete: finish });
      // Tap: jump to the next phase; during the break, finish at once.
      root.current!.onpointerdown = () => {
        const t = tl.time();
        if (t < CHARGE) tl.seek("charge");
        else if (t < BREAK) tl.seek("break");
        else {
          tl.pause();
          finish();
        }
      };

      gsap.set(q(".gseal-ground"), { rotationX: 58, transformPerspective: 900 });
      gsap.set(q(".gseal-layer"), { svgOrigin: "0 0" });
      gsap.set(q(".gseal-pillar"), { xPercent: -50, scaleY: 0, transformOrigin: "50% 100%" });

      // Sparks rise from the circle for the whole animation (independent of tap-skips).
      q(".gseal-spark").forEach((e, i) => {
        const s = fx.sparks[i]!;
        gsap.set(e, { x: s.x * S * 0.8, y: s.y * S });
        gsap.to(e, { y: -s.h * S, duration: s.d, repeat: -1, delay: s.t, ease: "none" });
        gsap.fromTo(e, { opacity: 0 }, { opacity: 0.9, duration: s.d / 2, yoyo: true, repeat: -1, delay: s.t, ease: "sine.inOut" });
      });

      // Motes spiral inward and rune fragments orbit; one proxy tween drives both (transform + opacity only).
      const motes = q(".gseal-mote") as HTMLElement[];
      const frags = q(".gseal-frag") as HTMLElement[];
      const P = { t: 0, brk: 0 };
      const render = () => {
        motes.forEach((el, i) => {
          const m = fx.motes[i]!;
          const u = (P.t - CHARGE - m.d) / 1.2;
          if (u < 0 || P.t >= BREAK) {
            el.style.opacity = "0";
            return;
          }
          const p = u % 1;
          const r = S * 0.55 * m.k * (1 - p) ** 1.4;
          const a = m.a + p * 2.4;
          el.style.transform = `translate3d(${Math.cos(a) * r}px,${Math.sin(a) * r * 0.55}px,0)`;
          el.style.opacity = String(Math.sin(p * Math.PI));
        });
        frags.forEach((el, i) => {
          const f = fx.frags[i]!;
          const a = f.a + P.t * f.w;
          const r = S * f.r * (1 + P.brk * 3.5);
          el.style.transform = `translate3d(${Math.cos(a) * r}px,${Math.sin(a) * r * 0.5 - 6 * Math.sin(P.t * 2 + i)}px,0) rotate(${P.t * 40 * f.w + P.brk * 400}deg)`;
          el.style.opacity = String(Math.min(1, P.t / 0.8) * (0.35 + 0.45 * Math.sin(P.t * 2.2 + i)) * (1 - P.brk));
        });
      };
      tl.to(P, { t: END, duration: END, ease: "none", onUpdate: render }, 0).to(P, { brk: 1, duration: 1.2, ease: "power2.out", onUpdate: render }, BREAK);

      // Every ring spins at its own speed, alternating direction, accelerating toward the break.
      q(".gseal-layer").forEach((el, i) => tl.to(el, { rotation: (i % 2 ? -1 : 1) * (110 + i * 40), duration: END, ease: "power1.in" }, 0));

      // 1. Seal: strokes draw in as a cascade, then runes light dimly
      tl.addLabel("seal", 0)
        .from(q(".gseal-draw"), { strokeDashoffset: 1, duration: 0.9, stagger: 0.06, ease: "power2.inOut" }, 0)
        .from(q(".gseal-fade"), { opacity: 0, duration: 0.5, stagger: 0.12, ease: "power1.out" }, 0.2)
        .fromTo(q(".gseal-rune"), { fillOpacity: 0 }, { fillOpacity: 0.35, duration: 0.3, stagger: 0.035 }, 0.5)
        .fromTo(q(".gseal-bloom"), { opacity: 0 }, { opacity: 0.85, duration: 1.2, ease: "power1.in" }, 0);

      // 2. Charge: upright echo and light pillar rise, pulses expand, runes light in sequence, vignette tightens
      tl.addLabel("charge", CHARGE)
        .fromTo(q(".gseal-aura"), { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 1.8, ease: "power2.in" }, CHARGE)
        .fromTo(q(".gseal-vig"), { opacity: 0, scale: 1.9 }, { opacity: 1, scale: 1, duration: 1.8, ease: "power2.in" }, CHARGE)
        .fromTo(q(".gseal-back"), { opacity: 0, scale: 0.85 }, { opacity: 0.3, scale: 1, duration: 1.2, ease: "power1.out", immediateRender: false }, CHARGE)
        .to(q(".gseal-ground"), { rotationX: 50, duration: 2, ease: "power1.inOut" }, CHARGE)
        .fromTo(q(".gseal-pillar"), { scaleY: 0, opacity: 0 }, { scaleY: 1, opacity: 0.8, duration: 1.4, ease: "power2.out", immediateRender: false }, CHARGE + 0.4)
        .fromTo(q(".gseal-rune"), { fillOpacity: 0.35 }, { fillOpacity: 1, duration: 0.2, stagger: 1.6 / 32, immediateRender: false }, CHARGE);
      q(".gseal-pulse").forEach((el, i) => {
        const at = CHARGE + 0.2 + i * 0.45;
        tl.fromTo(el, { scale: 0.3, opacity: 0.9 }, { scale: 1.5, opacity: 0, duration: 0.8, ease: "power2.out", immediateRender: false }, at);
      });
      for (let i = 0; i < 4; i++) {
        const at = CHARGE + 0.1 + i * 0.45;
        tl.to(q(".gseal-ground"), { scale: 1.04 + i * 0.03, duration: 0.18, ease: "power2.out" }, at).to(q(".gseal-ground"), { scale: 1 + (i + 1) * 0.015, duration: 0.27, ease: "power2.in" }, at + 0.18);
      }
      if (t1 === "ssr") {
        // lightning arcs between ring nodes, in bursts
        for (let b = 0; b < 3; b++) {
          const at = CHARGE + 0.9 + b * 0.4;
          tl.fromTo(q(".gseal-bolt"), { opacity: 1, strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.12, stagger: 0.04, immediateRender: false }, at).to(q(".gseal-bolt"), { opacity: 0, duration: 0.18 }, at + 0.25);
        }
      }
      if (upgrade) {
        const at = CHARGE + 1.0;
        tl.to(q(".gseal-flash"), { opacity: 0.8, duration: 0.1 }, at)
          .to(q(".gseal-flash"), { opacity: 0, duration: 0.35 }, at + 0.1)
          .fromTo(q(".gseal-world"), { x: -8 }, { x: 0, duration: 0.5, ease: "elastic.out(2,0.2)", immediateRender: false }, at)
          .to(q(".gseal-aura"), { scale: 1.25, duration: 0.5, ease: "back.out(2)" }, at)
          .to(q(".gseal-pillar"), { scaleX: 1.6, duration: 0.15, yoyo: true, repeat: 1 }, at)
          .to(root.current, { color: RING_COLOR[t1], duration: 0.3 }, at);
      }

      // 3. Break: rings burst outward at different speeds, bloom flash, then shards
      tl.addLabel("break", BREAK)
        .to(q(".gseal-layer"), { scale: (i: number) => 1.6 + i * 0.35, opacity: 0, duration: 0.75, ease: "power3.in", stagger: 0.02 }, BREAK)
        .to(q(".gseal-aura, .gseal-vig"), { scale: 2, opacity: 0, duration: 0.6, ease: "power3.in" }, BREAK)
        .to(q(".gseal-pillar"), { scaleX: 2.5, opacity: 0, duration: 0.6, ease: "power2.in" }, BREAK)
        .to(q(".gseal-back, .gseal-sparks"), { opacity: 0, duration: 0.3 }, BREAK)
        .to(q(".gseal-bloom"), { opacity: 1, duration: 0.15 }, BREAK)
        .to(q(".gseal-bloom"), { opacity: 0, scale: 1.4, duration: 0.7, ease: "power2.out" }, BREAK + 0.15)
        .fromTo(q(".gseal-flash"), { opacity: 0 }, { opacity: 1, duration: 0.2 }, BREAK + 0.15)
        .to(q(".gseal-flash"), { opacity: 0, duration: 0.8 }, BREAK + 0.4)
        .fromTo(q(".gseal-shard"), { x: 0, y: 0, opacity: 1, scale: 1 }, {
          x: (i: number) => Math.cos((i / 24) * Math.PI * 2) * (200 + (i % 3) * 80),
          y: (i: number) => Math.sin((i / 24) * Math.PI * 2) * (200 + (i % 3) * 80),
          rotation: (i: number) => (i % 2 ? 540 : -540),
          opacity: 0,
          scale: 0.4,
          duration: 0.9,
          ease: "power2.out",
          immediateRender: false,
        }, BREAK + 0.15)
        .fromTo(q(".gseal-world"), { x: -12, y: 6 }, { x: 0, y: 0, duration: 0.6, ease: "elastic.out(3,0.2)", immediateRender: false }, BREAK + 0.2)
        .to({}, { duration: 0.2 }, BREAK + 1.2);
    },
    { scope: root },
  );

  return (
    <div className="gseal-root" ref={root} style={{ color: RING_COLOR[t0] }}>
      <div className="gseal-world">
        <div className="gseal-stage">
          <div className="gseal-aura" />
          <svg className="gseal-svg gseal-back" viewBox="-100 -100 200 200">
            <use href="#gseal-art" />
          </svg>
          <div className="gseal-pillar" />
          <div className="gseal-ground">
            <svg className="gseal-svg gseal-bloom" viewBox="-100 -100 200 200">
              <g filter="url(#gseal-blur)">
                <use href="#gseal-art" />
              </g>
            </svg>
            <svg className="gseal-svg" viewBox="-100 -100 200 200">
              <defs>
                <filter id="gseal-blur" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3.5" />
                </filter>
                <path id="gseal-pr" d={circ(78)} />
                <path id="gseal-pg" d={circ(30)} />
              </defs>
              <g id="gseal-art">
                {/* outer double ring */}
                <g className="gseal-layer">
                  <path className="gseal-draw" d={circ(96)} pathLength={1} />
                  <path className="gseal-draw" d={circ(93)} pathLength={1} />
                </g>
                {/* tick marks */}
                <g className="gseal-layer">
                  <path className="gseal-fade gseal-ticks" d={circ(88)} />
                </g>
                {/* runic glyph ring between thin rings */}
                <g className="gseal-layer">
                  <path className="gseal-draw" d={circ(84)} pathLength={1} />
                  <path className="gseal-draw" d={circ(71)} pathLength={1} />
                  <text className="gseal-txt">
                    <textPath href="#gseal-pr" textLength={485} lengthAdjust="spacing">
                      {RUNES.map((c, i) => (
                        <tspan key={i} className="gseal-rune">{c}</tspan>
                      ))}
                    </textPath>
                  </text>
                </g>
                {/* node ring (+ SSR lightning between nodes) */}
                <g className="gseal-layer">
                  <path className="gseal-draw" d={circ(NODE_R)} pathLength={1} />
                  {Array.from({ length: 12 }, (_, i) => {
                    const [x, y] = nodeAt(i);
                    return <circle key={i} className="gseal-fade gseal-node" cx={x} cy={y} r="2" />;
                  })}
                  {t1 === "ssr" && fx.bolts.map((d, i) => <path key={i} className="gseal-bolt" d={d} pathLength={1} />)}
                </g>
                {/* dashed ring */}
                <g className="gseal-layer">
                  <path className="gseal-fade gseal-dash" d={circ(59)} />
                </g>
                {/* hexagram */}
                <g className="gseal-layer">
                  <path className="gseal-draw" d={poly(3, 54)} pathLength={1} />
                  <path className="gseal-draw" d={poly(3, 54, 1, 90)} pathLength={1} />
                </g>
                {/* overlapping squares */}
                <g className="gseal-layer">
                  <path className="gseal-draw" d={poly(4, 40)} pathLength={1} />
                  <path className="gseal-draw" d={poly(4, 40, 1, -45)} pathLength={1} />
                </g>
                {/* geometric glyph ring */}
                <g className="gseal-layer">
                  <path className="gseal-draw" d={circ(35)} pathLength={1} />
                  <text className="gseal-txt gseal-txt-s">
                    <textPath href="#gseal-pg" textLength={186} lengthAdjust="spacing">
                      {GEO.map((c, i) => (
                        <tspan key={i} className="gseal-rune">{c}</tspan>
                      ))}
                    </textPath>
                  </text>
                </g>
                {/* heptagram */}
                <g className="gseal-layer">
                  <path className="gseal-draw" d={poly(7, 25, 3)} pathLength={1} />
                </g>
                {/* inner sigil */}
                <g className="gseal-layer">
                  <path className="gseal-draw" d={circ(12)} pathLength={1} />
                  <path className="gseal-draw" d="M0 -12V12M-12 0H12M-8.5 -8.5L8.5 8.5M8.5 -8.5L-8.5 8.5" pathLength={1} />
                  <path className="gseal-draw" d={SIGIL_ARCS} pathLength={1} />
                  <circle className="gseal-fade gseal-node" r="3" />
                </g>
              </g>
            </svg>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="gseal-pulse" />
            ))}
          </div>
          <div className="gseal-sparks">
            {fx.sparks.map((_, i) => (
              <div key={i} className="gseal-spark" />
            ))}
          </div>
          {fx.motes.map((_, i) => (
            <div key={i} className="gseal-mote" />
          ))}
          {fx.frags.map((f, i) => (
            <div key={i} className="gseal-frag">{f.g}</div>
          ))}
        </div>
        {Array.from({ length: 24 }, (_, i) => (
          <div key={i} className="gseal-shard" style={{ opacity: 0 }} />
        ))}
        <div className="gseal-vig" />
        <div className="gseal-flash" />
      </div>
    </div>
  );
}
