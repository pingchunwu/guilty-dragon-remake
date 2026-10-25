/** Unit card types. A card's type decides which non-Free slot it may occupy. */
export type CardType = "heavy" | "light" | "magic";

/** Deck slots: one per card type plus a Free slot that accepts any type. */
export type DeckSlot = CardType | "free";

export const DECK_SLOTS: readonly DeckSlot[] = ["heavy", "light", "magic", "free"];

/**
 * Minimal card definition. Attack, draw value, attribute/colour and skills are
 * intentionally absent until the open rule decisions (attack model, weapons,
 * type vs. colour vs. attribute) are made. See docs/development-spec.md §7.
 */
export interface CardDefinition {
  /** Stable ID, independent of display/translated names. */
  id: string;
  name: string;
  type: CardType;
}

export type Deck = Record<DeckSlot, readonly string[]>;
