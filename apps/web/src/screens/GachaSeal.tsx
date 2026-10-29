import { useRef } from "react";
import { gsap } from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";
import { useGSAP } from "@gsap/react";
import { reducedMotion } from "./BattleParts";
import type { Omen } from "./gachaOmen";

gsap.registerPlugin(DrawSVGPlugin, MotionPathPlugin, CustomEase);
/** Slow start, long soft landing: the "holy" ease used for every drawn stroke. */
const HOLY = CustomEase.create("gsealHoly", "M0,0 C0.4,0 0.1,1 1,1");

const COLOR = { n: "#d6ebff", SR: "#cfc4ff", SSR: "#ffd34d" };
/** The circle is flattened inside SVG coordinates (no CSS 3D), so strokes stay vector-crisp. */
const FLAT = "translate(0 20) scale(1 0.45)";
const RISE = 26; // user units each ring lifts per index when the rings stack into a tower

const rad = (d: number) => (d * Math.PI) / 180;
const pt = (r: number, d: number) => `${(r * Math.cos(rad(d))).toFixed(2)} ${(r * Math.sin(rad(d))).toFixed(2)}`;
/** Star polygon {n/k}: k=1 is a regular polygon. */
const poly = (n: number, r: number, k = 1, off = -90) =>
  Array.from({ length: n }, (_, i) => `${i ? "L" : "M"}${pt(r, ((i * k) / n) * 360 + off)}`).join(" ") + "Z";
/** Closed circle; ccw flips the direction a comet runs around it. */
const circ = (r: number, ccw = false) => `M${-r} 0A${r} ${r} 0 1 ${ccw ? 0 : 1} ${r} 0A${r} ${r} 0 1 ${ccw ? 0 : 1} ${-r} 0Z`;
const SIGIL_ARCS = [0, 90, 180, 270].map((a) => `M${pt(18, a - 35)}A18 18 0 0 1 ${pt(18, a + 35)}`).join("");

// Invented calligraphic sigils, each ~12 units tall, top pointing outward from the ring.
const GLYPH = [
  "M0 -6C5 -6 5 -1 1 0S-4 4 0 6",
  "M-3 -6C3 -7 5 -3 1 -1C-3 1 -2 5 4 6M-4 0H3",
  "M-3 -6H3C0 -3 -3 0 0 3C2 5 4 5 5 3",
  "M0 -6V6M0 -2C4 -5 6 -1 3 1S-4 2 -5 5",
];
const SIGILS = Array.from({ length: 14 }, (_, i) => {
  const a = (i * 360) / 14 - 90;
  return { d: GLYPH[i % 4]!, t: `translate(${pt(77, a)}) rotate(${a + 90})` };
});

// Inward spirals (flattened plane) the charge streaks travel along.
const spiral = (a0: number) =>
  Array.from({ length: 49 }, (_, i) => `${i ? "L" : "M"}${pt(100 - 94 * (i / 48), a0 + (i / 48) * 450)}`).join(" ");
const SPIRALS = [0, 120, 240].map(spiral);
// Rising curves along the pillar, and descending ribbons for SSR (stage units, unflattened).
const RISES = [-18, 0, 18].map((x) => `M${x} 34C${x + 16} -10 ${x - 16} -60 ${x + 4} -170`);
const RIBBONS = [
  "M-80 -190C-120 -130 -30 -80 -56 12",
  "M-40 -205C-70 -140 10 -100 -18 -6",
  "M0 -215C-26 -150 28 -100 4 4",
  "M40 -205C70 -140 -10 -100 18 -6",
  "M80 -190C120 -130 30 -80 56 12",
  "M-165 -20C-90 -115 90 -115 165 -20",
];

/**
 * Seal animation. Phases (seconds):
 *  no SR+  : seal 0-3 | final 3-4
 *  SR      : seal 0-2.4 | breakthrough 2.4-3.8 | how good 3.8-5 | final 5-6
 *  SSR     : seal 0-2.4 | breakthrough 2.4-3.8 | how good 3.8-7 | final 7-8
 * Tap jumps to the next phase; a tap in the final phase calls onDone.
 */
export function GachaSeal({ omen, onDone }: { omen: Omen; onDone: () => void }) {
  const { good, tier, tease } = omen;
  const ssr = tier === "SSR";
  const root = useRef<HTMLDivElement>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useGSAP(
    () => {
      if (reducedMotion()) {
        doneRef.current();
        return;
      }
      const q = gsap.utils.selector(root);
      const one = (s: string) => q(s)[0] as HTMLElement;
      const S = one(".gseal-stage").offsetWidth;

      // phase marks
      const A = 2.4; // breakthrough
      const B = 3.8; // how good
      const F = !good ? 3 : ssr ? 7 : 5; // final
      const END = F + 1;
      const sealEnd = good ? A : F;
      const marks = good ? [0, A, B, F] : [0, F];

      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        doneRef.current();
      };
      const tl = gsap.timeline({ onComplete: finish });
      root.current!.onpointerdown = () => {
        const next = marks.find((m) => m > tl.time() + 0.05);
        if (next === undefined) {
          tl.pause();
          finish();
        } else tl.seek(next);
      };

      const layers = q(".gseal-layer");
      const tw = q(".gseal-tw");
      const draw = q(".gseal-draw");
      const sig = q(".gseal-sig");
      const orbit = q(".gseal-orbit");
      const pillar = one(".gseal-pillar");
      const crack = one(".gseal-crack");
      const halo = one(".gseal-halo");
      const aura = one(".gseal-aura");
      const rays = one(".gseal-rays");
      const bloom = one(".gseal-bloom");
      const ground = one(".gseal-ground");
      const world = one(".gseal-world");
      const flash = one(".gseal-flash");

      gsap.set(layers, { svgOrigin: "0 0" });
      gsap.set([draw, sig], { drawSVG: "0% 0%", opacity: 0 });
      gsap.set(ground, { y: S * 0.1, opacity: 0 });
      gsap.set(pillar, { xPercent: -50, scaleY: 0, transformOrigin: "50% 100%" });
      gsap.set(crack, { xPercent: -50, yPercent: -50, scaleX: 0.15 });
      gsap.set(halo, { xPercent: -50, yPercent: -50 });
      gsap.set(q(".gseal-wrap"), { svgOrigin: "0 0" });
      if (good) {
        gsap.set(one(".gseal-crown"), { y: -290, opacity: 0 });
        gsap.set(q(".gseal-cdraw"), { drawSVG: "0% 0%" });
      }
      if (ssr) {
        gsap.set(one(".gseal-giant"), { y: -S * 0.85, opacity: 0 });
        gsap.set(q(".gseal-gdraw, .gseal-rib"), { drawSVG: "0% 0%", opacity: 0 });
        gsap.set(q(".gseal-chord"), { scaleY: 0.2, transformOrigin: "50% 100%" });
      }

      /** A tapered light streak travelling a curved guide, fading in and out along the way. */
      const fly = (s: Element, path: Element, at: number, dur: number, ease: string) => {
        tl.fromTo(s, { opacity: 0 }, { opacity: 1, duration: dur * 0.3, ease: "sine.out" }, at)
          .to(s, { motionPath: { path, autoRotate: true }, duration: dur, ease } as gsap.TweenVars, at)
          .to(s, { opacity: 0, duration: dur * 0.3, ease: "sine.in" }, at + dur * 0.7);
      };

      // Ambient, phase-independent: comet-like light segments circling each ring, streaks spiralling into the centre, drifting mist.
      orbit.forEach((e, i) =>
        gsap.fromTo(e, { drawSVG: "0% 14%" }, { drawSVG: "100% 114%", duration: 5 + i * 1.6, repeat: -1, ease: "none" }),
      );
      const spirals = q(".gseal-spiral") as unknown as SVGPathElement[];
      q(".gseal-charge").forEach((e, i) => {
        const c = gsap.timeline({ repeat: -1, delay: i * 1.1 });
        c.to(e, { opacity: 1, duration: 0.8, ease: "sine.out" }, 0)
          .to(e, { motionPath: { path: spirals[i % spirals.length]!, autoRotate: true }, duration: 3.4, ease: "sine.in" } as gsap.TweenVars, 0)
          .to(e, { opacity: 0, duration: 0.7, ease: "sine.in" }, 2.7);
      });
      q(".gseal-mist").forEach((e, i) => gsap.fromTo(e, { x: -S * 0.15 }, { x: S * 0.15, duration: 12 + i * 4, repeat: -1, yoyo: true, ease: "sine.inOut" }));

      // Steady rotation for the whole piece: alternate directions, inner rings a little faster. No easing, no pulses.
      layers.forEach((el, i) => tl.to(el, { rotation: (i % 2 ? -1 : 1) * (5 + i * 2) * END, duration: END, ease: "none" }, 0));
      q(".gseal-wrap").forEach((el, i) => tl.to(el, { rotation: (i % 2 ? -1 : 1) * (10 + i * 4) * END * 0.25, duration: END, ease: "none" }, 0));
      tl.to(rays, { rotation: 140, duration: END, ease: "power1.in" }, 0);

      // 1. Seal (all pulls): the circle rises, rings draw themselves and sigils write around the ring, calm blue-white
      tl.to(ground, { y: 0, opacity: 1, duration: 1.8, ease: "expo.out" }, 0)
        .to(draw, { drawSVG: "0% 100%", opacity: 1, duration: 1.4, stagger: 0.07, ease: HOLY }, 0.1)
        .to(sig, { drawSVG: "0% 100%", opacity: 0.8, duration: 1, stagger: { amount: sealEnd - 1.6 }, ease: "sine.inOut" }, 0.6)
        .to(orbit, { opacity: 0.85, duration: 1.2, stagger: 0.25, ease: "sine.inOut" }, 1.2)
        .to(bloom, { opacity: 0.55, duration: sealEnd, ease: "sine.inOut" }, 0)
        .to(aura, { opacity: 0.6, duration: sealEnd, ease: "sine.inOut" }, 0)
        .to(q(".gseal-bg"), { opacity: 0.2, duration: 2, ease: "sine.inOut" }, 0.4)
        .to(rays, { opacity: 0.28, duration: sealEnd, ease: "sine.inOut" }, 0);

      if (good) {
        // 2. Breakthrough: the centre opens, light streaks climb a column through it, the rings lift apart into a tower
        tl.to(crack, { opacity: 1, duration: 0.6, ease: "sine.out" }, A)
          .to(crack, { scaleX: 1, duration: 1.2, ease: "expo.out" }, A)
          .to(pillar, { scaleY: 1, duration: 1.3, ease: "expo.out" }, A + 0.1)
          .to(pillar, { opacity: 0.85, duration: 0.9, ease: "sine.out" }, A + 0.1)
          .to(tw, { y: (i: number) => -i * RISE, duration: 1, stagger: { amount: 0.35, from: "end" }, ease: "sine.inOut" }, A)
          .to(sig, { opacity: 1, duration: 0.9, stagger: { amount: 0.6 }, ease: "sine.inOut" }, A)
          .to(aura, { opacity: 1, duration: 1.2, ease: "sine.inOut" }, A)
          .to(bloom, { opacity: 0.8, duration: 1.2, ease: "sine.inOut" }, A);
        const rises = q(".gseal-rise-guide");
        q(".gseal-lift").forEach((e, i) => fly(e, rises[i % rises.length]!, A + 0.1 + i * 0.3, 1.5, "sine.inOut"));

        // 3. How good: violet/silver crown ring and halo (SR; also the SSR tease); gold spectacle for SSR
        const violet = tier === "SR" || tease;
        if (violet) {
          tl.to(root.current, { color: COLOR.SR, duration: 0.9, ease: "sine.inOut" }, B)
            .to(pillar, { scaleX: 1.9, duration: 1.2, ease: "sine.inOut" }, B)
            .to(rays, { opacity: 0.5, duration: 1.2, ease: "sine.inOut" }, B);
        }
        tl.to(one(".gseal-crown"), { opacity: 1, duration: 1, ease: "sine.inOut" }, B + 0.1)
          .to(q(".gseal-cdraw"), { drawSVG: "0% 100%", duration: 1.4, stagger: 0.2, ease: HOLY }, B + 0.1)
          .to(halo, { opacity: 0.8, duration: 1.1, ease: "sine.inOut" }, B + 0.1);
        if (ssr) {
          const g0 = tease ? B + 1.2 : B;
          const span = F - g0;
          tl.to(root.current, { color: COLOR.SSR, duration: 1.1, ease: "sine.inOut" }, g0)
            .to(one(".gseal-giant"), { y: 0, duration: span - 0.3, ease: "sine.out" }, g0)
            .to(one(".gseal-giant"), { opacity: 0.9, duration: 1.2, ease: "sine.inOut" }, g0)
            .to(q(".gseal-gdraw"), { drawSVG: "0% 100%", opacity: 1, duration: span - 0.8, stagger: 0.3, ease: HOLY }, g0)
            .to(rays, { opacity: 0.85, duration: 1.5, ease: "sine.inOut" }, g0)
            .to(pillar, { scaleX: 6, opacity: 0.6, duration: span - 0.2, ease: "sine.inOut" }, g0)
            .to(q(".gseal-chord"), { opacity: 0.6, scaleY: 1, duration: 1.2, stagger: { amount: 0.9 }, ease: "sine.out" }, g0 + 0.3)
            .to(aura, { opacity: 1, duration: span, ease: "sine.inOut" }, g0);
          // golden ribbons sweep down; a light streak follows each one
          const ribs = q(".gseal-rib");
          tl.to(ribs, { drawSVG: "0% 100%", opacity: 0.9, duration: 1.8, stagger: { amount: 1.2 }, ease: HOLY }, g0 + 0.2);
          q(".gseal-rstreak").forEach((e, i) => fly(e, ribs[i]!, g0 + 0.4 + i * 0.25, 1.8, "sine.inOut"));
        }
      }

      // Final: the light swells and washes into the card reveal
      tl.to(bloom, { opacity: 1, duration: 0.5, ease: "sine.inOut" }, F)
        .to(flash, { opacity: 0.85, duration: 0.5, ease: "sine.in" }, F)
        .to(world, { opacity: 0, duration: 0.45, ease: "sine.inOut" }, F + 0.45)
        .to(q(".gseal-mist"), { opacity: 0, duration: 0.5 }, F)
        .to(flash, { opacity: 0, duration: END - F - 0.5, ease: "sine.inOut" }, F + 0.5);
    },
    { scope: root, dependencies: [good, tier, tease] },
  );

  const layer = "gseal-layer gseal-tw";
  const streak = "M-30 0H0";
  return (
    <div className="gseal-root" ref={root} style={{ color: COLOR.n }}>
      <div className="gseal-rays" />
      <div className="gseal-aura" />
      <div className="gseal-world">
        <div className="gseal-stage">
          <svg className="gseal-svg gseal-bg" viewBox="-100 -100 200 200" shapeRendering="geometricPrecision">
            <g transform={FLAT}>
              <g className="gseal-wrap">
                <use href="#gseal-gart" transform="scale(1.5)" />
              </g>
            </g>
          </svg>
          <div className="gseal-ground">
            <svg className="gseal-svg gseal-bloom" viewBox="-100 -100 200 200" shapeRendering="geometricPrecision">
              <g transform={FLAT} filter="url(#gseal-blur)">
                <use href="#gseal-art" />
              </g>
            </svg>
            <svg className="gseal-svg" viewBox="-100 -100 200 200" shapeRendering="geometricPrecision">
              <defs>
                <filter id="gseal-blur" x="-20%" y="-60%" width="140%" height="220%">
                  <feGaussianBlur stdDeviation="3.2" />
                </filter>
                <linearGradient id="gseal-tail" gradientUnits="userSpaceOnUse" x1="-30" y1="0" x2="0" y2="0">
                  <stop offset="0" stopColor="currentColor" stopOpacity="0" />
                  <stop offset="1" stopColor="#fff" />
                </linearGradient>
                <g id="gseal-gart">
                  <path d={circ(96)} />
                  <path d={circ(90)} />
                  <path d={poly(12, 90, 5)} />
                </g>
              </defs>
              <g transform={FLAT}>
                <g id="gseal-art">
                  {/* outer double ring */}
                  <g className={layer}>
                    <path className="gseal-draw" d={circ(96)} />
                    <path className="gseal-draw" d={circ(93)} />
                    <path className="gseal-orbit" d={circ(94.5)} />
                  </g>
                  {/* sigil band: calligraphic strokes write themselves between two rings */}
                  <g className={layer}>
                    <path className="gseal-draw" d={circ(86)} />
                    <path className="gseal-draw" d={circ(68)} />
                    <path className="gseal-orbit" d={circ(86, true)} />
                    {SIGILS.map((s, i) => (
                      <path key={i} className="gseal-sig" d={s.d} transform={s.t} />
                    ))}
                  </g>
                  {/* inner rings */}
                  <g className={layer}>
                    <path className="gseal-draw" d={circ(63)} />
                    <path className="gseal-draw" d={circ(58)} />
                    <path className="gseal-orbit" d={circ(60.5)} />
                  </g>
                  {/* hexagram */}
                  <g className={layer}>
                    <path className="gseal-draw" d={poly(3, 54)} />
                    <path className="gseal-draw" d={poly(3, 54, 1, 90)} />
                    <path className="gseal-orbit" d={circ(54, true)} />
                  </g>
                  {/* overlapping squares */}
                  <g className={layer}>
                    <path className="gseal-draw" d={poly(4, 40)} />
                    <path className="gseal-draw" d={poly(4, 40, 1, -45)} />
                  </g>
                  {/* inner ring */}
                  <g className={layer}>
                    <path className="gseal-draw" d={circ(35)} />
                    <path className="gseal-orbit" d={circ(35, true)} />
                  </g>
                  {/* heptagram */}
                  <g className={layer}>
                    <path className="gseal-draw" d={poly(7, 25, 3)} />
                  </g>
                  {/* inner sigil */}
                  <g className={layer}>
                    <path className="gseal-draw" d={circ(12)} />
                    <path className="gseal-draw" d="M0 -12V12M-12 0H12M-8.5 -8.5L8.5 8.5M8.5 -8.5L-8.5 8.5" />
                    <path className="gseal-draw" d={SIGIL_ARCS} />
                  </g>
                  {/* crown ring above the tower (SR and better) */}
                  {good && (
                    <g className="gseal-layer gseal-crown">
                      <path className="gseal-cdraw" d={circ(30)} />
                      <path className="gseal-cdraw" d={circ(25)} />
                      <path className="gseal-cdraw" d={poly(5, 22, 2)} />
                    </g>
                  )}
                  {/* charge: long streaks spiral inward along invisible guides */}
                  {SPIRALS.map((d, i) => (
                    <g key={i}>
                      <path className="gseal-guide gseal-spiral" d={d} />
                      <path className="gseal-streak gseal-charge" d={streak} />
                    </g>
                  ))}
                </g>
              </g>
            </svg>
          </div>
          <div className="gseal-crack" />
          <div className="gseal-pillar" />
          <div className="gseal-halo" />
          {good && (
            <svg className="gseal-svg" viewBox="-100 -100 200 200" shapeRendering="geometricPrecision">
              {RISES.map((d, i) => (
                <path key={i} className="gseal-guide gseal-rise-guide" d={d} />
              ))}
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <path key={i} className="gseal-streak gseal-lift" d="M-40 0H0" />
              ))}
            </svg>
          )}
          {ssr && (
            <>
              <svg className="gseal-svg gseal-giant" viewBox="-100 -100 200 200" shapeRendering="geometricPrecision">
                <g transform={FLAT}>
                  <g className="gseal-wrap">
                    <path className="gseal-gdraw" d={circ(168)} />
                    <path className="gseal-gdraw" d={circ(158)} />
                    <path className="gseal-gdraw" d={poly(12, 158, 5)} />
                    <path className="gseal-orbit" d={circ(163)} />
                  </g>
                </g>
              </svg>
              <svg className="gseal-svg" viewBox="-100 -100 200 200" shapeRendering="geometricPrecision">
                <g id="gseal-ribs">
                  {RIBBONS.map((d, i) => (
                    <path key={i} className="gseal-rib" d={d} />
                  ))}
                </g>
                <use href="#gseal-ribs" filter="url(#gseal-blur)" />
                {RIBBONS.map((_, i) => (
                  <path key={i} className="gseal-streak gseal-rstreak" d={streak} />
                ))}
              </svg>
            </>
          )}
        </div>
        {ssr &&
          [0, 1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="gseal-chord" style={{ left: `${10 + i * 13.3}%` }} />)}
      </div>
      <div className="gseal-mist" />
      <div className="gseal-mist gseal-mist-b" />
      <div className="gseal-vig" />
      <div className="gseal-flash" />
    </div>
  );
}
