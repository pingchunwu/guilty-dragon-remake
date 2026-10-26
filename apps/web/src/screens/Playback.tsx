import { useEffect, useState } from "react";
import type { CardDefinition, PhaseResult, SideId, SideResult } from "@gdr/engine";
import { useCardInfoPress } from "./CardTile";
import { SkillBursts, SkillTag, type CardMap, type SideLabels } from "./BattleParts";

/** One beat of the phase playback (decided 2026-10-26): both sides side by side, 0.5 s per step. */
export const BEAT_MS = 500;

export type ChipState = "leader" | "pending" | "counted" | "blocked" | "purged";

export interface Chip {
  card: string;
  state: ChipState;
  drawn: boolean;
  /** Appeared on this beat (drawn as a same-colour card merged). */
  fresh: boolean;
}

export interface SideFrame {
  row: Chip[];
  /** Raw sum and count of the cards counted so far, before combo, colour, weapon and skills. */
  sum: number;
  counted: number;
}

export interface Frame {
  /** chain: cards resolve one by one; total: final attack with multipliers; damage: who hits. */
  stage: "chain" | "total" | "damage";
  sides: Record<SideId, SideFrame>;
}

const SIDES = ["challenger", "defender"] as const;

/**
 * Replays a resolved phase as frames in the original's order: the leader, then
 * each card behind it one at a time (same colour merges and a card is drawn into
 * the end of the row; another colour blocks), then the attack judgment, then damage.
 */
export function playbackFrames(result: PhaseResult, cards: CardMap): Frame[] {
  const attackOf = (id: string) => cards.get(id)?.attack ?? 0;
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
    frames.push({ stage: "chain", sides });
  }
  const last = frames[frames.length - 1]!.sides;
  const settled = {} as Record<SideId, SideFrame>;
  for (const id of SIDES) settled[id] = { ...last[id], row: last[id].row.map((c) => ({ ...c, fresh: false })) };
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
}

function SideLine({ id, result, frame, stage, label, cards }: SideLineProps) {
  const s = result.sides[id];
  const idle = result.kind === "deck_out" && !s.ranOut;
  const won = stage === "damage" && result.winner === id;
  return (
    <div className={`board-side${won ? " board-won" : ""}`}>
      <div className="row between small">
        <span className="one-line">
          <strong>{label}</strong>
          {s.skill && <SkillTag use={s.skill} />}
        </span>
        <strong className="board-attack">
          {idle ? "不出手" : stage === "chain" ? `${frame.sum}（${frame.counted} 張）` : `攻擊 ${s.attack}`}
        </strong>
      </div>
      {stage !== "chain" && !idle && result.kind === "normal" && (
        <div className="muted small">
          {frame.sum} × 連擊 {s.combo}
          {s.advantage && ` × 相剋 ${s.advantageMultiplier}`}
          {s.weaponAttack > 0 && ` + 武器 ${s.weaponAttack}`}
          {s.skillAttack !== 0 && ` ${s.skillAttack > 0 ? "+" : "−"} 技能 ${Math.abs(s.skillAttack)}`}
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
  /** Play from the first beat; otherwise show the end state (e.g. after a reload). */
  animate: boolean;
  onDone: () => void;
}

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/** The last phase, replayed beat by beat with a skip button. Remount (key) per phase. */
export function PhaseBoard({ result, cards, labels, animate, onDone }: BoardProps) {
  const frames = result ? playbackFrames(result, cards) : [];
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
        <p className="muted small">點一張卡當領導卡，再選後面 4 格出牌。長按卡片可查看技能。</p>
      </div>
    );
  }
  const frame = frames[beat]!;
  const outcome = result.winner
    ? `${labels[result.winner]}造成 ${result.damage} 傷害${result.ignoredArmor ? "（無視防具）" : ""}`
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
      {/* Leader skills announce themselves while the first cards resolve, or on demand afterwards. */}
      {beat <= 1 && !done && (
        <div className="board-overlay">
          <SkillBursts result={result} labels={labels} />
        </div>
      )}
      {details && <SkillBursts result={result} labels={labels} />}
      {(["defender", "challenger"] as const).map((id) => (
        <SideLine
          key={id}
          id={id}
          result={result}
          frame={frame.sides[id]}
          stage={frame.stage}
          label={labels[id]}
          cards={cards}
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
