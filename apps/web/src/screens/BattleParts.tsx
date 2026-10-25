import { useState } from "react";
import {
  RULES_V0,
  defenseOf,
  previewAttack,
  requiredPicks,
  type CardDefinition,
  type Collection,
  type Equipment,
  type PhaseResult,
  type Selection,
  type SideId,
  type SideResult,
  weaponAttackOf,
} from "@gdr/engine";
import { TYPE_LABEL } from "../game/text";
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
              （{s.played.length} 張計入，連擊 ×{s.combo}
              {s.blocks > 0 && `，阻擋 ${s.blocks} 格`}）
            </span>
          )}
          {s.advantage && <span className="tag">相剋 ×{RULES_V0.advantageMultiplier}</span>}
          {s.weaponAttack > 0 && <span className="tag">武器 +{s.weaponAttack}</span>}
          {s.ranOut && <span className="tag">牌庫耗盡</span>}
        </span>
        {result.kind === "normal" ? (
          <span className="chain">
            {s.chain.map((step, i) => (
              <span
                key={step.card}
                className={`chain-step card-${cards.get(step.card)?.type}${step.counted ? "" : " chain-blocked"}`}
                title={step.counted ? "計入" : "阻擋"}
              >
                {i === 0 ? "領 " : step.from === "draw" ? "抽 " : ""}
                {cards.get(step.card)?.attack}
                {!step.counted && " ✕"}
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
  const leaderType = leader ? cards.get(leader)!.type : null;
  const preview = previewAttack(picked, cards, RULES_V0);
  const pickedCounted = picked.filter((id) => cards.get(id)!.type === leaderType).length;
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
          ? `再選 ${required - picked.length} 張（共 ${required} 張）；${TYPE_LABEL[leaderType!]}以外的卡會擋住一格。點領導卡可重選。`
          : `點一張卡作為領導卡，共要出 ${required} 張。`}
      </p>
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
              badge={index === 0 ? "領導" : index > 0 ? (card.type === leaderType ? `支援 ${index}` : `阻擋 ${index}`) : undefined}
              onClick={() => toggle(id)}
            />
          );
        })}
      </div>
      <div className="row between">
        <span className="small">
          {picked.length > 0
            ? `選牌攻擊 ${preview}（同色 ${pickedCounted} 張${picked.length > pickedCounted ? `，阻擋 ${picked.length - pickedCounted} 格` : ""}）`
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
      <p className="muted small">連鎖抽牌和相剋加成在出牌後計算。</p>
    </div>
  );
}
