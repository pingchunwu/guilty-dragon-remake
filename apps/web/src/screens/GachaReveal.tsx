import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CardDefinition, ItemDefinition, PullResult } from "@gdr/engine";
import { DeckCard } from "./DeckCard";
import { ItemTile } from "./ItemTile";
import { GachaSeal } from "./GachaSeal";
import { GachaCutIn } from "./GachaCutIn";
import { omenOf } from "./gachaOmen";
import { reducedMotion } from "./BattleParts";

type Kind = "card" | "item";
type Stage = "seal" | "flip" | "summary";

export function pullBadge(r: PullResult): string {
  if (r.isNew) return "NEW";
  return r.leveledUp ? `升級 Lv ${r.level}` : "已滿級";
}

interface GridProps {
  kind: Kind;
  results: PullResult[];
  cards: ReadonlyMap<string, CardDefinition>;
  items: ReadonlyMap<string, ItemDefinition>;
}

function Face({ kind, r, cards, items }: { kind: Kind; r: PullResult } & Omit<GridProps, "kind" | "results">) {
  const owned = { level: r.level, shards: r.shards };
  if (kind === "card") {
    const card = cards.get(r.id);
    return card ? <DeckCard card={card} owned={owned} badge={pullBadge(r)} /> : null;
  }
  const item = items.get(r.id);
  return item ? <ItemTile item={item} owned={owned} badge={pullBadge(r)} /> : null;
}

/** The plain results grid, shared by the reveal's summary and the page below it. */
export function PullGrid({ kind, results, cards, items }: GridProps) {
  return (
    <div className="grev-grid">
      {results.map((r, i) => (
        <Face key={i} kind={kind} r={r} cards={cards} items={items} />
      ))}
    </div>
  );
}

interface Props extends GridProps {
  onClose: () => void;
  onAgain?: (() => void) | undefined;
}

export function GachaReveal({ kind, results, cards, items, onClose, onAgain }: Props) {
  const reduced = useMemo(reducedMotion, []);
  const [stage, setStage] = useState<Stage>(reduced ? "summary" : "seal");
  const [flipped, setFlipped] = useState<ReadonlySet<number>>(new Set());
  const [shown, setShown] = useState<ReadonlySet<number>>(new Set());
  const [cutIn, setCutIn] = useState<number | null>(null);
  const [skipping, setSkipping] = useState(false);
  const [prime, setPrime] = useState<number | null>(null); // card currently tilting before its flip
  const cardOf = (i: number) => (kind === "card" ? cards.get(results[i]!.id) : undefined);
  const rarities = useMemo(() => results.map((r) => (kind === "card" ? cards.get(r.id)?.rarity : undefined) ?? "N"), [results, kind, cards]);
  const omen = useMemo(() => omenOf(rarities), [rarities]);
  const rootRef = useRef<HTMLDivElement>(null);
  const settleAt = useRef(0); // time before which the next card's anticipation must not start

  // Preload the card art so flips never show a blank face.
  useEffect(() => {
    if (kind === "card") for (const r of results) new Image().src = `/cards/${r.id}.webp`;
  }, [kind, results]);

  // Next SR/SSR cut-in owed: flipped, not yet shown (and, when skipping, only NEW SSR ones).
  const owed = results.findIndex(
    (r, i) =>
      stage !== "summary" &&
      (rarities[i] === "SSR" || rarities[i] === "SR") &&
      flipped.has(i) &&
      !shown.has(i) &&
      (!skipping || (rarities[i] === "SSR" && r.isNew)),
  );
  useEffect(() => {
    if (cutIn === null && owed >= 0) setCutIn(owed);
  }, [cutIn, owed]);

  // Auto-flip one by one (~0.35s each): a short anticipation shake, then the flip.
  // Paused while a cut-in is showing or owed.
  const busyCutIn = cutIn !== null || owed >= 0;
  useEffect(() => {
    if (stage !== "flip" || busyCutIn || skipping) return;
    const next = results.findIndex((_, i) => !flipped.has(i));
    let t: ReturnType<typeof setTimeout>;
    if (prime !== null && !flipped.has(prime)) {
      t = setTimeout(() => {
        flipOne(prime);
        setPrime(null);
      }, rarities[prime] === "SSR" ? 1200 : rarities[prime] === "SR" ? 600 : 200); // anticipation hold
    } else if (next >= 0) {
      // After an SR/SSR flip, let its flip + light burst land before the next anticipation.
      t = setTimeout(() => setPrime(next), Math.max(150, settleAt.current - Date.now()));
    } else {
      t = setTimeout(() => setStage("summary"), 900);
    }
    return () => clearTimeout(t);
  });

  useEffect(() => {
    if (skipping && !busyCutIn) setStage("summary");
  }, [skipping, busyCutIn]);

  function flipOne(i: number) {
    const settle = rarities[i] === "SSR" ? 1300 : rarities[i] === "SR" ? 1000 : 0; // flip 0.9/0.6s + 0.4s
    if (settle) settleAt.current = Date.now() + settle;
    setFlipped((f) => new Set(f).add(i));
  }
  const flipAll = () => setFlipped(new Set(results.keys()));
  function skip() {
    flipAll();
    setStage("flip");
    setSkipping(true);
  }

  const card = cutIn !== null ? cardOf(cutIn) : undefined;
  const cutR = cutIn !== null ? results[cutIn] : undefined;
  return createPortal(
    <div
      ref={rootRef}
      className={`grev${reduced ? " grev-fade" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="抽卡結果"
      // Tapping the background during the flip stage flips everything left.
      onClick={(e) => stage === "flip" && !(e.target as Element).closest(".grev-card,.grev-skip,.gcut") && flipAll()}
    >
      {stage !== "summary" && (
        <button type="button" className="grev-skip" onClick={skip}>
          SKIP
        </button>
      )}
      {stage === "seal" && <GachaSeal omen={omen} onDone={() => setStage("flip")} />}
      {stage === "flip" && (
        <div className="grev-flip">
          <div className="grev-grid">
            {results.map((r, i) => (
              // A div, not a button: the card front (BattleCard) is itself a button.
              <div
                key={i}
                role="button"
                tabIndex={0}
                className={`grev-card grev-${rarities[i]}${flipped.has(i) ? " grev-flipped" : prime === i ? " grev-prime" : ""}`}
                aria-label={flipped.has(i) ? "已翻開" : "翻開"}
                onClick={() => flipOne(i)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && flipOne(i)}
              >
                <span className="grev-inner">
                  <span className="grev-back" />
                  <span className="grev-front">
                    <Face kind={kind} r={r} cards={cards} items={items} />
                  </span>
                </span>
              </div>
            ))}
          </div>
          <button type="button" className="grev-all" onClick={flipAll} disabled={flipped.size === results.length}>
            全部翻開
          </button>
        </div>
      )}
      {stage === "summary" && (
        <div className="grev-summary">
          <PullGrid kind={kind} results={results} cards={cards} items={items} />
          <div className="row">
            {onAgain && (
              <button type="button" className="primary grow" onClick={onAgain}>
                再抽一次
              </button>
            )}
            <button type="button" className="grow" onClick={onClose}>
              確認
            </button>
          </div>
        </div>
      )}
      {card && cutR && stage !== "summary" && (
        <GachaCutIn
          key={cutIn}
          card={card}
          isNew={cutR.isNew}
          level={cutR.level}
          onDone={() => {
            setShown((s) => new Set(s).add(cutIn!));
            setCutIn(null);
          }}
        />
      )}
    </div>,
    document.body,
  );
}

