import { memo } from "react";
import { cardMaxLevel, type CardDefinition, type OwnedCard } from "@gdr/engine";
import { BattleCard } from "./BattleCard";

interface Props {
  card: CardDefinition;
  owned?: OwnedCard | undefined;
  selected?: boolean;
  /** Short label laid over the card (e.g. NEW). */
  badge?: string | undefined;
  /** Dim the card when the player doesn't own it. */
  locked?: boolean;
  onClick?: () => void;
}

/** The battle-card look with the owned level caption, selection outline and optional badge. */
export const DeckCard = memo(function DeckCard({ card, owned, selected, badge, locked, onClick }: Props) {
  return (
    <div className={`deck-card${locked ? " deck-card-locked" : ""}`}>
      <BattleCard card={card} owned={owned} show="pow" className={selected ? "card-selected" : ""} onClick={onClick} />
      {badge && <span className={`deck-card-badge${badge === "NEW" ? " deck-card-badge-new" : ""}`}>{badge}</span>}
      {owned && (
        <small className="deck-card-level">
          Lv {owned.level}/{cardMaxLevel(card)}
        </small>
      )}
    </div>
  );
});
