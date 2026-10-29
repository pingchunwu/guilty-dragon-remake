import { useMemo, useState } from "react";
import { ITEM_KINDS, type CardType, type ItemKind } from "@gdr/engine";
import type { Content } from "../game/content";
import type { PlayerState } from "../game/types";
import { ITEM_KIND_LABEL, TYPE_LABEL } from "../game/text";
import { DeckCard } from "./DeckCard";
import { ItemTile } from "./ItemTile";
import { useChunk } from "./useChunk";

type View = "card" | "item";
const VIEW_LABEL: Record<View, string> = { card: "卡片", item: "裝備" };

export function Collection({ content, state }: { content: Content; state: PlayerState }) {
  const [view, setView] = useState<View>("card");
  const [cardFilter, setCardFilter] = useState<CardType | "all">("all");
  const [itemFilter, setItemFilter] = useState<ItemKind | "all">("all");
  const allCards = useMemo(() => [...content.cards.values()], [content]);
  const allItems = useMemo(() => ITEM_KINDS.flatMap((kind) => [...content.items.values()].filter((i) => i.kind === kind)), [content]);
  const shownCards = useMemo(() => allCards.filter((c) => cardFilter === "all" || c.type === cardFilter), [allCards, cardFilter]);
  const { limit, sentinel } = useChunk(shownCards.length, cardFilter);
  const owned = view === "card" ? allCards.filter((c) => state.cards[c.id]) : allItems.filter((i) => state.items[i.id]);
  const total = view === "card" ? allCards.length : allItems.length;

  return (
    <section className="stack">
      <div className="row between">
        <h2>收藏</h2>
        <span className="muted">
          {owned.length}/{total}
        </span>
      </div>
      <div className="chips">
        {(["card", "item"] as const).map((v) => (
          <button key={v} type="button" className={view === v ? "chip active" : "chip"} onClick={() => setView(v)}>
            {VIEW_LABEL[v]}
          </button>
        ))}
      </div>
      {view === "card" ? (
        <>
          <div className="chips">
            {(["all", "heavy", "light", "magic"] as const).map((f) => (
              <button
                key={f}
                type="button"
                className={cardFilter === f ? "chip active" : "chip"}
                onClick={() => setCardFilter(f)}
              >
                {f === "all" ? "全部" : TYPE_LABEL[f]}
              </button>
            ))}
          </div>
          <div className="grid deck-grid">
            {shownCards.slice(0, limit).map((c) => (
              <DeckCard key={c.id} card={c} owned={state.cards[c.id]} locked={!state.cards[c.id]} />
            ))}
          </div>
          {sentinel}
        </>
      ) : (
        <>
          <div className="chips">
            {(["all", ...ITEM_KINDS] as const).map((f) => (
              <button
                key={f}
                type="button"
                className={itemFilter === f ? "chip active" : "chip"}
                onClick={() => setItemFilter(f)}
              >
                {f === "all" ? "全部" : ITEM_KIND_LABEL[f]}
              </button>
            ))}
          </div>
          <div className="grid">
            {allItems
              .filter((i) => state.items[i.id] && (itemFilter === "all" || i.kind === itemFilter))
              .map((i) => (
                <ItemTile key={i.id} item={i} owned={state.items[i.id]} />
              ))}
          </div>
        </>
      )}
    </section>
  );
}
