import { ITEM_MAX_LEVEL, leveledItem, type ItemDefinition, type OwnedCard } from "@gdr/engine";
import { ITEM_KIND_LABEL, isWeapon, itemStatText } from "../game/text";

interface Props {
  item: ItemDefinition;
  owned?: OwnedCard | undefined;
  onClick?: () => void;
  badge?: string | undefined;
  selected?: boolean;
}

export function ItemTile({ item, owned, onClick, badge, selected }: Props) {
  const className = `card item-tile ${isWeapon(item.kind) ? `card-${item.kind}` : "item-armor"}${selected ? " card-selected" : ""}`;
  const body = (
    <>
      <span className="card-type">{ITEM_KIND_LABEL[item.kind]}</span>
      <span className="card-name">{item.name}</span>
      <span className="card-stat">{itemStatText(leveledItem(item, owned?.level ?? 1))}</span>
      {owned && (
        <span className="card-level">
          Lv {owned.level}/{ITEM_MAX_LEVEL}
          {owned.shards > 0 && ` · 多餘 ${owned.shards}`}
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
