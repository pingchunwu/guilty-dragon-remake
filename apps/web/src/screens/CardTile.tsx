import type { CardDefinition, OwnedCard } from "@gdr/engine";
import { TYPE_LABEL } from "../game/text";

interface Props {
  card: CardDefinition;
  owned?: OwnedCard | undefined;
  onClick?: () => void;
  badge?: string | undefined;
  selected?: boolean;
}

export function CardTile({ card, owned, onClick, badge, selected }: Props) {
  const className = `card card-${card.type}${owned ? "" : " card-locked"}${selected ? " card-selected" : ""}`;
  const body = (
    <>
      <span className="card-type">{TYPE_LABEL[card.type]}</span>
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
    <button type="button" className={className} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className={className}>{body}</div>
  );
}
