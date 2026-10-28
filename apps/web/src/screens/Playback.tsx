import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import {
  RULES_V07,
  WEAPON_KINDS,
  type CardDefinition,
  type Equipment,
  type PhaseResult,
  type RuleConfig,
  type SideId,
  type SideResult,
} from "@gdr/engine";
import { TYPE_LABEL } from "../game/text";
import { useCardInfoPress } from "./CardTile";
import { SkillBursts, SkillTag, type CardMap, type SideLabels } from "./BattleParts";

/** One beat of the phase playback (decided 2026-10-26): both sides side by side, 0.5 s per step. */
export const BEAT_MS = 500;

export type ChipState = "leader" | "pending" | "counted" | "blocked" | "purged";

export interface Chip {
  card: string;
  state: ChipState;
  drawn: boolean;
  /** Appeared or resolved on this beat (0.6.0: drawn as a same-colour card merged; 0.7.0: drawn, or the leader added). */
  fresh: boolean;
}

export interface SideFrame {
  row: Chip[];
  /**
   * Raw sum and count of the cards counted so far, before combo, colour and skills.
   * 0.6.0: cards only. 0.7.0: starts at the weapon, and the leader joins last.
   */
  sum: number;
  counted: number;
}

export interface Frame {
  /** chain: cards resolve one by one; total: final attack with multipliers; damage: who hits. */
  stage: "chain" | "total" | "damage";
  sides: Record<SideId, SideFrame>;
  /** Leader skills are announced on this beat. */
  skills?: boolean;
}

const SIDES = ["challenger", "defender"] as const;

/**
 * Replays a resolved phase as frames in the original's order: the leader, then
 * each card behind it one at a time (same colour merges and a card is drawn into
 * the end of the row; another colour blocks), then the attack judgment, then damage.
 */
export function playbackFrames(result: PhaseResult, cards: CardMap, rules?: RuleConfig): Frame[] {
  const attackOf = (id: string) => cards.get(id)?.attack ?? 0;
  if (rules?.ruleVersion === RULES_V07.ruleVersion && result.kind === "normal") return framesV07(result, attackOf);
  if (result.kind === "deck_out") {
    const sides = {} as Record<SideId, SideFrame>;
    for (const id of SIDES) {
      const played = result.sides[id].played;
      sides[id] = {
        row: played.map((card) => ({ card, state: "counted", drawn: false, fresh: false })),
        sum: played.reduce((n, c) => n + attackOf(c), 0),
        counted: played.length,
      };
    }
    return [
      { stage: "total", sides },
      { stage: "damage", sides },
    ];
  }

  const at = (s: SideResult, t: number, drawnBefore: number): SideFrame => {
    const resolved = s.chain.slice(0, t + 1);
    // 肅清 fires once all 4 spaces are blocked; until then purged cards still block.
    const purgeFired = resolved.filter((c) => !c.counted).length >= 4;
    const triggers =
      resolved.slice(1).filter((c) => c.counted).length + (purgeFired ? resolved.filter((c) => c.purged).length : 0);
    const drawnSoFar = Math.min(triggers, s.chain.filter((c) => c.from === "draw").length);
    let drawIndex = 0;
    const row: Chip[] = [];
    s.chain.forEach((step, k) => {
      const drawn = step.from === "draw";
      const visible = !drawn || drawIndex < drawnSoFar || k <= t;
      const fresh = drawn && visible && drawIndex >= drawnBefore;
      if (drawn) drawIndex++;
      if (!visible) return;
      const state: ChipState =
        k === 0
          ? "leader"
          : k > t
            ? "pending"
            : step.counted
              ? "counted"
              : step.purged && purgeFired
                ? "purged"
                : "blocked";
      row.push({ card: step.card, state, drawn, fresh });
    });
    const counted = resolved.filter((c) => c.counted);
    return { row, sum: counted.reduce((n, c) => n + attackOf(c.card), 0), counted: counted.length };
  };

  const steps = Math.max(1, ...SIDES.map((id) => result.sides[id].chain.length));
  const frames: Frame[] = [];
  const drawn: Record<SideId, number> = { challenger: Infinity, defender: Infinity };
  for (let t = 0; t < steps; t++) {
    const sides = {} as Record<SideId, SideFrame>;
    for (const id of SIDES) {
      sides[id] = at(result.sides[id], t, drawn[id]);
      drawn[id] = sides[id].row.filter((c) => c.drawn).length;
    }
    frames.push({ stage: "chain", sides, skills: t <= 1 });
  }
  const last = frames[frames.length - 1]!.sides;
  const settled = {} as Record<SideId, SideFrame>;
  for (const id of SIDES) settled[id] = { ...last[id], row: last[id].row.map((c) => ({ ...c, fresh: false })) };
  frames.push({ stage: "total", sides: settled }, { stage: "damage", sides: settled });
  return frames;
}

/**
 * Rule 0.7.0-draft, in the OG clip's order with both sides at once: leader reveal
 * and weapon light-up, leader-time skills, each charge card (counts or blocks),
 * each deck draw, the leader added last, then the judgment and damage.
 */
function framesV07(result: PhaseResult, attackOf: (id: string) => number): Frame[] {
  const charges = (s: SideResult) => s.chain.filter((c, k) => k > 0 && c.from === "pick").length;
  const draws = (s: SideResult) => s.chain.filter((c) => c.from === "draw").length;
  const most = (count: (s: SideResult) => number) => Math.max(0, ...SIDES.map((id) => count(result.sides[id])));

  const at = (s: SideResult, charged: number, drawn: number, leaderIn: boolean): SideFrame => {
    const shown = 1 + charges(s) + Math.min(drawn, draws(s));
    const resolved = 1 + Math.min(charged, charges(s)) + Math.min(drawn, draws(s));
    const behind = s.chain.slice(1, resolved);
    // 肅清 fires once all 4 spaces are blocked; until then purged cards still block.
    const purgeFired = behind.filter((c) => !c.counted).length >= 4;
    const row = s.chain.slice(0, shown).map((step, k): Chip => {
      const state: ChipState =
        k === 0 ? "leader" : k >= resolved ? "pending" : step.counted ? "counted" : step.purged && purgeFired ? "purged" : "blocked";
      // The card resolving on this beat: a draw drops in; the leader flashes as it joins the total.
      const fresh = k === 0 ? leaderIn : step.from === "draw" && k === shown - 1 && drawn <= draws(s);
      return { card: step.card, state, drawn: step.from === "draw", fresh };
    });
    const counted = behind.filter((c) => c.counted);
    return {
      row,
      sum: s.weaponAttack + counted.reduce((n, c) => n + attackOf(c.card), 0) + (leaderIn ? attackOf(s.chain[0]!.card) : 0),
      counted: counted.length + (leaderIn ? 1 : 0),
    };
  };
  const frame = (charged: number, drawn: number, leaderIn = false, skills = false): Frame => ({
    stage: "chain",
    sides: { challenger: at(result.sides.challenger, charged, drawn, leaderIn), defender: at(result.sides.defender, charged, drawn, leaderIn) },
    skills,
  });

  const frames: Frame[] = [frame(0, 0)];
  if (SIDES.some((id) => result.sides[id].skill)) frames.push(frame(0, 0, false, true));
  for (let c = 1; c <= most(charges); c++) frames.push(frame(c, 0));
  for (let d = 1; d <= most(draws); d++) frames.push(frame(Infinity, d));
  frames.push(frame(Infinity, Infinity, true));
  const settled = {} as Record<SideId, SideFrame>;
  for (const id of SIDES) {
    const last = frames[frames.length - 1]!.sides[id];
    settled[id] = { ...last, row: last.row.map((c) => ({ ...c, fresh: false })) };
  }
  frames.push({ stage: "total", sides: settled }, { stage: "damage", sides: settled });
  return frames;
}

const CHIP_MARK: Partial<Record<ChipState, string>> = { leader: "領", blocked: "✕", purged: "↺" };

function ChainChip({ chip, card }: { chip: Chip; card: CardDefinition }) {
  const press = useCardInfoPress(card, undefined);
  return (
    <span
      className={`chip-card card-${card.type} chip-${chip.state}${chip.fresh ? " chip-fresh" : ""}`}
      title={chip.drawn ? "抽到的卡" : undefined}
      {...press}
    >
      <span className="chip-attack">{card.attack}</span>
      <span className="chip-mark" aria-hidden="true">
        {CHIP_MARK[chip.state] ?? (chip.drawn ? "抽" : "")}
      </span>
    </span>
  );
}

interface SideLineProps {
  id: SideId;
  result: PhaseResult;
  frame: SideFrame;
  stage: Frame["stage"];
  label: string;
  cards: CardMap;
  v07: boolean;
  equipment: Equipment;
}

/** Combo count so far as 5 pips (the combo caps at 5). */
export function Pips({ count }: { count: number }) {
  return (
    <span className="pips" aria-label={`連擊 ${count}`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className={i < count ? "pip pip-on" : "pip"} />
      ))}
    </span>
  );
}

/** 0.7.0: the 3 weapon slots; the leader's colour lights up (all three on deck-out). */
function Weapons({ side, equipment, all }: { side: SideResult; equipment: Equipment; all: boolean }) {
  return (
    <span className="weapons small">
      {WEAPON_KINDS.map((k) => {
        const lit = all || k === side.leaderType;
        return (
          <span key={k} className={`weapon card-${k}${lit ? " weapon-lit" : ""}`}>
            {TYPE_LABEL[k].slice(0, 1)} {lit && !all ? side.weaponAttack : (equipment[k]?.attack ?? 0)}
          </span>
        );
      })}
    </span>
  );
}

function SideLine({ id, result, frame, stage, label, cards, v07, equipment }: SideLineProps) {
  const s = result.sides[id];
  const idle = result.kind === "deck_out" && !s.ranOut;
  const won = stage === "damage" && result.winner === id;
  const skill = s.skillAttack !== 0 && ` ${s.skillAttack > 0 ? "+" : "−"} 技能 ${Math.abs(s.skillAttack)}`;
  return (
    <div className={`board-side${won ? " board-won" : ""}`}>
      <div className="row between small">
        <span className="one-line">
          <strong>{label}</strong>
          {s.skill && <SkillTag use={s.skill} />}
        </span>
        <strong className="board-attack">
          {idle ? (
            "不出手"
          ) : stage !== "chain" ? (
            `攻擊 ${s.attack}`
          ) : v07 ? (
            <>
              合計 {frame.sum} <Pips count={frame.counted} />
            </>
          ) : (
            `${frame.sum}（${frame.counted} 張）`
          )}
        </strong>
      </div>
      {v07 && !idle && (stage === "chain" || result.kind === "deck_out") && (
        <div className="row between">
          <Weapons side={s} equipment={equipment} all={result.kind === "deck_out"} />
          {result.kind === "deck_out" && (
            <span className="muted small">
              手牌 {s.baseAttack} + 武器 {s.weaponAttack}
            </span>
          )}
        </div>
      )}
      {v07 && stage !== "chain" && result.kind === "normal" && (
        <div className="muted small">
          ({s.weaponAttack + s.baseAttack}
          {s.advantage && ` × 相剋 ${s.advantageMultiplier}`}) × 連擊 {s.combo}
          {skill} · 防禦 {s.defense}%
        </div>
      )}
      {!v07 && stage !== "chain" && !idle && result.kind === "normal" && (
        <div className="muted small">
          {frame.sum} × 連擊 {s.combo}
          {s.advantage && ` × 相剋 ${s.advantageMultiplier}`}
          {s.weaponAttack > 0 && ` + 武器 ${s.weaponAttack}`}
          {skill}
        </div>
      )}
      <div className="board-row">
        {idle ? (
          <span className="muted small">手牌保留</span>
        ) : (
          frame.row.map((chip) => {
            const card = cards.get(chip.card);
            return card ? <ChainChip key={chip.card} chip={chip} card={card} /> : null;
          })
        )}
      </div>
    </div>
  );
}

interface BoardProps {
  result: PhaseResult | null;
  cards: CardMap;
  labels: SideLabels;
  /** The battle's rules: 0.6.0 and 0.7.0 battles play back differently. */
  rules: RuleConfig;
  equipment: Record<SideId, Equipment>;
  /** Play from the first beat; otherwise show the end state (e.g. after a reload). */
  animate: boolean;
  onDone: () => void;
}

/** Shared with Duel.tsx (rule 0.7.0). */
interface SceneProps {
  result: PhaseResult;
  cards: CardMap;
  labels: SideLabels;
  onComplete: () => void;
}

/**
 * 0.7.0: the OG's attack cut-in after the judgment. A red slash wipes in, both
 * sides' attack and defense % slide in (opponent top, you bottom), the winner's
 * banner and leader strike, then the damage number with a screen shake. Tap to skip.
 */
export function AttackScene({ result, cards, labels, onComplete }: SceneProps) {
  const root = useRef<HTMLDivElement>(null);
  const tl = useRef<gsap.core.Timeline | null>(null);
  useGSAP(
    (_, contextSafe) => {
      const q = gsap.utils.selector(root);
      tl.current = gsap
        .timeline({ defaults: { ease: "power3.out" }, onComplete: contextSafe!(onComplete) })
        .from(root.current, { autoAlpha: 0, duration: 0.15 })
        .fromTo(q(".scene-slash"), { xPercent: -130 }, { xPercent: 130, duration: 0.45, ease: "power2.in" }, 0)
        .from(q(".scene-bar-top"), { yPercent: -110, duration: 0.3 }, 0.25)
        .from(q(".scene-bar-bottom"), { yPercent: 110, duration: 0.3 }, "<")
        .addLabel("banner", 0.55)
        .from(q(".scene-banner"), { xPercent: -110, duration: 0.3 }, "banner")
        .from(q(".scene-attacker"), { scale: 2.4, autoAlpha: 0, duration: 0.35, ease: "power4.in" }, "banner+=0.2")
        .addLabel("hit")
        .fromTo(q(".scene-flash"), { autoAlpha: 0.85 }, { autoAlpha: 0, duration: 0.3 }, "hit")
        .from(q(".scene-damage"), { scale: 2.6, autoAlpha: 0, duration: 0.3, ease: "back.out(2)" }, "hit")
        .to(q(".scene-stage"), { keyframes: { x: [-12, 10, -7, 5, -2, 0] }, duration: 0.4, ease: "none" }, "hit")
        .to(root.current, { autoAlpha: 0, duration: 0.25 }, "hit+=1.1");
    },
    { scope: root },
  );

  const { winner } = result;
  const leader = winner && result.sides[winner].chain[0] ? cards.get(result.sides[winner].chain[0].card) : undefined;
  const bar = (id: SideId, pos: "top" | "bottom") => (
    <div className={`scene-bar scene-bar-${pos}${winner === id ? " scene-bar-won" : ""}`}>
      <strong className="one-line">{labels[id]}</strong>
      <span className="nowrap">
        攻擊 <strong className="scene-stat">{result.sides[id].attack}</strong>
      </span>
      <span className="nowrap">
        防禦 <strong className="scene-stat">{result.sides[id].defense}%</strong>
      </span>
    </div>
  );
  return (
    <div ref={root} className="attack-scene" role="presentation" onClick={() => tl.current?.progress(1)}>
      <div className="scene-stage">
        {bar("defender", "top")}
        <div className="scene-banner">
          {!winner ? "勢均力敵" : result.kind === "deck_out" ? "最終一擊！" : `${labels[winner]}的攻擊！`}
        </div>
        {leader && <div className={`scene-attacker card-${leader.type}`}>{leader.name}</div>}
        <div className="scene-damage">
          {winner ? `−${result.damage}` : "沒有傷害"}
          {result.ignoredArmor && <small>無視防禦</small>}
        </div>
        {bar("challenger", "bottom")}
      </div>
      <div className="scene-slash" />
      <div className="scene-flash" />
    </div>
  );
}

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/** The last phase, replayed beat by beat with a skip button. Remount (key) per phase. */
export function PhaseBoard({ result, cards, labels, rules, equipment, animate, onDone }: BoardProps) {
  const v07 = rules.ruleVersion === RULES_V07.ruleVersion;
  const frames = result ? playbackFrames(result, cards, rules) : [];
  const end = Math.max(0, frames.length - 1);
  const [beat, setBeat] = useState(() => (animate && !reducedMotion() ? 0 : end));
  const [details, setDetails] = useState(false);
  const done = beat >= end;

  useEffect(() => {
    if (done) return onDone();
    const timer = window.setTimeout(() => setBeat((b) => b + 1), BEAT_MS);
    return () => window.clearTimeout(timer);
  }, [beat, done, onDone]);

  if (!result) {
    return (
      <div className="board panel">
        <p className="muted small">
          {v07
            ? "先選領導卡（看 DRAW），再選 4 張充能卡（看 POW），選滿就出牌。長按卡片可查看技能。"
            : "點一張卡當領導卡，再選後面 4 格出牌。長按卡片可查看技能。"}
        </p>
      </div>
    );
  }
  const frame = frames[beat]!;
  const outcome = result.winner
    ? `${labels[result.winner]}${v07 ? "攻擊！" : ""}造成 ${result.damage} 傷害${
        result.ignoredArmor ? (v07 ? "（無視防禦）" : "（無視防具）") : ""
      }`
    : "攻擊相同，沒有傷害";

  return (
    <div className="board panel">
      <div className="row between small">
        <strong>
          第 {result.phase} 階段{result.kind === "deck_out" && " · 牌庫耗盡"}
        </strong>
        {done ? (
          <button type="button" className="link" onClick={() => setDetails(!details)} aria-expanded={details}>
            {details ? "收起技能" : "技能詳情"}
          </button>
        ) : (
          <button type="button" className="link" onClick={() => setBeat(end)}>
            略過
          </button>
        )}
      </div>
      {/* Leader skills announce themselves on their beat, or on demand afterwards. */}
      {frame.skills && !done && (
        <div className="board-overlay">
          <SkillBursts result={result} labels={labels} v07={v07} />
        </div>
      )}
      {details && <SkillBursts result={result} labels={labels} v07={v07} />}
      {(["defender", "challenger"] as const).map((id) => (
        <SideLine
          key={id}
          id={id}
          result={result}
          frame={frame.sides[id]}
          stage={frame.stage}
          label={labels[id]}
          cards={cards}
          v07={v07}
          equipment={equipment[id]}
        />
      ))}
      <p className="board-outcome" aria-live="polite">
        {frame.stage === "damage" ? outcome : " "}
      </p>
      {details && result.reshuffled.length > 0 && (
        <p className="muted small">{result.reshuffled.map((id) => labels[id]).join("、")}的牌庫已洗牌重置。</p>
      )}
    </div>
  );
}
