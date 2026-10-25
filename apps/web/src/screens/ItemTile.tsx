import type { ItemDefinition, OwnedCard } from "@gdr/engine";
import { ITEM_KIND_LABEL, itemStatText } from "../game/text";

interface Props {
  item: ItemDefinition;
  owned?: OwnedCard | undefined;
  onClick?: () => void;
  badge?: string | undefined;
  selected?: boolean;
}

export function ItemTile({ item, owned, onClick, badge, selected }: Props) {
  const className = `card item-${item.kind}${selected ? " card-selected" : ""}`;
  const body = (
    <>
      <span className="card-type">{ITEM_KIND_LABEL[item.kind]}</span>
      <span className="card-name">{item.name}</span>
      <span className="card-stat">{itemStatText(item)}</span>
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
