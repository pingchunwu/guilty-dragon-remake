import { useEffect, useRef, useSyncExternalStore, type MouseEvent } from "react";
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

const LONG_PRESS_MS = 450;

// One card toast for the whole app; any CardTile can open it.
type Info = { card: CardDefinition; owned: OwnedCard | undefined; at: number };
let info: Info | null = null;
const listeners = new Set<() => void>();
function setInfo(next: Info | null) {
  info = next;
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Long-press (touch), hold or right-click (mouse) opens the info toast; the click that ends a hold is swallowed. */
export function useCardInfoPress(card: CardDefinition, owned: OwnedCard | undefined) {
  const timer = useRef<number | undefined>(undefined);
  const opened = useRef(false);
  const cancel = () => window.clearTimeout(timer.current);
  const open = () => {
    opened.current = true;
    setInfo({ card, owned, at: Date.now() });
  };
  useEffect(() => cancel, []);
  return {
    onPointerDown: () => {
      opened.current = false;
      cancel();
      timer.current = window.setTimeout(open, LONG_PRESS_MS);
    },
    // Scrolling fires pointercancel, so a swipe never opens it.
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e: MouseEvent) => {
      e.preventDefault();
      cancel();
      open();
    },
    onClickCapture: (e: MouseEvent) => {
      if (!opened.current) return;
      opened.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
  };
}

export function CardTile({ card, owned, onClick, badge, selected, dimmed }: Props) {
  const press = useCardInfoPress(card, owned);
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
    <button type="button" className={className} onClick={onClick} disabled={dimmed} {...press}>
      {body}
    </button>
  ) : (
    <div className={className} {...press}>
      {body}
    </div>
  );
}

const TOAST_MS = 5000;

/** Render once. Shows the long-pressed card; tap it or wait to close. */
export function CardToast() {
  const shown = useSyncExternalStore(subscribe, () => info);
  useEffect(() => {
    if (!shown) return;
    const timer = window.setTimeout(() => setInfo(null), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [shown]);
  const card = shown?.card;
  const skill = card?.skill ? SKILL_BY_ID.get(card.skill) : undefined;
  const level = shown?.owned?.level ?? 1;
  return (
    <div className="card-toast-anchor" role="status" aria-live="polite">
      {card && (
        <button type="button" key={shown.at} className={`card-toast card-${card.type}`} onClick={() => setInfo(null)}>
          <span className="row between">
            <strong>{card.name}</strong>
            <span className="card-attack-inline">攻擊 {card.attack}</span>
          </span>
          <span className="small muted">
            {TYPE_LABEL[card.type]} · {card.rarity}
            {shown.owned && ` · 技能 Lv ${level}/${cardMaxLevel(card)}`}
          </span>
          {skill && (
            <span className="small">
              <strong className="card-skill">{skill.name}</strong>：{skillEffectText(skill, level)}
              {!shown.owned && "（Lv 1）"}
            </span>
          )}
        </button>
      )}
    </div>
  );
}
