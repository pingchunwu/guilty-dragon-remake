import { useRef } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { SKILL_BY_ID, type CardDefinition } from "@gdr/engine";
import { skillEffectText } from "../game/text";
import { BattleCard } from "./BattleCard";
import { reducedMotion } from "./BattleParts";

const STARS: Record<string, number> = { N: 1, R: 2, SR: 3, SSR: 4 };
const PARTICLES = Array.from({ length: 22 }, (_, i) => i);

/**
 * Full-screen individual reveal for a high-rarity card (SSR ~4.5s, SR ~2.2s). Fill a fixed parent.
 * First tap jumps to the fully revealed end state; second tap calls onDone (once).
 */
export function GachaCutIn({
  card,
  isNew,
  level,
  onDone,
}: {
  card: CardDefinition;
  isNew: boolean;
  level: number;
  onDone: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const skipped = useRef(false);
  const done = useRef(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const finish = () => {
    if (done.current) return;
    done.current = true;
    doneRef.current();
  };
  const tap = () => {
    const tl = tlRef.current;
    if (tl && tl.progress() < 1) {
      skipped.current = true; // no auto-finish after a skip: the second tap ends the scene
      tl.progress(1);
      return;
    }
    finish();
  };
  const skill = card.skill ? SKILL_BY_ID.get(card.skill) : undefined;
  const ssr = card.rarity === "SSR";
  const stars = STARS[card.rarity] ?? 3;

  useGSAP(
    () => {
      if (reducedMotion()) {
        const t = window.setTimeout(finish, 1500);
        return () => window.clearTimeout(t);
      }
      const q = gsap.utils.selector(root);
      const text = [q(".gcut-name"), q(".gcut-skill")];
      gsap.set(q(".gcut-star"), { opacity: 0, scale: 3 });
      gsap.set(text, { opacity: 0, y: 24 });
      gsap.set(q(".gcut-new"), { opacity: 0, scale: 3, rotate: -25 });
      gsap.set(q(".gcut-sweep"), { xPercent: -160 });
      const tl = gsap.timeline({
        onComplete: () => {
          if (!skipped.current) gsap.delayedCall(0.3, finish);
        },
      });
      tlRef.current = tl;
      const starsIn = (at: number, gap: number) =>
        tl.to(q(".gcut-star"), { opacity: 1, scale: 1, duration: 0.25, ease: "back.out(3)", stagger: gap }, at);
      const textIn = (at: number) =>
        tl
          .to(q(".gcut-name"), { opacity: 1, y: 0, duration: 0.35, ease: "back.out(2)" }, at)
          .to(q(".gcut-skill"), { opacity: 1, y: 0, duration: 0.35, ease: "power2.out" }, at + 0.2)
          .to(q(".gcut-new"), { opacity: 1, scale: 1, rotate: -12, duration: 0.2, ease: "power4.in" }, at + 0.5)
          .to(q(".gcut-card"), { x: 3, y: -3, duration: 0.05, yoyo: true, repeat: 3 }, at + 0.7);

      if (!ssr) {
        // SR: soft backdrop, slide in, single flash + sweep
        gsap.set(q(".gcut-card"), { xPercent: 120, scale: 1.4, rotate: 8, opacity: 0 });
        gsap.set(q(".gcut-flash"), { opacity: 0 });
        tl.from(q(".gcut-bg, .gcut-rays"), { opacity: 0, duration: 0.3 })
          .to(q(".gcut-card"), { xPercent: 0, scale: 1, rotate: 0, opacity: 1, duration: 0.5, ease: "power4.out" }, 0.1)
          .to(q(".gcut-flash"), { opacity: 0.7, duration: 0.08, yoyo: true, repeat: 1 }, 0.55)
          .to(q(".gcut-sweep"), { xPercent: 160, duration: 0.5, ease: "power2.inOut" }, 0.6);
        starsIn(0.9, 0.18);
        textIn(1.2);
        tl.to({}, { duration: 0.01 }, 2.19);
        return;
      }

      // SSR: dark hold, gold pillar builds, silhouette -> burst
      gsap.set(q(".gcut-card"), { opacity: 0, scale: 0.9 });
      gsap.set(q(".gcut-fx"), { filter: "brightness(0)" });
      gsap.set(q(".gcut-pillar"), { opacity: 0, scaleY: 0 });
      gsap.set(q(".gcut-glow"), { opacity: 0, scale: 0.1 });
      gsap.set(q(".gcut-rays"), { opacity: 0 });
      gsap.set(q(".gcut-flash"), { opacity: 0 });
      gsap.set(q(".gcut-ring"), { opacity: 0, scale: 0.2 });
      gsap.set(q(".gcut-spark"), { opacity: 0 });
      tl.to(q(".gcut-pillar"), { opacity: 1, scaleY: 1, duration: 1.4, ease: "power2.in" }, 0.2)
        .to(q(".gcut-glow"), { opacity: 1, scale: 1.6, duration: 1.6, ease: "power2.in" }, 0)
        .to(q(".gcut-card"), { opacity: 1, scale: 1, duration: 0.7, ease: "power2.out" }, 0.8)
        .to(q(".gcut-stage"), { scale: 1.06, duration: 4.3, ease: "none" }, 0.2)
        // burst at 1.7
        .to(q(".gcut-flash"), { opacity: 1, duration: 0.08, ease: "power2.out" }, 1.7)
        .set(q(".gcut-fx"), { filter: "brightness(1)" }, 1.76)
        .to(q(".gcut-flash"), { opacity: 0, duration: 0.6, ease: "power2.in" }, 1.8)
        .to(q(".gcut-pillar"), { opacity: 0.25, duration: 0.6 }, 1.8)
        .to(q(".gcut-glow"), { opacity: 0.6, duration: 0.6 }, 1.8)
        .to(q(".gcut-rays"), { opacity: 0.8, duration: 0.5 }, 1.8)
        .to(q(".gcut-ring"), { opacity: 1, duration: 0.05 }, 1.72)
        .to(q(".gcut-ring"), { scale: 4, opacity: 0, duration: 0.8, ease: "power2.out" }, 1.77)
        .to(q(".gcut-sweep"), { xPercent: 160, duration: 0.6, ease: "power2.inOut" }, 1.9);
      q(".gcut-spark").forEach((el) => {
        const a = gsap.utils.random(0, Math.PI * 2);
        const d = gsap.utils.random(110, 260);
        tl.fromTo(
          el,
          { x: 0, y: 0, opacity: 1, scale: gsap.utils.random(0.6, 1.4) },
          { x: Math.cos(a) * d, y: Math.sin(a) * d, opacity: 0, duration: gsap.utils.random(0.7, 1.2), ease: "power3.out" },
          1.74,
        );
      });
      starsIn(2.3, 0.28);
      textIn(3.3);
      tl.to({}, { duration: 0.01 }, 4.49);
    },
    { scope: root },
  );

  return (
    <div ref={root} className={`gcut ${ssr ? "gcut-ssr" : "gcut-sr"}`} onClick={tap} role="presentation">
      <div className="gcut-bg" />
      {ssr && <div className="gcut-glow" />}
      {ssr && <div className="gcut-pillar" />}
      <div className="gcut-rays" />
      <div className="gcut-stage">
        {ssr && <div className="gcut-ring" />}
        <div className="gcut-card">
          <div className="gcut-fx">
            <BattleCard card={card} show="pow" />
          </div>
          <div className="gcut-sweep" />
        </div>
        {ssr && PARTICLES.map((i) => <i key={i} className="gcut-spark" />)}
        {isNew && <div className="gcut-new">NEW</div>}
      </div>
      <div className="gcut-info">
        <div className="gcut-stars" aria-label={`${card.rarity} ${stars} stars`}>
          {Array.from({ length: stars }, (_, i) => (
            <span key={i} className="gcut-star">
              ★
            </span>
          ))}
        </div>
        <div className="gcut-name">{card.name}</div>
        {skill && (
          <div className="gcut-skill">
            <strong>{skill.name}</strong>
            <span>{skillEffectText(skill, level)}</span>
          </div>
        )}
      </div>
      <div className="gcut-flash" />
    </div>
  );
}
