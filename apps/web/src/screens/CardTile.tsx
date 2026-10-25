import { SKILL_BY_ID, cardMaxLevel, type CardDefinition, type OwnedCard } from "@gdr/engine";
import { TYPE_LABEL, skillEffectText } from "../game/text";

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
  const skill = card.skill ? SKILL_BY_ID.get(card.skill) : undefined;
  const max = cardMaxLevel(card);
  const body = (
    <>
      <span className="card-type">
        {TYPE_LABEL[card.type]} <span className="card-rarity">{card.rarity}</span>
      </span>
      <span className="card-attack" aria-label={`攻擊 ${card.attack}`}>
        {card.attack}
      </span>
      <span className="card-name">{card.name}</span>
      {skill && (
        <span className="card-skill" title={skillEffectText(skill, owned?.level ?? 1)}>
          {skill.name}
        </span>
      )}
      {owned && (
        <span className="card-level">
          技能 Lv {owned.level}/{max}
          {owned.shards > 0 && ` · 多餘 ${owned.shards}`}
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
