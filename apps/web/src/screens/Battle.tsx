import { useState } from "react";
import {
  PLACEHOLDER_CARDS,
  PLACEHOLDER_ITEMS,
  RULES_V0,
  deckCardIds,
  defenseOf,
  previewAttack,
  requiredPicks,
  resolvePhase,
  resolveEquipment,
  startBattle,
  weaponAttackOf,
  type BattleState,
  type Equipment,
  type PhaseResult,
  type SideId,
  type SideResult,
} from "@gdr/engine";
import type { PlayerState } from "../game/types";
import { TYPE_LABEL } from "../game/text";
import { CardTile } from "./CardTile";

const cards = new Map(PLACEHOLDER_CARDS.map((c) => [c.id, c]));
const items = new Map(PLACEHOLDER_ITEMS.map((i) => [i.id, i]));
const cardName = (id: string) => cards.get(id)?.name ?? id;
const SIDE_LABEL: Record<SideId, string> = { challenger: "你", defender: "對手" };

function randomSeed(): [number, number, number, number] {
  const seed = new Uint32Array(4);
  crypto.getRandomValues(seed);
  return [seed[0]!, seed[1]!, seed[2]!, seed[3]!];
}

/**
 * Practice battle: your attack deck against your own defense deck played by
 * the defender AI. Runs in the browser; nothing is saved and there are no
 * rewards. Friend PvP will resolve the same engine on the server.
 */
export function Battle({ state: player }: { state: PlayerState }) {
  const [battle, setBattle] = useState<BattleState | null>(null);
  const [last, setLast] = useState<PhaseResult | null>(null);
  const [picked, setPicked] = useState<string[]>([]);

  function start() {
    // One loadout for attack and defense, so both sides wear the same here.
    const equipment = resolveEquipment(player.loadout, items);
    setBattle(
      startBattle(
        randomSeed(),
        { deck: deckCardIds(player.decks.attack), equipment },
        { deck: deckCardIds(player.decks.defense), equipment },
        RULES_V0,
      ),
    );
    setLast(null);
    setPicked([]);
  }

  if (!battle) {
    return (
      <section className="stack">
        <h2>對戰</h2>
        <div className="panel stack">
          <strong>練習對戰</strong>
          <p className="muted small">
            用你的進攻牌組挑戰你自己的防守牌組，對手由 AI 出牌。練習不保存、沒有獎勵；和朋友的非同步對戰之後加入。
          </p>
          <ul className="small rules">
            <li>雙方 HP {RULES_V0.startingHp}，手牌 {RULES_V0.handSize} 張；沒出的牌留在手上，每階段補回 {RULES_V0.handSize} 張。</li>
            <li>每階段一定出 {RULES_V0.maxSelected} 張：一張領導卡，後面 {RULES_V0.maxSelected - 1} 格。</li>
            <li>後面的卡依序結算：與領導卡同色就併入攻擊並空出那格，從牌庫抽一張補到最後；不同色就擋住那格，不抽牌。{RULES_V0.maxSelected - 1} 格都被擋住、抽到的卡已計入 {RULES_V0.maxChainDraws} 張、或牌庫抽完時停止。</li>
            <li>計入的張數越多連擊加成越高（最高 ×1.5）。</li>
            <li>重裝剋輕裝、輕裝剋魔裝、魔裝剋重裝（領導卡相剋 ×1.2）。</li>
            <li>裝備的武器攻擊每階段都加在倍率之後（牌庫耗盡時加在手牌總和上）。</li>
            <li>攻擊較高的一方造成「攻擊－對方防具」傷害；相同則無傷害。</li>
            <li>牌庫抽完後的下一階段：用手牌總和結算，之後洗牌重置。</li>
          </ul>
          <button type="button" className="primary" onClick={start}>
            開始練習對戰
          </button>
        </div>
      </section>
    );
  }

  const me = battle.sides.challenger;
  const leader = picked[0];
  const leaderType = leader ? cards.get(leader)!.type : null;
  const preview = previewAttack(picked, cards, RULES_V0);
  const pickedCounted = picked.filter((id) => cards.get(id)!.type === leaderType).length;
  const required = requiredPicks(me.hand, RULES_V0);

  function toggle(id: string) {
    if (id === leader) setPicked([]);
    else if (picked.includes(id)) setPicked(picked.filter((x) => x !== id));
    else if (picked.length < required) setPicked([...picked, id]);
  }

  function play() {
    if (!battle) return;
    const selection = battle.kind === "normal" && leader ? { leader, supports: picked.slice(1) } : null;
    const step = resolvePhase(battle, selection, cards, RULES_V0);
    setBattle(step.state);
    setLast(step.result);
    setPicked([]);
  }

  const over = battle.status !== "active";

  return (
    <section className="stack">
      <div className="row between">
        <h2>練習對戰</h2>
        <span className="muted">{over ? "結束" : `第 ${battle.phase} 階段`}</span>
      </div>

      <div className="panel stack">
        {(["challenger", "defender"] as const).map((id) => (
          <HpBar key={id} label={SIDE_LABEL[id]} hp={battle.sides[id].hp} equipment={battle.sides[id].equipment} />
        ))}
      </div>

      {last && <PhaseSummary result={last} />}

      {over ? (
        <div className="panel stack">
          <strong className="big">{battle.status === "challenger_won" ? "勝利！" : "落敗"}</strong>
          <p className="small">
            共 {battle.phase} 階段 · 你剩 {me.hp} HP · 對手剩 {battle.sides.defender.hp} HP
          </p>
          <button type="button" className="primary" onClick={start}>
            再戰一次
          </button>
          <button type="button" onClick={() => setBattle(null)}>
            返回
          </button>
        </div>
      ) : battle.kind === "deck_out" ? (
        <div className="panel stack">
          <strong>牌庫耗盡！</strong>
          <p className="small muted">
            {me.ranOut && battle.sides.defender.ranOut
              ? "雙方牌庫同時耗盡：比較手牌攻擊總和，較高者造成「總和－對方防具」傷害，之後雙方洗牌重置。"
              : me.ranOut
                ? "你的牌庫耗盡：手牌攻擊總和直接打給對手（無視防具），之後你的牌庫洗牌重置。"
                : "對手牌庫耗盡：對手手牌攻擊總和直接打給你（無視防具）。你的手牌保留。"}
          </p>
          <div className="grid compact">
            {me.hand.map((id) => (
              <CardTile key={id} card={cards.get(id)!} owned={player.cards[id]} />
            ))}
          </div>
          <button type="button" className="primary" onClick={play}>
            結算
          </button>
        </div>
      ) : (
        <div className="panel stack">
          <div className="row between">
            <strong>你的手牌</strong>
            <span className="muted small">牌庫剩 {me.drawPile.length}</span>
          </div>
          <p className="muted small">
            {leader
              ? `再選 ${required - picked.length} 張（共 ${required} 張）；${TYPE_LABEL[leaderType!]}以外的卡會擋住一格。點領導卡可重選。`
              : `點一張卡作為領導卡，共要出 ${required} 張。`}
          </p>
          <div className="grid compact">
            {me.hand.map((id) => {
              const card = cards.get(id)!;
              const index = picked.indexOf(id);
              return (
                <CardTile
                  key={id}
                  card={card}
                  owned={player.cards[id]}
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
            <button type="button" className="primary" disabled={picked.length !== required} onClick={play}>
              出牌
            </button>
          </div>
          <p className="muted small">連鎖抽牌和相剋加成在出牌後計算。</p>
        </div>
      )}
    </section>
  );
}

function HpBar({ label, hp, equipment }: { label: string; hp: number; equipment: Equipment }) {
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

function PhaseSummary({ result }: { result: PhaseResult }) {
  const line = (id: SideId, s: SideResult) =>
    result.kind === "deck_out" && !s.ranOut ? (
      <li key={id}>
        <strong>{SIDE_LABEL[id]}</strong>：本階段不出手，手牌保留。
      </li>
    ) : (
      <li key={id} className="stack chain-line">
        <span>
          <strong>{SIDE_LABEL[id]}</strong>：攻擊 {s.attack}
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
                className={`chain-step card-${cards.get(step.card)!.type}${step.counted ? "" : " chain-blocked"}`}
                title={step.counted ? "計入" : "阻擋"}
              >
                {i === 0 ? "領 " : step.from === "draw" ? "抽 " : ""}
                {cards.get(step.card)!.attack}
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
    ? `${SIDE_LABEL[result.winner]}贏下這階段，造成 ${result.damage} 傷害${result.ignoredArmor ? "（無視防具）" : ""}。`
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
        <p className="muted">{result.reshuffled.map((id) => SIDE_LABEL[id]).join("、")}的牌庫已洗牌重置。</p>
      )}
    </div>
  );
}
