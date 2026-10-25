import { useState } from "react";
import {
  RULES_V0,
  deckCardIds,
  levelsOf,
  resolvePhase,
  resolveEquipment,
  startBattle,
  type BattleState,
  type PhaseResult,
  type Selection,
} from "@gdr/engine";
import type { Content } from "../game/content";
import type { PlayerState } from "../game/types";
import { DeckOutPanel, HandPicker, HpBar, PhaseSummary, type SideLabels } from "./BattleParts";

const SIDE_LABEL: SideLabels = { challenger: "你", defender: "對手" };

function randomSeed(): [number, number, number, number] {
  const seed = new Uint32Array(4);
  crypto.getRandomValues(seed);
  return [seed[0]!, seed[1]!, seed[2]!, seed[3]!];
}

/**
 * Practice battle: your attack deck against your own defense deck played by
 * the defender AI. Runs in the browser; nothing is saved and there are no
 * rewards. Friend PvP (Pvp.tsx) resolves the same engine on the server.
 */
export function Battle({ content, state: player }: { content: Content; state: PlayerState }) {
  const { cards, items } = content;
  const [battle, setBattle] = useState<BattleState | null>(null);
  const [last, setLast] = useState<PhaseResult | null>(null);

  function start() {
    // One loadout for attack and defense, so both sides wear the same here.
    const equipment = resolveEquipment(player.loadout, items, levelsOf(player.items));
    const levels = levelsOf(player.cards);
    setBattle(
      startBattle(
        randomSeed(),
        { deck: deckCardIds(player.decks.attack), equipment, levels },
        { deck: deckCardIds(player.decks.defense), equipment, levels },
        RULES_V0,
      ),
    );
    setLast(null);
  }

  if (!battle) {
    return (
      <section className="stack">
        <h2>對戰</h2>
        <div className="panel stack">
          <strong>練習對戰</strong>
          <p className="muted small">
            用你的進攻牌組挑戰你自己的防守牌組，對手由 AI 出牌。練習不保存、沒有獎勵。
          </p>
          <ul className="small rules">
            <li>雙方 HP {RULES_V0.startingHp}，手牌 {RULES_V0.handSize} 張；沒出的牌留在手上，每階段補回 {RULES_V0.handSize} 張。</li>
            <li>每階段一定出 {RULES_V0.maxSelected} 張：一張領導卡，後面 {RULES_V0.maxSelected - 1} 格。</li>
            <li>後面的卡依序結算：與領導卡同色就併入攻擊並空出那格，從牌庫抽一張補到最後；不同色就擋住那格，不抽牌。{RULES_V0.maxSelected - 1} 格都被擋住、抽到的卡已計入 {RULES_V0.maxChainDraws} 張、或牌庫抽完時停止。</li>
            <li>計入的張數越多連擊加成越高（最高 ×1.5）。</li>
            <li>重裝剋輕裝、輕裝剋魔裝、魔裝剋重裝（領導卡相剋 ×1.2）。</li>
            <li>裝備的武器攻擊每階段都加在倍率之後（牌庫耗盡時加在手牌總和上）。</li>
            <li>只有領導卡的技能會發動，技能等級就是卡片等級（重複抽到升級，上限依技能）。</li>
            <li>防具、武器每級 +10%（上限 Lv 10）。</li>
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

  function play(selection: Selection | null) {
    if (!battle) return;
    const step = resolvePhase(battle, selection, cards, RULES_V0);
    setBattle(step.state);
    setLast(step.result);
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

      {last && <PhaseSummary result={last} cards={cards} labels={SIDE_LABEL} />}

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
        <DeckOutPanel
          hand={me.hand}
          cards={cards}
          owned={player.cards}
          ranOut={{ challenger: me.ranOut, defender: battle.sides.defender.ranOut }}
          onResolve={() => play(null)}
        />
      ) : (
        <HandPicker
          key={battle.phase}
          hand={me.hand}
          cards={cards}
          owned={player.cards}
          drawPile={me.drawPile.length}
          onPlay={play}
        />
      )}
    </section>
  );
}
