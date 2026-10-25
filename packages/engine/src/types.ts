/** Unit card types. A card's type decides which non-Free slot it may occupy. */
export type CardType = "heavy" | "light" | "magic";

/** Deck slots: one per card type plus a Free slot that accepts any type. */
export type DeckSlot = CardType | "free";

export const DECK_SLOTS: readonly DeckSlot[] = ["heavy", "light", "magic", "free"];

/**
 * Card definition. Type doubles as the card's colour (supports, advantage).
 * Draw values and skills are still open. See docs/development-spec.md §6a.
 */
export interface CardDefinition {
  /** Stable ID, independent of display/translated names. */
  id: string;
  name: string;
  type: CardType;
  attack: number;
}

/** Equipment kinds; a player equips one of each (docs/development-spec.md §6a). */
export type ItemKind = "armor" | "weapon" | "gear";

export const ITEM_KINDS: readonly ItemKind[] = ["armor", "weapon", "gear"];

/**
 * Equipment, separate from the deck. Armor defense reduces damage taken in a
 * lost phase; weapon attack is added to every phase's attack after the
 * multipliers. Gear has no battle effect yet (open decision).
 */
export interface ItemDefinition {
  id: string;
  name: string;
  kind: ItemKind;
  attack: number;
  defense: number;
}

/** Equipped item IDs; null is an empty slot. */
export type Loadout = Record<ItemKind, string | null>;

export type Deck = Record<DeckSlot, readonly string[]>;
