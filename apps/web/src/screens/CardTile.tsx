import type { CardDefinition, OwnedCard } from "@gdr/engine";
import { TYPE_LABEL } from "../game/text";

interface Props {
  card: CardDefinition;
  owned?: OwnedCard | undefined;
  onClick?: () => void;
  badge?: string | undefined;
  selected?: boolean;
  /** Shown but not choosable right now (e.g. wrong colour for the leader). */
  dimmed?: boolean;
}

export function CardTile({ card, owned, onClick, badge, selected, dimmed }: Props) {
  const className = `card card-${card.type}${owned ? "" : " card-locked"}${selected ? " card-selected" : ""}${
    dimmed ? " card-dimmed" : ""
  }`;
  const body = (
    <>
      <span className="card-type">{TYPE_LABEL[card.type]}</span>
      <span className="card-attack" aria-label={`攻擊 ${card.attack}`}>
        {card.attack}
      </span>
      <span className="card-name">{card.name}</span>
      {owned && (
        <span className="card-level">
          Lv {owned.level} · 碎片 {owned.shards}/5
        </span>
      )}
      {badge && <span className="card-badge">{badge}</span>}
    </>
  );
  return onClick ? (
    <button type="button" className={className} onClick={onClick} disabled={dimmed}>
      {body}
    </button>
  ) : (
    <div className={className}>{body}</div>
  );
}
