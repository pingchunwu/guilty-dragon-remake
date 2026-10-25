import { useState } from "react";
import { PLACEHOLDER_CARDS, type CardType } from "@gdr/engine";
import type { PlayerState } from "../game/types";
import { TYPE_LABEL } from "../game/text";
import { CardTile } from "./CardTile";

export function Collection({ state }: { state: PlayerState }) {
  const [filter, setFilter] = useState<CardType | "all">("all");
  const cards = PLACEHOLDER_CARDS.filter((c) => filter === "all" || c.type === filter);
  const ownedCount = PLACEHOLDER_CARDS.filter((c) => state.cards[c.id]).length;

  return (
    <section className="stack">
      <div className="row between">
        <h2>收藏</h2>
        <span className="muted">
          {ownedCount}/{PLACEHOLDER_CARDS.length}
        </span>
      </div>
      <div className="chips">
        {(["all", "heavy", "light", "magic"] as const).map((f) => (
          <button key={f} type="button" className={filter === f ? "chip active" : "chip"} onClick={() => setFilter(f)}>
            {f === "all" ? "全部" : TYPE_LABEL[f]}
          </button>
        ))}
      </div>
      <div className="grid">
        {cards.map((c) => (
          <CardTile key={c.id} card={c} owned={state.cards[c.id]} />
        ))}
      </div>
    </section>
  );
}
