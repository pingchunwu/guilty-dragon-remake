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

/** Worn by a player; its defense reduces damage taken in a lost phase. */
export interface Armor {
  id: string;
  name: string;
  defense: number;
}

export type Deck = Record<DeckSlot, readonly string[]>;
