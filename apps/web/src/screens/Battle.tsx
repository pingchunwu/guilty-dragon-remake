import { useCallback, useEffect, useState } from "react";
import {
  RULES_V07,
  deckCardIds,
  levelsOf,
  resolvePhase,
  resolveEquipment,
  startBattle,
  type BattleState,
  type PhaseResult,
  type Selection,
  type SideId,
} from "@gdr/engine";
import type { Content } from "../game/content";
import type { PlayerState } from "../game/types";
import type { SideLabels } from "./BattleParts";
import { Duel } from "./Duel";
import { hpAfterSkills } from "./Playback";

const SIDE_LABEL: SideLabels = { challenger: "你", defender: "對手" };
/** Practice runs rule 0.7.0-draft locally; nothing is stored, so old battles don't matter here. */
const RULES = RULES_V07;

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
interface Props {
  content: Content;
  state: PlayerState;
  /** A battle is on screen, so the app hides its header and tabs. */
  onActive: (active: boolean) => void;
}

export function Battle({ content, state: player, onActive }: Props) {
  const { cards, items } = content;
  const [battle, setBattle] = useState<BattleState | null>(null);
  const [last, setLast] = useState<PhaseResult | null>(null);
  // HP before the phase now replaying; the bars move when the playback ends.
  const [hpBefore, setHpBefore] = useState<Record<SideId, number> | null>(null);
  const onReplayDone = useCallback(() => setHpBefore(null), []);
  const onSkills = () => setHpBefore((h) => (h && last ? hpAfterSkills(h, last) : h));
  useEffect(() => {
    onActive(battle !== null);
    return () => onActive(false);
  }, [battle, onActive]);

  function start() {
    // One loadout for attack and defense, so both sides wear the same here.
    const equipment = resolveEquipment(player.loadout, items, levelsOf(player.items));
    const levels = levelsOf(player.cards);
    setBattle(
      startBattle(
        randomSeed(),
        { deck: deckCardIds(player.decks.attack), equipment, levels },
        { deck: deckCardIds(player.decks.defense), equipment, levels },
        RULES,
      ),
    );
    setLast(null);
    setHpBefore(null);
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
            <li>雙方 HP {RULES.startingHp}，手牌 {RULES.handSize} 張；沒出的牌留在手上，每階段補回 {RULES.handSize} 張。</li>
            <li>先選領導卡（手牌顯示 DRAW），再選 {RULES.maxSelected - 1} 張任意顏色的充能卡（顯示 POW），選滿就出牌；選滿前可以點已選的卡收回。</li>
            <li>充能卡依序結算：與領導卡同色就加入合計並空出那格；不同色就擋住那格。接著從牌庫抽領導卡的 DRAW 張，同樣規則；格子都被擋住或牌庫抽完就停。</li>
            <li>合計＝領導卡顏色的武器＋領導卡＋計入的卡；攻擊＝合計 × 相剋 × 連擊（計入張數含領導卡，最高 5 連擊 ×1.5）。</li>
            <li>重裝剋輕裝、輕裝剋魔裝、魔裝剋重裝（領導卡相剋 ×1.2）。</li>
            <li>只有領導卡的技能會發動，技能等級就是卡片等級（重複抽到升級，上限依技能）。</li>
            <li>攻擊較高的一方造成「（攻擊差）×（100%－對方防禦%）」傷害；相同則無傷害。</li>
            <li>牌庫抽完時自動發動最終一擊：用手牌總和＋三把武器直接攻擊（無視防禦），之後洗牌重置。</li>
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
    const step = resolvePhase(battle, selection, cards, RULES);
    setHpBefore({ challenger: me.hp, defender: battle.sides.defender.hp });
    setBattle(step.state);
    setLast(step.result);
  }

  function leave() {
    if (battle?.status !== "active" || window.confirm("離開練習對戰？這場不會保存。")) setBattle(null);
  }

  const over = battle.status !== "active";
  const replaying = hpBefore !== null;
  const hpOf = (id: SideId) => hpBefore?.[id] ?? battle.sides[id].hp;

  return (
    <section className="battle-screen">
      <div className="row between small">
        <strong>練習對戰 · {over && !replaying ? "結束" : `第 ${last && replaying ? last.phase : battle.phase} 階段`}</strong>
        <button type="button" className="link" onClick={leave}>
          離開
        </button>
      </div>
      <Duel
        labels={SIDE_LABEL}
        cards={cards}
        owned={player.cards}
        rules={RULES}
        equipment={{ challenger: me.equipment, defender: battle.sides.defender.equipment }}
        hp={{ challenger: hpOf("challenger"), defender: hpOf("defender") }}
        drawPile={{ challenger: me.drawPile.length, defender: battle.sides.defender.drawPile.length }}
        hand={me.hand}
        phase={battle.phase}
        kind={battle.kind}
        last={last}
        animate={replaying}
        onDone={onReplayDone}
        onSkills={onSkills}
        busy={replaying || over}
        onPlay={play}
      >
        {over && !replaying ? (
          <div className="panel stack">
            <strong className="big">{battle.status === "challenger_won" ? "勝利！" : "落敗"}</strong>
            <p className="small">
              共 {battle.phase} 階段 · 你剩 {me.hp} HP · 對手剩 {battle.sides.defender.hp} HP
            </p>
            <div className="row">
              <button type="button" className="primary grow" onClick={start}>
                再戰一次
              </button>
              <button type="button" className="grow" onClick={() => setBattle(null)}>
                返回
              </button>
            </div>
          </div>
        ) : undefined}
      </Duel>
    </section>
  );
}
