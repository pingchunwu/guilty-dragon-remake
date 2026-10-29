import { useRef } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { SKILL_BY_ID, type CardDefinition } from "@gdr/engine";
import { skillEffectText } from "../game/text";
import { BattleCard } from "./BattleCard";
import { reducedMotion } from "./BattleParts";

/** Stage 5 of docs/gacha-animation-plan.md: full-screen SSR cut-in. Fill a fixed parent; ~2.5s, tap to end. */
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
  const done = useRef(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const finish = () => {
    if (done.current) return;
    done.current = true;
    doneRef.current();
  };
  const skill = card.skill ? SKILL_BY_ID.get(card.skill) : undefined;

  useGSAP(
    () => {
      if (reducedMotion()) {
        const t = window.setTimeout(finish, 1500);
        return () => window.clearTimeout(t);
      }
      const q = gsap.utils.selector(root);
      gsap.set(q(".gcut-card"), { xPercent: 120, scale: 1.5, rotate: 8, opacity: 0 });
      gsap.set(q(".gcut-sweep"), { xPercent: -160 });
      gsap.set([q(".gcut-name"), q(".gcut-rarity"), q(".gcut-skill")], { opacity: 0, y: 24 });
      gsap.set(q(".gcut-new"), { opacity: 0, scale: 3, rotate: -25 });
      gsap
        .timeline({ onComplete: () => void gsap.delayedCall(0.4, finish) })
        .from(q(".gcut-bg, .gcut-rays"), { opacity: 0, duration: 0.25 })
        .to(q(".gcut-card"), { xPercent: 0, scale: 1, rotate: 0, opacity: 1, duration: 0.5, ease: "power4.out" }, 0.1)
        .to(q(".gcut-sweep"), { xPercent: 160, duration: 0.5, ease: "power2.inOut" }, 0.55)
        .to(q(".gcut-name"), { opacity: 1, y: 0, duration: 0.35, ease: "back.out(2)" }, 0.8)
        .to(q(".gcut-rarity"), { opacity: 1, y: 0, duration: 0.3, ease: "back.out(2)" }, 1.0)
        .to(q(".gcut-skill"), { opacity: 1, y: 0, duration: 0.35, ease: "power2.out" }, 1.2)
        .to(q(".gcut-new"), { opacity: 1, scale: 1, rotate: -12, duration: 0.2, ease: "power4.in" }, 1.6)
        .to(q(".gcut-card"), { x: 3, y: -3, duration: 0.05, yoyo: true, repeat: 3 }, 1.8)
        .to({}, { duration: 0.5 });
    },
    { scope: root },
  );

  return (
    <div ref={root} className="gcut" onClick={finish} role="presentation">
      <div className="gcut-bg" />
      <div className="gcut-rays" />
      <div className="gcut-stage">
        <div className="gcut-card">
          <BattleCard card={card} show="pow" />
          <div className="gcut-sweep" />
        </div>
        {isNew && <div className="gcut-new">NEW</div>}
      </div>
      <div className="gcut-info">
        <div className="gcut-rarity">SSR</div>
        <div className="gcut-name">{card.name}</div>
        {skill && (
          <div className="gcut-skill">
            <strong>{skill.name}</strong>
            <span>{skillEffectText(skill, level)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
