import { useState } from "react";
import {
  RULES_V0,
  SKILL_BY_ID,
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

export type CardMap = ReadonlyMap<string, CardDefinition>;
export type SideLabels = Record<SideId, string>;

export function HpBar({ label, hp, equipment }: { label: string; hp: number; equipment: Equipment }) {
  const pct = Math.round((hp / RULES_V0.startingHp) * 100);
  return (
    <div className="stack hp">
      <div className="row between small">
        <span>
          {label}{" "}
          <span className="muted">
            防具 {defenseOf(equipment)} · 武器 +{weaponAttackOf(equipment)}
          </span>
        </span>
        <span>
          {hp} / {RULES_V0.startingHp}
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
function SkillTag({ use }: { use: SkillUse }) {
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
export function skillOutcome(effect: SkillEffect, mine: SideResult, theirs: SideResult): string[] {
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
    if (s.drawLimit !== undefined && s.drawLimit !== RULES_V0.maxChainDraws)
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
function SkillBursts({ result, labels }: { result: PhaseResult; labels: SideLabels }) {
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
              {skillOutcome(skill.effect, mine, theirs)
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

export function PhaseSummary({ result, cards, labels }: { result: PhaseResult; cards: CardMap; labels: SideLabels }) {
  const cardName = (id: string) => cards.get(id)?.name ?? id;
  const line = (id: SideId, s: SideResult) =>
    result.kind === "deck_out" && !s.ranOut ? (
      <li key={id}>
        <strong>{labels[id]}</strong>：本階段不出手，手牌保留。
      </li>
    ) : (
      <li key={id} className="stack chain-line">
        <span>
          <strong>{labels[id]}</strong>：攻擊 {s.attack}
          {result.kind === "normal" && (
            <span className="muted">
              {" "}
              （{s.played.length} 張計入，連擊 {s.comboCount} ×{s.combo}
              {s.blocks > 0 && `，阻擋 ${s.blocks} 格`}）
            </span>
          )}
          {s.skill && <SkillTag use={s.skill} />}
          {s.advantage && <span className="tag">相剋 ×{s.advantageMultiplier}</span>}
          {s.weaponAttack > 0 && <span className="tag">武器 +{s.weaponAttack}</span>}
          {s.skillAttack !== 0 && <span className="tag">技能攻擊 {signed(s.skillAttack)}</span>}
          {s.healed > 0 && <span className="tag">回復 {s.healed}</span>}
          {s.hpCost > 0 && <span className="tag">消耗 HP {s.hpCost}</span>}
          {s.hpDamageTaken > 0 && <span className="tag">受到技能傷害 {s.hpDamageTaken}</span>}
          {s.ranOut && <span className="tag">牌庫耗盡</span>}
        </span>
        {result.kind === "normal" ? (
          <span className="chain">
            {s.chain.map((step, i) => (
              <span
                key={step.card}
                className={`chain-step card-${cards.get(step.card)?.type}${step.counted ? "" : " chain-blocked"}${
                  step.purged ? " chain-purged" : ""
                }`}
                title={step.counted ? "計入" : step.purged ? "被肅清移除" : "阻擋"}
              >
                {i === 0 ? "領 " : step.from === "draw" ? "抽 " : ""}
                {cards.get(step.card)?.attack}
                {!step.counted && (step.purged ? " ↺" : " ✕")}
              </span>
            ))}
          </span>
        ) : (
          <span className="muted">{s.played.map(cardName).join("、") || "（無）"}</span>
        )}
      </li>
    );
  const outcome = result.winner
    ? `${labels[result.winner]}贏下這階段，造成 ${result.damage} 傷害${result.ignoredArmor ? "（無視防具）" : ""}。`
    : "攻擊相同，雙方都沒有受到傷害。";
  return (
    <div className="panel stack small">
      <strong>第 {result.phase} 階段結果</strong>
      {/* Keyed by phase so the animation replays every phase. */}
      <SkillBursts key={result.phase} result={result} labels={labels} />
      <ul className="result-list">
        {line("challenger", result.sides.challenger)}
        {line("defender", result.sides.defender)}
      </ul>
      <p>{outcome}</p>
      {result.reshuffled.length > 0 && (
        <p className="muted">{result.reshuffled.map((id) => labels[id]).join("、")}的牌庫已洗牌重置。</p>
      )}
    </div>
  );
}

interface DeckOutProps {
  hand: readonly string[];
  cards: CardMap;
  owned: Collection;
  ranOut: Record<SideId, boolean>;
  busy?: boolean;
  onResolve: () => void;
}

export function DeckOutPanel({ hand, cards, owned, ranOut, busy, onResolve }: DeckOutProps) {
  return (
    <div className="panel stack">
      <strong>牌庫耗盡！</strong>
      <p className="small muted">
        {ranOut.challenger && ranOut.defender
          ? "雙方牌庫同時耗盡：比較手牌攻擊總和，較高者造成「總和－對方防具」傷害，之後雙方洗牌重置。"
          : ranOut.challenger
            ? "你的牌庫耗盡：手牌攻擊總和直接打給對手（無視防具），之後你的牌庫洗牌重置。"
            : "對手牌庫耗盡：對手手牌攻擊總和直接打給你（無視防具）。你的手牌保留。"}
      </p>
      <div className="grid compact">
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
  busy?: boolean;
  onPlay: (selection: Selection) => void;
}

/** Pick a leader and fill the spaces behind it. Remount (key) each phase to clear the picks. */
export function HandPicker({ hand, cards, owned, drawPile, busy, onPlay }: HandPickerProps) {
  const [picked, setPicked] = useState<string[]>([]);
  const leader = picked[0];
  const leaderCard = leader ? cards.get(leader)! : null;
  const levels = levelsOf(owned);
  const counts = leaderCard ? chargeTypes(leaderCard, levels) : new Set<CardDefinition["type"]>();
  const leaderSkill = leaderCard ? cardSkill(leaderCard, levels) : null;
  const preview = previewAttack(picked, cards, RULES_V0, counts);
  const pickedCounted = picked.filter((id) => counts.has(cards.get(id)!.type)).length;
  const required = requiredPicks(hand, RULES_V0);

  function toggle(id: string) {
    if (id === leader) setPicked([]);
    else if (picked.includes(id)) setPicked(picked.filter((x) => x !== id));
    else if (picked.length < required) setPicked([...picked, id]);
  }

  return (
    <div className="panel stack">
      <div className="row between">
        <strong>你的手牌</strong>
        <span className="muted small">牌庫剩 {drawPile}</span>
      </div>
      <p className="muted small">
        {leader
          ? `再選 ${required - picked.length} 張（共 ${required} 張）；${[...counts].map((t) => TYPE_LABEL[t]).join("、")}以外的卡會擋住一格。點領導卡可重選。`
          : `點一張卡作為領導卡，共要出 ${required} 張。只有領導卡的技能會發動。`}
      </p>
      {leaderSkill && (
        <p className="small">
          領導技能：<strong>{leaderSkill.skill.name} Lv {leaderSkill.level}</strong>（
          {skillEffectText(leaderSkill.skill, leaderSkill.level)}）
        </p>
      )}
      <div className="grid compact">
        {hand.map((id) => {
          const card = cards.get(id)!;
          const index = picked.indexOf(id);
          return (
            <CardTile
              key={id}
              card={card}
              owned={owned[id]}
              selected={index >= 0}
              badge={index === 0 ? "領導" : index > 0 ? (counts.has(card.type) ? `支援 ${index}` : `阻擋 ${index}`) : undefined}
              onClick={() => toggle(id)}
            />
          );
        })}
      </div>
      <div className="row between">
        <span className="small">
          {picked.length > 0
            ? `選牌攻擊 ${preview}（計入 ${pickedCounted} 張${picked.length > pickedCounted ? `，阻擋 ${picked.length - pickedCounted} 格` : ""}）`
            : "尚未選牌"}
        </span>
        <button
          type="button"
          className="primary"
          disabled={busy || !leader || picked.length !== required}
          onClick={() => leader && onPlay({ leader, supports: picked.slice(1) })}
        >
          出牌
        </button>
      </div>
      <p className="muted small">連鎖抽牌、技能和相剋加成在出牌後計算。</p>
    </div>
  );
}
