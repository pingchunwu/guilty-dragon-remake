import { RARITIES, SKILL_BY_ID, type CardDefinition, type OwnedCard } from "@gdr/engine";
import { useCardInfoPress } from "./CardTile";

interface Props {
  card: CardDefinition;
  owned?: OwnedCard | undefined;
  /** The big number: DRAW while choosing the leader, POW after (as in the OG). */
  show: "draw" | "pow";
  className?: string;
  onClick?: (() => void) | undefined;
}

/**
 * The OG's square battle card. Its layers follow docs/art-samples/og-sample.html
 * (art, frame, colour gem, skill badge, number + label, rarity stars); until the
 * art and frames are final, the art slot shows the name and the frame is a border.
 */
export function BattleCard({ card, owned, show, className, onClick }: Props) {
  const press = useCardInfoPress(card, owned);
  const skill = card.skill ? SKILL_BY_ID.get(card.skill) : undefined;
  const value = show === "draw" ? card.draw : card.attack;
  return (
    <button
      type="button"
      className={`bcard card-${card.type}${className ? ` ${className}` : ""}`}
      aria-label={`${card.name} ${show === "draw" ? "DRAW" : "POW"} ${value}`}
      onClick={onClick}
      {...press}
    >
      <span className="bcard-art">{card.name}</span>
      <span className="bcard-frame" />
      <span className="bcard-gem" />
      {skill && <span className="bcard-skill">{skill.name.slice(0, 1)}</span>}
      <span className="bcard-num">
        {/* While the big number is DRAW, the POW still shows above it, so a leader can be weighed by both. */}
        {show === "draw" && <small className="bcard-pow">POW {card.attack}</small>}
        <b>{value}</b>
        <small>{show === "draw" ? "DRAW" : "POW"}</small>
      </span>
      <span className="bcard-stars">{"★".repeat(RARITIES.indexOf(card.rarity) + 1)}</span>
    </button>
  );
}
