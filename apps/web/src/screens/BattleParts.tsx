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
        <div className="hp-fill" style={{ width: `${pct}%` }} />
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
