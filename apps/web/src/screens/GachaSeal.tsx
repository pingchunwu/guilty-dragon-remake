import { useMemo, useRef } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import type { Rarity } from "@gdr/engine";
import { reducedMotion } from "./BattleParts";

const TIER = (r: Rarity) => (r === "SSR" ? "ssr" : "n");
const RING_COLOR = { n: "#d6ebff", ssr: "#ffd34d" };
const RINGS = [90, 76, 56, 36];
const CHARGE = 1.8;
const BREAK = 3.8;
const CRACKS = ["M0 0 L-12 -22 L4 -40 L-10 -62 L2 -96", "M0 0 L16 -14 L8 -34 L26 -52 L20 -92", "M0 0 L22 8 L40 -6 L58 14 L92 4", "M0 0 L10 24 L-6 42 L8 64 L-2 94", "M0 0 L-18 10 L-38 2 L-60 22 L-92 12", "M0 0 L-14 -8 L-30 -30 L-52 -38 L-80 -60"];

/** Stages 1-3 of the gacha reveal: rune circle draws, charges (blue, or gold for SSR), shatters. Tap skips to the next phase. */
export function GachaSeal({ start, best, onDone }: { start: Rarity; best: Rarity; onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const embers = useMemo(
    () => Array.from({ length: 24 }, () => ({ x: Math.random() * 100, s: 2 + Math.random() * 4, d: 2 + Math.random() * 2 })),
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

      q(".gseal-ember").forEach((e, i) =>
        gsap.fromTo(e, { y: 0, opacity: 0 }, { y: -320 - (i % 5) * 40, opacity: 0.9, duration: embers[i]!.d, repeat: -1, delay: Math.random() * 2, ease: "power1.out", onRepeat: () => void gsap.set(e, { opacity: 0 }) }),
      );

      // 1. Seal draws, runes light one by one
      tl.addLabel("seal", 0)
        .from(q(".gseal-ring"), { strokeDashoffset: 1, duration: 1.2, stagger: 0.18, ease: "power2.inOut" }, 0)
        .from(q(".gseal-glyph"), { opacity: 0.08, duration: 0.25, stagger: 0.07, ease: "power1.out" }, 0.5)
        .to(q(".gseal-svg"), { rotation: 150, duration: BREAK, ease: "none" }, 0);

      // 2. Charge: pulses build, vignette tightens, aura swells
      tl.addLabel("charge", CHARGE)
        .fromTo(q(".gseal-aura-0"), { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 1.8, ease: "power2.in" }, CHARGE)
        .fromTo(q(".gseal-vig"), { opacity: 0, scale: 1.9 }, { opacity: 1, scale: 1, duration: 1.8, ease: "power2.in" }, CHARGE);
      for (let i = 0; i < 4; i++) {
        const at = CHARGE + 0.1 + i * 0.45;
        tl.to(q(".gseal-svg"), { scale: 1.05 + i * 0.05, duration: 0.18, ease: "power2.out" }, at)
          .to(q(".gseal-svg"), { scale: 1 + (i + 1) * 0.02, duration: 0.27, ease: "power2.in" }, at + 0.18);
      }
      if (t1 === "ssr") {
        tl.fromTo(q(".gseal-crack"), { strokeDashoffset: 1, opacity: 1 }, { strokeDashoffset: 0, duration: 0.25, stagger: 0.15, ease: "power1.out", immediateRender: false }, CHARGE + 0.6)
          .to(q(".gseal-crack"), { opacity: 0.4, duration: 0.1, stagger: { each: 0.15, yoyo: true, repeat: 1 } }, CHARGE + 1.0);
      }
      if (upgrade) {
        const at = CHARGE + 1.0;
        tl.to(q(".gseal-flash"), { opacity: 0.8, duration: 0.1 }, at)
          .to(q(".gseal-flash"), { opacity: 0, duration: 0.35 }, at + 0.1)
          .fromTo(q(".gseal-root"), { x: -8 }, { x: 0, duration: 0.5, ease: "elastic.out(2,0.2)", immediateRender: false }, at)
          .to(q(".gseal-aura-0"), { opacity: 0, scale: 1.3, duration: 0.3 }, at)
          .fromTo(q(".gseal-aura-1"), { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1.1, duration: 0.6, ease: "back.out(2)" }, at)
          .to(q(".gseal-svg"), { color: RING_COLOR[t1], duration: 0.3 }, at);
      } else {
        tl.set(q(".gseal-svg"), { color: RING_COLOR[t0] }, 0);
      }

      // 3. Break
      const aura = upgrade ? ".gseal-aura-1" : ".gseal-aura-0";
      tl.addLabel("break", BREAK)
        .to(q(".gseal-svg, " + aura + ", .gseal-vig"), { scale: 2, opacity: 0, duration: 0.6, ease: "power3.in" }, BREAK)
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
        .fromTo(q(".gseal-root"), { x: -12, y: 6 }, { x: 0, y: 0, duration: 0.6, ease: "elastic.out(3,0.2)", immediateRender: false }, BREAK + 0.2)
        .to({}, { duration: 0.2 }, BREAK + 1.2);
    },
    { scope: root },
  );

  return (
    <div className="gseal-root" ref={root}>
      <div className={`gseal-aura gseal-aura-0 gseal-${t0}`} />
      {upgrade && <div className={`gseal-aura gseal-aura-1 gseal-${t1}`} />}
      <svg className="gseal-svg" viewBox="-100 -100 200 200" style={{ color: RING_COLOR[t0] }}>
        {RINGS.map((r) => (
          <circle key={r} className="gseal-ring" r={r} pathLength={1} />
        ))}
        {Array.from({ length: 12 }, (_, i) => (
          <line key={i} className="gseal-glyph" x1="0" y1={i % 2 ? -62 : -66} x2="0" y2="-70" transform={`rotate(${i * 30})`} />
        ))}
        {Array.from({ length: 6 }, (_, i) => (
          <path key={i} className="gseal-glyph" d="M0 -50 L5 -42 L0 -34 L-5 -42 Z" transform={`rotate(${i * 60})`} />
        ))}
        {t1 === "ssr" && CRACKS.map((d, i) => <path key={i} className="gseal-crack" d={d} pathLength={1} />)}
      </svg>
      {embers.map((e, i) => (
        <div key={i} className="gseal-ember" style={{ left: `${e.x}%`, width: e.s, height: e.s }} />
      ))}
      {Array.from({ length: 24 }, (_, i) => (
        <div key={i} className="gseal-shard" style={{ opacity: 0 }} />
      ))}
      <div className="gseal-vig" />
      <div className="gseal-flash" />
    </div>
  );
}
