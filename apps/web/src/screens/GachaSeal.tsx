import { useMemo, useRef } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { reducedMotion } from "./BattleParts";
import type { Omen } from "./gachaOmen";

const COLOR = { n: "#d6ebff", SR: "#cfc4ff", SSR: "#ffd34d" };
/** The circle is flattened inside SVG coordinates (no CSS 3D), so strokes stay vector-crisp. */
const FLAT = "translate(0 20) scale(1 0.45)";
const RISE = 26; // user units each ring lifts per index when the rings stack into a tower

// Invented sigil glyphs (Runic block + geometric symbols); purely decorative.
const RUNES = [..."ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ"];
const GEO = [..."⟁◬◈⌬⏣◇⬡⟐"];

const rad = (d: number) => (d * Math.PI) / 180;
const pt = (r: number, d: number) => `${(r * Math.cos(rad(d))).toFixed(2)} ${(r * Math.sin(rad(d))).toFixed(2)}`;
/** Star polygon {n/k}: k=1 is a regular polygon. */
const poly = (n: number, r: number, k = 1, off = -90) =>
  Array.from({ length: n }, (_, i) => `${i ? "L" : "M"}${pt(r, ((i * k) / n) * 360 + off)}`).join(" ") + "Z";
const circ = (r: number) => `M${-r} 0A${r} ${r} 0 1 1 ${r} 0A${r} ${r} 0 1 1 ${-r} 0`;
const NODE_R = 66;
const nodeAt = (i: number) => [NODE_R * Math.cos(rad(i * 30 - 90)), NODE_R * Math.sin(rad(i * 30 - 90))] as const;
const SIGIL_ARCS = [0, 90, 180, 270].map((a) => `M${pt(18, a - 35)}A18 18 0 0 1 ${pt(18, a + 35)}`).join("");
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

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
  const fx = useMemo(
    () => ({
      stars: Array.from({ length: 28 }, (_, i) => ({ x: rnd(0, 100), y: rnd(0, 100), r: rnd(0.14, 0.4), g: i % 3 })),
      motes: Array.from({ length: 18 }, () => ({ x: rnd(-0.55, 0.55), y: rnd(0.05, 0.4), h: rnd(0.5, 0.9), d: rnd(7, 12), t: rnd(0, 6), o: rnd(0.4, 0.9) })),
      feathers: Array.from({ length: 22 }, () => ({ x: rnd(-0.6, 0.6), d: rnd(6, 9.5), t: rnd(0, 6), s: rnd(0.7, 1.3), w: rnd(10, 22) })),
    }),
    [],
  );

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
      const fade = q(".gseal-fade");
      const rune = q(".gseal-rune");
      const pillar = one(".gseal-pillar");
      const crack = one(".gseal-crack");
      const halo = one(".gseal-halo");
      const aura = one(".gseal-aura");
      const rays = one(".gseal-rays");
      const bloom = one(".gseal-bloom");
      const ground = one(".gseal-ground");
      const stars = one(".gseal-stars");
      const world = one(".gseal-world");
      const flash = one(".gseal-flash");

      gsap.set(layers, { svgOrigin: "0 0" });
      gsap.set(draw, { strokeDashoffset: 1 });
      gsap.set(fade, { opacity: 0 });
      gsap.set(rune, { fillOpacity: 0 });
      gsap.set(ground, { y: S * 0.1, opacity: 0 });
      gsap.set(pillar, { xPercent: -50, scaleY: 0, transformOrigin: "50% 100%" });
      gsap.set(crack, { xPercent: -50, yPercent: -50, scaleX: 0.15 });
      gsap.set(halo, { xPercent: -50, yPercent: -50 });
      gsap.set(q(".gseal-wrap"), { svgOrigin: "0 0" });
      if (good) gsap.set(one(".gseal-crown"), { y: -290, opacity: 0 });
      if (ssr) {
        gsap.set(one(".gseal-giant"), { y: -S * 0.85, opacity: 0 });
        gsap.set(q(".gseal-chord"), { scaleY: 0.2, transformOrigin: "50% 100%" });
      }

      // Ambient, phase-independent: slow rising motes, drifting mist, twinkling stars, falling feathers.
      q(".gseal-mote").forEach((e, i) => {
        const m = fx.motes[i]!;
        gsap.set(e, { x: m.x * S });
        gsap.fromTo(e, { y: m.y * S }, { y: (m.y - m.h) * S, duration: m.d, delay: m.t, repeat: -1, ease: "none" });
        gsap.fromTo(e, { opacity: 0 }, { opacity: m.o, duration: m.d / 2, delay: m.t, repeat: -1, yoyo: true, ease: "sine.inOut" });
      });
      q(".gseal-mist").forEach((e, i) => gsap.fromTo(e, { x: -S * 0.15 }, { x: S * 0.15, duration: 12 + i * 4, repeat: -1, yoyo: true, ease: "sine.inOut" }));
      q(".gseal-starg").forEach((e, i) => gsap.fromTo(e, { opacity: 0.3 }, { opacity: 1, duration: 3 + i, repeat: -1, yoyo: true, ease: "sine.inOut", delay: i * 0.7 }));
      q(".gseal-feather").forEach((e, i) => {
        const f = fx.feathers[i]!;
        gsap.set(e, { x: f.x * S, scale: f.s });
        gsap.fromTo(e, { y: -S * 0.9 }, { y: S * 0.8, duration: f.d, delay: f.t, repeat: -1, ease: "none" });
        gsap.fromTo(e, { x: f.x * S - f.w }, { x: f.x * S + f.w, duration: f.d / 3, delay: f.t, repeat: -1, yoyo: true, ease: "sine.inOut" });
        gsap.fromTo(e, { rotation: -28 }, { rotation: 28, duration: f.d / 3, delay: f.t, repeat: -1, yoyo: true, ease: "sine.inOut" });
      });

      // Steady rotation for the whole piece: alternate directions, inner rings a little faster. No easing, no pulses.
      layers.forEach((el, i) => tl.to(el, { rotation: (i % 2 ? -1 : 1) * (5 + i * 2) * END, duration: END, ease: "none" }, 0));
      q(".gseal-wrap").forEach((el, i) => tl.to(el, { rotation: (i % 2 ? -1 : 1) * (10 + i * 4) * END * 0.25, duration: END, ease: "none" }, 0));
      tl.to(rays, { rotation: 140, duration: END, ease: "power1.in" }, 0);

      // 1. Seal (all pulls): the circle rises and draws itself, calm blue-white
      tl.to(ground, { y: 0, opacity: 1, duration: 1.8, ease: "expo.out" }, 0)
        .to(stars, { opacity: 1, duration: 1.6, ease: "sine.inOut" }, 0)
        .to(draw, { strokeDashoffset: 0, duration: 1.4, stagger: 0.08, ease: "sine.inOut" }, 0.1)
        .to(fade, { opacity: 1, duration: 1.2, stagger: 0.1, ease: "sine.out" }, 0.5)
        .to(rune, { fillOpacity: good ? 0.55 : 0.9, duration: 0.8, stagger: { amount: sealEnd - 1.5 }, ease: "sine.inOut" }, 0.6)
        .to(bloom, { opacity: 0.55, duration: sealEnd, ease: "sine.inOut" }, 0)
        .to(aura, { opacity: 0.6, duration: sealEnd, ease: "sine.inOut" }, 0)
        .to(q(".gseal-bg"), { opacity: 0.2, duration: 2, ease: "sine.inOut" }, 0.4)
        .to(rays, { opacity: 0.28, duration: sealEnd, ease: "sine.inOut" }, 0);

      if (good) {
        // 2. Breakthrough: the centre opens, a column of light rises through it, the rings lift apart into a tower
        tl.to(crack, { opacity: 1, duration: 0.6, ease: "sine.out" }, A)
          .to(crack, { scaleX: 1, duration: 1.2, ease: "expo.out" }, A)
          .to(pillar, { scaleY: 1, duration: 1.3, ease: "expo.out" }, A + 0.1)
          .to(pillar, { opacity: 0.85, duration: 0.9, ease: "sine.out" }, A + 0.1)
          .to(tw, { y: (i: number) => -i * RISE, duration: 1, stagger: { amount: 0.35, from: "end" }, ease: "sine.inOut" }, A)
          .to(rune, { fillOpacity: 1, duration: 0.9, stagger: { amount: 0.6 }, ease: "sine.inOut" }, A)
          .to(aura, { opacity: 1, duration: 1.2, ease: "sine.inOut" }, A)
          .to(bloom, { opacity: 0.8, duration: 1.2, ease: "sine.inOut" }, A);

        // 3. How good: violet/silver crown ring and halo (SR; also the SSR tease); gold spectacle for SSR
        const violet = tier === "SR" || tease;
        if (violet) {
          tl.to(root.current, { color: COLOR.SR, duration: 0.9, ease: "sine.inOut" }, B)
            .to(pillar, { scaleX: 1.9, duration: 1.2, ease: "sine.inOut" }, B)
            .to(rays, { opacity: 0.5, duration: 1.2, ease: "sine.inOut" }, B);
        }
        tl.to(one(".gseal-crown"), { opacity: 1, duration: 1, ease: "sine.inOut" }, B + 0.1).to(halo, { opacity: 0.8, duration: 1.1, ease: "sine.inOut" }, B + 0.1);
        if (ssr) {
          const g0 = tease ? B + 1.2 : B;
          const span = F - g0;
          tl.to(root.current, { color: COLOR.SSR, duration: 1.1, ease: "sine.inOut" }, g0)
            .to(one(".gseal-giant"), { y: 0, duration: span - 0.3, ease: "sine.out" }, g0)
            .to(one(".gseal-giant"), { opacity: 0.9, duration: 1.2, ease: "sine.inOut" }, g0)
            .to(rays, { opacity: 0.85, duration: 1.5, ease: "sine.inOut" }, g0)
            .to(pillar, { scaleX: 6, opacity: 0.6, duration: span - 0.2, ease: "sine.inOut" }, g0)
            .to(one(".gseal-feathers"), { opacity: 1, duration: 1.5, ease: "sine.inOut" }, g0)
            .to(q(".gseal-chord"), { opacity: 0.6, scaleY: 1, duration: 1.2, stagger: { amount: 0.9 }, ease: "sine.out" }, g0 + 0.3)
            .to(aura, { opacity: 1, duration: span, ease: "sine.inOut" }, g0);
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
  return (
    <div className="gseal-root" ref={root} style={{ color: COLOR.n }}>
      <svg className="gseal-stars" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" shapeRendering="geometricPrecision">
        {[0, 1, 2].map((g) => (
          <g key={g} className="gseal-starg">
            {fx.stars.filter((s) => s.g === g).map((s, i) => (
              <circle key={i} cx={s.x} cy={s.y} r={s.r} />
            ))}
          </g>
        ))}
      </svg>
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
            <svg className="gseal-svg" viewBox="-100 -100 200 200" shapeRendering="geometricPrecision" textRendering="geometricPrecision">
              <defs>
                <filter id="gseal-blur" x="-20%" y="-60%" width="140%" height="220%">
                  <feGaussianBlur stdDeviation="3.2" />
                </filter>
                <path id="gseal-pr" d={circ(78)} />
                <path id="gseal-pg" d={circ(30)} />
                <g id="gseal-gart">
                  <path d={circ(96)} />
                  <path d={circ(90)} />
                  <path className="gseal-dash" d={circ(83)} />
                  <path d={poly(12, 90, 5)} />
                </g>
              </defs>
              <g transform={FLAT}>
                <g id="gseal-art">
                  {/* outer double ring */}
                  <g className={layer}>
                    <path className="gseal-draw" d={circ(96)} pathLength={1} />
                    <path className="gseal-draw" d={circ(93)} pathLength={1} />
                  </g>
                  {/* tick marks */}
                  <g className={layer}>
                    <path className="gseal-fade gseal-ticks" d={circ(88)} />
                  </g>
                  {/* runic glyph ring */}
                  <g className={layer}>
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
                  {/* node ring */}
                  <g className={layer}>
                    <path className="gseal-draw" d={circ(NODE_R)} pathLength={1} />
                    {Array.from({ length: 12 }, (_, i) => {
                      const [x, y] = nodeAt(i);
                      return <circle key={i} className="gseal-fade gseal-node" cx={x} cy={y} r="2.2" />;
                    })}
                  </g>
                  {/* dashed ring */}
                  <g className={layer}>
                    <path className="gseal-fade gseal-dash" d={circ(59)} />
                  </g>
                  {/* hexagram */}
                  <g className={layer}>
                    <path className="gseal-draw" d={poly(3, 54)} pathLength={1} />
                    <path className="gseal-draw" d={poly(3, 54, 1, 90)} pathLength={1} />
                  </g>
                  {/* overlapping squares */}
                  <g className={layer}>
                    <path className="gseal-draw" d={poly(4, 40)} pathLength={1} />
                    <path className="gseal-draw" d={poly(4, 40, 1, -45)} pathLength={1} />
                  </g>
                  {/* geometric glyph ring */}
                  <g className={layer}>
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
                  <g className={layer}>
                    <path className="gseal-draw" d={poly(7, 25, 3)} pathLength={1} />
                  </g>
                  {/* inner sigil */}
                  <g className={layer}>
                    <path className="gseal-draw" d={circ(12)} pathLength={1} />
                    <path className="gseal-draw" d="M0 -12V12M-12 0H12M-8.5 -8.5L8.5 8.5M8.5 -8.5L-8.5 8.5" pathLength={1} />
                    <path className="gseal-draw" d={SIGIL_ARCS} pathLength={1} />
                    <circle className="gseal-fade gseal-node" r="3" />
                  </g>
                  {/* crown ring above the tower (SR and better) */}
                  {good && (
                    <g className="gseal-layer gseal-crown">
                      <path d={circ(30)} />
                      <path className="gseal-dash" d={circ(25)} />
                      <path d={poly(5, 22, 2)} />
                    </g>
                  )}
                </g>
              </g>
            </svg>
          </div>
          <div className="gseal-crack" />
          <div className="gseal-pillar" />
          <div className="gseal-halo" />
          {ssr && (
            <svg className="gseal-svg gseal-giant" viewBox="-100 -100 200 200" shapeRendering="geometricPrecision">
              <g transform={FLAT}>
                <g className="gseal-wrap">
                  <use href="#gseal-gart" transform="scale(1.75)" />
                </g>
              </g>
            </svg>
          )}
          {fx.motes.map((_, i) => (
            <div key={i} className="gseal-mote" />
          ))}
        </div>
        {ssr && (
          <>
            <div className="gseal-feathers">
              {fx.feathers.map((_, i) => (
                <div key={i} className="gseal-feather" />
              ))}
            </div>
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="gseal-chord" style={{ left: `${10 + i * 13.3}%` }} />
            ))}
          </>
        )}
      </div>
      <div className="gseal-mist" />
      <div className="gseal-mist gseal-mist-b" />
      <div className="gseal-vig" />
      <div className="gseal-flash" />
    </div>
  );
}
