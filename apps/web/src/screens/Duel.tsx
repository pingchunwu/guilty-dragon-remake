import { useEffect, useRef, useState, type ReactNode } from "react";
import { gsap } from "gsap";
import { Flip } from "gsap/Flip";
import { useGSAP } from "@gsap/react";
import {
  SKILL_BY_ID,
  WEAPON_KINDS,
  cardSkill,
  chargeTypes,
  levelsOf,
  requiredPicks,
  type CardType,
  type Collection,
  type Equipment,
  type PhaseResult,
  type RuleConfig,
  type Selection,
  type SideId,
} from "@gdr/engine";
import { TYPE_LABEL, skillEffectText } from "../game/text";
import { BattleCard } from "./BattleCard";
import { CountUp, HpBar, SkillBursts, SkillTag, reducedMotion, type CardMap, type SideLabels } from "./BattleParts";
import { AttackScene, BEAT_MS, Pips, playbackFrames, type Chip } from "./Playback";

gsap.registerPlugin(Flip);

/** How long the phase opens on both leaders and their skills (requested 2026-10-28). */
const REVEAL_MS = 3000;
/** Pause before a deck-out final blow resolves on its own, so its banner can be read. */
const FINAL_BLOW_MS = 1200;

interface Props {
  labels: SideLabels;
  cards: CardMap;
  /** Your collection, for skill levels in the toast and the leader line. */
  owned: Collection;
  /** Rule 0.7.0-draft. */
  rules: RuleConfig;
  equipment: Record<SideId, Equipment>;
  /** HP to show; the caller keeps the pre-phase HP until `onDone`. */
  hp: Record<SideId, number>;
  drawPile: Record<SideId, number>;
  hand: readonly string[];
  /** The phase being chosen for. */
  phase: number;
  kind: "normal" | "deck_out";
  /** The last resolved phase; it replays from the start while `animate` is on. */
  last: PhaseResult | null;
  animate: boolean;
  onDone: () => void;
  /** Called once when the playback reaches the skill beat (not when skipping past it). */
  onSkills?: () => void;
  busy: boolean;
  onPlay: (selection: Selection | null) => void;
  /** An error line (PvP); also releases locked picks so they can be sent again. */
  notice?: ReactNode;
  /** Shown in place of the banner, hand and info line (battle over, time up). */
  children?: ReactNode;
}

/** The 3 weapon capsules: `lit` is the leader's colour, which carries the total and combo pips; "all" lights all three. */
function Capsules({ equipment, lit, sum, counted, empty }: {
  equipment: Equipment;
  lit: CardType | "all" | null;
  sum: number;
  counted: number;
  /** Once a leader is chosen the other capsules empty out, as in the OG. */
  empty: boolean;
}) {
  return (
    <span className="capsules">
      {WEAPON_KINDS.map((k) => (
        <span
          key={k}
          className={`capsule card-${k}${lit === "all" || k === lit ? " capsule-lit" : ""}`}
          title={`${TYPE_LABEL[k]}武器`}
        >
          {k === lit ? (
            <>
              <CountUp value={sum} className="capsule-value" />
              <Pips count={counted} />
            </>
          ) : empty && lit !== "all" ? null : (
            (equipment[k]?.attack ?? 0)
          )}
        </span>
      ))}
    </span>
  );
}

interface Play {
  phase: number;
  beat: number;
  reveal: boolean;
  scene: boolean;
}

/**
 * Rule 0.7.0 duel, after the OG clip: one fixed stage, so nothing moves while a
 * phase plays. The opponent's strip on top; your weapon capsules and charge row
 * in the middle, where your picks land and the phase then plays out (draws fly
 * in from your deck pile); your HP, a banner slot, the hand and one info line
 * below. A phase opens on both leaders for REVEAL_MS, plays its beats, then the
 * attack cut-in; a deck-out phase resolves on its own as the final blow.
 */
export function Duel(props: Props) {
  const { labels, cards, owned, rules, equipment, hp, drawPile, hand, phase, kind, last, animate, onDone, busy, onPlay } =
    props;
  const root = useRef<HTMLDivElement>(null);
  const levels = levelsOf(owned);

  // Choosing: picks and the deal reset for each phase.
  const [picked, setPicked] = useState<string[]>([]);
  const [dealt, setDealt] = useState(() => reducedMotion());
  const [pickPhase, setPickPhase] = useState(phase);
  if (pickPhase !== phase) {
    setPickPhase(phase);
    setPicked([]);
    setDealt(reducedMotion());
  }

  // Playback of `last`: leader reveal, beats, attack cut-in.
  const frames = last ? playbackFrames(last, cards, rules) : [];
  const end = Math.max(0, frames.length - 1);
  const fresh = (p: number): Play =>
    animate && !reducedMotion()
      ? { phase: p, beat: 0, reveal: last?.kind === "normal", scene: true }
      : { phase: p, beat: end, reveal: false, scene: false };
  const [play, setPlay] = useState<Play>(() => fresh(last?.phase ?? 0));
  const shiftFrom = useRef<Flip.FlipState | null>(null);
  if (play.phase !== (last?.phase ?? 0)) setPlay(fresh(last?.phase ?? 0));
  const replaying = animate && !!last;
  const frame = replaying ? frames[play.beat] : undefined;

  useEffect(() => {
    if (!replaying) return;
    if (play.reveal) {
      const timer = window.setTimeout(() => setPlay((p) => ({ ...p, reveal: false })), REVEAL_MS);
      return () => window.clearTimeout(timer);
    }
    if (play.beat < end) {
      const timer = window.setTimeout(() => {
        // Where the row cards sit now, so the queue can slide left once a merged card leaves it.
        if (root.current && !reducedMotion()) shiftFrom.current = Flip.getState(root.current.querySelectorAll(".charge-slot, .opp-slot"));
        setPlay((p) => ({ ...p, beat: p.beat + 1 }));
      }, BEAT_MS);
      return () => window.clearTimeout(timer);
    }
    if (!play.scene) onDone();
  }, [replaying, play, end, onDone]);
  // Heals, HP paid and direct damage land on the skill beat.
  const skillBeat = replaying && !play.reveal && !!frames[play.beat]?.skills;
  useEffect(() => {
    if (skillBeat) props.onSkills?.();
  }, [skillBeat]);
  const skip = () => setPlay((p) => ({ ...p, reveal: false, beat: end, scene: false }));

  const leader = picked[0] && !props.children ? cards.get(picked[0])! : null;
  const counts = leader ? chargeTypes(leader, levels) : new Set<CardType>();
  const required = requiredPicks(hand, rules);
  const full = picked.length === required;
  const locked = busy || replaying || !dealt || kind === "deck_out" || !!props.children;
  const pickedCounted = picked.filter((id) => counts.has(cards.get(id)!.type)).length;
  const sum = leader
    ? (equipment.challenger[leader.type]?.attack ?? 0) +
      picked.filter((id) => counts.has(cards.get(id)!.type)).reduce((n, id) => n + cards.get(id)!.attack, 0)
    : 0;

  // The hand is dealt from the deck pile once the last phase has finished playing.
  useGSAP(
    () => {
      if (dealt || busy || replaying) return;
      setDealt(true);
      const q = gsap.utils.selector(root);
      const pile = q(".my-pile")[0]!.getBoundingClientRect();
      const tl = gsap.timeline();
      q(".hand-grid > .bcard").forEach((el, i) => {
        const r = el.getBoundingClientRect();
        tl.from(
          el,
          {
            x: pile.left - r.left,
            y: pile.top - r.top,
            scale: pile.width / r.width,
            transformOrigin: "0 0",
            autoAlpha: 0,
            duration: 0.3,
            ease: "power2.out",
            // The inline visibility would override .bcard-gone once the card is picked.
            clearProps: "all",
          },
          i * 0.12,
        );
      });
    },
    { dependencies: [busy, replaying, phase], scope: root },
  );

  // A pick flies from its hand slot into the charge row (GSAP Flip).
  const flipFrom = useRef<Flip.FlipState | null>(null);
  useGSAP(
    () => {
      const state = flipFrom.current;
      flipFrom.current = null;
      const id = picked[picked.length - 1];
      const slot = id && root.current?.querySelector(`.charge-row [data-flip-id="${id}"]`);
      if (state && slot) Flip.from(state, { targets: slot, duration: 0.4, ease: "back.out(1.2)", absolute: true });
    },
    { dependencies: [picked], scope: root },
  );

  // Choosing the leader turns the hand from DRAW to POW, as the OG flips its numbers.
  useGSAP(
    () => {
      if (leader && !reducedMotion())
        gsap.from(".hand-grid .bcard-num", { rotationX: 90, duration: 0.25, stagger: 0.03, ease: "power2.out" });
    },
    { dependencies: [leader], scope: root },
  );

  // Playback, after the OG: the charge row is a queue behind the leader. A card that counts flies up
  // into the weapon capsule (which adds its POW), leaves the row, and the queue slides left; a draw
  // flies in from the deck pile at the end of the queue.
  useGSAP(
    () => {
      const state = shiftFrom.current;
      shiftFrom.current = null;
      if (!frame || reducedMotion()) return;
      const q = gsap.utils.selector(root);
      const shifted = state && Flip.from(state, { targets: q(".charge-slot, .opp-slot"), duration: 0.2, ease: "power2.out" });
      for (const [rowSel, pileSel, weaponSel] of [
        [".charge-row", ".my-pile", ".duel-stage .capsule-lit"],
        [".opp-chips", ".mini-pile", ".opp-total"],
      ] as const) {
        const row = q(rowSel)[0];
        const pileEl = q(pileSel)[0];
        const weapon = q(weaponSel)[0];
        if (!row || !pileEl) continue;
        const pile = pileEl.getBoundingClientRect();
        row.querySelectorAll<HTMLElement>(".bcard").forEach((el) => {
          const merging = el.classList.contains("bcard-merging") && weapon;
          const fresh = el.classList.contains("bcard-fresh");
          if (!merging && !fresh) return;
          const tl = gsap.timeline({ delay: shifted ? 0.2 : 0 });
          if (fresh && el.classList.contains("bcard-drawn")) {
            const r = el.getBoundingClientRect();
            tl.from(el, { x: pile.left - r.left, y: pile.top - r.top, autoAlpha: 0, duration: 0.3, ease: "power2.out", clearProps: merging ? "" : "all" });
          } else if (fresh) tl.fromTo(el, { scale: 1.25 }, { scale: 1, duration: 0.35, ease: "back.out(3)" });
          if (merging) {
            // Measured when the merge starts, after the queue has slid into place.
            const centre = (r: DOMRect) => [r.left + r.width / 2, r.top + r.height / 2] as const;
            const delta = (axis: 0 | 1) => () => centre(weapon.getBoundingClientRect())[axis] - centre(el.getBoundingClientRect())[axis];
            tl.to(el, { x: delta(0), y: delta(1), scale: 0.4, autoAlpha: 0, duration: 0.25, ease: "power2.in" }, ">0.05")
              .fromTo(weapon, { scale: 1.12 }, { scale: 1, duration: 0.2, ease: "back.out(3)" }, ">-0.05");
          }
        });
      }
    },
    { dependencies: [play.beat, replaying], scope: root },
  );

  // The leader reveal slides both leaders in.
  useGSAP(
    () => {
      if (!replaying || !play.reveal || reducedMotion()) return;
      gsap
        .timeline({ defaults: { duration: 0.4, ease: "power3.out" } })
        .from(".reveal", { autoAlpha: 0, duration: 0.2 })
        .from(".reveal-side-defender", { xPercent: 60, autoAlpha: 0 }, 0.1)
        .from(".reveal-side-challenger", { xPercent: -60, autoAlpha: 0 }, "<");
    },
    { dependencies: [play.reveal, replaying], scope: root },
  );

  // No confirm button: the last pick plays once it lands. A plain timer, not GSAP's frame
  // ticker, so play still goes through in a background tab (the PvP clock keeps running).
  useEffect(() => {
    if (!full || locked) return;
    const timer = window.setTimeout(
      () => onPlay({ leader: picked[0]!, supports: picked.slice(1) }),
      reducedMotion() ? 0 : 450,
    );
    return () => window.clearTimeout(timer);
    // Picks are locked once full; PvP re-renders every tick, and a new onPlay must not restart the timer.
  }, [full, locked]);

  // When the deck runs out, the final blow is performed on its own (OG: it triggers automatically).
  useEffect(() => {
    if (kind !== "deck_out" || busy || replaying || props.children) return;
    const timer = window.setTimeout(() => onPlay(null), FINAL_BLOW_MS);
    return () => window.clearTimeout(timer);
  }, [kind, busy, replaying, phase, props.children]);

  // A failed send (PvP error) releases the picks.
  useEffect(() => {
    if (props.notice) setPicked([]);
  }, [props.notice]);

  function toggle(id: string) {
    if (locked || full) return;
    if (id === picked[0]) setPicked([]);
    else if (picked.includes(id)) setPicked(picked.filter((x) => x !== id));
    else if (picked.length < required) {
      const tile = root.current?.querySelector<HTMLElement>(`.hand-grid > :nth-child(${hand.indexOf(id) + 1})`);
      if (tile && !reducedMotion()) {
        tile.dataset.flipId = id;
        flipFrom.current = Flip.getState(tile);
      }
      setPicked([...picked, id]);
    }
  }

  // --- Stage contents -------------------------------------------------------------------------
  const settled = frame && frame.stage !== "chain";
  const sideOf = (id: SideId) => last!.sides[id];
  const total = (id: SideId) => (settled ? sideOf(id).attack : frame!.sides[id].sum);
  const myLit: CardType | "all" | null = frame
    ? last!.kind === "deck_out"
      ? "all"
      : sideOf("challenger").leaderType
    : (leader?.type ?? null);
  const myRow: Chip[] = frame
    ? frame.sides.challenger.row
    : // Once the battle is over (children shown), the last picks are history; the row clears.
      (leader ? picked : []).map((card, i) => ({
        card,
        state: i === 0 ? "leader" : counts.has(cards.get(card)!.type) ? "counted" : "blocked",
        drawn: false,
        fresh: false,
      }));
  // OG queue: a counted card merges into the weapon on its beat and leaves the row after, so the row
  // never outgrows leader + spaces; once the judgment starts, the blocked cards clear away too.
  // A deck-out shows every card it adds up.
  const prev = replaying && play.beat > 0 ? frames[play.beat - 1] : undefined;
  const gone = (id: SideId, chip: Chip) =>
    !!frame &&
    last!.kind !== "deck_out" &&
    chip.state !== "leader" &&
    (settled || (chip.state === "counted" && prev?.sides[id].row.find((c) => c.card === chip.card)?.state === "counted"));
  const chipClass = (chip: Chip) =>
    `bcard-${chip.state}${chip.drawn ? " bcard-drawn" : ""}${chip.fresh ? " bcard-fresh" : ""}${
      frame && chip.state === "counted" && last!.kind !== "deck_out" ? " bcard-merging" : ""
    }`;
  // Playback cards get their own keys and flip ids, so the next phase's picks never reuse a merged
  // element, and the same card on both sides (practice uses one collection) never shares an id.
  const slotKey = (card: string) => (frame ? `${last!.phase}-${card}` : card);
  const outcome = last
    ? last.winner
      ? `${labels[last.winner]}${last.kind === "deck_out" ? "最終一擊" : "攻擊"}，造成 ${last.damage} 傷害`
      : "攻擊相同，沒有傷害"
    : null;

  const banner = replaying ? (
    <div className="prompt-banner row between">
      <span>
        第 {last!.phase} 階段{last!.kind === "deck_out" && " · 最終一擊"}
      </span>
      <button type="button" className="link" onClick={skip}>
        略過
      </button>
    </div>
  ) : kind === "deck_out" ? (
    <div className="prompt-banner prompt-final">牌庫耗盡！最終一擊</div>
  ) : dealt && !full && !busy ? (
    <div key={leader ? "charge" : "leader"} className="prompt-banner">
      {!leader ? "請選擇領導卡" : `請選擇充能卡（再 ${required - picked.length} 張）· 合計 ${sum}`}
    </div>
  ) : null;

  const leaderSkill = leader ? cardSkill(leader, levels) : null;
  const info = props.notice ? (
    <span className="error">{props.notice}</span>
  ) : leaderSkill ? (
    <>
      領導技能 <strong>{leaderSkill.skill.name} Lv {leaderSkill.level}</strong>：{skillEffectText(leaderSkill.skill, leaderSkill.level)}
    </>
  ) : leader ? (
    <span className="muted">領導卡沒有技能</span>
  ) : outcome && !replaying ? (
    <span className="muted">
      第 {last!.phase} 階段：{outcome}
    </span>
  ) : (
    <span className="muted">先選領導卡（大字是 DRAW），再選 4 張充能卡。長按卡片看技能。</span>
  );

  return (
    <div className="duel" ref={root}>
      <div className="duel-opp">
        <span className="mini-pile" aria-label={`${labels.defender}的牌庫 ${drawPile.defender}`}>
          {drawPile.defender}
        </span>
        <HpBar label={labels.defender} hp={hp.defender} equipment={equipment.defender} rules={rules} />
      </div>
      <div className="duel-opp-row">
        {frame && (
          <>
            <span className="opp-chips">
              {frame.sides.defender.row.filter((chip) => !gone("defender", chip)).map((chip, i) => {
                const card = cards.get(chip.card);
                return card ? (
                  <span key={slotKey(chip.card)} className="opp-slot" data-flip-id={`opp-${chip.card}`} style={{ zIndex: 20 - i }}>
                    <BattleCard card={card} show="pow" className={`bcard-mini ${chipClass(chip)}`} />
                  </span>
                ) : null;
              })}
            </span>
            <span className={`capsule capsule-lit opp-total card-${sideOf("defender").leaderType ?? "heavy"}`}>
              <CountUp value={total("defender")} className="capsule-value" />
              <Pips count={frame.sides.defender.counted} />
            </span>
          </>
        )}
      </div>

      <div className="duel-stage">
        <Capsules
          equipment={equipment.challenger}
          lit={myLit}
          sum={frame ? total("challenger") : leader ? (equipment.challenger[leader.type]?.attack ?? 0) : 0}
          counted={frame ? frame.sides.challenger.counted : 0}
          empty={!!leader || !!frame}
        />
        <div className="charge-line">
          <div className="charge-row">
            {myRow.filter((chip) => !gone("challenger", chip)).map((chip, i) => (
              // Earlier cards sit on top, so every card's POW (bottom right) stays readable.
              <span
                key={slotKey(chip.card)}
                className="charge-slot"
                data-flip-id={frame ? `me-${chip.card}` : chip.card}
                style={{ zIndex: 20 - i }}
              >
                <BattleCard
                  card={cards.get(chip.card)!}
                  owned={owned[chip.card]}
                  show="pow"
                  className={chipClass(chip)}
                  onClick={frame ? undefined : () => toggle(chip.card)}
                />
              </span>
            ))}
          </div>
          <span className="deck-pile my-pile" aria-label={`牌庫 ${drawPile.challenger}`}>
            {drawPile.challenger}
          </span>
        </div>
        {frame?.skills && (
          <div className="board-overlay">
            <SkillBursts result={last!} labels={labels} v07 />
          </div>
        )}
      </div>

      <HpBar label={labels.challenger} hp={hp.challenger} equipment={equipment.challenger} rules={rules} />

      {props.children ? (
        <div className="duel-end">{props.children}</div>
      ) : (
        <>
          <div className="banner-slot">{banner}</div>
          <div className={`hand-grid${dealt ? "" : " undealt"}`}>
            {hand.map((id) => {
              const card = cards.get(id)!;
              const index = picked.indexOf(id);
              return (
                <BattleCard
                  key={id}
                  card={card}
                  owned={owned[id]}
                  show={leader ? "pow" : "draw"}
                  // A picked card leaves its hand slot empty; same-colour cards glow once the leader is chosen.
                  className={index >= 0 ? "bcard-gone" : leader && counts.has(card.type) ? "bcard-charge" : ""}
                  onClick={() => toggle(id)}
                />
              );
            })}
          </div>
          <p className="info-line one-line small">{info}</p>
        </>
      )}

      {replaying && play.reveal && (
        <div className="reveal" role="presentation" onClick={() => setPlay((p) => ({ ...p, reveal: false }))}>
          {(["defender", "challenger"] as const).map((id) => {
            const s = sideOf(id);
            const card = s.chain[0] ? cards.get(s.chain[0].card) : undefined;
            const skill = s.skill ? SKILL_BY_ID.get(s.skill.id) : undefined;
            return card ? (
              <div key={id} className={`reveal-side reveal-side-${id}`}>
                <div className="reveal-card">
                  <BattleCard card={card} owned={id === "challenger" ? owned[card.id] : undefined} show="pow" />
                </div>
                <div className="stack">
                  <span className="small muted">{labels[id]}的領導卡</span>
                  <strong>{card.name}</strong>
                  {s.skill && skill ? (
                    <>
                      <span>
                        <SkillTag use={s.skill} />
                      </span>
                      <span className="small">{skillEffectText(skill, s.skill.level)}</span>
                    </>
                  ) : (
                    <span className="small muted">沒有技能</span>
                  )}
                </div>
              </div>
            ) : null;
          })}
          <span className="small muted">點一下繼續</span>
        </div>
      )}

      {replaying && !play.reveal && play.beat >= end && play.scene && (
        <AttackScene result={last!} cards={cards} labels={labels} onComplete={() => setPlay((p) => ({ ...p, scene: false }))} />
      )}
    </div>
  );
}
