import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import {
  RULES_V0,
  RULES_V07,
  SKILL_BY_ID,
  WEAPON_KINDS,
  cardSkill,
  chargeTypes,
  defenseOf,
  levelsOf,
  previewAttack,
  requiredPicks,
  type CardDefinition,
  type Collection,
  type Equipment,
  type PhaseResult,
  type RuleConfig,
  type Selection,
  type SideId,
  type SideResult,
  type SkillEffect,
  type SkillUse,
  weaponAttackOf,
} from "@gdr/engine";
import { TYPE_LABEL, skillEffectText } from "../game/text";
import { CardTile } from "./CardTile";

/** Battle UI shared by practice and friend PvP. */

gsap.registerPlugin(useGSAP);

export type CardMap = ReadonlyMap<string, CardDefinition>;
export type SideLabels = Record<SideId, string>;

export const isV07 = (rules: RuleConfig) => rules.ruleVersion === RULES_V07.ruleVersion;

/** Small modal for destructive choices (the native confirm() is blocked in some webviews and PWAs). Focus starts on cancel; Esc cancels. */
export function ConfirmDialog({ message, confirmLabel, onConfirm, onCancel }: {
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel; // PvP re-renders every tick; keep the listener and focus stable.
  useEffect(() => {
    cancel.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onCancelRef.current();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);
  return (
    <div className="dialog-backdrop" role="presentation" onClick={onCancel}>
      <div className="dialog panel stack" role="dialog" aria-modal="true" aria-label={message} onClick={(e) => e.stopPropagation()}>
        <strong>{message}</strong>
        <div className="row">
          <button type="button" className="primary grow" onClick={onConfirm}>
            {confirmLabel}
          </button>
          <button type="button" className="grow" ref={cancel} onClick={onCancel}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

export const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/** Full-screen win/lose result over the whole viewport (portalled out of the board's transforms); `children` are the buttons. */
export function ResultScreen({ won, stats, children }: { won: boolean; stats: string; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      if (reducedMotion()) return;
      gsap.timeline()
        .from(root.current, { opacity: 0, duration: 0.4 })
        .from(".result-title", { scale: 0.4, opacity: 0, duration: 0.7, ease: "back.out(1.6)" }, 0.1)
        .from(".result-body", { y: 16, opacity: 0, duration: 0.4 }, 0.6);
    },
    { scope: root },
  );
  return createPortal(
    <div ref={root} className={`result-screen ${won ? "result-win" : "result-lose"}`} role="dialog" aria-modal="true" aria-label={won ? "勝利" : "落敗"}>
      <strong className="result-title">{won ? "勝利！" : "落敗"}</strong>
      <div className="result-body stack">
        <p className="small">{stats}</p>
        <div className="row">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/** Counts up (or down) to `value`; React renders only the first value, so the tween owns the text after that. */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [first] = useState(value);
  const shown = useRef(value);
  const count = useRef<gsap.core.Timeline | null>(null);
  useGSAP(
    () => {
      if (shown.current === value) return;
      // Kill, not revert: reverting rewinds the old count and writes its start value back for a frame.
      count.current?.kill();
      const n = { v: shown.current };
      const motion = !reducedMotion();
      count.current = gsap
        .timeline()
        .to(n, {
          v: value,
          duration: motion ? 0.4 : 0,
          ease: "power2.out",
          onUpdate: () => {
            shown.current = Math.round(n.v);
            if (ref.current) ref.current.textContent = String(shown.current);
          },
        })
        .fromTo(ref.current, { scale: motion ? 1.25 : 1 }, { scale: 1, duration: motion ? 0.3 : 0, ease: "back.out(3)" }, 0);
    },
    { dependencies: [value], scope: ref },
  );
  return (
    <span ref={ref} className={`count-up${className ? ` ${className}` : ""}`}>
      {first}
    </span>
  );
}

interface HpBarProps {
  label: string;
  hp: number;
  equipment: Equipment;
  rules: RuleConfig;
}

export function HpBar({ label, hp, equipment, rules }: HpBarProps) {
  const pct = Math.round((hp / rules.startingHp) * 100);
  return (
    <div className="stack hp">
      <div className="row between small">
        <span className="one-line">
          {label}{" "}
          <span className="muted">
            {isV07(rules)
              ? `防禦 ${defenseOf(equipment)}% · 武器 ${WEAPON_KINDS.map((k) => equipment[k]?.attack ?? 0).join("/")}`
              : `防具 ${defenseOf(equipment)} · 武器 +${weaponAttackOf(equipment)}`}
          </span>
        </span>
        <span className="nowrap">
          <CountUp value={hp} /> / {rules.startingHp}
        </span>
      </div>
      <div className="hp-track">
        <div className="hp-fill" style={{ transform: `scaleX(${pct / 100})` }} />
      </div>
    </div>
  );
}

const skillName = (id: string) => SKILL_BY_ID.get(id)?.name ?? id;

/** 「連擊 Lv 2」, 「模仿→連擊 Lv 2」, or the skill crossed out when a shield cancelled it. */
export function SkillTag({ use }: { use: SkillUse }) {
  const name = `${use.via ? `${skillName(use.via)}→` : ""}${skillName(use.id)} Lv ${use.level}`;
  const skill = SKILL_BY_ID.get(use.id);
  return use.blocked ? (
    <span className="tag tag-off" title="被對方的護盾無效">
      {name} 無效
    </span>
  ) : (
    <span className="tag tag-skill" title={skill ? skillEffectText(skill, use.level) : undefined}>
      {name}
    </span>
  );
}

const signed = (n: number) => (n >= 0 ? `+${n}` : `−${-n}`);

type Family = "attack" | "debuff" | "guard" | "heal" | "damage" | "cards" | "element";

function familyOf(e: SkillEffect): Family {
  switch (e.kind) {
    case "combo":
    case "power":
      return e.target === "self" ? "attack" : "debuff";
    case "defense":
      return e.target === "self" ? "guard" : "debuff";
    case "draws":
      return e.target === "self" ? "cards" : "debuff";
    case "reckless":
    case "board":
    case "hpCost":
      return "attack";
    case "guard":
    case "finalBlowGuard":
    case "shield":
      return "guard";
    case "heal":
      return "heal";
    case "hpDamage":
    case "finalDamage":
      return "damage";
    case "element":
      return "element";
    default:
      return "cards";
  }
}

const FAMILY_ICON: Record<Family, string> = {
  attack: "⚔",
  debuff: "▼",
  guard: "◆",
  heal: "✚",
  damage: "✦",
  cards: "⇄",
  element: "◐",
};

/** What the skill actually did this phase, as short lines; results stored before 2026-10-27 lack the hand fields. */
export function skillOutcome(effect: SkillEffect, mine: SideResult, theirs: SideResult, v07 = false): string[] {
  const lines: string[] = [];
  const hand = (h: SideResult["handChange"] | undefined, who: string) => {
    if (!h) return;
    if (h.discarded) lines.push(`${who}丟棄 ${h.discarded} 張`);
    if (h.returned) lines.push(`${who}手牌 ${h.returned} 張洗回牌庫`);
    else if (h.shuffled) lines.push(`${who}牌庫洗牌`);
    if (h.drawn) lines.push(`${who}補抽 ${h.drawn} 張`);
  };
  if (effect.kind === "shuffle" && effect.target !== "self") hand(theirs.handChange, "對手");
  if (effect.kind === "shuffle" ? effect.target !== "enemy" : true) hand(mine.handChange, "");
  const limit = (s: SideResult, who: string) => {
    // 0.7.0: the leader's DRAW after skills; the card's own DRAW is not in the result.
    if (v07) lines.push(`${who}DRAW 變為 ${s.drawLimit}`);
    else if (s.drawLimit !== undefined && s.drawLimit !== RULES_V0.maxChainDraws)
      lines.push(`${who}抽牌上限 ${RULES_V0.maxChainDraws}→${s.drawLimit}`);
  };
  if (effect.kind === "draws") limit(effect.target === "self" ? mine : theirs, effect.target === "self" ? "" : "對手");
  const purged = mine.chain.filter((c) => c.purged).length;
  if (purged) lines.push(`肅清 ${purged} 張阻擋卡`);
  const own = mine.skillAttack - (mine.enemySkillAttack ?? 0);
  if (own !== 0) lines.push(`攻擊 ${signed(own)}`);
  if (theirs.enemySkillAttack) lines.push(`對手攻擊 ${signed(theirs.enemySkillAttack)}`);
  if (mine.healed) lines.push(`HP +${mine.healed}`);
  if (mine.hpCost) lines.push(`HP −${mine.hpCost}`);
  if (theirs.hpDamageTaken) lines.push(`對手 HP −${theirs.hpDamageTaken}`);
  return lines;
}

/** Animated banner for each leader skill that fired (or was cancelled) this phase. */
export function SkillBursts({ result, labels, v07 }: { result: PhaseResult; labels: SideLabels; v07: boolean }) {
  const bursts = (["challenger", "defender"] as const).flatMap((id) => {
    const mine = result.sides[id];
    const use = mine.skill;
    const skill = use && SKILL_BY_ID.get(use.id);
    if (!use || !skill) return [];
    const theirs = result.sides[id === "challenger" ? "defender" : "challenger"];
    const family = familyOf(skill.effect);
    const name = `${use.via ? `${skillName(use.via)}→` : ""}${skill.name} Lv ${use.level}`;
    return [
      <div key={id} className={`skill-burst burst-${use.blocked ? "off" : family} burst-${id}`}>
        <span className="burst-icon" aria-hidden="true">
          {FAMILY_ICON[family]}
        </span>
        <span className="stack">
          <span className="burst-title">
            {labels[id]}・{name}
            {use.blocked ? " 被護盾無效" : " 發動！"}
          </span>
          <span className="burst-text">{skillEffectText(skill, use.level)}</span>
          {!use.blocked && (
            <span className="burst-lines">
              {skillOutcome(skill.effect, mine, theirs, v07)
                .filter((line) => line !== skillEffectText(skill, use.level))
                .map((line, i) => (
                <span key={line} className="burst-line" style={{ animationDelay: `${0.25 + i * 0.12}s` }}>
                  {line}
                </span>
              ))}
            </span>
          )}
        </span>
      </div>,
    ];
  });
  return bursts.length > 0 ? (
    <div className="skill-bursts">
      {bursts}
    </div>
  ) : null;
}

interface DeckOutProps {
  hand: readonly string[];
  cards: CardMap;
  owned: Collection;
  ranOut: Record<SideId, boolean>;
  rules: RuleConfig;
  busy?: boolean;
  onResolve: () => void;
}

export function DeckOutPanel({ hand, cards, owned, ranOut, rules, busy, onResolve }: DeckOutProps) {
  const v07 = isV07(rules);
  return (
    <div className="panel stack">
      <p className="small">
        <strong>牌庫耗盡！</strong>
        <span className="muted">
          {v07
            ? ranOut.challenger && ranOut.defender
              ? "比較雙方「手牌總和＋三把武器」，較高者直接打給對方（無視防禦），之後洗牌重置。"
              : ranOut.challenger
                ? "你的手牌總和＋三把武器直接打給對手（無視防禦），之後洗牌重置。"
                : "對手的手牌總和＋三把武器直接打給你（無視防禦），你的手牌保留。"
            : ranOut.challenger && ranOut.defender
              ? "比較雙方手牌總和，較高者造成「總和－防具」傷害，之後洗牌重置。"
              : ranOut.challenger
                ? "你的手牌總和直接打給對手（無視防具），之後洗牌重置。"
                : "對手手牌總和直接打給你（無視防具），你的手牌保留。"}
        </span>
      </p>
      <div className="hand-grid">
        {hand.map((id) => (
          <CardTile key={id} card={cards.get(id)!} owned={owned[id]} />
        ))}
      </div>
      <button type="button" className="primary" disabled={busy} onClick={onResolve}>
        結算
      </button>
    </div>
  );
}

interface HandPickerProps {
  hand: readonly string[];
  cards: CardMap;
  owned: Collection;
  drawPile: number;
  rules: RuleConfig;
  /** 0.7.0: the leader's colour picks the weapon shown in the total. */
  equipment: Equipment;
  busy?: boolean;
  onPlay: (selection: Selection) => void;
}

/**
 * Pick a leader and fill the spaces behind it. Remount (key) each phase to clear the picks.
 * 0.7.0: the hand shows DRAW until a leader is picked, then POW; the last pick plays at once.
 */
export function HandPicker({ hand, cards, owned, drawPile, rules, equipment, busy, onPlay }: HandPickerProps) {
  const [picked, setPicked] = useState<string[]>([]);
  const v07 = isV07(rules);
  const leader = picked[0];
  const leaderCard = leader ? cards.get(leader)! : null;
  const levels = levelsOf(owned);
  const counts = leaderCard ? chargeTypes(leaderCard, levels) : new Set<CardDefinition["type"]>();
  const leaderSkill = leaderCard ? cardSkill(leaderCard, levels) : null;
  const pickedCounted = picked.filter((id) => counts.has(cards.get(id)!.type)).length;
  const required = requiredPicks(hand, rules);
  const left = required - picked.length;
  const blocked = picked.length - pickedCounted;
  const status = !leaderCard
    ? "尚未選牌"
    : v07
      ? `合計 ${
          (equipment[leaderCard.type]?.attack ?? 0) +
          picked.filter((id) => counts.has(cards.get(id)!.type)).reduce((n, id) => n + cards.get(id)!.attack, 0)
        }（連擊 ${pickedCounted}${blocked ? `，阻擋 ${blocked}` : ""}）${left > 0 ? ` · 再選 ${left} 張充能卡` : " · 出牌中…"}`
      : `攻擊 ${previewAttack(picked, cards, rules, counts)}（計入 ${pickedCounted}${blocked ? `，阻擋 ${blocked}` : ""}）${
          left > 0 ? ` · 再選 ${left} 張` : ""
        }`;

  function toggle(id: string) {
    if (busy) return;
    if (id === leader) setPicked([]);
    else if (picked.includes(id)) setPicked(picked.filter((x) => x !== id));
    else if (picked.length < required) {
      const next = [...picked, id];
      setPicked(next);
      // 0.7.0 has no confirm button: the last pick starts the phase.
      if (v07 && next.length === required) onPlay({ leader: next[0]!, supports: next.slice(1) });
    }
  }

  return (
    <div className="panel stack">
      <div className="row between small">
        <span className="one-line grow">
          {leaderSkill ? (
            <>
              領導技能 <strong>{leaderSkill.skill.name} Lv {leaderSkill.level}</strong>：
              {skillEffectText(leaderSkill.skill, leaderSkill.level)}
            </>
          ) : leaderCard ? (
            <span className="muted">領導卡沒有技能</span>
          ) : v07 ? (
            <span className="muted">選領導卡：DRAW 是領導卡從牌庫抽的張數；只有領導卡的技能會發動</span>
          ) : (
            <span className="muted">選一張領導卡，共出 {required} 張；只有領導卡的技能會發動</span>
          )}
        </span>
        <span className="muted nowrap">牌庫 {drawPile}</span>
      </div>
      <div className="hand-grid">
        {hand.map((id) => {
          const card = cards.get(id)!;
          const index = picked.indexOf(id);
          return (
            <CardTile
              key={id}
              card={card}
              owned={owned[id]}
              selected={index >= 0}
              showDraw={v07 && !leaderCard}
              badge={
                index === 0
                  ? "領導"
                  : index > 0
                    ? counts.has(card.type)
                      ? `${v07 ? "充能" : "支援"} ${index}`
                      : `阻擋 ${index}`
                    : undefined
              }
              onClick={() => toggle(id)}
            />
          );
        })}
      </div>
      <div className="row between">
        <span className="small">{status}</span>
        {!v07 && (
          <button
            type="button"
            className="primary"
            disabled={busy || !leader || picked.length !== required}
            onClick={() => leader && onPlay({ leader, supports: picked.slice(1) })}
          >
            出牌
          </button>
        )}
      </div>
    </div>
  );
}
